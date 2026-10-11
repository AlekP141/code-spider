import { describe, expect, it } from "vitest";
import { positionToOffset } from "../src/position.js";

describe("positionToOffset", () => {
  it("counts LF line breaks", () => {
    const text = "line one\nline two\nline three";
    expect(positionToOffset(text, 0, 0)).toBe(0);
    expect(positionToOffset(text, 0, 5)).toBe(5);
    expect(positionToOffset(text, 1, 0)).toBe(9);
    expect(positionToOffset(text, 2, 2)).toBe(20);
  });

  it("counts a CRLF break once, as two characters", () => {
    expect(positionToOffset("a\r\nb", 1, 0)).toBe(3);
  });

  it("handles mixed line endings", () => {
    const text = "ab\r\ncd\nef";
    expect(positionToOffset(text, 1, 1)).toBe(5);
    expect(positionToOffset(text, 2, 1)).toBe(8);
  });

  it("treats a lone CR as a line break", () => {
    expect(positionToOffset("ab\rcd", 1, 1)).toBe(4);
  });

  it("does not count a leading byte-order mark as a character of line 0", () => {
    const text = "\uFEFFab\ncd";
    expect(positionToOffset(text, 0, 1)).toBe(2);
    expect(positionToOffset(text, 1, 0)).toBe(4);
    expect(positionToOffset(text, 0, 0)).toBe(1);
  });

  it("counts no offset shift without a byte-order mark", () => {
    expect(positionToOffset("ab\ncd", 0, 1)).toBe(1);
    expect(positionToOffset("ab\ncd", 1, 0)).toBe(3);
  });

  it("clamps a character past the end to the line end, break excluded", () => {
    expect(positionToOffset("ab\r\ncd", 0, 99)).toBe(2);
    expect(positionToOffset("ab\ncd", 0, 99)).toBe(2);
    expect(positionToOffset("ab\ncd", 1, 99)).toBe(5);
  });

  it("clamps a negative character to 0", () => {
    expect(positionToOffset("ab\ncd", 1, -4)).toBe(3);
  });

  it("addresses the empty last line after a trailing newline", () => {
    expect(positionToOffset("ab\n", 1, 0)).toBe(3);
    expect(positionToOffset("ab\n", 1, 5)).toBe(3);
  });

  it("throws a RangeError for a line outside the text", () => {
    expect(() => positionToOffset("ab\ncd", 2, 0)).toThrow(RangeError);
    expect(() => positionToOffset("ab\ncd", 2, 0)).toThrow(
      "Line 3 is out of range (file has 2 lines)",
    );
    expect(() => positionToOffset("ab\ncd", -1, 0)).toThrow(
      "Line 0 is out of range (file has 2 lines)",
    );
    expect(() => positionToOffset("ab\n", 2, 0)).toThrow(
      "Line 3 is out of range (file has 2 lines)",
    );
  });
});
