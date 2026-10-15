import type { EdgeType, NodeKind } from "@code-spider/core/types";
import { normaliseColumnGap } from "../settings/column-gap.js";
import { isEdgeStyle } from "../settings/edge-style.js";
import type { GraphState, ViewState } from "./types.js";
import { isPathInfo, pathInfoMatches } from "./path-info.js";
import { HISTORY_LIMIT } from "./view-state.js";

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function everyValue(value: unknown, check: (item: unknown) => boolean) {
  return isRecord(value) && Object.values(value).every(check);
}

function isNormalisedGap(value: unknown): boolean {
  return isNumber(value) && normaliseColumnGap(value) === value;
}

function isPoint(value: unknown): boolean {
  return isRecord(value) && isNumber(value.x) && isNumber(value.y);
}

const NODE_KINDS: Record<NodeKind, true> = {
  function: true,
  component: true,
  module: true,
  external: true,
  unknown: true,
};
const EDGE_KINDS: Record<EdgeType, true> = {
  call: true,
  jsx: true,
  external: true,
  passes: true,
  injected: true,
};

function isRange(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value.startLine) &&
    isNumber(value.startColumn) &&
    isNumber(value.endLine) &&
    isNumber(value.endColumn)
  );
}

function isNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.kind) &&
    Object.hasOwn(NODE_KINDS, value.kind) &&
    isString(value.name) &&
    isString(value.file) &&
    isRange(value.range) &&
    isString(value.inputType) &&
    isString(value.returnType) &&
    typeof value.isAsync === "boolean" &&
    isNumber(value.lineCount) &&
    isString(value.codePreview)
  );
}

function isEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.from) &&
    isString(value.to) &&
    isString(value.kind) &&
    Object.hasOwn(EDGE_KINDS, value.kind) &&
    isString(value.supplies) &&
    isRange(value.callSite) &&
    typeof value.resolved === "boolean"
  );
}

function isSliceRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    isStringArray(value.members) &&
    isStringArray(value.edgeIds)
  );
}

function keyedById(value: Record_): boolean {
  return Object.entries(value).every(
    ([key, item]) => isRecord(item) && item.id === key,
  );
}

function isConsistent(graph: GraphState): boolean {
  const hasNode = (id: string) => Object.hasOwn(graph.nodes, id);
  const hasEdge = (id: string) => Object.hasOwn(graph.edges, id);
  return (
    keyedById(graph.nodes) &&
    keyedById(graph.edges) &&
    Object.values(graph.edges).every(
      (edge) => hasNode(edge.from) && hasNode(edge.to),
    ) &&
    Object.hasOwn(graph.slices, graph.focusId) &&
    Object.entries(graph.slices).every(
      ([key, record]) =>
        hasNode(key) &&
        record.members.every(hasNode) &&
        record.edgeIds.every(hasEdge),
    ) &&
    graph.pinned.every(hasNode) &&
    (graph.open ?? []).every(hasNode) &&
    Object.keys(graph.positions).every(hasNode)
  );
}

function isValidPath(graph: GraphState): boolean {
  const path: unknown = graph.path;
  return (
    path === undefined || (isPathInfo(path) && pathInfoMatches(graph, path))
  );
}

export function isGraphState(value: unknown): value is GraphState {
  return (
    isRecord(value) &&
    isNumber(value.generation) &&
    isString(value.project) &&
    isString(value.focusId) &&
    everyValue(value.nodes, isNode) &&
    everyValue(value.edges, isEdge) &&
    everyValue(value.slices, isSliceRecord) &&
    everyValue(value.positions, isPoint) &&
    isStringArray(value.pinned) &&
    (value.open === undefined || isStringArray(value.open)) &&
    isNumber(value.revision) &&
    (value.sourceVersion === undefined || isNumber(value.sourceVersion)) &&
    (value.columnGap === undefined || isNormalisedGap(value.columnGap)) &&
    isConsistent(value as GraphState) &&
    isValidPath(value as GraphState)
  );
}

function generationsBelow(limit: number, graphs: GraphState[]): boolean {
  return graphs.every((graph) => graph.generation < limit);
}

/** Enough to trust what `getState()` hands back. */
export function isViewState(value: unknown): value is ViewState {
  return (
    isRecord(value) &&
    value.version === 1 &&
    Number.isInteger(value.nextGeneration) &&
    (value.nextGeneration as number) >= 1 &&
    isNormalisedGap(value.columnGap) &&
    (value.edgeStyle === undefined || isEdgeStyle(value.edgeStyle)) &&
    (value.current === undefined || isGraphState(value.current)) &&
    Array.isArray(value.history) &&
    value.history.length <= HISTORY_LIMIT &&
    value.history.every(isGraphState) &&
    generationsBelow(value.nextGeneration as number, [
      ...(value.current ? [value.current as GraphState] : []),
      ...(value.history as GraphState[]),
    ])
  );
}
