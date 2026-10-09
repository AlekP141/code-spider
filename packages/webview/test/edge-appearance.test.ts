import { describe, expect, it } from "vitest";
import {
  DASHED,
  DOTTED,
  edgeAppearance,
} from "../src/graph/edge-appearance.js";

describe("edgeAppearance", () => {
  it("draws calls solid", () => {
    expect(edgeAppearance("call", true)).toEqual({
      className: "edge-call",
      strokeDasharray: undefined,
      strokeWidth: 1.5,
    });
  });

  it("draws JSX edges solid but distinct", () => {
    const jsx = edgeAppearance("jsx", true);
    expect(jsx.className).toBe("edge-jsx");
    expect(jsx.strokeDasharray).toBeUndefined();
    expect(jsx.strokeWidth).toBeGreaterThan(
      edgeAppearance("call", true).strokeWidth,
    );
  });

  it("draws passes edges dotted, since dashed already means unresolved", () => {
    expect(edgeAppearance("passes", true)).toMatchObject({
      className: "edge-passes",
      strokeDasharray: DOTTED,
    });
    expect(DOTTED).not.toBe(DASHED);
  });

  it("draws external edges solid with their own class", () => {
    expect(edgeAppearance("external", true)).toMatchObject({
      className: "edge-external",
      strokeDasharray: undefined,
    });
  });

  it("draws every unresolved edge dashed, whatever its kind", () => {
    for (const kind of ["call", "jsx", "passes", "external"] as const) {
      const appearance = edgeAppearance(kind, false);
      expect(appearance.strokeDasharray).toBe(DASHED);
      expect(appearance.className).toBe(`edge-${kind} edge-unresolved`);
    }
  });
});
