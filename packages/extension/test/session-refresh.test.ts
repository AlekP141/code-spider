import { describe, expect, it } from "vitest";
import type { RefreshResult } from "../src/worker/protocol.js";
import { WorkerCrashedError } from "../src/worker/worker-client.js";
import { CENTRE_GONE_MESSAGE } from "../src/session-refresh.js";
import {
  deferred,
  FOCUS,
  known,
  PROJECT,
  request,
  resultFor,
  setup,
} from "./support/session-setup.js";

const answer = (
  centre: RefreshResult["centre"],
  expansions: RefreshResult["expansions"] = [],
): RefreshResult => ({
  tsconfig: PROJECT,
  repoRoot: "/repo",
  centre,
  expansions,
});

describe("GraphSession.refresh", () => {
  it("fails an unknown project before any busy or worker work", async () => {
    const { session, worker, changes, posted } = setup();
    changes.mark("/repo/src/a.ts");
    await session.refresh(request());
    expect(posted).toEqual([
      { type: "refreshFailed", generation: 4, message: "Unknown project" },
    ]);
    expect(worker.refresh).not.toHaveBeenCalled();
    expect(changes.drain().files).toEqual(["/repo/src/a.ts"]);
  });

  it("posts busy, then refreshed with the drained version, then busy off", async () => {
    const { session, worker, changes, posted, types } = known();
    changes.mark("/repo/src/a.ts");
    changes.mark("/repo/src/b.ts");
    await session.refresh(request(["src/a.ts#g"]));
    expect(worker.refresh).toHaveBeenCalledOnce();
    expect(worker.refresh).toHaveBeenCalledWith(
      PROJECT,
      FOCUS,
      ["src/a.ts#g"],
      ["/repo/src/a.ts", "/repo/src/b.ts"],
    );
    expect(types()).toEqual(["busy", "refreshed", "busy"]);
    expect(posted[0]).toEqual({ type: "busy", busy: true });
    expect(posted[1]).toEqual({
      type: "refreshed",
      project: PROJECT,
      generation: 4,
      sourceVersion: 2,
      centre: resultFor(FOCUS).slice,
      expansions: [],
    });
    expect(posted[2]).toEqual({ type: "busy", busy: false });
  });

  it("keeps the drained version when a file changes before the answer", async () => {
    const waiting = deferred<RefreshResult>();
    const { session, changes, posted } = known({
      refresh: () => waiting.promise,
    });
    changes.mark("/repo/src/a.ts");
    const pending = session.refresh(request());
    changes.mark("/repo/src/a.ts");
    waiting.resolve(answer(resultFor(FOCUS).slice));
    await pending;
    const refreshed = posted.find((message) => message.type === "refreshed");
    expect(refreshed).toMatchObject({ sourceVersion: 1 });
  });

  it("puts every returned slice in the jump table and remembers the centre", async () => {
    const centre = resultFor(FOCUS, ["src/a.ts#callee"]).slice;
    const expansion = resultFor("src/a.ts#g", ["src/a.ts#only"]).slice;
    const { session, jumps } = known({
      refresh: async () =>
        answer(centre, [{ nodeId: "src/a.ts#g", slice: expansion }]),
    });
    await session.refresh(request(["src/a.ts#g"]));
    expect(jumps.nodeTarget(PROJECT, "src/a.ts#callee")).toBeDefined();
    expect(jumps.nodeTarget(PROJECT, "src/a.ts#only")).toBeDefined();
    expect(session.currentGraph()).toEqual({
      slice: centre,
      repoRoot: "/repo",
      tsconfig: PROJECT,
    });
  });

  it("reports a missing centre and leaves the table and graph alone", async () => {
    const orphan = resultFor("src/a.ts#only").slice;
    const { session, jumps, posted, types } = known({
      refresh: async () =>
        answer(undefined, [{ nodeId: "src/a.ts#only", slice: orphan }]),
    });
    await session.showGraph({
      file: "/repo/src/a.ts",
      line: 0,
      character: 0,
      isDirty: false,
    });
    const before = session.currentGraph();
    posted.length = 0;
    await session.refresh(request());
    expect(types()).toEqual(["busy", "refreshFailed", "busy"]);
    expect(posted[1]).toEqual({
      type: "refreshFailed",
      generation: 4,
      message: CENTRE_GONE_MESSAGE,
    });
    expect(session.currentGraph()).toBe(before);
    expect(jumps.nodeTarget(PROJECT, "src/a.ts#only")).toBeUndefined();
    expect(jumps.nodeTarget(PROJECT, FOCUS)).toBeDefined();
  });

  it("posts another failure's text", async () => {
    const { session, posted, notifier } = known({
      refresh: async () => {
        throw new Error("broken tsconfig");
      },
    });
    await session.refresh(request());
    expect(posted[1]).toEqual({
      type: "refreshFailed",
      generation: 4,
      message: "broken tsconfig",
    });
    expect(notifier.error).not.toHaveBeenCalled();
  });

  it("toasts once for a crash shared by a refresh and an expansion", async () => {
    const waiting: ReturnType<typeof deferred<never>>[] = [];
    const next = () => {
      const entry = deferred<never>();
      waiting.push(entry);
      return entry.promise;
    };
    const { session, notifier, posted } = known({
      refresh: next,
      sliceForNode: next,
    });
    const requests = [
      session.refresh(request()),
      session.expand({ project: PROJECT, nodeId: "src/a.ts#g", generation: 1 }),
    ];
    const error = new WorkerCrashedError("The worker stopped", false);
    for (const entry of waiting) entry.reject(error);
    await Promise.all(requests);
    expect(notifier.error).toHaveBeenCalledTimes(1);
    expect(posted.map((message) => message.type)).toEqual(
      expect.arrayContaining(["refreshFailed", "expandFailed"]),
    );
  });

  it("drops the answer when a newer centre request started", async () => {
    const waiting = deferred<RefreshResult>();
    const { session, posted, types } = known({
      refresh: () => waiting.promise,
    });
    const pending = session.refresh(request());
    await session.focusNode({ project: PROJECT, nodeId: "src/a.ts#k" });
    posted.length = 0;
    waiting.resolve(answer(resultFor(FOCUS).slice));
    await pending;
    expect(types()).toEqual(["busy"]);
    expect(posted[0]).toEqual({ type: "busy", busy: false });
    expect(session.currentGraph()?.slice.focusId).toBe("src/a.ts#k");
  });

  it("drops the answer when the panel closed", async () => {
    const waiting = deferred<RefreshResult>();
    const { session, panel, posted, types } = known({
      refresh: () => waiting.promise,
    });
    const pending = session.refresh(request());
    panel.open = false;
    posted.length = 0;
    waiting.resolve(answer(resultFor(FOCUS).slice));
    await pending;
    expect(types()).toEqual(["busy"]);
    expect(posted[0]).toEqual({ type: "busy", busy: false });
  });

  it("drops a failure and its toast when a newer centre request started", async () => {
    const waiting = deferred<RefreshResult>();
    const { session, notifier, posted, types } = known({
      refresh: () => waiting.promise,
    });
    const pending = session.refresh(request());
    await session.focusNode({ project: PROJECT, nodeId: "src/a.ts#k" });
    posted.length = 0;
    waiting.reject(new WorkerCrashedError("The worker stopped", false));
    await pending;
    expect(types()).toEqual(["busy"]);
    expect(posted[0]).toEqual({ type: "busy", busy: false });
    expect(notifier.error).not.toHaveBeenCalled();
  });

  it("drops a failure and its toast when the panel closed", async () => {
    const waiting = deferred<RefreshResult>();
    const { session, panel, notifier, posted, types } = known({
      refresh: () => waiting.promise,
    });
    const pending = session.refresh(request());
    panel.open = false;
    posted.length = 0;
    waiting.reject(new WorkerCrashedError("The worker stopped", false));
    await pending;
    expect(types()).toEqual(["busy"]);
    expect(posted[0]).toEqual({ type: "busy", busy: false });
    expect(notifier.error).not.toHaveBeenCalled();
  });

  it("lets an older centre request answer after a refresh started", async () => {
    const focusing = deferred<ReturnType<typeof resultFor>>();
    const refreshing = deferred<RefreshResult>();
    const { session, posted, types } = known({
      sliceForNode: () => focusing.promise,
      refresh: () => refreshing.promise,
    });
    const focus = session.focusNode({
      project: PROJECT,
      nodeId: "src/a.ts#k",
    });
    const refresh = session.refresh(request());
    posted.length = 0;
    focusing.resolve(resultFor("src/a.ts#k"));
    await focus;
    refreshing.resolve(answer(resultFor(FOCUS).slice));
    await refresh;
    expect(types()).toEqual(["slice", "refreshed", "busy"]);
    expect(posted[0]).toMatchObject({ type: "slice" });
  });
});
