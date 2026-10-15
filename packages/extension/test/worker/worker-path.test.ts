import { describe, expect, it } from "vitest";
import { createWorkerHandler } from "../../src/worker/handler.js";
import { ProjectCache } from "../../src/worker/project-cache.js";
import type {
  FindPathResult,
  WorkerResponse,
} from "../../src/worker/protocol.js";
import { fixturePath, positionOf } from "../support/fixtures.js";

const tsconfig = fixturePath("paths", "tsconfig.json");
const report = fixturePath("paths", "src/report.ts");
const limits = { timeLimitMs: 60_000, maxBoxes: 200 };

const LOAD_ROWS = "src/report.ts#loadRows";
const RENDER_CELL = "src/report.ts#renderCell";

function flag(set = false): SharedArrayBuffer {
  const buffer = new SharedArrayBuffer(4);
  if (set) Atomics.store(new Int32Array(buffer), 0, 1);
  return buffer;
}

function findPath(
  handle: ReturnType<typeof createWorkerHandler>,
  fromId: string,
  toId: string,
  extra: { cancel?: SharedArrayBuffer; timeLimitMs?: number } = {},
  emit?: (response: WorkerResponse) => void,
) {
  return handle(
    {
      id: 5,
      kind: "findPath",
      tsconfig,
      fromId,
      toId,
      limits: { ...limits, timeLimitMs: extra.timeLimitMs ?? 60_000 },
      cancel: extra.cancel ?? flag(),
      changedFiles: [],
    },
    emit,
  );
}

function done(response: WorkerResponse): FindPathResult {
  if (response.kind !== "pathDone") {
    throw new Error(
      response.kind === "failed" ? response.message : response.kind,
    );
  }
  return response.result;
}

describe("worker resolveEnd", () => {
  const resolve = (file: string, needle: string, delta = 0) =>
    createWorkerHandler()({
      id: 3,
      kind: "resolveEnd",
      file,
      ...positionOf(file, needle, delta),
      changedFiles: [],
    });

  it("answers the function at the cursor with id, name, tsconfig, repo root and test flag", () => {
    const response = resolve(report, "renderCell(row: string)", 4);
    expect(response).toEqual({
      id: 3,
      kind: "resolved",
      result: {
        tsconfig,
        repoRoot: fixturePath("paths"),
        nodeId: RENDER_CELL,
        name: "renderCell",
        isTest: false,
      },
    });
    const test = fixturePath("paths", "src/helper.test.ts");
    const inTest = resolve(test, "return helper()", 2);
    if (inTest.kind !== "resolved") throw new Error(inTest.kind);
    expect(inTest.result).toMatchObject({
      nodeId: "src/helper.test.ts#checkHelper",
      isTest: true,
    });
  });

  it("answers undefined when no function is found", () => {
    const response = createWorkerHandler()({
      id: 4,
      kind: "resolveEnd",
      file: fixturePath("paths", "src/lonely.test.ts"),
      line: 0,
      character: 3,
      changedFiles: [],
    });
    expect(response).toEqual({ id: 4, kind: "resolved", result: undefined });
  });

  it("fails for a file that is not in the project", () => {
    const response = createWorkerHandler()({
      id: 3,
      kind: "resolveEnd",
      file: fixturePath("paths", "src/missing.ts"),
      line: 0,
      character: 0,
      changedFiles: [],
    });
    expect(response.kind).toBe("failed");
  });
});

