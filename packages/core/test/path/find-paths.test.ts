import { describe, expect, it } from "vitest";
import { analyzeFocus } from "../../src/analyze.js";
import { NodeNotFoundError } from "../../src/errors.js";
import { findPaths, type PathRequest } from "../../src/path/find-paths.js";
import { createStopSignal, type StopSignal } from "../../src/path/signal.js";
import type { PathProgress } from "../../src/types.js";
import { memoryProject, MEMORY_ROOT } from "../helpers.js";

const limits = { timeLimitMs: 60_000, maxBoxes: 200 };
const idle: StopSignal = { isRequested: () => false, reason: () => undefined };

function request(
  from: string,
  to: string,
  extra: Partial<PathRequest> = {},
): PathRequest {
  return { from, to, repoRoot: MEMORY_ROOT, limits, signal: idle, ...extra };
}

function foundOutcome(outcome: ReturnType<typeof findPaths>) {
  if (outcome.status !== "found") throw new Error(`got ${outcome.status}`);
  return outcome;
}

const CHAIN = {
  "src/low.ts": "export function low(): number { return 1 }\n",
  "src/mid.ts":
    'import { low } from "./low.js"\nexport function mid() { return low() }\n',
  "src/top.ts":
    'import { mid } from "./mid.js"\nexport function top() { return mid() }\n',
};

const hubLines = Array.from(
  { length: 60 },
  (_, i) => `export function c${i}() { return target(${i}) }`,
);
const HUB = {
  "src/lib.ts": "export function target(n: number): number { return n }\n",
  "src/callers.ts": `import { target } from "./lib.js"\n${hubLines.join("\n")}\n`,
  "src/callers.test.ts":
    'import { target } from "./lib.js"\nexport function t1() { target(1) }\nexport function t2() { target(2) }\n',
};

function tripAfterFirstRound() {
  let tripped = false;
  const signal: StopSignal = {
    isRequested: () => tripped,
    reason: () => (tripped ? "time" : undefined),
  };
  return {
    signal,
    onProgress(progress: PathProgress) {
      if (progress.checked >= 2) tripped = true;
    },
  };
}

