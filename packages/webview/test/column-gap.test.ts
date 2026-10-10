import { describe, expect, it } from "vitest";
import { COLUMN_GAP, normaliseColumnGap } from "../src/column-gap.js";

describe("COLUMN_GAP", () => {
  it("is a 32 to 480 slider in steps of 16 that starts at 192", () => {
    expect(COLUMN_GAP).toEqual({ min: 32, max: 480, step: 16, default: 192 });
    expect((COLUMN_GAP.default - COLUMN_GAP.min) % COLUMN_GAP.step).toBe(0);
  });
});

describe("normaliseColumnGap", () => {
  it("falls back to the default for anything that is not a finite number", () => {
    for (const raw of [undefined, null, "wide", Number.NaN, Infinity, {}]) {
      expect(normaliseColumnGap(raw)).toBe(192);
    }
  });

  it("clamps to the range", () => {
    expect(normaliseColumnGap(0)).toBe(32);
    expect(normaliseColumnGap(-50)).toBe(32);
    expect(normaliseColumnGap(5000)).toBe(480);
  });

  it("snaps to the step and keeps valid values as they are", () => {
    expect(normaliseColumnGap(100)).toBe(96);
    expect(normaliseColumnGap(105)).toBe(112);
    for (const value of [32, 48, 192, 464, 480]) {
      expect(normaliseColumnGap(value)).toBe(value);
    }
  });
});
