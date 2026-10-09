import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_HEAP_MB,
  MIN_MAX_HEAP_MB,
  normaliseHeapMb,
} from "../src/settings-values.js";

describe("normaliseHeapMb", () => {
  it("defaults to 8192 MB", () => {
    expect(DEFAULT_MAX_HEAP_MB).toBe(8192);
    expect(normaliseHeapMb(undefined)).toBe(8192);
  });

  it("falls back to the default for non-numbers", () => {
    expect(normaliseHeapMb("lots")).toBe(8192);
    expect(normaliseHeapMb(Number.NaN)).toBe(8192);
    expect(normaliseHeapMb(Number.POSITIVE_INFINITY)).toBe(8192);
  });

  it("floors fractions and enforces the minimum", () => {
    expect(normaliseHeapMb(4096.9)).toBe(4096);
    expect(normaliseHeapMb(1)).toBe(MIN_MAX_HEAP_MB);
    expect(normaliseHeapMb(-5)).toBe(MIN_MAX_HEAP_MB);
  });
});
