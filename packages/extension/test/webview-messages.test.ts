import { describe, expect, it } from "vitest";
import { parseWebviewMessage } from "../src/panel/messages.js";

describe("parseWebviewMessage", () => {
  it("accepts the messages with no payload", () => {
    expect(parseWebviewMessage({ type: "ready" })).toEqual({ type: "ready" });
    expect(parseWebviewMessage({ type: "refresh" })).toEqual({
      type: "refresh",
    });
  });

  it("accepts node messages with a string nodeId", () => {
    for (const type of ["openInEditor", "focus", "expand"] as const) {
      expect(parseWebviewMessage({ type, nodeId: "a.ts#f" })).toEqual({
        type,
        nodeId: "a.ts#f",
      });
    }
  });

  it("accepts openCallSite with a string edgeId", () => {
    expect(parseWebviewMessage({ type: "openCallSite", edgeId: "e1" })).toEqual(
      { type: "openCallSite", edgeId: "e1" },
    );
  });

  it("drops anything malformed or unknown", () => {
    expect(parseWebviewMessage(null)).toBeUndefined();
    expect(parseWebviewMessage("ready")).toBeUndefined();
    expect(parseWebviewMessage({ type: "openInEditor" })).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "openInEditor", nodeId: 3 }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "openCallSite", nodeId: "x" }),
    ).toBeUndefined();
    expect(parseWebviewMessage({ type: "bogus" })).toBeUndefined();
  });
});
