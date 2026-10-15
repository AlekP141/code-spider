import { describe, expect, it } from "vitest";
import { isPathInfo, pathInfoMatches } from "../../src/view/path-info.js";
import { graphOf, id } from "../support/graph-states.js";
import { pathInfo } from "../support/path-graphs.js";

const valid = pathInfo(["a", "b"], ["e1"], "b");

describe("isPathInfo", () => {
  it("accepts a valid PathInfo, with stoppedBy absent or time", () => {
    expect(isPathInfo(valid)).toBe(true);
    const timed = { ...valid.summary, stoppedBy: "time" };
    expect(isPathInfo({ ...valid, summary: timed })).toBe(true);
    expect(isPathInfo(JSON.parse(JSON.stringify(valid)))).toBe(true);
  });

  it("rejects a non-integer or negative column, a non-string endId, and non-array boxes or edgeIds", () => {
    const box = { id: id("a"), column: 0 };
    expect(isPathInfo({ ...valid, boxes: [{ ...box, column: 1.5 }] })).toBe(
      false,
    );
    expect(isPathInfo({ ...valid, boxes: [{ ...box, column: -1 }] })).toBe(
      false,
    );
    expect(isPathInfo({ ...valid, boxes: [{ id: 3, column: 0 }] })).toBe(false);
    expect(isPathInfo({ ...valid, endId: 3 })).toBe(false);
    expect(isPathInfo({ ...valid, boxes: "a" })).toBe(false);
    expect(isPathInfo({ ...valid, edgeIds: { e1: true } })).toBe(false);
    expect(isPathInfo({ ...valid, edgeIds: [1] })).toBe(false);
    expect(isPathInfo(null)).toBe(false);
    expect(isPathInfo("path")).toBe(false);
  });

  it("rejects non-finite summary numbers, a non-boolean routesCapped and any other stoppedBy", () => {
    const withSummary = (patch: object) => ({
      ...valid,
      summary: { ...valid.summary, ...patch },
    });
    for (const patch of [
      { routes: Number.NaN },
      { leftOut: Number.POSITIVE_INFINITY },
      { checked: "3" },
      { routesCapped: 0 },
      { stoppedBy: "memory" },
      { stoppedBy: 1 },
    ]) {
      expect(isPathInfo(withSummary(patch))).toBe(false);
    }
    expect(isPathInfo({ ...valid, summary: undefined })).toBe(false);
  });
});

describe("pathInfoMatches", () => {
  const graph = {
    ...graphOf("a", ["s"], ["b"]),
  };
  const edge = Object.keys(graph.edges)[0] ?? "";

  it("accepts a path whose end, box ids and edge ids are all in the graph and whose boxes include the focus", () => {
    expect(pathInfoMatches(graph, pathInfo(["a", "b"], [edge], "b"))).toBe(
      true,
    );
    expect(pathInfoMatches(graph, pathInfo(["a"], [], "s"))).toBe(true);
  });

  it("rejects an endId, box id or edge id that is missing, and a focusId that is not among the boxes", () => {
    expect(pathInfoMatches(graph, pathInfo(["a", "b"], [edge], "zz"))).toBe(
      false,
    );
    expect(pathInfoMatches(graph, pathInfo(["a", "zz"], [edge], "b"))).toBe(
      false,
    );
    expect(pathInfoMatches(graph, pathInfo(["a", "b"], ["nope"], "b"))).toBe(
      false,
    );
    expect(pathInfoMatches(graph, pathInfo(["s", "b"], [edge], "b"))).toBe(
      false,
    );
  });
});
