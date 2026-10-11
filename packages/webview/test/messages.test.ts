import { describe, expect, it } from "vitest";
import { isExtensionMessage } from "../src/messages.js";

const slice = { focusId: "a#b", nodes: [], edges: [], truncated: false };
const project = "/repo/tsconfig.json";

describe("isExtensionMessage", () => {
  it("accepts each extension-to-webview message", () => {
    const centre = {
      type: "slice",
      slice,
      project,
      mode: { kind: "centre", sourceVersion: 0 },
    };
    const expansion = {
      type: "slice",
      slice,
      project,
      mode: { kind: "expansion", nodeId: "a#b", generation: 3 },
    };
    expect(isExtensionMessage(centre)).toBe(true);
    expect(isExtensionMessage(expansion)).toBe(true);
    expect(isExtensionMessage({ type: "sourceChanged", version: 4 })).toBe(
      true,
    );
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
    expect(
      isExtensionMessage({
        type: "settings",
        columnGap: 192,
        edgeStyle: "curved",
      }),
    ).toBe(true);
  });

  it("needs a known edgeStyle on settings", () => {
    const settings = { type: "settings", columnGap: 192 };
    expect(isExtensionMessage(settings)).toBe(false);
    for (const edgeStyle of ["wavy", 1, null]) {
      expect(isExtensionMessage({ ...settings, edgeStyle })).toBe(false);
    }
    expect(isExtensionMessage({ ...settings, edgeStyle: "stepped" })).toBe(
      true,
    );
  });

  it("accepts refreshed and refreshFailed when well-formed", () => {
    expect(
      isExtensionMessage({
        type: "refreshed",
        project,
        generation: 2,
        sourceVersion: 5,
        centre: slice,
        expansions: [{ nodeId: "a#c", slice }],
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: "refreshed",
        project,
        generation: 2,
        sourceVersion: 0,
        centre: slice,
        expansions: [],
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: "refreshFailed",
        generation: 2,
        message: "x",
      }),
    ).toBe(true);
  });

  it("rejects malformed refreshed and refreshFailed messages", () => {
    const refreshed = {
      type: "refreshed",
      project,
      generation: 2,
      sourceVersion: 5,
      centre: slice,
      expansions: [],
    };
    for (const bad of [
      { project: undefined },
      { generation: "2" },
      { sourceVersion: undefined },
      { centre: null },
      { centre: undefined },
      { expansions: undefined },
      { expansions: [null] },
      { expansions: [{ nodeId: 3, slice }] },
      { expansions: [{ nodeId: "a#c", slice: null }] },
    ]) {
      expect(isExtensionMessage({ ...refreshed, ...bad })).toBe(false);
    }
    expect(isExtensionMessage({ type: "refreshFailed", message: "x" })).toBe(
      false,
    );
    expect(isExtensionMessage({ type: "refreshFailed", generation: 2 })).toBe(
      false,
    );
  });

  it("rejects malformed payloads", () => {
    expect(isExtensionMessage(undefined)).toBe(false);
    expect(isExtensionMessage("busy")).toBe(false);
    expect(isExtensionMessage({ type: "busy", busy: "yes" })).toBe(false);
    expect(isExtensionMessage({ type: "analysisError" })).toBe(false);
    expect(
      isExtensionMessage({
        type: "settings",
        columnGap: "wide",
        edgeStyle: "stepped",
      }),
    ).toBe(false);
    expect(isExtensionMessage({ type: "expandFailed", nodeId: "a#b" })).toBe(
      false,
    );
    expect(isExtensionMessage({ type: "unknown" })).toBe(false);
  });

  it("rejects a slice without a project or with a malformed mode", () => {
    const mode = { kind: "centre", sourceVersion: 0 };
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

  it("rejects a centre mode without a numeric sourceVersion", () => {
    for (const mode of [
      { kind: "centre" },
      { kind: "centre", sourceVersion: "3" },
      { kind: "centre", sourceVersion: null },
    ]) {
      expect(isExtensionMessage({ type: "slice", slice, project, mode })).toBe(
        false,
      );
    }
  });

  it("needs a numeric version on sourceChanged", () => {
    expect(isExtensionMessage({ type: "sourceChanged" })).toBe(false);
    expect(isExtensionMessage({ type: "sourceChanged", version: "4" })).toBe(
      false,
    );
    expect(isExtensionMessage({ type: "sourceChanged", version: null })).toBe(
      false,
    );
  });

  it("rejects a non-finite sourceVersion or version", () => {
    const refreshed = {
      type: "refreshed",
      project,
      generation: 1,
      sourceVersion: 3,
      centre: slice,
      expansions: [],
    };
    expect(isExtensionMessage(refreshed)).toBe(true);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const mode = { kind: "centre", sourceVersion: bad };
      expect(isExtensionMessage({ type: "slice", slice, project, mode })).toBe(
        false,
      );
      expect(isExtensionMessage({ ...refreshed, sourceVersion: bad })).toBe(
        false,
      );
      expect(isExtensionMessage({ type: "sourceChanged", version: bad })).toBe(
        false,
      );
      expect(
        isExtensionMessage({
          type: "settings",
          columnGap: bad,
          edgeStyle: "stepped",
        }),
      ).toBe(false);
    }
  });
});