describe("findPaths", () => {
  it("finds the straight-down route with route, path and centre", () => {
    const project = memoryProject(CHAIN);
    const outcome = foundOutcome(
      findPaths(project, request("src/low.ts#low", "src/top.ts#top")),
    );
    expect(outcome.route.nodes.map((n) => n.id)).toEqual([
      "src/low.ts#low",
      "src/mid.ts#mid",
      "src/top.ts#top",
    ]);
    expect(outcome.route.edges.map((e) => [e.from, e.to])).toEqual([
      ["src/low.ts#low", "src/mid.ts#mid"],
      ["src/mid.ts#mid", "src/top.ts#top"],
    ]);
    expect(outcome.path.endId).toBe("src/top.ts#top");
    expect(outcome.path.boxes.map((box) => box.column)).toEqual([0, 1, 2]);
    expect(outcome.path.summary).toMatchObject({
      routes: 1,
      routesCapped: false,
      leftOut: 0,
    });
    expect(outcome.centre.focusId).toBe("src/low.ts#low");
  });

  it("makes a centre equal to what analyzeFocus makes for A on a hub of 60 callers", () => {
    const project = memoryProject(HUB);
    const outcome = foundOutcome(
      findPaths(project, request("src/lib.ts#target", "src/callers.ts#c0")),
    );
    const expected = analyzeFocus(project, {
      file: `${MEMORY_ROOT}/src/lib.ts`,
      offset: HUB["src/lib.ts"].indexOf("target"),
      repoRoot: MEMORY_ROOT,
    });
    expect(outcome.centre).toEqual(expected);
    expect(outcome.centre.truncated).toBe(true);
    expect(outcome.centre.nodes.filter((n) => n.isTest)).toHaveLength(0);
  });

  it("gives a route box that is also in the centre identical data", () => {
    const project = memoryProject(HUB);
    const outcome = foundOutcome(
      findPaths(project, request("src/lib.ts#target", "src/callers.ts#c0")),
    );
    const inRoute = outcome.route.nodes.find((n) => n.id.endsWith("#c0"));
    const inCentre = outcome.centre.nodes.find((n) => n.id.endsWith("#c0"));
    expect(inRoute).toBeDefined();
    expect(inRoute).toEqual(inCentre);
  });

  it("counts route boxes only against the box cap, A's neighbours are extra", () => {
    const project = memoryProject(HUB);
    const outcome = foundOutcome(
      findPaths(project, {
        ...request("src/lib.ts#target", "src/callers.ts#c0"),
        limits: { timeLimitMs: 60_000, maxBoxes: 2 },
      }),
    );
    expect(outcome.route.nodes).toHaveLength(2);
    expect(outcome.centre.nodes.length).toBeGreaterThan(40);
  });

  it("still builds the centre when the time limit stopped the search", () => {
    const project = memoryProject({
      ...HUB,
      "src/deep.ts":
        'import { c1 } from "./callers.js"\nexport function deep() { c1() }\n',
    });
    const { signal, onProgress } = tripAfterFirstRound();
    const outcome = foundOutcome(
      findPaths(
        project,
        request("src/lib.ts#target", "src/callers.ts#c0", {
          signal,
          onProgress,
        }),
      ),
    );
    expect(outcome.path.summary.stoppedBy).toBe("time");
    expect(outcome.centre.focusId).toBe("src/lib.ts#target");
    expect(outcome.centre.nodes.length).toBeGreaterThan(1);
  });

  it("reports checked and no centre for none, and stoppedBy time when the limit ended it", () => {
    const project = memoryProject({
      ...CHAIN,
      "src/other.ts": "export function other() {}\n",
    });
    const unrelated = findPaths(
      project,
      request("src/low.ts#low", "src/other.ts#other"),
    );
    expect(unrelated).toEqual({ status: "none", checked: 4 });
    expect(unrelated).not.toHaveProperty("centre");

    const { signal, onProgress } = tripAfterFirstRound();
    const timed = findPaths(
      project,
      request("src/low.ts#low", "src/top.ts#top", { signal, onProgress }),
    );
    expect(timed).toEqual({ status: "none", checked: 2, stoppedBy: "time" });
  });

  it("gives cancelled for a flag set before the start", () => {
    const project = memoryProject(CHAIN);
    const flag = new Int32Array(new SharedArrayBuffer(4));
    Atomics.store(flag, 0, 1);
    const outcome = findPaths(
      project,
      request("src/low.ts#low", "src/top.ts#top", {
        signal: createStopSignal(flag, 60_000),
      }),
    );
    expect(outcome).toEqual({ status: "cancelled" });
  });

  it("throws for equal ends and NodeNotFoundError for a missing end", () => {
    const project = memoryProject(CHAIN);
    expect(() =>
      findPaths(project, request("src/low.ts#low", "src/low.ts#low")),
    ).toThrow("The start and the end are the same function");
    for (const [from, to] of [
      ["src/gone.ts#x", "src/top.ts#top"],
      ["src/low.ts#low", "src/top.ts#deleted"],
    ] as const) {
      let error: unknown;
      try {
        findPaths(project, request(from, to));
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(NodeNotFoundError);
    }
  });

  it("throws the same-function error for equal ends that do not exist", () => {
    const project = memoryProject(CHAIN);
    let error: unknown;
    try {
      findPaths(project, request("src/gone.ts#x", "src/gone.ts#x"));
    } catch (thrown) {
      error = thrown;
    }
    expect(error).not.toBeInstanceOf(NodeNotFoundError);
    expect((error as Error).message).toBe(
      "The start and the end are the same function",
    );
  });

  it("sends onProgress (0, 0) first", () => {
    const project = memoryProject(CHAIN);
    const seen: PathProgress[] = [];
    findPaths(
      project,
      request("src/low.ts#low", "src/top.ts#top", {
        onProgress: (progress) => seen.push(progress),
      }),
    );
    expect(seen[0]).toEqual({ checked: 0, routes: 0, routesCapped: false });
    expect(seen.length).toBeGreaterThan(1);
  });

  it("holds the same boxes in path.boxes and route.nodes, and exactly the route's edge ids", () => {
    const project = memoryProject(CHAIN);
    const { path, route } = foundOutcome(
      findPaths(project, request("src/low.ts#low", "src/top.ts#top")),
    );
    expect(path.boxes.map((box) => box.id).sort()).toEqual(
      route.nodes.map((n) => n.id),
    );
    expect(path.edgeIds).toEqual(route.edges.map((e) => e.id));
  });

  it("lets a test function be an end while test callers elsewhere stay off the route", () => {
    const project = memoryProject({
      "src/low.ts": CHAIN["src/low.ts"],
      "src/mid.ts": CHAIN["src/mid.ts"],
      "src/mid.test.ts":
        'import { mid } from "./mid.js"\nexport function viaTest() { mid() }\nexport function other() { mid() }\n',
    });
    const outcome = foundOutcome(
      findPaths(project, request("src/low.ts#low", "src/mid.test.ts#viaTest")),
    );
    const ids = outcome.route.nodes.map((n) => n.id);
    expect(ids).toContain("src/mid.test.ts#viaTest");
    expect(ids).not.toContain("src/mid.test.ts#other");
    expect(
      outcome.route.nodes.find((n) => n.id === "src/mid.test.ts#viaTest")
        ?.isTest,
    ).toBe(true);
  });

  it("does not find a route through a library function", () => {
    const project = memoryProject({
      "src/lib.d.ts":
        'declare module "lib" { export function run(): void }\n',
      "src/a.ts": "export function a() {}\n",
      "src/b.ts": 'import { run } from "lib"\nexport function b() { run() }\n',
    });
    expect(findPaths(project, request("src/a.ts#a", "src/b.ts#b"))).toEqual({
      status: "none",
      checked: 2,
    });
  });
});
