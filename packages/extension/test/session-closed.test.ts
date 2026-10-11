import { describe, expect, it, vi } from "vitest";
import type { FocusRequest } from "../src/session.js";
import type { FocusResult } from "../src/worker/protocol.js";
import { WorkerCrashedError } from "../src/worker/worker-client.js";
import {
  deferred,
  PROJECT,
  resultFor,
  setup,
} from "./support/session-setup.js";

const NODE = "src/a.ts#g";
const OTHER = "src/a.ts#h";
const request: FocusRequest = {
  file: "/repo/src/a.ts",
  line: 1,
  character: 2,
  isDirty: false,
};

describe("a centre answer that arrives after the panel closed", () => {
  it("is dropped for focusNode: nothing added to the table, no slice posted", async () => {
    const slow = deferred<FocusResult>();
    const { session, panel, jumps, posted } = setup({
      sliceForNode: () => slow.promise,
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const pending = session.focusNode({ project: PROJECT, nodeId: NODE });
    panel.open = false;
    jumps.clear();
    slow.resolve(resultFor(NODE, [OTHER]));
    await pending;

    expect(posted.filter((message) => message.type === "slice")).toEqual([]);
    expect(jumps.has(PROJECT)).toBe(false);
    expect(session.currentGraph()).toBeUndefined();
  });

  it("is dropped for showGraph and leaves the current graph as it was", async () => {
    const slow = deferred<FocusResult>();
    const answers = [Promise.resolve(resultFor("src/a.ts#f")), slow.promise];
    const { session, panel, jumps, posted } = setup({
      focus: vi.fn(() => answers.shift() ?? slow.promise),
    });
    await session.showGraph(request);
    expect(session.currentGraph()?.slice.focusId).toBe("src/a.ts#f");
    posted.length = 0;

    const pending = session.showGraph(request);
    panel.open = false;
    jumps.clear();
    slow.resolve(resultFor("src/a.ts#late", [OTHER]));
    await pending;

    expect(posted.filter((message) => message.type === "slice")).toEqual([]);
    expect(jumps.has(PROJECT)).toBe(false);
    expect(session.currentGraph()?.slice.focusId).toBe("src/a.ts#f");
  });

  it("posts no analysisError and raises no notification when it fails", async () => {
    const slow = deferred<FocusResult>();
    const { session, panel, jumps, notifier, posted } = setup({
      sliceForNode: () => slow.promise,
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const pending = session.focusNode({ project: PROJECT, nodeId: NODE });
    panel.open = false;
    jumps.clear();
    slow.reject(new WorkerCrashedError("The analysis worker stopped", false));
    await pending;

    expect(posted.some((message) => message.type === "analysisError")).toBe(
      false,
    );
    expect(notifier.error).not.toHaveBeenCalled();
  });
});
