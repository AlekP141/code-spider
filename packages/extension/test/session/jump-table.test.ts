import { join } from "node:path";
import type { GraphNode, GraphSlice } from "@code-spider/core";
import { describe, expect, it } from "vitest";
import { JumpTable } from "../../src/session/jump-table.js";
import { fixturePath, readGolden } from "../support/fixtures.js";

const basic = fixturePath("basic");
const project = join(basic, "tsconfig.json");
const golden = readGolden("basic-handleSignup.json");

function sent(slice: GraphSlice, repoRoot = basic) {
  return { slice, repoRoot, tsconfig: project };
}

function nodeOf(id: string): GraphNode {
  const node = golden.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`golden has no ${id}`);
  return node;
}

describe("JumpTable", () => {
  it("resolves a node to its declaration in the repo", () => {
    const table = new JumpTable();
    table.add(project, sent(golden));
    expect(table.nodeTarget(project, "src/signup.ts#validateUser")).toEqual({
      file: join(basic, "src/signup.ts"),
      range: { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 0 },
    });
  });

  it("resolves an edge to its call site in the consumer's file", () => {
    const table = new JumpTable();
    table.add(project, sent(golden));
    expect(
      table.callSiteTarget(
        project,
        "src/signup.ts#createUser->src/signup.ts#handleSignup",
      ),
    ).toEqual({
      file: join(basic, "src/signup.ts"),
      range: {
        startLine: 17,
        startCharacter: 21,
        endLine: 17,
        endCharacter: 38,
      },
    });
    expect(
      table.callSiteTarget(
        project,
        "src/signup.ts#handleSignup->src/app.ts#main",
      )?.file,
    ).toBe(join(basic, "src/app.ts"));
  });

  it("keeps earlier slices and lets later slices overwrite them", () => {
    const table = new JumpTable();
    table.add(project, sent(golden));
    const moved: GraphNode = {
      ...nodeOf("src/signup.ts#createUser"),
      range: { startLine: 21, startColumn: 3, endLine: 23, endColumn: 2 },
    };
    const added: GraphNode = {
      ...nodeOf("src/signup.ts#createUser"),
      id: "src/extra.ts#extra",
      file: "src/extra.ts",
    };
    table.add(
      project,
      sent({
        focusId: "src/signup.ts#validateUser",
        nodes: [moved, added],
        edges: [],
        truncated: false,
      }),
    );

    expect(table.nodeTarget(project, "src/signup.ts#createUser")).toMatchObject(
      { range: { startLine: 20, startCharacter: 2 } },
    );
    expect(table.nodeTarget(project, "src/extra.ts#extra")?.file).toBe(
      join(basic, "src/extra.ts"),
    );
    expect(
      table.nodeTarget(project, "src/signup.ts#validateUser"),
    ).toBeDefined();
  });

  it("keeps projects apart even when they share a node id", () => {
    const table = new JumpTable();
    const other = "/other/tsconfig.json";
    table.add(project, sent(golden));
    table.add(other, { slice: golden, repoRoot: "/other", tsconfig: other });
    expect(table.nodeTarget(project, "src/app.ts#main")?.file).toBe(
      join(basic, "src/app.ts"),
    );
    expect(table.nodeTarget(other, "src/app.ts#main")?.file).toBe(
      "/other/src/app.ts",
    );
    expect(table.has(other)).toBe(true);
  });

  it("returns undefined for unknown projects, nodes and edges, and for nodes without a file", () => {
    const table = new JumpTable();
    const external: GraphNode = {
      ...nodeOf("src/app.ts#main"),
      id: "external:tiny-lib#persist",
      kind: "external",
      file: "",
    };
    table.add(project, sent({ ...golden, nodes: [...golden.nodes, external] }));
    expect(table.nodeTarget("/nope/tsconfig.json", "src/app.ts#main")).toBe(
      undefined,
    );
    expect(table.nodeTarget(project, "src/signup.ts#nope")).toBeUndefined();
    expect(
      table.nodeTarget(project, "external:tiny-lib#persist"),
    ).toBeUndefined();
    expect(table.callSiteTarget(project, "nope")).toBeUndefined();
    expect(table.has("/nope/tsconfig.json")).toBe(false);
  });

  it("lists the absolute, deduplicated files of nodes that have one", () => {
    const table = new JumpTable();
    const external: GraphNode = {
      ...nodeOf("src/app.ts#main"),
      id: "external:tiny-lib#persist",
      kind: "external",
      file: "",
    };
    table.add(project, sent({ ...golden, nodes: [...golden.nodes, external] }));
    const files = table.files(project);
    const expected = [
      ...new Set(
        golden.nodes.filter((node) => node.file).map((node) => node.file),
      ),
    ].map((file) => join(basic, file));
    expect(expected.length).toBeGreaterThan(0);
    expect(files).toEqual(expected);
    expect(files).toContain(join(basic, "src/signup.ts"));
    expect(new Set(files).size).toBe(files.length);
  });

  it("lists no files for an unknown project", () => {
    const table = new JumpTable();
    table.add(project, sent(golden));
    expect(table.files("/nope/tsconfig.json")).toEqual([]);
  });

  it("lists each project with its repo root", () => {
    const table = new JumpTable();
    const other = "/other/tsconfig.json";
    table.add(project, sent(golden));
    table.add(other, { slice: golden, repoRoot: "/other", tsconfig: other });
    expect(table.projects()).toEqual([
      { project, repoRoot: basic },
      { project: other, repoRoot: "/other" },
    ]);
  });

  it("returns every node sent for a project, later slices overwriting earlier ones", () => {
    const table = new JumpTable();
    table.add(project, sent(golden));
    const moved: GraphNode = {
      ...nodeOf("src/signup.ts#createUser"),
      range: { startLine: 21, startColumn: 3, endLine: 23, endColumn: 2 },
    };
    const added: GraphNode = {
      ...moved,
      id: "src/extra.ts#extra",
      file: "src/extra.ts",
    };
    table.add(
      project,
      sent({
        focusId: moved.id,
        nodes: [moved, added],
        edges: [],
        truncated: false,
      }),
    );
    const nodes = table.nodes(project);
    expect(nodes.map((node) => node.id).sort()).toEqual(
      [...golden.nodes.map((node) => node.id), added.id].sort(),
    );
    expect(nodes.find((node) => node.id === moved.id)).toEqual(moved);
  });

  it("returns no nodes for an unknown project", () => {
    const table = new JumpTable();
    table.add(project, sent(golden));
    expect(table.nodes("/nope/tsconfig.json")).toEqual([]);
  });

  it("forgets everything on clear", () => {
    const table = new JumpTable();
    table.add(project, sent(golden));
    table.clear();
    expect(table.has(project)).toBe(false);
    expect(table.nodeTarget(project, "src/app.ts#main")).toBeUndefined();
  });
});
