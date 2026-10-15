import type { PathInfo } from "@code-spider/core/types";
import type { GraphState } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBox(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    Number.isInteger(value.column) &&
    (value.column as number) >= 0
  );
}

function isSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.routes) &&
    isFiniteNumber(value.leftOut) &&
    isFiniteNumber(value.checked) &&
    typeof value.routesCapped === "boolean" &&
    (value.stoppedBy === undefined || value.stoppedBy === "time")
  );
}

export function isPathInfo(value: unknown): value is PathInfo {
  return (
    isRecord(value) &&
    typeof value.endId === "string" &&
    Array.isArray(value.boxes) &&
    value.boxes.every(isBox) &&
    Array.isArray(value.edgeIds) &&
    value.edgeIds.every((id) => typeof id === "string") &&
    isSummary(value.summary)
  );
}

export function pathInfoMatches(
  graph: Pick<GraphState, "nodes" | "edges" | "focusId">,
  path: PathInfo,
): boolean {
  return (
    Object.hasOwn(graph.nodes, path.endId) &&
    path.boxes.every((box) => Object.hasOwn(graph.nodes, box.id)) &&
    path.boxes.some((box) => box.id === graph.focusId) &&
    path.edgeIds.every((id) => Object.hasOwn(graph.edges, id))
  );
}
