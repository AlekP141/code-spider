import type { ExtensionToWebview } from "./protocol.js";

export function isExtensionMessage(
  value: unknown,
): value is ExtensionToWebview {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case "slice":
      return typeof message.slice === "object" && message.slice !== null;
    case "analysisError":
      return typeof message.message === "string";
    case "busy":
      return typeof message.busy === "boolean";
    case "indexing":
      return typeof message.indexing === "boolean";
    default:
      return false;
  }
}
