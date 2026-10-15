import { describe, expect, it } from "vitest";
import { parseWebviewMessage } from "../../src/panel/messages.js";

const project = "/repo/tsconfig.json";
const refresh = {
  type: "refresh",
  project,
  generation: 2,
  focusId: "a.ts#f",
  expanded: ["a.ts#g"],
};

describe("parseWebviewMessage for paths", () => {
  it("accepts pathClick with a project and node id", () => {
    const click = { type: "pathClick", project, nodeId: "a.ts#f" };
    expect(parseWebviewMessage(click)).toEqual(click);
  });

  it("drops pathClick with a missing or non-string field", () => {
    const click = { type: "pathClick", project, nodeId: "a.ts#f" };
    for (const bad of [
      { project: undefined },
      { project: 3 },
      { nodeId: undefined },
      { nodeId: 7 },
    ]) {
      expect(parseWebviewMessage({ ...click, ...bad })).toBeUndefined();
    }
  });

  it("accepts cancelPath with an integer id", () => {
    expect(parseWebviewMessage({ type: "cancelPath", id: 3 })).toEqual({
      type: "cancelPath",
      id: 3,
    });
  });

  it("drops cancelPath with a non-integer id", () => {
    for (const id of [undefined, "3", 1.5, Number.NaN]) {
      expect(parseWebviewMessage({ type: "cancelPath", id })).toBeUndefined();
    }
  });

  it("accepts refresh with a string pathEndId", () => {
    const withEnd = { ...refresh, pathEndId: "b.ts#g" };
    expect(parseWebviewMessage(withEnd)).toEqual(withEnd);
    expect(parseWebviewMessage(refresh)).toEqual(refresh);
  });

  it("drops refresh with a non-string pathEndId", () => {
    for (const pathEndId of [3, null, ["b.ts#g"], {}]) {
      expect(parseWebviewMessage({ ...refresh, pathEndId })).toBeUndefined();
    }
  });
});
