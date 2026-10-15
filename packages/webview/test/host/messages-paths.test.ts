import { describe, expect, it } from "vitest";
import { isExtensionMessage } from "../../src/host/messages.js";
import { PROJECT, sliceOf } from "../support/graph-states.js";
import { pathInfo } from "../support/path-graphs.js";

const mark = { project: PROJECT, nodeId: "a#f", name: "f" };
const search = {
  id: 1,
  purpose: "search",
  from: "f",
  to: "g",
  checked: 140,
  routes: 3,
  routesCapped: false,
};
const found = {
  type: "pathFound",
  project: PROJECT,
  slice: sliceOf("a"),
  route: { nodes: [], edges: [] },
  path: pathInfo(["a", "z"], []),
  sourceVersion: 2,
};
const refreshed = {
  type: "refreshed",
  project: PROJECT,
  generation: 1,
  sourceVersion: 2,
  centre: sliceOf("a"),
  expansions: [],
};

describe("pathStart", () => {
  it("accepts a mark and undefined and rejects a mark with a missing field", () => {
    expect(isExtensionMessage({ type: "pathStart", mark })).toBe(true);
    expect(isExtensionMessage({ type: "pathStart", mark: undefined })).toBe(
      true,
    );
    expect(isExtensionMessage({ type: "pathStart" })).toBe(true);
    for (const field of ["project", "nodeId", "name"]) {
      const { [field]: _dropped, ...partial } = mark as Record<string, string>;
      expect(isExtensionMessage({ type: "pathStart", mark: partial })).toBe(
        false,
      );
    }
    expect(isExtensionMessage({ type: "pathStart", mark: null })).toBe(false);
  });
});

describe("pathSearch", () => {
  it("accepts a search and undefined and rejects a wrong purpose or non-number counts", () => {
    expect(isExtensionMessage({ type: "pathSearch", search })).toBe(true);
    expect(
      isExtensionMessage({
        type: "pathSearch",
        search: { ...search, purpose: "refresh", routesCapped: true },
      }),
    ).toBe(true);
    expect(isExtensionMessage({ type: "pathSearch", search: undefined })).toBe(
      true,
    );
    expect(isExtensionMessage({ type: "pathSearch" })).toBe(true);
    for (const bad of [
      { purpose: "other" },
      { checked: "3" },
      { routes: Number.NaN },
      { id: null },
      { routesCapped: 1 },
      { from: 4 },
    ]) {
      expect(
        isExtensionMessage({
          type: "pathSearch",
          search: { ...search, ...bad },
        }),
      ).toBe(false);
    }
  });
});

describe("pathFound", () => {
  it("needs project, slice, route, a valid path and a finite sourceVersion", () => {
    expect(isExtensionMessage(found)).toBe(true);
    for (const bad of [
      { project: 1 },
      { project: undefined },
      { slice: undefined },
      { slice: null },
      { route: undefined },
      { route: { nodes: [] } },
      { route: { nodes: [], edges: 3 } },
      { path: undefined },
      { path: { ...found.path, endId: 3 } },
      { sourceVersion: Number.POSITIVE_INFINITY },
      { sourceVersion: "2" },
    ]) {
      expect(isExtensionMessage({ ...found, ...bad })).toBe(false);
    }
  });
});

describe("refreshed", () => {
  it("accepts optional route and path and rejects a malformed path", () => {
    expect(isExtensionMessage(refreshed)).toBe(true);
    expect(
      isExtensionMessage({
        ...refreshed,
        route: found.route,
        path: found.path,
      }),
    ).toBe(true);
    expect(isExtensionMessage({ ...refreshed, route: found.route })).toBe(
      true,
    );
    expect(
      isExtensionMessage({ ...refreshed, path: { ...found.path, boxes: 1 } }),
    ).toBe(false);
    expect(isExtensionMessage({ ...refreshed, route: { nodes: 1 } })).toBe(
      false,
    );
  });
});
