import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import { describe, expect, it, vi } from "vitest";
import { MessageGate } from "../../src/panel/message-gate.js";
import type { DiffReading } from "../../src/ports.js";
import { WorkerCrashedError } from "../../src/worker/worker-client.js";
import { foundResult, pathEnv, startSearch } from "../support/path-run.js";
import { deferred, PROJECT, resultFor } from "../support/session-setup.js";

const ended = { type: "pathSearch", search: undefined };
const focusRequest = {
  file: "/repo/src/a.ts",
  line: 0,
  character: 0,
  isDirty: false,
};

describe("stopping a path search", () => {
  it("cancels the run for the active id and ends the state with nothing else", async () => {
    const env = pathEnv();
    const { search } = await startSearch(env);
    env.session.paths.cancel(1);
    const [run] = env.finds.runs;
    expect(run?.cancel).toHaveBeenCalledOnce();
    run?.cancelled();
    await search;
    expect(env.types()).toEqual(["busy", "pathSearch", "pathSearch", "busy"]);
    expect(env.posted.at(-2)).toEqual(ended);
  });

  it("ignores a cancel for another id", async () => {
    const env = pathEnv();
    const { search } = await startSearch(env);
    env.session.paths.cancel(99);
    expect(env.finds.runs[0]?.cancel).not.toHaveBeenCalled();
    env.finds.runs[0]?.cancelled();
    await search;
  });

  it("cancels the search for a newer centre request and drops its answer", async () => {
    const env = pathEnv({ focus: async () => resultFor("src/z.ts#z") });
    const { search } = await startSearch(env);
    await env.session.showGraph(focusRequest);
    expect(env.finds.runs[0]?.cancel).toHaveBeenCalledOnce();
    env.finds.runs[0]?.done(foundResult());
    await search;
    expect(env.types()).not.toContain("pathFound");
    expect(env.jumps.callSiteTarget(PROJECT, "a->b")).toBeUndefined();
    expect(env.session.currentGraph()?.slice.focusId).toBe("src/z.ts#z");
    expect(env.posted.at(-2)).toEqual(ended);
  });

  it("cancels the run when the panel closes and drops the answer", async () => {
    const env = pathEnv();
    const { search } = await startSearch(env);
    env.panel.open = false;
    env.session.paths.cancelActive();
    expect(env.finds.runs[0]?.cancel).toHaveBeenCalledOnce();
    env.finds.runs[0]?.done(foundResult());
    await search;
    expect(env.types()).not.toContain("pathFound");
    expect(env.jumps.callSiteTarget(PROJECT, "a->b")).toBeUndefined();
  });

  it("posts the failure text, notifies a crash once and ends the state", async () => {
    const env = pathEnv();
    const { search } = await startSearch(env);
    env.finds.runs[0]?.fail(
      new WorkerCrashedError("The worker stopped", false),
    );
    await search;
    const message =
      "The worker stopped. The next request starts a fresh worker.";
    expect(env.posted.slice(2)).toEqual([
      { type: "analysisError", message },
      ended,
      { type: "busy", busy: false },
    ]);
    expect(env.notifier.error.mock.calls).toEqual([[message]]);
  });

  it("includes the time-limit advice in the out-of-memory text", async () => {
    const env = pathEnv();
    const { search } = await startSearch(env);
    env.finds.runs[0]?.fail(new WorkerCrashedError("oom", true));
    await search;
    expect(env.posted[2]).toEqual({
      type: "analysisError",
      message:
        'Code Spider ran out of memory analysing this project (limit 4096 MB). Raise "codeSpider.worker.maxHeapMb" in settings and try again. Lower "codeSpider.path.timeLimitSeconds" to stop sooner.',
    });
  });

  it("drops an answer that arrives after the panel closed", async () => {
    const env = pathEnv();
    const { search } = await startSearch(env);
    env.panel.open = false;
    env.finds.runs[0]?.done(foundResult());
    await search;
    expect(env.types()).not.toContain("pathFound");
    expect(env.jumps.callSiteTarget(PROJECT, "a->b")).toBeUndefined();
    expect(env.posted.at(-2)).toEqual(ended);
  });

  it("posts only the end of the state for a cancelled outcome", async () => {
    const env = pathEnv();
    const { search } = await startSearch(env);
    env.finds.runs[0]?.cancelled();
    await search;
    expect(env.types()).toEqual(["busy", "pathSearch", "pathSearch", "busy"]);
    expect(env.notifier.warn).not.toHaveBeenCalled();
  });

  it("posts no pathFound and ends the state when a cancel lands while change marks are read", async () => {
    const env = pathEnv();
    const reading = deferred<DiffReading>();
    env.diff.changes.mockReturnValue(reading.promise);
    const { search } = await startSearch(env);
    env.finds.runs[0]?.done(foundResult());
    await vi.waitFor(() => expect(env.diff.changes).toHaveBeenCalled());
    env.session.paths.cancel(1);
    reading.resolve({ changes: new Map(), fellBack: false });
    await search;
    expect(env.types()).toEqual(["busy", "pathSearch", "pathSearch", "busy"]);
    expect(env.posted.at(-2)).toEqual(ended);
    expect(env.jumps.callSiteTarget(PROJECT, "a->b")).toBeUndefined();
    expect(env.session.currentGraph()).toBeUndefined();
  });

  it("does not replay a searching state when the panel is closed mid-search and reopened", async () => {
    const env = pathEnv();
    const sent: ExtensionToWebview[] = [];
    const gate = new MessageGate((message) => sent.push(message));
    const post = env.panel.post;
    env.panel.post = (message) => {
      post(message);
      gate.post(message);
    };
    const { search } = await startSearch(env);
    gate.markReady();
    expect(sent.some((m) => m.type === "pathSearch" && m.search)).toBe(true);

    env.panel.open = false;
    gate.reset();
    env.session.paths.panelClosed();
    expect(env.finds.runs[0]?.cancel).toHaveBeenCalledOnce();

    env.panel.show();
    gate.reset();
    sent.length = 0;
    gate.markReady();
    expect(sent.filter((m) => m.type === "pathSearch" && m.search)).toEqual([]);

    env.finds.runs[0]?.cancelled();
    await search;
    expect(env.types().filter((t) => t === "pathSearch")).toHaveLength(2);
  });
});
