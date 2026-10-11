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

describe("GraphSession.focusNode", () => {
  it("refuses a project it has never sent to the panel", async () => {
    const { session, worker, posted } = setup();
    await session.focusNode({ project: PROJECT, nodeId: NODE });
    expect(posted).toEqual([
      { type: "analysisError", message: "Unknown project" },
    ]);
    expect(worker.sliceForNode).not.toHaveBeenCalled();
  });

  it("re-centres: brackets busy, slices around the node and posts a centre slice", async () => {
    const { session, worker, jumps, changes, posted, types } = setup();
    jumps.add(PROJECT, resultFor("src/a.ts#f"));
    changes.markSaved("typescript", "/repo/src/b.ts");

    await session.focusNode({ project: PROJECT, nodeId: NODE });

    expect(worker.sliceForNode).toHaveBeenCalledWith(PROJECT, NODE, [
      "/repo/src/b.ts",
    ]);
    expect(types()).toEqual(["busy", "slice", "busy"]);
    expect(posted[1]).toEqual({
      type: "slice",
      slice: resultFor(NODE).slice,
      project: PROJECT,
      mode: { kind: "centre" },
    });
    expect(session.currentGraph()?.slice.focusId).toBe(NODE);
  });

  it("lets the newest centre request win across showGraph and focusNode", async () => {
    const slow = deferred<FocusResult>();
    const { session, jumps, posted } = setup({ focus: () => slow.promise });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const first = session.showGraph(request);
    await session.focusNode({ project: PROJECT, nodeId: NODE });
    slow.resolve(resultFor("src/a.ts#slow"));
    await first;

    expect(posted.filter((message) => message.type === "slice")).toHaveLength(
      1,
    );
    expect(session.currentGraph()?.slice.focusId).toBe(NODE);
    expect(
      posted.filter((message) => message.type === "busy" && !message.busy),
    ).toHaveLength(1);
  });

  it("shows a failure in the panel only and keeps the earlier graph", async () => {
    const { session, jumps, notifier, posted } = setup({
      sliceForNode: async () => {
        throw new Error("Node not found: src/a.ts#g");
      },
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    await session.focusNode({ project: PROJECT, nodeId: NODE });

    expect(posted).toContainEqual({
      type: "analysisError",
      message: "Node not found: src/a.ts#g",
    });
    expect(posted.at(-1)).toEqual({ type: "busy", busy: false });
    expect(notifier.error).not.toHaveBeenCalled();
    expect(session.currentGraph()).toBeUndefined();
  });

  it("also raises a notification when the worker crashed", async () => {
    const { session, jumps, notifier, posted } = setup({
      sliceForNode: async () => {
        throw new WorkerCrashedError(
          "The analysis worker stopped: exited with code 3",
          false,
        );
      },
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    await session.focusNode({ project: PROJECT, nodeId: NODE });

    const error = posted.find((message) => message.type === "analysisError");
    const text = error?.type === "analysisError" ? error.message : "";
    expect(text).toContain("fresh worker");
    expect(notifier.error).toHaveBeenCalledWith(text);
  });
});

describe("GraphSession.expand", () => {
  const expand = { project: PROJECT, nodeId: NODE, generation: 7 };

  it("refuses a project it has never sent to the panel", async () => {
    const { session, worker, posted } = setup();
    await session.expand(expand);
    expect(posted).toEqual([
      {
        type: "expandFailed",
        nodeId: NODE,
        generation: 7,
        message: "Unknown project",
      },
    ]);
    expect(worker.sliceForNode).not.toHaveBeenCalled();
  });

  it("posts an expansion slice that echoes the generation, without busy", async () => {
    const { session, jumps, worker, posted } = setup({
      sliceForNode: vi.fn(async () => resultFor(NODE, [OTHER])),
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    await session.expand(expand);

    expect(posted).toEqual([
      {
        type: "slice",
        slice: resultFor(NODE, [OTHER]).slice,
        project: PROJECT,
        mode: { kind: "expansion", nodeId: NODE, generation: 7 },
      },
    ]);
    expect(jumps.nodeTarget(PROJECT, OTHER)).toBeDefined();
    expect(worker.sliceForNode).toHaveBeenCalledWith(PROJECT, NODE, []);
    expect(session.currentGraph()).toBeUndefined();
  });

  it("may overlap other expansions and answers each in its own time", async () => {
    const first = deferred<FocusResult>();
    const second = deferred<FocusResult>();
    const pending = [first, second];
    const { session, jumps, posted } = setup({
      sliceForNode: () => {
        const next = pending.shift();
        if (!next) throw new Error("unexpected request");
        return next.promise;
      },
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const one = session.expand(expand);
    const two = session.expand({ ...expand, nodeId: OTHER, generation: 8 });
    second.resolve(resultFor(OTHER));
    await two;
    first.resolve(resultFor(NODE));
    await one;

    expect(
      posted.map((message) =>
        message.type === "slice" ? message.mode : message.type,
      ),
    ).toEqual([
      { kind: "expansion", nodeId: OTHER, generation: 8 },
      { kind: "expansion", nodeId: NODE, generation: 7 },
    ]);
  });

  it("does not supersede a centre request in flight", async () => {
    const slow = deferred<FocusResult>();
    const { session, jumps, posted } = setup({ focus: () => slow.promise });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const centre = session.showGraph(request);
    await session.expand(expand);
    slow.resolve(resultFor("src/a.ts#centre"));
    await centre;

    expect(session.currentGraph()?.slice.focusId).toBe("src/a.ts#centre");
    expect(
      posted
        .filter((message) => message.type === "slice")
        .map((message) => message.mode.kind),
    ).toEqual(["expansion", "centre"]);
  });

  it("reports a failure as expandFailed and leaves notifications alone", async () => {
    const { session, jumps, notifier, posted } = setup({
      sliceForNode: async () => {
        throw new Error("Node not found: src/a.ts#g");
      },
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    await session.expand(expand);

    expect(posted).toEqual([
      {
        type: "expandFailed",
        nodeId: NODE,
        generation: 7,
        message: "Node not found: src/a.ts#g",
      },
    ]);
    expect(notifier.error).not.toHaveBeenCalled();
  });

  it("also raises a notification when the worker crashed", async () => {
    const { session, jumps, notifier, posted } = setup({
      sliceForNode: async () => {
        throw new WorkerCrashedError(
          "The analysis worker ran out of memory.",
          true,
        );
      },
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    await session.expand(expand);

    const failed = posted.find((message) => message.type === "expandFailed");
    const text = failed?.type === "expandFailed" ? failed.message : "";
    expect(text).toContain("ran out of memory");
    expect(notifier.error).toHaveBeenCalledWith(text);
  });

  it("posts nothing when the panel closed while the answer was on its way", async () => {
    const slow = deferred<FocusResult>();
    const { session, jumps, posted } = setup({
      sliceForNode: () => slow.promise,
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const pending = session.expand(expand);
    jumps.clear();
    slow.resolve(resultFor(NODE, [OTHER]));
    await pending;

    expect(posted).toEqual([]);
    expect(jumps.has(PROJECT)).toBe(false);
  });

  it("posts nothing, and no notification, when it fails after the panel closed", async () => {
    const slow = deferred<FocusResult>();
    const { session, jumps, notifier, posted } = setup({
      sliceForNode: () => slow.promise,
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const pending = session.expand(expand);
    jumps.clear();
    slow.reject(new WorkerCrashedError("The analysis worker stopped", false));
    await pending;

    expect(posted).toEqual([]);
    expect(notifier.error).not.toHaveBeenCalled();
  });
});
