import { describe, expect, it } from "vitest";
import { collectCalleeEdges } from "../src/callees.js";
import { toFocusTarget } from "../src/focus.js";
import { loadTestCode } from "./helpers.js";

describe("JSX edges", () => {
  const { project, root } = loadTestCode("jsx");
  const file = project.getSourceFileOrThrow("components.tsx");
  const focusId = "src/components.tsx#Page";
  const target = toFocusTarget(file.getFunctionOrThrow("Page"), file);
  const { nodes, edges } = collectCalleeEdges(target, focusId, {
    repoRoot: root,
  });
  const signupId = "src/components.tsx#SignupForm";

  it("emits an edge for a rendered component", () => {
    expect(edges.some((e) => e.from === signupId)).toBe(true);
  });

  it("marks it as a jsx edge", () => {
    const edge = edges.find((e) => e.from === signupId);
    expect(edge?.kind).toBe("jsx");
  });

  it("labels the edge with the props type, not JSX.Element", () => {
    const edge = edges.find((e) => e.from === signupId);
    expect(edge?.supplies).toBe("SignupFormProps");
  });

  it("classifies the rendered component as a component node", () => {
    const node = nodes.find((n) => n.id === signupId);
    expect(node?.kind).toBe("component");
  });

  it("ignores intrinsic elements like div", () => {
    expect(nodes.some((n) => n.name === "div")).toBe(false);
    expect(edges.some((e) => e.from.endsWith("#div"))).toBe(false);
  });
});
