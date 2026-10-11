import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDGE_STYLE,
  EDGE_STYLES,
  isEdgeStyle,
  normaliseEdgeStyle,
} from "../src/edge-style.js";

describe("normaliseEdgeStyle", () => {
  it("lists stepped and curved, with stepped as the default", () => {
    expect(EDGE_STYLES).toEqual(["stepped", "curved"]);
    expect(DEFAULT_EDGE_STYLE).toBe("stepped");
  });

  it("passes both known names through", () => {
    expect(normaliseEdgeStyle("stepped")).toBe("stepped");
    expect(normaliseEdgeStyle("curved")).toBe("curved");
  });

  it("gives the default for an unknown name, a number and undefined", () => {
    expect(normaliseEdgeStyle("wavy")).toBe("stepped");
    expect(normaliseEdgeStyle("Curved")).toBe("stepped");
    expect(normaliseEdgeStyle(1)).toBe("stepped");
    expect(normaliseEdgeStyle(undefined)).toBe("stepped");
    expect(normaliseEdgeStyle(null)).toBe("stepped");
  });

  it("recognises exactly the known names", () => {
    expect(isEdgeStyle("curved")).toBe(true);
    expect(isEdgeStyle("wavy")).toBe(false);
    expect(isEdgeStyle(undefined)).toBe(false);
  });
});
