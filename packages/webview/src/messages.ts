import type { ExtensionToWebview, SliceMode } from "./protocol.js";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMode(value: unknown): value is SliceMode {
  if (typeof value !== "object" || value === null) return false;
  const mode = value as Record<string, unknown>;
  if (mode.kind === "centre") return isFiniteNumber(mode.sourceVersion);
  return (
    mode.kind === "expansion" &&
    typeof mode.nodeId === "string" &&
    typeof mode.generation === "number"
  );
}

function isExpansionAnswer(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const answer = value as Record<string, unknown>;
  return (
    typeof answer.nodeId === "string" &&
    typeof answer.slice === "object" &&
    answer.slice !== null
  );
}

export function isExtensionMessage(
  value: unknown,
): value is ExtensionToWebview {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case "slice":
      return (
        typeof message.slice === "object" &&
        message.slice !== null &&
        typeof message.project === "string" &&
        isMode(message.mode)
      );
    case "expandFailed":
      return (
        typeof message.nodeId === "string" &&
        typeof message.generation === "number" &&
        typeof message.message === "string"
      );
    case "analysisError":
      return typeof message.message === "string";
    case "busy":
      return typeof message.busy === "boolean";
    case "indexing":
      return typeof message.indexing === "boolean";
    case "settings":
      return isFiniteNumber(message.columnGap);
    case "refreshed":
      return (
        typeof message.project === "string" &&
        typeof message.generation === "number" &&
        isFiniteNumber(message.sourceVersion) &&
        typeof message.centre === "object" &&
        message.centre !== null &&
        Array.isArray(message.expansions) &&
        message.expansions.every(isExpansionAnswer)
      );
    case "refreshFailed":
      return (
        typeof message.generation === "number" &&
        typeof message.message === "string"
      );
    case "sourceChanged":
      return isFiniteNumber(message.version);
    default:
      return false;
  }
}
