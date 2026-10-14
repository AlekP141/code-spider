import { describe, expect, it } from "vitest";
import { parseWebviewMessage } from "../../src/panel/messages.js";

const project = "/repo/tsconfig.json";

describe("parseWebviewMessage", () => {
  it("accepts ready with no payload", () => {
    expect(parseWebviewMessage({ type: "ready" })).toEqual({ type: "ready" });
  });

  it("accepts refresh with all four fields", () => {
    const refresh = {
      type: "refresh",
      project,
      generation: 2,
      focusId: "a.ts#f",
      expanded: ["a.ts#g", "b.ts#h"],
    };
    expect(parseWebviewMessage(refresh)).toEqual(refresh);
    expect(parseWebviewMessage({ ...refresh, expanded: [] })).toEqual({
      ...refresh,
      expanded: [],
    });
  });

  it("drops a refresh with a missing or mistyped field", () => {
    const refresh = {
      type: "refresh",
      project,
      generation: 2,
      focusId: "a.ts#f",
      expanded: ["a.ts#g"],
    };
    expect(parseWebviewMessage({ type: "refresh" })).toBeUndefined();
    for (const bad of [
      { project: undefined },
      { project: 3 },
      { generation: undefined },
      { generation: "2" },
      { generation: 1.5 },
      { focusId: undefined },
      { focusId: 7 },
      { expanded: undefined },
      { expanded: "a.ts#g" },
      { expanded: ["a.ts#g", 4] },
    ]) {
      expect(parseWebviewMessage({ ...refresh, ...bad })).toBeUndefined();
    }
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

  it("accepts openInEditor with a whole, non-negative line and drops others", () => {
    const message = { type: "openInEditor", project, nodeId: "a.ts#f" };
    expect(parseWebviewMessage({ ...message, line: 4 })).toEqual({
      ...message,
      line: 4,
    });
    expect(parseWebviewMessage({ ...message, line: 0 })).toEqual({
      ...message,
      line: 0,
    });
    for (const line of [-1, 1.5, "2", null, Number.NaN]) {
      expect(parseWebviewMessage({ ...message, line })).toBeUndefined();
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

  it("accepts setEdgeStyle with a known name and drops any other", () => {
    for (const value of ["stepped", "curved"]) {
      expect(parseWebviewMessage({ type: "setEdgeStyle", value })).toEqual({
        type: "setEdgeStyle",
        value,
      });
    }
    for (const value of ["wavy", "Curved", 1, null, undefined]) {
      expect(
        parseWebviewMessage({ type: "setEdgeStyle", value }),
      ).toBeUndefined();
    }
  });

  it("accepts setDiffMode with a known mode", () => {
    for (const value of ["uncommitted", "pr"]) {
      expect(parseWebviewMessage({ type: "setDiffMode", value })).toEqual({
        type: "setDiffMode",
        value,
      });
    }
  });

  it("drops setDiffMode with an unknown, missing or non-string mode", () => {
    expect(parseWebviewMessage({ type: "setDiffMode" })).toBeUndefined();
    for (const value of ["PR", "main", "", 1, null, undefined, ["pr"]]) {
      expect(
        parseWebviewMessage({ type: "setDiffMode", value }),
      ).toBeUndefined();
    }
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
