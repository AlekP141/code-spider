import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  GraphEdge,
  GraphNode,
  GraphSlice,
  Range,
} from "@code-spider/core";

const here = dirname(fileURLToPath(import.meta.url));

/** A real slice produced by the analyser, checked in under core's tests. */
export function readGolden(name: string): GraphSlice {
  const path = join(here, "../../../core/test/__goldens__", name);
  return JSON.parse(readFileSync(path, "utf8")) as GraphSlice;
}

export function makeNode(
  overrides: Partial<GraphNode> & { id: string },
): GraphNode {
  return {
    kind: "function",
    name: overrides.id.split("#")[1] ?? overrides.id,
    file: "src/a.ts",
    range: { startLine: 1, startColumn: 1, endLine: 3, endColumn: 2 },
    inputType: "",
    returnType: "",
    isAsync: false,
    lineCount: 3,
    codePreview: "function f() {}",
    ...overrides,
  };
}

export function makeEdge(
  from: string,
  to: string,
  overrides: Partial<GraphEdge> = {},
): GraphEdge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    kind: "call",
    supplies: "",
    callSite: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 9 },
    resolved: true,
    ...overrides,
  };
}

export function makeSlice(
  focusId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphSlice {
  return { focusId, nodes, edges, truncated: false };
}

export function site(line: number, column = 3): Range {
  return {
    startLine: line,
    startColumn: column,
    endLine: line,
    endColumn: column + 6,
  };
}
