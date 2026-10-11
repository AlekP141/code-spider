import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeTarget,
  main,
  parseArgs,
  parseTarget,
} from "../src/index.js";

const SIGNUP = fileURLToPath(
  new URL("../../../test-code/basic/src/signup.ts", import.meta.url),
);
const GOLDEN = fileURLToPath(
  new URL(
    "../../core/test/__goldens__/basic-handleSignup.json",
    import.meta.url,
  ),
);
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

describe("parseTarget", () => {
  it("splits file:line:col", () => {
    expect(parseTarget("src/a.ts:12:5")).toEqual({
      file: "src/a.ts",
      line: 12,
      col: 5,
    });
  });

  it("defaults the column to 1", () => {
    expect(parseTarget("src/a.ts:12")).toEqual({
      file: "src/a.ts",
      line: 12,
      col: 1,
    });
  });

  it("handles a Windows absolute path with a drive letter", () => {
    expect(parseTarget("C:\\repo\\a.ts:3:2")).toEqual({
      file: "C:\\repo\\a.ts",
      line: 3,
      col: 2,
    });
  });

  it("throws without a line number", () => {
    expect(() => parseTarget("src/a.ts")).toThrow(/Expected <file>:<line>/);
  });

  it("rejects a zero line or column", () => {
    expect(() => parseTarget("src/a.ts:0")).toThrow(/Expected <file>:<line>/);
    expect(() => parseTarget("src/a.ts:1:0")).toThrow(/Expected <file>:<line>/);
  });

  it("rejects a trailing colon after the line", () => {
    expect(() => parseTarget("src/a.ts:12:")).toThrow(/Expected <file>:<line>/);
  });

  it("rejects an empty column between colons", () => {
    expect(() => parseTarget("src/a.ts::3")).toThrow(/Expected <file>:<line>/);
  });

  it("rejects numbers that are not safe integers", () => {
    expect(() => parseTarget("src/a.ts:12345678901234567890123")).toThrow(
      /Expected <file>:<line>/,
    );
    expect(() => parseTarget("src/a.ts:1:99999999999999999999")).toThrow(
      /Expected <file>:<line>/,
    );
  });
});

describe("parseArgs", () => {
  it("reads the target and --root in either order", () => {
    expect(parseArgs(["a.ts:1", "--root", "/r"])).toEqual({
      target: "a.ts:1",
      root: "/r",
    });
    expect(parseArgs(["--root", "/r", "a.ts:1"])).toEqual({
      target: "a.ts:1",
      root: "/r",
    });
  });

  it("accepts --root=<dir> as well as --root <dir>", () => {
    expect(parseArgs(["--root=/r", "a.ts:1"])).toEqual({
      target: "a.ts:1",
      root: "/r",
    });
  });

  it("throws when --root= has an empty value", () => {
    expect(() => parseArgs(["a.ts:1", "--root="])).toThrow(/--root requires/);
  });

  it("leaves root undefined when --root is absent", () => {
    expect(parseArgs(["a.ts:1"])).toEqual({
      target: "a.ts:1",
      root: undefined,
    });
  });

  it("throws when --root has no value", () => {
    expect(() => parseArgs(["a.ts:1", "--root"])).toThrow(/--root requires/);
    expect(() => parseArgs(["--root", "--x", "a.ts:1"])).toThrow(
      /--root requires/,
    );
  });

  it("throws for an unknown option, missing target, or extra argument", () => {
    expect(() => parseArgs(["a.ts:1", "--bogus"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["--root", "/r"])).toThrow(/Missing/);
    expect(() => parseArgs(["a.ts:1", "b.ts:2"])).toThrow(/Unexpected/);
  });
});

describe("analyzeTarget", () => {
  it("matches the core golden slice for handleSignup", () => {
    const slice = analyzeTarget(`${SIGNUP}:19:3`);
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));

    expect(JSON.parse(JSON.stringify(slice))).toEqual(golden);
  });

  it("uses an explicit --root for NodeIds", () => {
    const slice = analyzeTarget(`${SIGNUP}:19:3`, REPO_ROOT);
    expect(slice.focusId).toBe("test-code/basic/src/signup.ts#handleSignup");
  });

  it("throws for a missing file", () => {
    expect(() => analyzeTarget("no/such/file.ts:1")).toThrow(/File not found/);
  });

  it("clamps a column past the end of the line", () => {
    expect(analyzeTarget(`${SIGNUP}:19:999`)).toEqual(
      analyzeTarget(`${SIGNUP}:19:3`),
    );
  });

  it("throws for a line past the end of the file", () => {
    expect(() => analyzeTarget(`${SIGNUP}:9999`)).toThrow(/out of range/);
  });
});

describe("main", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the slice as JSON and returns 0 on success", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(main([`${SIGNUP}:19:3`])).toBe(0);
    const printed = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(printed.focusId).toBe("src/signup.ts#handleSignup");
  });

  it("returns 2 with usage when no arguments are given", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(main([])).toBe(2);
    expect(error.mock.calls[0]?.[0]).toMatch(/^usage:/);
  });

  it("reports a bad target as a one-line error and returns 1", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(main(["--root"])).toBe(1);
    expect(error).toHaveBeenCalledWith(
      "code-spider: --root requires a directory",
    );
  });

  it("returns 1 for a missing file", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(main(["no/such/file.ts:1"])).toBe(1);
    expect(error.mock.calls[0]?.[0]).toMatch(/^code-spider: File not found/);
  });
});
