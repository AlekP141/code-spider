import type {
  ExtensionToWebview,
  SliceMode,
} from "@code-spider/webview/protocol";
import { describe, expect, it } from "vitest";
import { MessageGate } from "../../src/panel/message-gate.js";

const slice = (
  focusId: string,
  mode: SliceMode = { kind: "centre", sourceVersion: 0 },
): ExtensionToWebview => ({
  type: "slice",
  slice: { focusId, nodes: [], edges: [], truncated: false },
  project: "/repo/tsconfig.json",
  mode,
});

const expansion = (nodeId: string): ExtensionToWebview =>
  slice(nodeId, { kind: "expansion", nodeId, generation: 1 });

const failed: ExtensionToWebview = {
  type: "expandFailed",
  nodeId: "a#one",
  generation: 1,
  message: "gone",
};

const settings = (
  columnGap: number,
  edgeStyle: "stepped" | "curved",
): ExtensionToWebview => ({
  type: "settings",
  columnGap,
  edgeStyle,
  diffMode: "uncommitted",
});

function setup() {
  const sent: ExtensionToWebview[] = [];
  const gate = new MessageGate((message) => sent.push(message));
  return { sent, gate };
}

describe("MessageGate content", () => {
  it("holds a centre slice until the webview is ready", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    expect(sent).toEqual([]);
  });

  it("delivers only the latest content, once, on the first ready", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    gate.post(slice("a#two"));
    gate.markReady();
    expect(sent).toEqual([slice("a#two")]);
  });

  it("lets a later error replace a queued slice and vice versa", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    gate.post({ type: "analysisError", message: "boom" });
    gate.markReady();
    expect(sent).toEqual([{ type: "analysisError", message: "boom" }]);

    gate.reset();
    gate.post({ type: "analysisError", message: "boom" });
    gate.post(slice("a#two"));
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([slice("a#two")]);
  });

  it("never replays content when the webview reloads and says ready again", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    gate.markReady();
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([]);
  });

  it("sends content straight through once ready and does not keep it", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post(slice("a#one"));
    expect(sent).toEqual([slice("a#one")]);
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([]);
  });

  it("queues content again after reset", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.reset();
    gate.post(slice("a#one"));
    expect(sent).toEqual([]);
    gate.markReady();
    expect(sent).toEqual([slice("a#one")]);
  });
});

describe("MessageGate ephemeral messages", () => {
  it("drops an expansion slice and expandFailed while the webview is not ready", () => {
    const { sent, gate } = setup();
    gate.post(expansion("a#one"));
    gate.post(failed);
    gate.markReady();
    expect(sent).toEqual([]);
  });

  it("sends them straight through once ready", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post(expansion("a#one"));
    gate.post(failed);
    expect(sent).toEqual([expansion("a#one"), failed]);
  });
});

describe("MessageGate refresh answers", () => {
  const refreshed: ExtensionToWebview = {
    type: "refreshed",
    project: "/repo/tsconfig.json",
    generation: 2,
    sourceVersion: 5,
    centre: { focusId: "a#one", nodes: [], edges: [], truncated: false },
    expansions: [],
  };
  const refreshFailed: ExtensionToWebview = {
    type: "refreshFailed",
    generation: 2,
    message: "gone",
  };

  it("sends them straight through once ready", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post(refreshed);
    gate.post(refreshFailed);
    expect(sent).toEqual([refreshed, refreshFailed]);
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([]);
  });

  it("drops them while the webview is not ready and never replays them", () => {
    const { sent, gate } = setup();
    gate.post(refreshed);
    gate.post(refreshFailed);
    gate.markReady();
    expect(sent).toEqual([]);
    gate.markReady();
    expect(sent).toEqual([]);
  });

  it("drops changeMarks before ready and sends them after it", () => {
    const { sent, gate } = setup();
    const marks: ExtensionToWebview = {
      type: "changeMarks",
      project: "/repo/tsconfig.json",
      marks: { "a#one": "added" },
    };
    gate.post(marks);
    gate.markReady();
    expect(sent).toEqual([]);
    gate.post(marks);
    expect(sent).toEqual([marks]);
    gate.reset();
    gate.markReady();
    expect(sent).toEqual([marks]);
  });
});

describe("MessageGate replayed state", () => {
  it("replays settings, then indexing, then busy, then content", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    gate.post({ type: "busy", busy: true });
    gate.post({ type: "indexing", indexing: true });
    gate.post(settings(160, "stepped"));
    gate.markReady();
    expect(sent.map((message) => message.type)).toEqual([
      "settings",
      "indexing",
      "busy",
      "slice",
    ]);
  });

  it("replays sourceChanged after busy and before content", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    gate.post({ type: "sourceChanged", version: 2 });
    gate.post({ type: "busy", busy: true });
    gate.post(settings(160, "stepped"));
    gate.markReady();
    expect(sent.map((message) => message.type)).toEqual([
      "settings",
      "busy",
      "sourceChanged",
      "slice",
    ]);
  });

  it("replays the latest sourceChanged on every ready", () => {
    const { sent, gate } = setup();
    gate.post({ type: "sourceChanged", version: 2 });
    gate.markReady();
    gate.post({ type: "sourceChanged", version: 5 });
    sent.length = 0;
    gate.markReady();
    gate.reset();
    gate.markReady();
    expect(sent).toEqual([
      { type: "sourceChanged", version: 5 },
      { type: "sourceChanged", version: 5 },
    ]);
  });

  it("replays the latest value of each on every ready", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post(settings(160, "stepped"));
    gate.post(settings(224, "curved"));
    gate.post({ type: "busy", busy: true });
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([
      settings(224, "curved"),
      { type: "busy", busy: true },
    ]);
  });

  it("forgets content on reset but keeps settings, indexing and busy", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post(slice("a#one"));
    gate.post(settings(160, "stepped"));
    gate.post({ type: "indexing", indexing: true });
    gate.post({ type: "busy", busy: true });
    sent.length = 0;
    gate.reset();
    gate.markReady();
    expect(sent).toEqual([
      settings(160, "stepped"),
      { type: "indexing", indexing: true },
      { type: "busy", busy: true },
    ]);
  });
});
