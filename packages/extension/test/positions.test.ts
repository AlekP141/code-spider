import { describe, expect, it } from "vitest";
import { positionToOffset } from "../src/positions.js";

describe("positionToOffset", () => {
  it("maps positions on the first line", () => {
    expect(positionToOffset("abc\ndef\n", 0, 0)).toBe(0);
    expect(positionToOffset("abc\ndef\n", 0, 2)).toBe(2);
  });

  it("counts the newline of every earlier line", () => {
    expect(positionToOffset("abc\ndef\nghi", 1, 1)).toBe(5);
    expect(positionToOffset("abc\ndef\nghi", 2, 0)).toBe(8);
  });

  it("counts the carriage return of CRLF lines", () => {
    expect(positionToOffset("abc\r\ndef\r\n", 1, 1)).toBe(6);
  });

  it("accepts the end of a line and the empty last line", () => {
    expect(positionToOffset("abc\ndef\n", 0, 3)).toBe(3);
    expect(positionToOffset("abc\n", 1, 0)).toBe(4);
  });

  it("clamps a character past the end of the line", () => {
    expect(positionToOffset("abc\ndef", 0, 99)).toBe(3);
  });

  it("rejects a line outside the text", () => {
    expect(() => positionToOffset("abc", 1, 0)).toThrow(RangeError);
    expect(() => positionToOffset("abc", -1, 0)).toThrow(RangeError);
  });
});
