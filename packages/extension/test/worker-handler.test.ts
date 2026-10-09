import {
  cpSync,
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
});
