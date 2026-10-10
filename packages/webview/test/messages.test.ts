import { describe, expect, it } from "vitest";
import { isExtensionMessage } from "../src/messages.js";

const slice = { focusId: "a#b", nodes: [], edges: [], truncated: false };
const project = "/repo/tsconfig.json";

describe("isExtensionMessage", () => {
  it("accepts each extension-to-webview message", () => {
    const centre = { type: "slice", slice, project, mode: { kind: "centre" } };
    const expansion = {
      type: "slice",
      slice,
      project,
      mode: { kind: "expansion", nodeId: "a#b", generation: 3 },
    };
    expect(isExtensionMessage(centre)).toBe(true);
    expect(isExtensionMessage(expansion)).toBe(true);
    expect(
      isExtensionMessage({
        type: "expandFailed",
        nodeId: "a#b",
        generation: 3,
        message: "x",
      }),
    ).toBe(true);
    expect(isExtensionMessage({ type: "analysisError", message: "x" })).toBe(
      true,
    );
    expect(isExtensionMessage({ type: "busy", busy: true })).toBe(true);
    expect(isExtensionMessage({ type: "indexing", indexing: false })).toBe(
      true,
    );
    expect(isExtensionMessage({ type: "settings", columnGap: 192 })).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(isExtensionMessage(undefined)).toBe(false);
    expect(isExtensionMessage("busy")).toBe(false);
    expect(isExtensionMessage({ type: "busy", busy: "yes" })).toBe(false);
    expect(isExtensionMessage({ type: "analysisError" })).toBe(false);
    expect(isExtensionMessage({ type: "settings", columnGap: "wide" })).toBe(
      false,
    );
    expect(isExtensionMessage({ type: "expandFailed", nodeId: "a#b" })).toBe(
      false,
    );
    expect(isExtensionMessage({ type: "unknown" })).toBe(false);
  });

  it("rejects a slice without a project or with a malformed mode", () => {
    const mode = { kind: "centre" };
    expect(isExtensionMessage({ type: "slice", mode })).toBe(false);
    expect(
      isExtensionMessage({ type: "slice", slice: null, project, mode }),
    ).toBe(false);
    expect(isExtensionMessage({ type: "slice", slice, mode })).toBe(false);
    expect(isExtensionMessage({ type: "slice", slice, project })).toBe(false);
    expect(
      isExtensionMessage({
        type: "slice",
        slice,
        project,
        mode: { kind: "x" },
      }),
    ).toBe(false);
    expect(
      isExtensionMessage({
        type: "slice",
        slice,
        project,
        mode: { kind: "expansion", nodeId: "a#b" },
      }),
    ).toBe(false);
  });
});
