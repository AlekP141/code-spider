import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { memoiseTsMorphPaths } from "../../src/project/ts-morph-paths.js";

const require = createRequire(import.meta.url);
const { FileUtils } = createRequire(require.resolve("ts-morph"))(
  "@ts-morph/common",
);
const fileSystem = { getCurrentDirectory: () => "/work" };

describe("memoiseTsMorphPaths", () => {
  const before = (path: string, base?: string) =>
    FileUtils.getStandardizedAbsolutePath(fileSystem, path, base);
  const samples = [
    ["/repo/src/../lib/a.ts"],
    ["/repo//src/./b.ts"],
    ["src/c.ts"],
    ["../d.ts", "/repo/src"],
  ] as const;
  const expected = samples.map(([path, base]) => before(path, base));

  it("still finds the ts-morph internal it patches", () => {
    expect(memoiseTsMorphPaths()).toBe(true);
  });

  it("returns the same paths as before, absolute or relative", () => {
    memoiseTsMorphPaths();
    const after = samples.map(([path, base]) =>
      FileUtils.getStandardizedAbsolutePath(fileSystem, path, base),
    );
    expect(after).toEqual(expected);
  });

  it("patches only once", () => {
    memoiseTsMorphPaths();
    const patched = FileUtils.getStandardizedAbsolutePath;
    memoiseTsMorphPaths();
    expect(FileUtils.getStandardizedAbsolutePath).toBe(patched);
  });
});
