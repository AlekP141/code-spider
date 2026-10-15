import { describe, expect, it } from "vitest";
import {
  formatCount,
  pathOverlayText,
  pathSummaryText,
} from "../../src/path/path-text.js";
import type { PathSummary } from "@code-spider/core/types";
import type { PathSearch } from "../../src/host/protocol.js";
import type { GraphState } from "../../src/view/types.js";
import { id } from "../support/graph-states.js";
import { pathGraph, pathParts } from "../support/path-graphs.js";

function search(overrides: Partial<PathSearch> = {}): PathSearch {
  return {
    id: 1,
    purpose: "search",
    from: "fetchUser",
    to: "renderAvatar",
    checked: 0,
    routes: 0,
    routesCapped: false,
    ...overrides,
  };
}

function withSummary(patch: Partial<PathSummary>): GraphState {
  const graph = pathGraph();
  const path = graph.path;
  if (!path) throw new Error("no path");
  return {
    ...graph,
    path: { ...path, summary: { ...path.summary, ...patch } },
  };
}

describe("pathOverlayText", () => {
  it("leaves the counts out before the first progress", () => {
    expect(pathOverlayText(search())).toBe(
      "Searching for paths from fetchUser to renderAvatar...",
    );
  });

  it("adds the counts once something was checked, with the singular forms", () => {
    expect(pathOverlayText(search({ checked: 140, routes: 3 }))).toBe(
      "Searching for paths from fetchUser to renderAvatar... 140 functions checked, 3 routes so far",
    );
    expect(pathOverlayText(search({ checked: 1, routes: 1 }))).toBe(
      "Searching for paths from fetchUser to renderAvatar... 1 function checked, 1 route so far",
    );
    expect(pathOverlayText(search({ checked: 2, routes: 0 }))).toContain(
      "2 functions checked, 0 routes so far",
    );
  });

  it("shows 1,000+ routes when capped and thousands separators", () => {
    expect(formatCount(7)).toBe("7");
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(
      pathOverlayText(
        search({ checked: 12345, routes: 1000, routesCapped: true }),
      ),
    ).toBe(
      "Searching for paths from fetchUser to renderAvatar... 12,345 functions checked, 1,000+ routes so far",
    );
  });

  it("says Refreshing for a refresh, with the same counts", () => {
    expect(pathOverlayText(search({ purpose: "refresh" }))).toBe(
      "Refreshing paths from fetchUser to renderAvatar...",
    );
    expect(
      pathOverlayText(search({ purpose: "refresh", checked: 5, routes: 2 })),
    ).toBe(
      "Refreshing paths from fetchUser to renderAvatar... 5 functions checked, 2 routes so far",
    );
  });
});

describe("pathSummaryText", () => {
  it("counts routes, with the singular and the capped form", () => {
    expect(pathSummaryText(withSummary({ routes: 3 }))?.text).toBe(
      "Paths a → z: 3 routes",
    );
    expect(pathSummaryText(withSummary({ routes: 1 }))?.text).toBe(
      "Paths a → z: 1 route",
    );
    expect(
      pathSummaryText(withSummary({ routes: 1000, routesCapped: true }))?.text,
    ).toBe("Paths a → z: 1,000+ routes");
  });

  it("joins the time-limit and box-cap clauses with a middle dot", () => {
    const graph = withSummary({ routes: 3, stoppedBy: "time", leftOut: 41 });
    const boxes = graph.path?.boxes.length;
    expect(pathSummaryText(graph)?.text).toBe(
      `Paths a → z: 3 routes · stopped early (time limit) · nearest ${boxes} route boxes shown, 41 left out`,
    );
    expect(
      pathSummaryText(withSummary({ routes: 2, stoppedBy: "time" }))?.text,
    ).toBe("Paths a → z: 2 routes · stopped early (time limit)");
  });

  it("takes the names from the A and B nodes and puts the full text in the title", () => {
    const parts = pathParts();
    const renamed = pathGraph({
      ...parts,
      slice: {
        ...parts.slice,
        nodes: parts.slice.nodes.map((node) =>
          node.id === id("a") ? { ...node, name: "fetchUser" } : node,
        ),
      },
      route: {
        ...parts.route,
        nodes: parts.route.nodes.map((node) =>
          node.id === id("z") ? { ...node, name: "renderAvatar" } : node,
        ),
      },
    });
    const { path: _path, ...plain } = renamed;
    expect(pathSummaryText(plain as GraphState)).toBeUndefined();
    const summary = pathSummaryText(renamed);
    expect(summary?.text).toBe("Paths fetchUser → renderAvatar: 1 route");
    expect(summary?.title).toBe(summary?.text);
  });
});
