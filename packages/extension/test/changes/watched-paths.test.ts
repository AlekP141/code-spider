import { describe, expect, it } from "vitest";
import {
  CONFIG_WATCH_GLOB,
  SOURCE_EXTENSIONS,
  SOURCE_WATCH_GLOB,
  isConfigFile,
  isTrackedPath,
} from "../../src/changes/watched-paths.js";

describe("isTrackedPath", () => {
  it("tracks every listed extension, in any case", () => {
    expect(SOURCE_EXTENSIONS).toHaveLength(8);
    for (const ext of SOURCE_EXTENSIONS) {
      expect(isTrackedPath(`/repo/src/a.${ext}`)).toBe(true);
      expect(isTrackedPath(`/repo/src/A.${ext.toUpperCase()}`)).toBe(true);
    }
  });

  it("tracks declaration files", () => {
    expect(isTrackedPath("/repo/src/types.d.ts")).toBe(true);
  });

  it("does not track other files", () => {
    expect(isTrackedPath("/repo/README.md")).toBe(false);
    expect(isTrackedPath("/repo/package.json")).toBe(false);
    expect(isTrackedPath("/repo/src/style.css")).toBe(false);
    expect(isTrackedPath("/repo/src/ts")).toBe(false);
  });

  it("tracks config files", () => {
    expect(isTrackedPath("/repo/tsconfig.json")).toBe(true);
    expect(isTrackedPath("C:\\repo\\jsconfig.json")).toBe(true);
  });

  it("excludes any node_modules segment, with either separator", () => {
    expect(isTrackedPath("/repo/node_modules/lib/index.ts")).toBe(false);
    expect(isTrackedPath("C:\\repo\\node_modules\\lib\\index.ts")).toBe(false);
    expect(isTrackedPath("/repo/node_modules/lib/tsconfig.json")).toBe(false);
    expect(isTrackedPath("/repo/my_node_modules/index.ts")).toBe(true);
  });
});

describe("isConfigFile", () => {
  it("accepts tsconfig and jsconfig files", () => {
    expect(isConfigFile("/repo/tsconfig.json")).toBe(true);
    expect(isConfigFile("/repo/tsconfig.build.json")).toBe(true);
    expect(isConfigFile("/repo/jsconfig.json")).toBe(true);
  });

  it("rejects other names", () => {
    expect(isConfigFile("/repo/tsconfig.txt")).toBe(false);
    expect(isConfigFile("/repo/xtsconfig.json")).toBe(false);
    expect(isConfigFile("/repo/package.json")).toBe(false);
  });
});

describe("watch globs", () => {
  it("lists exactly the source extensions", () => {
    const listed = /^\*\*\/\*\.\{([^}]*)\}$/.exec(SOURCE_WATCH_GLOB)?.[1];
    expect(listed?.split(",")).toEqual([...SOURCE_EXTENSIONS]);
  });

  it("names both tsconfig and jsconfig", () => {
    expect(CONFIG_WATCH_GLOB).toBe("**/{tsconfig,jsconfig}*.json");
  });
});
