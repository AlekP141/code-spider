import type { GraphEdge } from "@code-spider/core/types";
import { describe, expect, it } from "vitest";
import {
  calledInOrder,
  walkOrder,
  walkParents,
} from "../src/graph/call-order.js";
import { graphFromSlice } from "../src/view/graph-state.js";
import { PROJECT, calledSlice, id } from "./support/graph-states.js";
import { makeEdge, makeNode, readGolden, site } from "./support/slices.js";

const X = "a#x";

const into = (
  from: string,
  callSite = site(2),
  kind: GraphEdge["kind"] = "call",
) => makeEdge(from, X, { callSite, kind });

describe("calledInOrder", () => {
  it("orders suppliers by start line, then start column", () => {
    const wide = { ...site(3, 2), endColumn: 30 };
    const narrow = { ...site(3, 9), endColumn: 12 };
    const edges = [
      into("a#late", site(5, 3)),
      into("a#narrow", narrow),
      into("a#wide", wide),
    ];
    expect(calledInOrder(X, edges)).toEqual(["a#wide", "a#narrow", "a#late"]);
  });

  it("breaks a tie on end line, then end column, then node id", () => {
    const start = { startLine: 2, startColumn: 3 };
    const edges = [
      into("a#s", { ...start, endLine: 2, endColumn: 5 }),
      into("a#r", { ...start, endLine: 4, endColumn: 1 }),
      into("a#p", { ...start, endLine: 2, endColumn: 9 }),
      into("a#q", { ...start, endLine: 2, endColumn: 5 }),
    ];
    expect(calledInOrder(X, edges)).toEqual(["a#q", "a#s", "a#p", "a#r"]);
  });

  it("puts a function called twice at its first call", () => {
    const edges = [
      into("a#twice", site(3)),
      into("a#once", site(5)),
      into("a#twice", site(8)),
    ];
    expect(calledInOrder(X, edges)).toEqual(["a#twice", "a#once"]);
  });

  it("takes the earliest site across the kinds call, jsx, external and passes", () => {
    const edges = [
      into("a#a", site(9), "call"),
      into("a#a", site(2), "jsx"),
      into("a#b", site(5), "external"),
      into("a#b", site(3), "passes"),
      into("a#c", site(4), "call"),
    ];
    expect(calledInOrder(X, edges)).toEqual(["a#a", "a#b", "a#c"]);
  });

  it("includes unresolved and external suppliers, but not a self edge or edges into other nodes", () => {
    const edges = [
      makeEdge(X, X, { callSite: site(1) }),
      makeEdge("a#other", "a#y", { callSite: site(1) }),
      makeEdge(X, "a#y", { callSite: site(1) }),
      makeEdge("unknown:a#x#Legacy", X, {
        callSite: site(2),
        resolved: false,
      }),
      makeEdge("external:lodash#map", X, {
        callSite: site(3),
        kind: "external",
      }),
    ];
    expect(calledInOrder(X, edges)).toEqual([
      "unknown:a#x#Legacy",
      "external:lodash#map",
    ]);
  });

  it("accepts a one-shot iterable and does not change the edges it is given", () => {
    const edges = Object.freeze([
      Object.freeze(into("a#b", site(4))),
      Object.freeze(into("a#a", site(3))),
    ]);
    const before = JSON.stringify(edges);
    function* once() {
      yield* edges;
    }
    expect(calledInOrder(X, once())).toEqual(["a#a", "a#b"]);
    expect(calledInOrder(X, edges)).toEqual(["a#a", "a#b"]);
    expect(JSON.stringify(edges)).toBe(before);
  });
});

