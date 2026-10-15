import { describe, expect, it, vi } from "vitest";
import type { DiffReading } from "../../src/ports.js";
import { WorkerCrashedError } from "../../src/worker/worker-client.js";
import { pathLimits } from "../../src/settings/path-limits.js";
import {
  A_ID,
  B_ID,
  centre,
  MARK,
  pathEnv,
  refreshedResult,
  route,
} from "../support/path-run.js";
import {
  deferred,
  FOCUS,
  PROJECT,
  request,
  resultFor,
} from "../support/session-setup.js";

const pathRequest = (expanded: string[] = []) => ({
  ...request(expanded),
  endId: B_ID,
});
const ended = { type: "pathSearch", search: undefined };

async function startRefresh(
  env: ReturnType<typeof pathEnv>,
  expanded: string[] = [],
) {
  const before = env.refreshes.runs.length;
  const refreshing = env.session.paths.refresh(pathRequest(expanded));
  await vi.waitFor(() => expect(env.refreshes.runs).toHaveLength(before + 1));
  return { refreshing };
}

describe("PathSearcher.refresh", () => {
  it("runs refreshPath with the current limits and expansions and keeps the mark", async () => {
    const env = pathEnv();
    env.limits.value = pathLimits(10, 20);
    env.changes.mark("/repo/src/c.ts");
    env.pathStart.set(MARK);
    const { refreshing } = await startRefresh(env, ["src/a.ts#g"]);
    expect(env.worker.refreshPath).toHaveBeenCalledWith(
      PROJECT,
      FOCUS,
      B_ID,
      ["src/a.ts#g"],
      ["/repo/src/c.ts"],
      { timeLimitMs: 10000, maxBoxes: 20 },
      expect.any(Function),
    );
    expect(env.pathStart.get()).toEqual(MARK);
    env.refreshes.runs[0]?.cancelled();
    await refreshing;
  });

  it("posts refreshed with the centre, route, path, expansions and version", async () => {
    const env = pathEnv();
    env.changes.mark("/repo/src/c.ts");
    const expansion = resultFor("src/a.ts#h", ["src/a.ts#only"]).slice;
    const answer = refreshedResult({
      expansions: [{ nodeId: "src/a.ts#h", slice: expansion }],
    });
    const { refreshing } = await startRefresh(env, ["src/a.ts#h"]);
    env.refreshes.runs[0]?.done(answer);
    await refreshing;
    const refreshed = env.posted.find((m) => m.type === "refreshed");
    expect(refreshed).toEqual({
      type: "refreshed",
      project: PROJECT,
      generation: 4,
      sourceVersion: 1,
      centre: centre(),
      expansions: [{ nodeId: "src/a.ts#h", slice: expansion }],
      route: route(),
      path: answer.path,
    });
  });

  it("records the centre, the route and the expansions for jumping", async () => {
    const env = pathEnv();
    const expansion = resultFor("src/a.ts#h", ["src/a.ts#only"]).slice;
    const { refreshing } = await startRefresh(env);
    env.refreshes.runs[0]?.done(
      refreshedResult({
        expansions: [{ nodeId: "src/a.ts#h", slice: expansion }],
      }),
    );
    await refreshing;
    expect(env.jumps.nodeTarget(PROJECT, "src/a.ts#callee")).toBeDefined();
    expect(env.jumps.nodeTarget(PROJECT, "src/a.ts#only")).toBeDefined();
    expect(env.jumps.callSiteTarget(PROJECT, "a->b")).toBeDefined();
    expect(env.session.currentGraph()).toEqual({
      slice: centre(),
      repoRoot: "/repo",
      tsconfig: PROJECT,
    });
  });

  it("posts refreshFailed when the start or the end is gone", async () => {
    const env = pathEnv();
    const { refreshing } = await startRefresh(env);
    env.refreshes.runs[0]?.done(
      refreshedResult({
        centre: undefined,
        route: undefined,
        path: undefined,
        pathStatus: "gone",
      }),
    );
    await refreshing;
    expect(env.posted.find((m) => m.type === "refreshFailed")).toEqual({
      type: "refreshFailed",
      generation: 4,
      message:
        "The start or the end of this path no longer exists. Put the cursor in a function and press Shift+Alt+2.",
    });
  });

  it("posts refreshFailed for no route, with the time-limit suffix when stopped by it", async () => {
    const env = pathEnv();
    const none = {
      centre: undefined,
      route: undefined,
      path: undefined,
      pathStatus: "none" as const,
    };
    const { refreshing: first } = await startRefresh(env);
    env.refreshes.runs[0]?.done(refreshedResult(none));
    await first;
    const { refreshing: second } = await startRefresh(env);
    env.refreshes.runs[1]?.done(
      refreshedResult({ ...none, pathStoppedBy: "time" }),
    );
    await second;
    const failures = env.posted.filter((m) => m.type === "refreshFailed");
    expect(
      failures.map((m) => m.type === "refreshFailed" && m.message),
    ).toEqual([
      "No path found any more from f to g. The graph on screen is unchanged.",
      "No path found any more from f to g within the time limit. The graph on screen is unchanged.",
    ]);
  });

  it("posts refreshFailed when the user cancels", async () => {
    const env = pathEnv();
    const { refreshing } = await startRefresh(env);
    env.session.paths.cancel(1);
    env.refreshes.runs[0]?.cancelled();
    await refreshing;
    expect(env.posted.find((m) => m.type === "refreshFailed")).toEqual({
      type: "refreshFailed",
      generation: 4,
      message: "Refresh cancelled. The graph is unchanged.",
    });
  });

  it("posts pathSearch with the refresh purpose and ends it", async () => {
    const env = pathEnv();
    const { refreshing } = await startRefresh(env);
    env.refreshes.runs[0]?.progress({
      checked: 3,
      routes: 1,
      routesCapped: false,
    });
    env.refreshes.runs[0]?.done(refreshedResult());
    await refreshing;
    const state = {
      id: 1,
      purpose: "refresh",
      from: "f",
      to: "g",
      checked: 0,
      routes: 0,
      routesCapped: false,
    };
    expect(env.types()).toEqual([
      "busy",
      "pathSearch",
      "pathSearch",
      "refreshed",
      "pathSearch",
      "busy",
    ]);
    expect(env.posted[1]).toEqual({ type: "pathSearch", search: state });
    expect(env.posted[2]).toEqual({
      type: "pathSearch",
      search: { ...state, checked: 3, routes: 1 },
    });
    expect(env.posted.at(-2)).toEqual(ended);
  });

  it("is superseded by a newer centre request without a message", async () => {
    const env = pathEnv({ focus: async () => resultFor("src/z.ts#z") });
    const { refreshing } = await startRefresh(env);
    await env.session.showGraph({
      file: "/repo/src/a.ts",
      line: 0,
      character: 0,
      isDirty: false,
    });
    expect(env.refreshes.runs[0]?.cancel).toHaveBeenCalledOnce();
    env.refreshes.runs[0]?.done(refreshedResult());
    await refreshing;
    expect(env.types()).not.toContain("refreshed");
    expect(env.types()).not.toContain("refreshFailed");
    expect(env.session.currentGraph()?.slice.focusId).toBe("src/z.ts#z");
  });

  it("posts the failure text and ends the state when the refresh fails", async () => {
    const env = pathEnv();
    const { refreshing } = await startRefresh(env);
    env.refreshes.runs[0]?.fail(new Error("broken tsconfig"));
    await refreshing;
    expect(env.posted.slice(2)).toEqual([
      { type: "refreshFailed", generation: 4, message: "broken tsconfig" },
      ended,
      { type: "busy", busy: false },
    ]);
    expect(env.notifier.error).not.toHaveBeenCalled();
  });

  it("adds the time-limit advice to an out-of-memory failure and toasts once", async () => {
    const env = pathEnv();
    const { refreshing } = await startRefresh(env);
    env.refreshes.runs[0]?.fail(new WorkerCrashedError("oom", true));
    await refreshing;
    const message =
      'Code Spider ran out of memory analysing this project (limit 4096 MB). Raise "codeSpider.worker.maxHeapMb" in settings and try again. Lower "codeSpider.path.timeLimitSeconds" to stop sooner.';
    expect(env.posted.at(-3)).toEqual({
      type: "refreshFailed",
      generation: 4,
      message,
    });
    expect(env.posted.at(-2)).toEqual(ended);
    expect(env.notifier.error.mock.calls).toEqual([[message]]);
  });

  it("posts only the end of the state when the panel closes mid-refresh", async () => {
    const env = pathEnv();
    const { refreshing } = await startRefresh(env);
    env.panel.open = false;
    env.refreshes.runs[0]?.fail(new Error("late"));
    await refreshing;
    expect(env.types()).toEqual(["busy", "pathSearch", "pathSearch", "busy"]);
    expect(env.posted.at(-2)).toEqual(ended);
    expect(env.notifier.error).not.toHaveBeenCalled();
  });

  it("marks the centre, the route and an expansion with the change marks", async () => {
    const env = pathEnv();
    env.diff.changes.mockResolvedValue({
      changes: new Map([["src/a.ts", { kind: "added" as const }]]),
      fellBack: false,
    });
    const expansion = resultFor("src/a.ts#h", ["src/c.ts#only"]).slice;
    const { refreshing } = await startRefresh(env, ["src/a.ts#h"]);
    env.refreshes.runs[0]?.done(
      refreshedResult({
        expansions: [{ nodeId: "src/a.ts#h", slice: expansion }],
      }),
    );
    await refreshing;
    const refreshed = env.posted.find((m) => m.type === "refreshed");
    if (refreshed?.type !== "refreshed") throw new Error("no refreshed");
    expect(refreshed.centre.nodes.map((n) => n.change)).toEqual([
      "added",
      "added",
    ]);
    expect(refreshed.route?.nodes.map((n) => [n.id, n.change])).toEqual([
      [A_ID, "added"],
      [B_ID, undefined],
    ]);
    expect(
      refreshed.expansions[0]?.slice.nodes.map((n) => [n.id, n.change]),
    ).toEqual([
      ["src/a.ts#h", "added"],
      ["src/c.ts#only", undefined],
    ]);
  });

  it("posts nothing but the end of the state when a cancel lands while change marks are read", async () => {
    const env = pathEnv();
    const reading = deferred<DiffReading>();
    env.diff.changes.mockReturnValue(reading.promise);
    const { refreshing } = await startRefresh(env);
    env.refreshes.runs[0]?.done(refreshedResult());
    await vi.waitFor(() => expect(env.diff.changes).toHaveBeenCalled());
    env.session.paths.cancel(1);
    reading.resolve({ changes: new Map(), fellBack: false });
    await refreshing;
    expect(env.types()).toEqual(["busy", "pathSearch", "pathSearch", "busy"]);
    expect(env.jumps.callSiteTarget(PROJECT, "a->b")).toBeUndefined();
  });
});
