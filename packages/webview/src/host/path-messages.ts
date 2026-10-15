import { isPathInfo } from "../view/path-info.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isMark(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.project === "string" &&
    typeof value.nodeId === "string" &&
    typeof value.name === "string"
  );
}

function isSearch(value: unknown): boolean {
  return (
    isRecord(value) &&
    isCount(value.id) &&
    (value.purpose === "search" || value.purpose === "refresh") &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    isCount(value.checked) &&
    isCount(value.routes) &&
    typeof value.routesCapped === "boolean"
  );
}

function isRoute(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges)
  );
}

export function isOptionalRoute(message: Record<string, unknown>): boolean {
  return (
    (message.route === undefined || isRoute(message.route)) &&
    (message.path === undefined || isPathInfo(message.path))
  );
}

export function isPathMessage(message: Record<string, unknown>): boolean {
  switch (message.type) {
    case "pathStart":
      return message.mark === undefined || isMark(message.mark);
    case "pathSearch":
      return message.search === undefined || isSearch(message.search);
    case "pathFound":
      return (
        typeof message.project === "string" &&
        isRecord(message.slice) &&
        isRoute(message.route) &&
        isPathInfo(message.path) &&
        isCount(message.sourceVersion)
      );
    default:
      return false;
  }
}
