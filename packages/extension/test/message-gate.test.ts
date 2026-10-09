import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import { describe, expect, it } from "vitest";
import { MessageGate } from "../src/panel/message-gate.js";

const slice = (focusId: string): ExtensionToWebview => ({
  type: "slice",
  slice: { focusId, nodes: [], edges: [], truncated: false },
});

function setup() {
  const sent: ExtensionToWebview[] = [];
  const gate = new MessageGate((message) => sent.push(message));
  return { sent, gate };
}

describe("MessageGate", () => {
  it("holds messages until the webview is ready", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    expect(sent).toEqual([]);
  });

  it("delivers only the latest slice on ready", () => {
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
  });

  it("replays indexing, then busy, then content", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    gate.post({ type: "busy", busy: true });
    gate.post({ type: "indexing", indexing: true });
    gate.markReady();
    expect(sent.map((message) => message.type)).toEqual([
      "indexing",
      "busy",
      "slice",
    ]);
  });

  it("sends straight through once ready", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post({ type: "busy", busy: true });
    gate.post(slice("a#one"));
    expect(sent.map((message) => message.type)).toEqual(["busy", "slice"]);
  });

  it("replays the latest state when the webview reloads and says ready again", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post(slice("a#one"));
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([slice("a#one")]);
  });

  it("queues again after reset", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.reset();
    gate.post(slice("a#one"));
    expect(sent).toEqual([]);
    gate.markReady();
    expect(sent).toEqual([slice("a#one")]);
  });

  it("forgets content on reset but keeps indexing and busy", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post(slice("a#one"));
    gate.post({ type: "indexing", indexing: true });
    gate.post({ type: "busy", busy: true });
    sent.length = 0;
    gate.reset();
    gate.markReady();
    expect(sent).toEqual([
      { type: "indexing", indexing: true },
      { type: "busy", busy: true },
    ]);
  });
});
