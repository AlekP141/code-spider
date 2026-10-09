import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  callSiteJumpTarget,
  JumpHandler,
  nodeJumpTarget,
  type EditorPort,
} from "../src/navigation.js";
import type { CurrentGraph } from "../src/session.js";
import { fixturePath, readGolden } from "./support/fixtures.js";

const repoRoot = fixturePath("basic");
const graph: CurrentGraph = {
  slice: readGolden("basic-handleSignup.json"),
  repoRoot,
};

describe("nodeJumpTarget", () => {
  it("resolves a node to its declaration in the repo", () => {
    expect(nodeJumpTarget(graph, "src/signup.ts#validateUser")).toEqual({
      file: join(repoRoot, "src/signup.ts"),
      range: { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 0 },
    });
  });

  it("returns undefined for an id that is not in the current slice", () => {
    expect(nodeJumpTarget(graph, "src/signup.ts#nope")).toBeUndefined();
  });

  it("returns undefined for nodes without a file", () => {
    const withExternal: CurrentGraph = {
      repoRoot,
      slice: {
        ...graph.slice,
        nodes: [
          ...graph.slice.nodes,
          {
            ...graph.slice.nodes[0]!,
            id: "external:tiny-lib#persist",
            kind: "external",
            file: "",
          },
        ],
      },
    };
    expect(
      nodeJumpTarget(withExternal, "external:tiny-lib#persist"),
    ).toBeUndefined();
  });
});

describe("callSiteJumpTarget", () => {
  it("opens the call site in the caller's file, not the callee's", () => {
    const edgeId = "src/signup.ts#createUser->src/signup.ts#handleSignup";
    expect(callSiteJumpTarget(graph, edgeId)).toEqual({
      file: join(repoRoot, "src/signup.ts"),
      range: {
        startLine: 17,
        startCharacter: 21,
        endLine: 17,
        endCharacter: 38,
      },
    });
  });

  it("uses the caller's file when the caller is in another file", () => {
    const target = callSiteJumpTarget(
      graph,
      "src/signup.ts#handleSignup->src/app.ts#main",
    );
    expect(target?.file).toBe(join(repoRoot, "src/app.ts"));
  });

  it("returns undefined for an unknown edge id", () => {
    expect(callSiteJumpTarget(graph, "nope")).toBeUndefined();
  });
});

describe("JumpHandler", () => {
  function setup(current: CurrentGraph | null = graph) {
    const editor: EditorPort = { reveal: vi.fn(async () => undefined) };
    return {
      editor,
      jumps: new JumpHandler(() => current ?? undefined, editor),
    };
  }

  it("reveals the declaration for openInEditor", async () => {
    const { editor, jumps } = setup();
    await jumps.handle({
      type: "openInEditor",
      nodeId: "src/signup.ts#validateUser",
    });
    expect(editor.reveal).toHaveBeenCalledWith(
      nodeJumpTarget(graph, "src/signup.ts#validateUser"),
    );
  });

  it("reveals the call site for openCallSite", async () => {
    const { editor, jumps } = setup();
    const edgeId = "src/signup.ts#createUser->src/signup.ts#handleSignup";
    await jumps.handle({ type: "openCallSite", edgeId });
    expect(editor.reveal).toHaveBeenCalledWith(
      callSiteJumpTarget(graph, edgeId),
    );
  });

  it("ignores ids it cannot resolve and messages with nothing to open", async () => {
    const { editor, jumps } = setup();
    await jumps.handle({ type: "openInEditor", nodeId: "src/x.ts#y" });
    await jumps.handle({ type: "openCallSite", edgeId: "nope" });
    await jumps.handle({ type: "focus", nodeId: "src/signup.ts#validateUser" });
    await jumps.handle({
      type: "expand",
      nodeId: "src/signup.ts#validateUser",
    });
    await jumps.handle({ type: "refresh" });
    await jumps.handle({ type: "ready" });
    expect(editor.reveal).not.toHaveBeenCalled();
  });

  it("does nothing before any graph has been shown", async () => {
    const { editor, jumps } = setup(null);
    await jumps.handle({
      type: "openInEditor",
      nodeId: "src/signup.ts#validateUser",
    });
    expect(editor.reveal).not.toHaveBeenCalled();
  });
});
