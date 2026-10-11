import {
  cpSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkerHandler } from "../src/worker/handler.js";
import { ProjectCache } from "../src/worker/project-cache.js";
import type { WorkerResponse } from "../src/worker/protocol.js";
import { fixturePath, positionOf } from "./support/fixtures.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "code-spider-changes-"));
  cpSync(fixturePath("basic"), dir, { recursive: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const at = (rel: string) => join(dir, rel);
const newFunction = (name: string) =>
  `export function ${name}(): number {\n  return 1\n}\n`;

function idsOf(response: WorkerResponse): string[] {
  if (response.kind !== "focused") throw new Error(`got ${response.kind}`);
  return response.result.slice.nodes.map((node) => node.id);
}

describe("changed files in the project cache", () => {
  it("re-reads a changed known file", () => {
    const cache = new ProjectCache();
    const file = at("src/types.ts");
    const entry = cache.open(file);
    writeFileSync(file, `${readFileSync(file, "utf8")}export type Added = 1\n`);
    cache.noteChanged([file]);
    cache.openTsconfig(entry.tsconfig);
    expect(entry.project.getSourceFile(file)?.getFullText()).toContain("Added");
  });

  it("forgets a deleted known file", () => {
    const cache = new ProjectCache();
    const file = at("src/types.ts");
    const entry = cache.open(file);
    unlinkSync(file);
    cache.noteChanged([file]);
    cache.openTsconfig(entry.tsconfig);
    expect(entry.project.getSourceFile(file)).toBeUndefined();
  });

  it("adds several new files with one read of the tsconfig", () => {
    const cache = new ProjectCache();
    const entry = cache.open(at("src/signup.ts"));
    const spy = vi.spyOn(entry.project, "addSourceFilesFromTsConfig");
    const created = ["one", "two", "three"].map((name) => {
      const file = at(`src/${name}.ts`);
      writeFileSync(file, newFunction(name));
      return file;
    });
    cache.noteChanged(created);
    cache.openTsconfig(entry.tsconfig);
    expect(spy).toHaveBeenCalledTimes(1);
    for (const file of created) {
      expect(entry.project.getSourceFile(file)).toBeDefined();
    }
  });

  it("re-reads once for an existing file outside the include, then never for that path", () => {
    const cache = new ProjectCache();
    const entry = cache.open(at("src/signup.ts"));
    const spy = vi.spyOn(entry.project, "addSourceFilesFromTsConfig");
    const outside = at("scripts/tool.ts");
    cpSync(at("src/types.ts"), outside);
    cache.noteChanged([outside]);
    cache.openTsconfig(entry.tsconfig);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(entry.project.getSourceFile(outside)).toBeUndefined();

    cache.noteChanged([outside]);
    cache.openTsconfig(entry.tsconfig);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ignores a path that does not exist", () => {
    const cache = new ProjectCache();
    const entry = cache.open(at("src/signup.ts"));
    const spy = vi.spyOn(entry.project, "addSourceFilesFromTsConfig");
    cache.noteChanged([at("src/never-written.ts")]);
    cache.openTsconfig(entry.tsconfig);
    expect(spy).not.toHaveBeenCalled();
  });

  it("reloads a project from its edited config", () => {
    const cache = new ProjectCache();
    const entry = cache.open(at("src/signup.ts"));
    const extra = at("scripts/tool.ts");
    cpSync(at("src/types.ts"), extra);
    expect(entry.project.getSourceFile(extra)).toBeUndefined();
    const config = at("tsconfig.json");
    writeFileSync(
      config,
      readFileSync(config, "utf8").replace('["src"]', '["src", "scripts"]'),
    );
    cache.noteChanged([config]);
    const reloaded = cache.openTsconfig(entry.tsconfig);
    expect(reloaded).not.toBe(entry);
    expect(reloaded.project.getSourceFile(extra)).toBeDefined();
  });

  it("forgets the tsconfig lookup when a config file changed", () => {
    const cache = new ProjectCache();
    const file = at("src/signup.ts");
    cache.open(file);
    const nested = at("src/tsconfig.json");
    writeFileSync(nested, readFileSync(at("tsconfig.json"), "utf8"));
    cache.noteChanged([nested]);
    expect(cache.open(file).tsconfig).toBe(nested);
  });

  it("keeps files added from outside the include across a config change", () => {
    const cache = new ProjectCache();
    const outside = at("scripts/tool.ts");
    cpSync(at("src/types.ts"), outside);
    const entry = cache.open(outside);
    expect(entry.project.getSourceFile(outside)).toBeDefined();
    cache.noteChanged([at("tsconfig.json")]);
    const reloaded = cache.openTsconfig(entry.tsconfig);
    expect(reloaded).not.toBe(entry);
    expect(reloaded.project.getSourceFile(outside)).toBeDefined();
  });

  it("keeps the queue when applying throws, for the next use", () => {
    const cache = new ProjectCache();
    const entry = cache.open(at("src/signup.ts"));
    const created = at("src/created.ts");
    writeFileSync(created, newFunction("created"));
    const config = at("tsconfig.json");
    const hidden = at("tsconfig.hidden");
    renameSync(config, hidden);
    cache.noteChanged([created]);
    expect(() => cache.openTsconfig(entry.tsconfig)).toThrow();
    expect(entry.project.getSourceFile(created)).toBeUndefined();

    renameSync(hidden, config);
    cache.openTsconfig(entry.tsconfig);
    expect(entry.project.getSourceFile(created)).toBeDefined();
  });
});

describe("files drained by a request that fails", () => {
  const edit = (file: string) =>
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "  return user\n}",
        "  extra()\n  return user\n}\n\nexport function extra(): number {\n  return 1\n}",
      ),
    );

  it("are seen by the next request, after an unknown node failed", () => {
    const file = at("src/signup.ts");
    const position = positionOf(file, "validateUser(input)", 3);
    const handle = createWorkerHandler();
    const focus = (changedFiles: string[]) =>
      handle({ id: 1, kind: "focus", file, ...position, changedFiles });
    expect(idsOf(focus([]))).not.toContain("src/signup.ts#extra");

    edit(file);
    const failed = handle({
      id: 2,
      kind: "sliceForNode",
      tsconfig: at("tsconfig.json"),
      nodeId: "src/signup.ts#renamedAway",
      changedFiles: [file],
    });
    expect(failed.kind).toBe("failed");
    expect(idsOf(focus([]))).toContain("src/signup.ts#extra");
  });

  it("are seen by the next request, after a request failed before the project opened", () => {
    const file = at("src/signup.ts");
    const position = positionOf(file, "validateUser(input)", 3);
    const handle = createWorkerHandler();
    const focus = (changedFiles: string[]) =>
      handle({ id: 1, kind: "focus", file, ...position, changedFiles });
    expect(idsOf(focus([]))).not.toContain("src/signup.ts#extra");

    edit(file);
    const failed = handle({
      id: 2,
      kind: "sliceForNode",
      tsconfig: at("missing/tsconfig.json"),
      nodeId: "src/signup.ts#validateUser",
      changedFiles: [file],
    });
    expect(failed.kind).toBe("failed");
    expect(idsOf(focus([]))).toContain("src/signup.ts#extra");
  });
});
