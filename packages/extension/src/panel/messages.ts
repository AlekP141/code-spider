import { isDiffMode } from "@code-spider/webview/diff-mode";
import { isEdgeStyle } from "@code-spider/webview/edge-style";
import { isTestVisibility } from "@code-spider/webview/test-visibility";
import type { WebviewToExtension } from "@code-spider/webview/protocol";

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** Messages arrive from a script context, so shape-check before trusting them. */
export function parseWebviewMessage(
  value: unknown,
): WebviewToExtension | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const message = value as Record<string, unknown>;
  const { project, nodeId } = message;
  switch (message.type) {
    case "ready":
      return { type: "ready" };
    case "refresh":
      return typeof project === "string" &&
        typeof message.generation === "number" &&
        Number.isInteger(message.generation) &&
        typeof message.focusId === "string" &&
        isStringArray(message.expanded) &&
        (message.pathEndId === undefined ||
          typeof message.pathEndId === "string")
        ? {
            type: "refresh",
            project,
            generation: message.generation,
            focusId: message.focusId,
            expanded: message.expanded,
            ...(message.pathEndId !== undefined && {
              pathEndId: message.pathEndId,
            }),
          }
        : undefined;
    case "pathClick":
      return typeof project === "string" && typeof nodeId === "string"
        ? { type: "pathClick", project, nodeId }
        : undefined;
    case "cancelPath":
      return typeof message.id === "number" && Number.isInteger(message.id)
        ? { type: "cancelPath", id: message.id }
        : undefined;
    case "openInEditor": {
      if (typeof project !== "string" || typeof nodeId !== "string") {
        return undefined;
      }
      const { line } = message;
      if (line === undefined) return { type: "openInEditor", project, nodeId };
      return typeof line === "number" && Number.isInteger(line) && line >= 0
        ? { type: "openInEditor", project, nodeId, line }
        : undefined;
    }
    case "focus":
      return typeof project === "string" && typeof nodeId === "string"
        ? { type: "focus", project, nodeId }
        : undefined;
    case "expand":
      return typeof project === "string" &&
        typeof nodeId === "string" &&
        typeof message.generation === "number" &&
        Number.isInteger(message.generation)
        ? { type: "expand", project, nodeId, generation: message.generation }
        : undefined;
    case "openCallSite":
      return typeof project === "string" && typeof message.edgeId === "string"
        ? { type: "openCallSite", project, edgeId: message.edgeId }
        : undefined;
    case "setColumnGap":
      return typeof message.value === "number" && Number.isFinite(message.value)
        ? { type: "setColumnGap", value: message.value }
        : undefined;
    case "setEdgeStyle":
      return isEdgeStyle(message.value)
        ? { type: "setEdgeStyle", value: message.value }
        : undefined;
    case "setDiffMode":
      return isDiffMode(message.value)
        ? { type: "setDiffMode", value: message.value }
        : undefined;
    case "setTestVisibility":
      return isTestVisibility(message.value)
        ? { type: "setTestVisibility", value: message.value }
        : undefined;
    default:
      return undefined;
  }
}
