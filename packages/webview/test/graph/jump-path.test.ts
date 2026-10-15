import { describe, expect, it } from "vitest";
import { refreshMessage } from "../../src/graph/jump.js";
import { graphOf, id } from "../support/graph-states.js";
import { pathGraph } from "../support/path-graphs.js";

describe("refreshMessage", () => {
  it("carries the end of a path graph", () => {
    const message = refreshMessage(pathGraph());
    expect(message).toMatchObject({ type: "refresh", pathEndId: id("z") });
  });

  it("has no pathEndId on any other graph", () => {
    const message = refreshMessage(graphOf("a", ["b"]));
    expect(message).not.toHaveProperty("pathEndId");
  });
});
