import { describe, expect, it } from "vitest";
import { isExtensionMessage } from "../src/messages.js";

describe("isExtensionMessage", () => {
  it("accepts each extension-to-webview message", () => {
    const slice = { focusId: "a#b", nodes: [], edges: [], truncated: false };
    expect(isExtensionMessage({ type: "slice", slice })).toBe(true);
    expect(isExtensionMessage({ type: "analysisError", message: "x" })).toBe(
      true,
    );
    expect(isExtensionMessage({ type: "busy", busy: true })).toBe(true);
    expect(isExtensionMessage({ type: "indexing", indexing: false })).toBe(
      true,
    );
  });

  it("rejects malformed payloads", () => {
    expect(isExtensionMessage(undefined)).toBe(false);
    expect(isExtensionMessage("busy")).toBe(false);
    expect(isExtensionMessage({ type: "slice" })).toBe(false);
    expect(isExtensionMessage({ type: "slice", slice: null })).toBe(false);
    expect(isExtensionMessage({ type: "busy", busy: "yes" })).toBe(false);
    expect(isExtensionMessage({ type: "analysisError" })).toBe(false);
    expect(isExtensionMessage({ type: "unknown" })).toBe(false);
  });
});
