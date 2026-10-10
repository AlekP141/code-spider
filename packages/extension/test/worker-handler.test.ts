import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkerHandler } from "../src/worker/handler.js";
import { ProjectCache } from "../src/worker/project-cache.js";
import type { WorkerResponse } from "../src/worker/protocol.js";
import { fixturePath, offsetOf } from "./support/fixtures.js";

const signup = fixturePath("basic", "src/signup.ts");
const insideHandleSignup = offsetOf(signup, "validateUser(input)", 3);
const basicTsconfig = fixturePath("basic", "tsconfig.json");

function idsOf(response: WorkerResponse): string[] {
  if (response.kind !== "focused") throw new Error(`got ${response.kind}`);
  return response.result.slice.nodes.map((node) => node.id);
}

describe("createWorkerHandler", () => {
  it("answers a focus request with the slice and the repo root", () => {
    const handle = createWorkerHandler();
    const response = handle({
      id: 7,
      kind: "focus",
      file: signup,
      offset: insideHandleSignup,
      changedFiles: [],
    });
    expect(response.id).toBe(7);
    if (response.kind !== "focused") throw new Error(response.kind);
    expect(response.result.slice.focusId).toBe("src/signup.ts#handleSignup");
    expect(response.result.repoRoot).toBe(fixturePath("basic"));
    expect(response.result.tsconfig).toBe(basicTsconfig);
  });

  it("answers a warm request", () => {
    const handle = createWorkerHandler();
    expect(
      handle({ id: 1, kind: "warm", file: signup, changedFiles: [] }),
    ).toEqual({ id: 1, kind: "warmed" });
  });

  it("reports a cursor outside any callable as a failure, not a throw", () => {
    const handle = createWorkerHandler();
    const response = handle({
      id: 2,
      kind: "focus",
      file: fixturePath("basic", "src/types.ts"),
      offset: 0,
      changedFiles: [],
    });
    expect(response.kind).toBe("failed");
    if (response.kind === "failed") {
      expect(response.message).toContain("No callable found");
    }
  });

  it("reports a missing tsconfig as a failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-spider-notsconfig-"));
    try {
      const file = join(dir, "a.ts");
      writeFileSync(file, "export const a = 1;\n");
      const response = createWorkerHandler()({
        id: 3,
        kind: "focus",
        file,
        offset: 0,
        changedFiles: [],
      });
      expect(response.kind).toBe("failed");
      if (response.kind === "failed") {
        expect(response.message).toContain("No tsconfig.json found");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createWorkerHandler sliceForNode", () => {
  it("slices around a node of the given project without being told a file", () => {
    const handle = createWorkerHandler();
    const response = handle({
      id: 4,
      kind: "sliceForNode",
      tsconfig: basicTsconfig,
      nodeId: "src/signup.ts#validateUser",
      changedFiles: [],
    });
    expect(response.id).toBe(4);
    if (response.kind !== "sliced") throw new Error(response.kind);
    expect(response.result.slice.focusId).toBe("src/signup.ts#validateUser");
    expect(response.result.tsconfig).toBe(basicTsconfig);
    expect(response.result.repoRoot).toBe(fixturePath("basic"));
    expect(response.result.slice.nodes.map((node) => node.id)).toContain(
      "src/signup.ts#handleSignup",
    );
  });

  it("reports a node the project cannot find as a failure", () => {
    const response = createWorkerHandler()({
      id: 5,
      kind: "sliceForNode",
      tsconfig: basicTsconfig,
      nodeId: "src/signup.ts#renamedAway",
      changedFiles: [],
    });
    expect(response.kind).toBe("failed");
    if (response.kind === "failed") {
      expect(response.message).toContain("Node not found");
    }
  });

  it("reports a node that cannot be expanded as a failure", () => {
    const response = createWorkerHandler()({
      id: 6,
      kind: "sliceForNode",
      tsconfig: basicTsconfig,
      nodeId: "external:tiny-lib#persist",
      changedFiles: [],
    });
    expect(response.kind).toBe("failed");
    if (response.kind === "failed") {
      expect(response.message).toContain("not expandable");
    }
  });
});

describe("ProjectCache", () => {
  it("keeps one warm project per tsconfig", () => {
    const cache = new ProjectCache();
    const first = cache.open(signup);
    const sameProject = cache.open(fixturePath("basic", "src/app.ts"));
    const otherProject = cache.open(fixturePath("jsx", "src/components.tsx"));
    expect(sameProject).toBe(first);
    expect(otherProject).not.toBe(first);
  });

  it("warms a project once", () => {
    const cache = new ProjectCache();
    const entry = cache.open(signup);
    expect(entry.warmed).toBe(false);
    cache.warm(entry);
    expect(entry.warmed).toBe(true);
  });

  it("evicts the least recently used project beyond the cap", () => {
    const cache = new ProjectCache();
    const jsxFile = fixturePath("jsx", "src/components.tsx");
    const basic = cache.open(signup);
    const jsx = cache.open(jsxFile);
    cache.open(signup);
    cache.open(fixturePath("hub", "src/callers.ts"));
    cache.open(fixturePath("barrel", "src/consumer.ts"));
    expect(cache.open(signup)).toBe(basic);
    expect(cache.open(jsxFile)).not.toBe(jsx);
  });

  it("opens a project by tsconfig and shares it with open()", () => {
    const cache = new ProjectCache();
    const entry = cache.open(signup);
    expect(entry.tsconfig).toBe(basicTsconfig);
    expect(cache.openTsconfig(basicTsconfig)).toBe(entry);
  });

  it("reloads a project by tsconfig after it was evicted", () => {
    const cache = new ProjectCache();
    const basic = cache.open(signup);
    cache.open(fixturePath("jsx", "src/components.tsx"));
    cache.open(fixturePath("hub", "src/callers.ts"));
    cache.open(fixturePath("barrel", "src/consumer.ts"));
    const reloaded = cache.openTsconfig(basicTsconfig);
    expect(reloaded).not.toBe(basic);
    expect(reloaded.tsconfig).toBe(basicTsconfig);
    expect(reloaded.project.getSourceFile(signup)).toBeDefined();
  });
});

describe("ProjectCache files outside the tsconfig", () => {
  const dir = mkdtempSync(join(tmpdir(), "code-spider-outside-"));
  const outside = join(dir, "scripts/tool.ts");
  beforeAll(() => {
    cpSync(fixturePath("basic"), dir, { recursive: true });
    mkdirSync(join(dir, "scripts"));
    writeFileSync(outside, "export function tool(): number {\n  return 1\n}\n");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("re-adds a focused file the tsconfig does not include when the project is reloaded", () => {
    const cache = new ProjectCache();
    const entry = cache.open(outside);
    expect(entry.project.getSourceFile(outside)).toBeDefined();
    cache.open(fixturePath("jsx", "src/components.tsx"));
    cache.open(fixturePath("hub", "src/callers.ts"));
    cache.open(fixturePath("barrel", "src/consumer.ts"));
    const reloaded = cache.openTsconfig(entry.tsconfig);
    expect(reloaded).not.toBe(entry);
    expect(reloaded.project.getSourceFile(outside)).toBeDefined();
  });
});

describe("changed-file refresh", () => {
  const dir = mkdtempSync(join(tmpdir(), "code-spider-refresh-"));
  beforeAll(() => cpSync(fixturePath("basic"), dir, { recursive: true }));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("applies saved files on the next request and not before", () => {
    const file = join(dir, "src/signup.ts");
    const offset = offsetOf(file, "validateUser(input)", 3);
    const handle = createWorkerHandler();
    const focus = (changedFiles: string[]) =>
      handle({ id: 1, kind: "focus", file, offset, changedFiles });

    expect(idsOf(focus([]))).not.toContain("src/signup.ts#extra");

    const edited = readFileSync(file, "utf8").replace(
      "  return user\n}",
      "  extra()\n  return user\n}\n\nexport function extra(): number {\n  return 1\n}",
    );
    writeFileSync(file, edited);

    expect(idsOf(focus([]))).not.toContain("src/signup.ts#extra");
    expect(idsOf(focus([file]))).toContain("src/signup.ts#extra");
  });

  it("adds the focus file from disk when it was created after the project loaded", () => {
    const handle = createWorkerHandler();
    const existing = join(dir, "src/signup.ts");
    handle({ id: 1, kind: "warm", file: existing, changedFiles: [] });

    const created = join(dir, "src/created.ts");
    writeFileSync(
      created,
      "export function created(): number {\n  return 1\n}\n",
    );
    const response = handle({
      id: 2,
      kind: "focus",
      file: created,
      offset: offsetOf(created, "return", 1),
      changedFiles: [created],
    });
    expect(idsOf(response)).toContain("src/created.ts#created");
  });

  it("applies saved files when a project is opened by tsconfig", () => {
    const cache = new ProjectCache();
    const file = join(dir, "src/types.ts");
    const entry = cache.open(file);
    writeFileSync(
      file,
      `${readFileSync(file, "utf8")}export type Added = number\n`,
    );
    cache.noteChanged([file]);
    expect(cache.openTsconfig(entry.tsconfig)).toBe(entry);
    expect(entry.project.getSourceFile(file)?.getFullText()).toContain("Added");
  });
});
