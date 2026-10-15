import { describe, expect, it } from "vitest";
import {
  DEFAULT_PATH_MAX_BOXES,
  DEFAULT_PATH_TIME_LIMIT_SECONDS,
  normaliseMaxBoxes,
  normaliseTimeLimitSeconds,
  pathLimits,
} from "../../src/settings/path-limits.js";

describe("path limits", () => {
  it("defaults the time limit to 60 seconds for a non-number", () => {
    expect(DEFAULT_PATH_TIME_LIMIT_SECONDS).toBe(60);
    for (const raw of [undefined, null, "90", Number.NaN, Infinity]) {
      expect(normaliseTimeLimitSeconds(raw)).toBe(60);
    }
  });

  it("clamps the time limit into 5 to 3600", () => {
    expect(normaliseTimeLimitSeconds(1)).toBe(5);
    expect(normaliseTimeLimitSeconds(-30)).toBe(5);
    expect(normaliseTimeLimitSeconds(90)).toBe(90);
    expect(normaliseTimeLimitSeconds(7.9)).toBe(7);
    expect(normaliseTimeLimitSeconds(99999)).toBe(3600);
  });

  it("defaults max boxes to 200, floors it and clamps into 10 to 2000", () => {
    expect(DEFAULT_PATH_MAX_BOXES).toBe(200);
    for (const raw of [undefined, null, "50", Number.NaN, -Infinity]) {
      expect(normaliseMaxBoxes(raw)).toBe(200);
    }
    expect(normaliseMaxBoxes(150.9)).toBe(150);
    expect(normaliseMaxBoxes(3)).toBe(10);
    expect(normaliseMaxBoxes(5000)).toBe(2000);
  });

  it("converts seconds to milliseconds and keeps the boxes", () => {
    expect(pathLimits(90, 150)).toEqual({ timeLimitMs: 90000, maxBoxes: 150 });
    expect(pathLimits(undefined, undefined)).toEqual({
      timeLimitMs: 60000,
      maxBoxes: 200,
    });
  });
});
