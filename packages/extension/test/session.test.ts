import { describe, expect, it } from "vitest";
import type { FocusRequest } from "../src/session.js";
import type { FocusResult } from "../src/worker/protocol.js";
import { WorkerCrashedError } from "../src/worker/worker-client.js";
import {
  deferred,
  PROJECT,
  resultFor,
  setup,
} from "./support/session-setup.js";

const request: FocusRequest = {
  file: "/repo/src/a.ts",
  text: "line0\nline1\nline2\n",
  line: 1,
  character: 2,
  isDirty: false,
};
const REQUEST_OFFSET = 8;

describe("GraphSession.showGraph", () => {
  it("asks the user to save a dirty document and does nothing else", async () => {
    const { session, panel, worker, notifier } = setup();
    await session.showGraph({ ...request, isDirty: true });
    expect(notifier.warn).toHaveBeenCalledOnce();
    expect(notifier.warn.mock.calls[0]?.[0]).toContain("Save a.ts");
    expect(panel.shown).toBe(0);
    expect(worker.focus).not.toHaveBeenCalled();
  });

  it("opens the panel, marks busy, posts the slice, then clears busy", async () => {
    const { session, panel, worker, jumps, posted, types } = setup();
    await session.showGraph(request);
    expect(panel.shown).toBe(1);
    expect(worker.focus).toHaveBeenCalledWith(
      "/repo/src/a.ts",
      REQUEST_OFFSET,
      ["/repo/src/a.ts"],
    );
    expect(types()).toEqual(["busy", "slice", "busy"]);
    expect(posted[0]).toEqual({ type: "busy", busy: true });
    expect(posted[1]).toEqual({
      type: "slice",
      slice: resultFor("src/a.ts#f").slice,
      project: PROJECT,
      mode: { kind: "centre" },
    });
    expect(posted[2]).toEqual({ type: "busy", busy: false });
    expect(session.currentGraph()).toEqual(resultFor("src/a.ts#f"));
    expect(jumps.nodeTarget(PROJECT, "src/a.ts#f")).toBeDefined();
  });

  it("sends the files saved since the last request, once", async () => {
    const { session, worker, changes } = setup();
    changes.markSaved("typescript", "/repo/src/b.ts");
    await session.showGraph(request);
    await session.showGraph(request);
    expect(worker.focus).toHaveBeenNthCalledWith(
      1,
      "/repo/src/a.ts",
      REQUEST_OFFSET,
      ["/repo/src/b.ts", "/repo/src/a.ts"],
    );
    expect(worker.focus).toHaveBeenNthCalledWith(
      2,
      "/repo/src/a.ts",
      REQUEST_OFFSET,
      ["/repo/src/a.ts"],
    );
  });

  it("always sends the focused file as changed, once", async () => {
    const { session, worker, changes } = setup();
    await session.showGraph(request);
    changes.markSaved("typescript", request.file);
    await session.showGraph(request);
    expect(worker.focus).toHaveBeenNthCalledWith(
      1,
      "/repo/src/a.ts",
      REQUEST_OFFSET,
      ["/repo/src/a.ts"],
    );
    expect(worker.focus).toHaveBeenNthCalledWith(
      2,
      "/repo/src/a.ts",
      REQUEST_OFFSET,
      ["/repo/src/a.ts"],
    );
  });

  it("shows an ordinary failure in the panel only", async () => {
    const { session, notifier, posted } = setup({
      focus: async () => {
        throw new Error("No callable found at x");
      },
    });
    await session.showGraph(request);
    expect(posted).toContainEqual({
      type: "analysisError",
      message: "No callable found at x",
    });
    expect(posted.at(-1)).toEqual({ type: "busy", busy: false });
    expect(notifier.error).not.toHaveBeenCalled();
  });

  it("reports an out-of-memory worker clearly, in the panel and a notification", async () => {
    const { session, notifier, posted } = setup({
      focus: async () => {
        throw new WorkerCrashedError(
          "The analysis worker ran out of memory.",
          true,
        );
      },
    });
    await session.showGraph(request);
    const error = posted.find((message) => message.type === "analysisError");
    expect(error).toMatchObject({ type: "analysisError" });
    const text = error?.type === "analysisError" ? error.message : "";
    expect(text).toContain("ran out of memory");
    expect(text).toContain("4096 MB");
    expect(text).toContain("codeSpider.worker.maxHeapMb");
    expect(notifier.error).toHaveBeenCalledWith(text);
  });

  it("explains that a crashed worker restarts on the next request", async () => {
    const { session, notifier, posted } = setup({
      focus: async () => {
        throw new WorkerCrashedError(
          "The analysis worker stopped: exited with code 3",
          false,
        );
      },
    });
    await session.showGraph(request);
    const error = posted.find((message) => message.type === "analysisError");
    const text = error?.type === "analysisError" ? error.message : "";
    expect(text).toContain("exited with code 3");
    expect(text).toContain("fresh worker");
    expect(notifier.error).toHaveBeenCalledOnce();
  });

  it("reports a position outside the document as a failure", async () => {
    const { session, worker, posted } = setup();
    await session.showGraph({ ...request, line: 99 });
    expect(worker.focus).not.toHaveBeenCalled();
    expect(posted.some((message) => message.type === "analysisError")).toBe(
      true,
    );
  });

  it("lets only the newest request reach the panel and clears busy once", async () => {
    const first = deferred<FocusResult>();
    const second = deferred<FocusResult>();
    const pending = [first, second];
    const { session, posted, types } = setup({
      focus: () => {
        const next = pending.shift();
        if (!next) throw new Error("unexpected request");
        return next.promise;
      },
    });

    const one = session.showGraph(request);
    const two = session.showGraph(request);
    second.resolve(resultFor("src/a.ts#second"));
    await two;
    first.resolve(resultFor("src/a.ts#first"));
    await one;

    const slices = posted.filter((message) => message.type === "slice");
    expect(slices).toHaveLength(1);
    expect(session.currentGraph()?.slice.focusId).toBe("src/a.ts#second");
    expect(types().filter((type) => type === "busy")).toEqual([
      "busy",
      "busy",
      "busy",
    ]);
    expect(posted.at(-1)).toEqual({ type: "busy", busy: false });
    expect(posted.filter((m) => m.type === "busy" && !m.busy)).toHaveLength(1);
  });

  it("ignores a superseded request that fails after the newer one finished", async () => {
    const first = deferred<FocusResult>();
    const second = deferred<FocusResult>();
    const pending = [first, second];
    const { session, notifier, posted } = setup({
      focus: () => {
        const next = pending.shift();
        if (!next) throw new Error("unexpected request");
        return next.promise;
      },
    });

    const one = session.showGraph(request);
    const two = session.showGraph(request);
    second.resolve(resultFor("src/a.ts#second"));
    await two;
    first.reject(new WorkerCrashedError("The analysis worker stopped", false));
    await one;

    expect(posted.some((message) => message.type === "analysisError")).toBe(
      false,
    );
    expect(notifier.error).not.toHaveBeenCalled();
    expect(posted.filter((m) => m.type === "busy" && !m.busy)).toHaveLength(1);
    expect(session.currentGraph()?.slice.focusId).toBe("src/a.ts#second");
  });
});

