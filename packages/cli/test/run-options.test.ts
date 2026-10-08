import { describe, expect, it } from "vitest";
import { parseRunOptions } from "../src/run-options.js";

describe("parseRunOptions", () => {
  it("defaults to no timing and a single run", () => {
    expect(parseRunOptions(["a.ts:1"])).toEqual({
      timing: false,
      repeat: 1,
      rest: ["a.ts:1"],
    });
  });

  it("extracts --timing from anywhere in the arguments", () => {
    expect(parseRunOptions(["--timing", "a.ts:1", "--root", "/r"])).toEqual({
      timing: true,
      repeat: 1,
      rest: ["a.ts:1", "--root", "/r"],
    });
  });

  it("accepts --repeat <n> and --repeat=<n>", () => {
    expect(parseRunOptions(["a.ts:1", "--repeat", "3"])).toEqual({
      timing: false,
      repeat: 3,
      rest: ["a.ts:1"],
    });
    expect(parseRunOptions(["--repeat=5", "a.ts:1"])).toEqual({
      timing: false,
      repeat: 5,
      rest: ["a.ts:1"],
    });
  });

  it("accepts the maximum repeat count", () => {
    expect(parseRunOptions(["--repeat=100", "a.ts:1"]).repeat).toBe(100);
  });

  it("rejects zero, negative, fractional, and non-numeric counts", () => {
    for (const value of ["0", "-1", "1.5", "abc", "1e3", ""]) {
      expect(() => parseRunOptions(["a.ts:1", "--repeat", value])).toThrow(
        "--repeat requires a positive integer",
      );
      expect(() => parseRunOptions([`--repeat=${value}`, "a.ts:1"])).toThrow(
        "--repeat requires a positive integer",
      );
    }
  });

  it("rejects a missing count or a count that is another flag", () => {
    expect(() => parseRunOptions(["a.ts:1", "--repeat"])).toThrow(
      "--repeat requires a positive integer",
    );
    expect(() => parseRunOptions(["--repeat", "--timing", "a.ts:1"])).toThrow(
      "--repeat requires a positive integer",
    );
  });

  it("leaves a flag in place when it is the value of --root", () => {
    expect(parseRunOptions(["--root", "--timing", "a.ts:1"])).toEqual({
      timing: false,
      repeat: 1,
      rest: ["--root", "--timing", "a.ts:1"],
    });
  });

  it("rejects counts above the maximum", () => {
    expect(() => parseRunOptions(["--repeat=101", "a.ts:1"])).toThrow(
      "--repeat must be at most 100",
    );
  });
});
