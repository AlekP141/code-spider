import { join } from "node:path";
import type { GraphEdge, GraphNode } from "@code-spider/core";
import { describe, expect, it, vi } from "vitest";
import {
  callSiteJumpTarget,
  JumpHandler,
  nodeJumpTarget,
  type EditorPort,
  type JumpLookup,
  type JumpTarget,
} from "../src/navigation.js";
import { fixturePath, readGolden } from "./support/fixtures.js";

const repoRoot = fixturePath("basic");
const golden = readGolden("basic-handleSignup.json");

function nodeOf(id: string): GraphNode {
  const node = golden.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`golden has no ${id}`);
  return node;
}

function edgeOf(id: string): GraphEdge {
  const edge = golden.edges.find((candidate) => candidate.id === id);
  if (!edge) throw new Error(`golden has no ${id}`);
  return edge;
}

describe("nodeJumpTarget", () => {
  it("resolves a node to its declaration in the repo", () => {
    expect(
      nodeJumpTarget(repoRoot, nodeOf("src/signup.ts#validateUser")),
    ).toEqual({
      file: join(repoRoot, "src/signup.ts"),
      range: { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 0 },
    });
  });

  it("returns undefined when there is no node", () => {
    expect(nodeJumpTarget(repoRoot, undefined)).toBeUndefined();
  });

  it("returns undefined for nodes without a file", () => {
    const external: GraphNode = {
      ...nodeOf("src/app.ts#main"),
      id: "external:tiny-lib#persist",
      kind: "external",
      file: "",
    };
    expect(nodeJumpTarget(repoRoot, external)).toBeUndefined();
  });
});

describe("callSiteJumpTarget", () => {
  it("opens the call site in the caller's file, not the callee's", () => {
    const edge = edgeOf("src/signup.ts#createUser->src/signup.ts#handleSignup");
    expect(
      callSiteJumpTarget(repoRoot, edge, nodeOf("src/signup.ts#handleSignup")),
    ).toEqual({
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
    const edge = edgeOf("src/signup.ts#handleSignup->src/app.ts#main");
    const target = callSiteJumpTarget(
      repoRoot,
      edge,
      nodeOf("src/app.ts#main"),
    );
    expect(target?.file).toBe(join(repoRoot, "src/app.ts"));
  });

  it("returns undefined without an edge or a caller that has a file", () => {
    const edge = edgeOf("src/signup.ts#handleSignup->src/app.ts#main");
    expect(callSiteJumpTarget(repoRoot, undefined, undefined)).toBeUndefined();
    expect(callSiteJumpTarget(repoRoot, edge, undefined)).toBeUndefined();
    expect(
      callSiteJumpTarget(repoRoot, edge, {
        ...nodeOf("src/app.ts#main"),
        file: "",
      }),
    ).toBeUndefined();
  });
});

describe("JumpHandler", () => {
  const nodeTarget: JumpTarget = {
    file: "/repo/a.ts",
    range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 },
  };
  const callTarget: JumpTarget = {
    file: "/repo/b.ts",
    range: { startLine: 4, startCharacter: 2, endLine: 4, endCharacter: 9 },
  };

  function setup(found = true) {
    const editor: EditorPort = { reveal: vi.fn(async () => undefined) };
    const lookup: JumpLookup = {
      nodeTarget: vi.fn(() => (found ? nodeTarget : undefined)),
      callSiteTarget: vi.fn(() => (found ? callTarget : undefined)),
    };
    return { editor, lookup, jumps: new JumpHandler(lookup, editor) };
  }

  it("reveals the declaration of the node in the named project", async () => {
    const { editor, lookup, jumps } = setup();
    await jumps.handle({
      type: "openInEditor",
      project: "/p/tsconfig.json",
      nodeId: "src/a.ts#f",
    });
    expect(lookup.nodeTarget).toHaveBeenCalledWith(
      "/p/tsconfig.json",
      "src/a.ts#f",
    );
    expect(editor.reveal).toHaveBeenCalledWith(nodeTarget);
  });

  it("reveals the call site of the edge in the named project", async () => {
    const { editor, lookup, jumps } = setup();
    await jumps.handle({
      type: "openCallSite",
      project: "/p/tsconfig.json",
      edgeId: "a->b",
    });
    expect(lookup.callSiteTarget).toHaveBeenCalledWith(
      "/p/tsconfig.json",
      "a->b",
    );
    expect(editor.reveal).toHaveBeenCalledWith(callTarget);
  });

  it("reveals nothing when the table cannot resolve the id", async () => {
    const { editor, jumps } = setup(false);
    await jumps.handle({
      type: "openInEditor",
      project: "/p/tsconfig.json",
      nodeId: "src/x.ts#y",
    });
    await jumps.handle({
      type: "openCallSite",
      project: "/p/tsconfig.json",
      edgeId: "nope",
    });
    expect(editor.reveal).not.toHaveBeenCalled();
  });
});
