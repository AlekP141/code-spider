import type { WebviewToExtension } from "@code-spider/webview/protocol";

/** Messages arrive from a script context, so shape-check before trusting them. */
export function parseWebviewMessage(
  value: unknown,
): WebviewToExtension | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const message = value as Record<string, unknown>;
  const { project, nodeId } = message;
  switch (message.type) {
    case "ready":
    case "refresh":
      return { type: message.type };
    case "openInEditor":
    case "focus":
      return typeof project === "string" && typeof nodeId === "string"
        ? { type: message.type, project, nodeId }
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
    default:
      return undefined;
  }
}