describe("GraphSession.warm", () => {
  it("shows the indexing state around the warm-up", async () => {
    const { session, worker, indexing, posted } = setup();
    await session.warm("/repo/src/a.ts");
    expect(worker.warm).toHaveBeenCalledWith("/repo/src/a.ts", []);
    expect(indexing.set.mock.calls).toEqual([[true], [false]]);
    expect(posted).toEqual([
      { type: "indexing", indexing: true },
      { type: "indexing", indexing: false },
    ]);
  });

  it("keeps the indexing state on until the last overlapping warm-up settles", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const pending = [first, second];
    const { session, indexing, posted } = setup({
      warm: () => {
        const next = pending.shift();
        if (!next) throw new Error("unexpected warm");
        return next.promise;
      },
    });

    const one = session.warm("/repo/src/a.ts");
    const two = session.warm("/repo/src/a.ts");
    first.reject(new Error("worker recycled"));
    await one;
    expect(indexing.set).not.toHaveBeenCalledWith(false);
    expect(posted).not.toContainEqual({ type: "indexing", indexing: false });

    second.resolve();
    await two;
    expect(indexing.set).toHaveBeenLastCalledWith(false);
    expect(posted.at(-1)).toEqual({ type: "indexing", indexing: false });
  });

  it("stays quiet when the warm-up fails for an ordinary reason", async () => {
    const { session, notifier, indexing } = setup({
      warm: async () => {
        throw new Error("No tsconfig.json found above /repo/src/a.ts");
      },
    });
    await session.warm("/repo/src/a.ts");
    expect(notifier.error).not.toHaveBeenCalled();
    expect(indexing.set).toHaveBeenLastCalledWith(false);
  });

  it("reports an out-of-memory warm-up", async () => {
    const { session, notifier, indexing } = setup({
      warm: async () => {
        throw new WorkerCrashedError(
          "The analysis worker ran out of memory.",
          true,
        );
      },
    });
    await session.warm("/repo/src/a.ts");
    expect(notifier.error).toHaveBeenCalledOnce();
    expect(notifier.error.mock.calls[0]?.[0]).toContain("ran out of memory");
    expect(indexing.set).toHaveBeenLastCalledWith(false);
  });
});
