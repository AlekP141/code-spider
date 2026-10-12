import { describe, expect, it } from "vitest";
import { toZeroBasedRange } from "../../src/session/ranges.js";

describe("toZeroBasedRange", () => {
  it("shifts one-based lines and columns to zero-based positions", () => {
    expect(
      toZeroBasedRange({
        startLine: 3,
        startColumn: 1,
        endLine: 6,
        endColumn: 2,
      }),
    ).toEqual({
      startLine: 2,
      startCharacter: 0,
      endLine: 5,
      endCharacter: 1,
    });
  });

  it("keeps the exclusive end column exclusive", () => {
    const range = toZeroBasedRange({
      startLine: 18,
      startColumn: 22,
      endLine: 18,
      endColumn: 39,
    });
    expect(range.endCharacter - range.startCharacter).toBe(17);
  });

  it("never goes below zero for the empty range of an external node", () => {
    expect(
      toZeroBasedRange({
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
      }),
    ).toEqual({ startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0 });
  });
});
