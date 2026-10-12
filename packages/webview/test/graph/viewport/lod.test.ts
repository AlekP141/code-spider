import { describe, expect, it } from "vitest";
import { LOD_ZOOM } from "../../../src/graph/constants.js";
import {
  canvasClassName,
  isZoomedOut,
} from "../../../src/graph/viewport/lod.js";

describe("isZoomedOut", () => {
  it("is true below the threshold only", () => {
    expect(LOD_ZOOM).toBe(0.5);
    expect(isZoomedOut(0.49)).toBe(true);
    expect(isZoomedOut(0.5)).toBe(false);
    expect(isZoomedOut(1)).toBe(false);
  });
});

describe("canvasClassName", () => {
  it("adds is-zoomed-out only when zoomed out", () => {
    expect(canvasClassName(true)).toBe("graph-canvas is-zoomed-out");
    expect(canvasClassName(false)).toBe("graph-canvas");
  });
});
