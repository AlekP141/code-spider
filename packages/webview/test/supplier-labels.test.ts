import { describe, expect, it } from "vitest";
import { supplierLabels } from "../src/graph/supplier-labels.js";
import { makeEdge } from "./support/slices.js";

describe("supplierLabels", () => {
  it("gives a supplier one line per kind", () => {
    const labels = supplierLabels([
      makeEdge("a#s", "a#x", { supplies: "User" }),
      makeEdge("a#s", "a#y", { supplies: "User" }),
    ]);
    expect(labels.get("a#s")).toEqual([{ kind: "returns", text: "User" }]);
  });

  it("merges call and external edges into one returns line", () => {
    const labels = supplierLabels([
      makeEdge("a#s", "a#x", { kind: "call", supplies: "User" }),
      makeEdge("a#s", "a#y", { kind: "external", supplies: "Promise<void>" }),
    ]);
    expect(labels.get("a#s")).toEqual([
      { kind: "returns", text: "User · Promise<void>" },
    ]);
  });

  it("keeps jsx and passes on separate lines", () => {
    const labels = supplierLabels([
      makeEdge("a#s", "a#x", { kind: "jsx", supplies: "Props" }),
      makeEdge("a#s", "a#y", { kind: "passes", supplies: "() => void" }),
    ]);
    expect(labels.get("a#s")).toEqual([
      { kind: "jsx", text: "Props" },
      { kind: "passes", text: "() => void" },
    ]);
  });

  it("skips an edge with empty supplies", () => {
    const labels = supplierLabels([makeEdge("a#s", "a#x", { supplies: "" })]);
    expect(labels.size).toBe(0);
  });

  it("joins two different supplies with a middle dot in edge-id order", () => {
    const labels = supplierLabels([
      makeEdge("a#s", "a#z", { id: "e2", supplies: "B" }),
      makeEdge("a#s", "a#x", { id: "e1", supplies: "A" }),
      makeEdge("a#s", "a#y", { id: "e3", supplies: "A" }),
    ]);
    expect(labels.get("a#s")).toEqual([{ kind: "returns", text: "A · B" }]);
  });

  it("orders lines returns, jsx, passes and leaves a pure consumer out", () => {
    const labels = supplierLabels([
      makeEdge("a#s", "a#c", { kind: "passes", supplies: "P" }),
      makeEdge("a#s", "a#c", { id: "j", kind: "jsx", supplies: "J" }),
      makeEdge("a#s", "a#c", { id: "r", kind: "call", supplies: "R" }),
    ]);
    expect(labels.get("a#s")?.map((line) => line.kind)).toEqual([
      "returns",
      "jsx",
      "passes",
    ]);
    expect(labels.has("a#c")).toBe(false);
  });
});
