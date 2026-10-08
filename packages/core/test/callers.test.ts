import { describe, expect, it } from "vitest";
import { collectCallerEdges, MAX_CALLERS } from "../src/callers.js";
import { toFocusTarget } from "../src/focus.js";
import { loadTestCode } from "./helpers.js";

describe("collectCallerEdges", () => {
  const { project, root } = loadTestCode("basic");
  const signup = project.getSourceFileOrThrow("signup.ts");
  const focusId = "src/signup.ts#handleSignup";
  const target = toFocusTarget(
    signup.getFunctionOrThrow("handleSignup"),
    signup,
  );
  const { nodes, edges, truncated } = collectCallerEdges(target, focusId, {
    repoRoot: root,
  });

  it("finds both callers across files", () => {
    expect(edges.map((e) => e.to).sort()).toEqual([
      "src/app.ts#main",
      "src/app.ts#retry",
    ]);
  });

  it("points every edge away from the focus node", () => {
    expect(edges.every((e) => e.from === focusId)).toBe(true);
  });

  it("labels edges with the focus node's return type", () => {
    expect(edges.every((e) => e.supplies === "User")).toBe(true);
  });

  it("does not include the declaration itself as a caller", () => {
    expect(nodes.some((n) => n.id === focusId)).toBe(false);
  });

  it("is not truncated for a small caller list", () => {
    expect(truncated).toBe(false);
  });
});

describe("collectCallerEdges — hub", () => {
  const { project, root } = loadTestCode("hub");
  const logFile = project.getSourceFileOrThrow("log.ts");
  const target = toFocusTarget(logFile.getFunctionOrThrow("log"), logFile);
  const { edges, truncated } = collectCallerEdges(
    target,
    "src/log.ts#log",
    { repoRoot: root },
  );

  it("caps the caller list at MAX_CALLERS", () => {
    expect(edges).toHaveLength(MAX_CALLERS);
  });

  it("reports truncation", () => {
    expect(truncated).toBe(true);
  });
});
