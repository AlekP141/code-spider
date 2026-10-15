import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import { describe, expect, it } from "vitest";
import { MessageGate } from "../../src/panel/message-gate.js";

const mark = (name: string): ExtensionToWebview => ({
  type: "pathStart",
  mark: { project: "/repo/tsconfig.json", nodeId: `a#${name}`, name },
});

const search = (id: number): ExtensionToWebview => ({
  type: "pathSearch",
  search: {
    id,
    purpose: "search",
    from: "f",
    to: "g",
    checked: 0,
    routes: 0,
    routesCapped: false,
  },
});

const noSearch: ExtensionToWebview = { type: "pathSearch", search: undefined };

const found = (focusId: string): ExtensionToWebview => ({
  type: "pathFound",
  project: "/repo/tsconfig.json",
  slice: { focusId, nodes: [], edges: [], truncated: false },
  route: { nodes: [], edges: [] },
  path: {
    endId: "a#end",
    boxes: [],
    edgeIds: [],
    summary: { routes: 0, routesCapped: false, leftOut: 0, checked: 0 },
  },
  sourceVersion: 0,
});

const centre = (focusId: string): ExtensionToWebview => ({
  type: "slice",
  slice: { focusId, nodes: [], edges: [], truncated: false },
  project: "/repo/tsconfig.json",
  mode: { kind: "centre", sourceVersion: 0 },
});

function setup() {
  const sent: ExtensionToWebview[] = [];
  const gate = new MessageGate((message) => sent.push(message));
  return { sent, gate };
}

describe("MessageGate and paths", () => {
  it("replays pathStart and pathSearch on every ready, the latest of each", () => {
    const { sent, gate } = setup();
    gate.post(mark("one"));
    gate.post(search(1));
    gate.post(mark("two"));
    gate.post(search(2));
    gate.markReady();
    expect(sent).toEqual([mark("two"), search(2)]);
    gate.reset();
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([mark("two"), search(2)]);
  });

  it("lets a pathSearch of undefined replace an earlier search in the replay", () => {
    const { sent, gate } = setup();
    gate.post(search(1));
    gate.post(noSearch);
    gate.markReady();
    expect(sent).toEqual([noSearch]);
  });

  it("holds pathFound until the first ready and delivers it once", () => {
    const { sent, gate } = setup();
    gate.post(found("a#one"));
    expect(sent).toEqual([]);
    gate.markReady();
    expect(sent).toEqual([found("a#one")]);
    gate.reset();
    gate.markReady();
    expect(sent).toEqual([found("a#one")]);
  });

  it("replaces a pathFound posted before ready with a later centre message", () => {
    const { sent, gate } = setup();
    gate.post(found("a#one"));
    gate.post(centre("a#two"));
    gate.markReady();
    expect(sent).toEqual([centre("a#two")]);
  });

  it("replays pathStart and pathSearch after the existing state kinds and before content", () => {
    const { sent, gate } = setup();
    gate.post(found("a#one"));
    gate.post(search(1));
    gate.post(mark("one"));
    gate.post({ type: "busy", busy: true });
    gate.post({ type: "sourceChanged", version: 3 });
    gate.post({ type: "indexing", indexing: true });
    gate.markReady();
    expect(sent.map((message) => message.type)).toEqual([
      "indexing",
      "busy",
      "sourceChanged",
      "pathStart",
      "pathSearch",
      "pathFound",
    ]);
  });
});
