import { describe, expect, it } from "vitest";
import { parseWebviewMessage } from "../src/panel/messages.js";

const project = "/repo/tsconfig.json";

describe("parseWebviewMessage", () => {
  it("accepts the messages with no payload", () => {
    expect(parseWebviewMessage({ type: "ready" })).toEqual({ type: "ready" });
    expect(parseWebviewMessage({ type: "refresh" })).toEqual({
      type: "refresh",
    });
  });

  it("accepts node messages with a project and a string nodeId", () => {
    for (const type of ["openInEditor", "focus"] as const) {
      expect(parseWebviewMessage({ type, project, nodeId: "a.ts#f" })).toEqual({
        type,
        project,
        nodeId: "a.ts#f",
      });
    }
  });

  it("accepts expand with a project, a nodeId and an integer generation", () => {
    expect(
      parseWebviewMessage({
        type: "expand",
        project,
        nodeId: "a.ts#f",
        generation: 3,
      }),
    ).toEqual({ type: "expand", project, nodeId: "a.ts#f", generation: 3 });
  });

  it("accepts openCallSite with a project and a string edgeId", () => {
    expect(
      parseWebviewMessage({ type: "openCallSite", project, edgeId: "e1" }),
    ).toEqual({ type: "openCallSite", project, edgeId: "e1" });
  });

  it("accepts setColumnGap with a finite number", () => {
    expect(parseWebviewMessage({ type: "setColumnGap", value: 128 })).toEqual({
      type: "setColumnGap",
      value: 128,
    });
  });

  it("drops anything malformed or unknown", () => {
    expect(parseWebviewMessage(null)).toBeUndefined();
    expect(parseWebviewMessage("ready")).toBeUndefined();
    expect(parseWebviewMessage({ type: "openInEditor" })).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "openInEditor", nodeId: "a.ts#f" }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "openInEditor", project, nodeId: 3 }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "openCallSite", project, nodeId: "x" }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "expand", project, nodeId: "a.ts#f" }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({
        type: "expand",
        project,
        nodeId: "a.ts#f",
        generation: 1.5,
      }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "setColumnGap", value: Number.NaN }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "setColumnGap", value: "wide" }),
    ).toBeUndefined();
    expect(parseWebviewMessage({ type: "bogus" })).toBeUndefined();
  });
});