describe("walkOrder", () => {
  const names = (ids: string[]) => ids.map((value) => value.split("#")[1]);

  it("gives the handleSignup golden handleSignup, validateUser, createUser, sendWelcome, main, retry", () => {
    const graph = graphFromSlice(
      readGolden("basic-handleSignup.json"),
      PROJECT,
    );
    expect(names(walkOrder(graph))).toEqual([
      "handleSignup",
      "validateUser",
      "createUser",
      "sendWelcome",
      "main",
      "retry",
    ]);
  });

  it("goes depth first, so a called function's own called functions come before its next sibling", () => {
    const slice = calledSlice("f", ["a", "b"]);
    const graph = graphFromSlice(
      {
        ...slice,
        nodes: [...slice.nodes, makeNode({ id: id("c") })],
        edges: [
          ...slice.edges,
          makeEdge(id("c"), id("a"), { callSite: site(2) }),
        ],
      },
      PROJECT,
    );
    expect(names(walkOrder(graph))).toEqual(["f", "a", "c", "b"]);
  });

  it("visits callers in id order, and a function two others call once, where the walk first reaches it", () => {
    const plain = graphFromSlice(
      calledSlice("f", [], ["z", "x", "y"]),
      PROJECT,
    );
    expect(names(walkOrder(plain))).toEqual(["f", "x", "y", "z"]);

    const slice = calledSlice("f", [], ["q", "p"]);
    const shared = graphFromSlice(
      {
        ...slice,
        nodes: [...slice.nodes, makeNode({ id: id("s") })],
        edges: [
          ...slice.edges,
          makeEdge(id("s"), id("p"), { callSite: site(3) }),
          makeEdge(id("s"), id("q"), { callSite: site(3) }),
        ],
      },
      PROJECT,
    );
    expect(names(walkOrder(shared))).toEqual(["f", "p", "s", "q"]);
  });

  it("ignores an edge with an end outside nodes", () => {
    const base = graphFromSlice(calledSlice("f", ["a"]), PROJECT);
    const graph = {
      ...base,
      edges: {
        ...base.edges,
        g1: makeEdge("a#ghost", id("f"), { id: "g1" }),
        g2: makeEdge(id("f"), "a#ghost2", { id: "g2" }),
        g3: makeEdge("constructor", id("f"), { id: "g3" }),
        g4: makeEdge(id("f"), "toString", { id: "g4" }),
      },
    };
    expect(names(walkOrder(graph))).toEqual(["f", "a"]);
  });

  it("appends the nodes the walk does not reach in id order", () => {
    const base = graphFromSlice(calledSlice("f", ["a"]), PROJECT);
    const nodes = {
      ...base.nodes,
      [id("z")]: makeNode({ id: id("z") }),
      [id("m")]: makeNode({ id: id("m") }),
    };
    expect(names(walkOrder({ ...base, nodes }))).toEqual([
      "f",
      "a",
      "m",
      "z",
    ]);
    expect(names(walkOrder({ ...base, nodes, focusId: "toString" }))).toEqual([
      "a",
      "f",
      "m",
      "z",
    ]);
  });

  it("ends on a cycle and lists each node once", () => {
    const nodes = Object.fromEntries(
      ["a", "b"].map((n) => [id(n), makeNode({ id: id(n) })]),
    );
    const edges = Object.fromEntries(
      [
        makeEdge(id("b"), id("a"), { id: "e1" }),
        makeEdge(id("a"), id("b"), { id: "e2" }),
        makeEdge(id("a"), id("a"), { id: "e3" }),
      ].map((edge) => [edge.id, edge]),
    );
    expect(names(walkOrder({ focusId: id("a"), nodes, edges }))).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("walkParents", () => {
  const owners = (graph: Parameters<typeof walkParents>[0]) =>
    Object.fromEntries(
      [...walkParents(graph)].map(([node, owner]) => [
        node.split("#")[1],
        owner.split("#")[1],
      ]),
    );

  it("names the function each called box was reached through, and none for the focus or the callers", () => {
    const graph = graphFromSlice(
      readGolden("basic-handleSignup.json"),
      PROJECT,
    );
    expect(owners(graph)).toEqual({
      validateUser: "handleSignup",
      createUser: "handleSignup",
      sendWelcome: "handleSignup",
    });
  });

  it("gives a box two functions call to the one the depth-first walk reaches first", () => {
    const slice = calledSlice("f", [], ["q", "p"]);
    const graph = graphFromSlice(
      {
        ...slice,
        nodes: [...slice.nodes, makeNode({ id: id("s") })],
        edges: [
          ...slice.edges,
          makeEdge(id("s"), id("p"), { callSite: site(3) }),
          makeEdge(id("s"), id("q"), { callSite: site(3) }),
        ],
      },
      PROJECT,
    );
    expect(owners(graph)).toEqual({ s: "p" });
  });

  it("gives no owner to a box first reached as a caller, although the focus calls it too", () => {
    const slice = calledSlice("f", ["a", "c"]);
    const graph = graphFromSlice(
      {
        ...slice,
        edges: [
          ...slice.edges,
          makeEdge(id("a"), id("c"), { callSite: site(2) }),
        ],
      },
      PROJECT,
    );
    expect(owners(graph)).toEqual({ a: "f" });
  });

  it("gives no owner to nodes the walk does not reach from the focus", () => {
    const base = graphFromSlice(calledSlice("f", ["a"]), PROJECT);
    const nodes = { ...base.nodes, [id("z")]: makeNode({ id: id("z") }) };
    expect(owners({ ...base, nodes })).toEqual({ a: "f" });
  });
});