describe("worker findPath", () => {
  it("answers a found outcome with route, path and centre", () => {
    const result = done(
      findPath(createWorkerHandler(), LOAD_ROWS, RENDER_CELL),
    );
    expect(result.tsconfig).toBe(tsconfig);
    expect(result.repoRoot).toBe(fixturePath("paths"));
    if (result.outcome.status !== "found") throw new Error("not found");
    expect(result.outcome.path.endId).toBe(RENDER_CELL);
    expect(result.outcome.path.boxes).toHaveLength(5);
    expect(result.outcome.route.nodes).toHaveLength(5);
    expect(result.outcome.centre.focusId).toBe(LOAD_ROWS);
  });

  it("emits pathProgress with the request id, starting at 0 checked, before pathDone", () => {
    const emitted: WorkerResponse[] = [];
    const response = findPath(
      createWorkerHandler(),
      LOAD_ROWS,
      RENDER_CELL,
      {},
      (item) => emitted.push(item),
    );
    expect(response.kind).toBe("pathDone");
    expect(emitted.length).toBeGreaterThan(1);
    expect(emitted.every((item) => item.kind === "pathProgress")).toBe(true);
    expect(emitted.every((item) => item.id === 5)).toBe(true);
    const first = emitted[0];
    if (first?.kind !== "pathProgress") throw new Error("no progress");
    expect(first.progress.checked).toBe(0);
  });

  it("answers none when no route exists", () => {
    const result = done(
      findPath(
        createWorkerHandler(),
        "src/lonely.ts#lonely",
        "src/lonely.ts#elsewhere",
      ),
    );
    expect(result.outcome.status).toBe("none");
  });

  it("accepts a test function as an end", () => {
    const result = done(
      findPath(
        createWorkerHandler(),
        "src/helper.test.ts#checkHelper",
        "src/helper.ts#leaf",
      ),
    );
    if (result.outcome.status !== "found") throw new Error("not found");
    expect(result.outcome.path.boxes.map((box) => box.id).sort()).toEqual([
      "src/helper.test.ts#checkHelper",
      "src/helper.ts#helper",
      "src/helper.ts#leaf",
    ]);
  });

  it("answers cancelled when the flag was set before the request", () => {
    const result = done(
      findPath(createWorkerHandler(), LOAD_ROWS, RENDER_CELL, {
        cancel: flag(true),
      }),
    );
    expect(result.outcome).toEqual({ status: "cancelled" });
  });

  it("answers cancelled at the next check when the first progress sets the flag", () => {
    const cancel = flag();
    const result = done(
      findPath(
        createWorkerHandler(),
        LOAD_ROWS,
        RENDER_CELL,
        { cancel },
        () => Atomics.store(new Int32Array(cancel), 0, 1),
      ),
    );
    expect(result.outcome).toEqual({ status: "cancelled" });
  });

  it("starts the clock after the warm", () => {
    let clock = 0;
    class SlowWarm extends ProjectCache {
      override warm(entry: Parameters<ProjectCache["warm"]>[0]): void {
        super.warm(entry);
        clock += 10_000;
      }
    }
    const handle = createWorkerHandler(new SlowWarm(), () => clock);
    const result = done(
      findPath(handle, LOAD_ROWS, RENDER_CELL, { timeLimitMs: 1_000 }),
    );
    expect(result.outcome.status).toBe("found");
  });

  it("stops at the time limit with stoppedBy time", () => {
    let clock = 0;
    const handle = createWorkerHandler(new ProjectCache(), () => (clock += 10));
    const result = done(
      findPath(handle, LOAD_ROWS, RENDER_CELL, { timeLimitMs: 5 }),
    );
    expect(result.outcome).toMatchObject({ status: "none", stoppedBy: "time" });
  });

  it("answers gone with the node id when an end is missing", () => {
    const missing = "src/report.ts#vanished";
    const asEnd = done(findPath(createWorkerHandler(), LOAD_ROWS, missing));
    expect(asEnd.outcome).toEqual({ status: "gone", nodeId: missing });
    const asStart = done(findPath(createWorkerHandler(), missing, LOAD_ROWS));
    expect(asStart.outcome).toEqual({ status: "gone", nodeId: missing });
  });

  it("fails with the core message when the ends are equal", () => {
    const response = findPath(createWorkerHandler(), LOAD_ROWS, LOAD_ROWS);
    expect(response.kind).toBe("failed");
    if (response.kind === "failed") {
      expect(response.message).toBe(
        "The start and the end are the same function",
      );
    }
  });

  it("answers without an emit hook", () => {
    const response = createWorkerHandler()({
      id: 6,
      kind: "findPath",
      tsconfig,
      fromId: LOAD_ROWS,
      toId: RENDER_CELL,
      limits,
      cancel: flag(),
      changedFiles: [],
    });
    expect(response.kind).toBe("pathDone");
    expect(response.id).toBe(6);
  });
});
