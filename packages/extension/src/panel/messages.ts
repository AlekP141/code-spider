import type { WebviewToExtension } from "@code-spider/webview/protocol";

/** Messages arrive from a script context, so shape-check before trusting them. */
export function parseWebviewMessage(
  value: unknown,
): WebviewToExtension | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case "ready":
    case "refresh":
      return { type: message.type };
    case "openInEditor":
    case "focus":
    case "expand":
      return typeof message.nodeId === "string"
        ? { type: message.type, nodeId: message.nodeId }
        : undefined;
    case "openCallSite":
      return typeof message.edgeId === "string"
        ? { type: "openCallSite", edgeId: message.edgeId }
        : undefined;
    default:
      return undefined;
  }
}
