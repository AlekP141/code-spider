import { describe, expect, it } from "vitest";
import type { WorkerPathOutcome } from "../../src/worker/protocol.js";
import { pathLimits } from "../../src/settings/path-limits.js";
import {
  A_ID,
  B_ID,
  CURSOR,
  foundResult,
  MARK,
  pathEnv,
  resolved,
  startSearch,
} from "../support/path-run.js";
import { PROJECT } from "../support/session-setup.js";
import { vi } from "vitest";

const search = (checked = 0, routes = 0) => ({
  type: "pathSearch" as const,
  search: {
    id: 1,
    purpose: "search" as const,
    from: "f",
    to: "g",
    checked,
    routes,
    routesCapped: false,
  },
});
const ended = { type: "pathSearch", search: undefined };

function outcome(status: WorkerPathOutcome) {
  return { tsconfig: PROJECT, repoRoot: "/repo", outcome: status };
}

describe("PathSearcher.finishAt", () => {
  it("warns when no start is marked and runs nothing", async () => {
    const env = pathEnv();
    await env.session.paths.finishAt(CURSOR);
    expect(env.notifier.warn.mock.calls).toEqual([
      [
        "Code Spider: mark a start first. Put the cursor in a function and run Code Spider: Path from here.",
      ],
    ]);
    expect(env.finds.runs).toHaveLength(0);
  });

  it("warns for the same function, keeps the mark and cancels nothing", async () => {
    const env = pathEnv();
    const { search: first } = await startSearch(env);
    env.pathStart.set(MARK);
    env.worker.resolveEnd = vi.fn(async () => resolved(A_ID, "f"));
    await env.session.paths.finishAt(CURSOR);
    expect(env.notifier.warn.mock.calls).toEqual([
      [
        "Code Spider: the start and the end are the same function (f). Pick a different function.",
      ],
    ]);
    expect(env.pathStart.get()).toEqual(MARK);
    expect(env.finds.runs).toHaveLength(1);
    expect(env.finds.runs[0]?.cancel).not.toHaveBeenCalled();
    env.finds.runs[0]?.cancelled();
    await first;
  });

  it("warns for functions in different projects, keeps the mark and cancels nothing", async () => {
    const env = pathEnv();
    const { search: first } = await startSearch(env);
    env.pathStart.set(MARK);
    env.worker.resolveEnd = vi.fn(async () => ({
      ...resolved(B_ID, "g"),
      tsconfig: "/other/tsconfig.json",
    }));
    await env.session.paths.finishAt(CURSOR);
    expect(env.notifier.warn.mock.calls).toEqual([
      [
        "Code Spider: f and g belong to different TypeScript projects, so they cannot be searched together.",
      ],
    ]);
    expect(env.pathStart.get()).toEqual(MARK);
    expect(env.finds.runs).toHaveLength(1);
    expect(env.finds.runs[0]?.cancel).not.toHaveBeenCalled();
    env.finds.runs[0]?.cancelled();
    await first;
  });

  it("refuses a document with unsaved edits", async () => {
    const env = pathEnv();
    env.pathStart.set(MARK);
    await env.session.paths.finishAt({ ...CURSOR, isDirty: true });
    expect(env.notifier.warn.mock.calls[0]?.[0]).toMatch(/^Save b\.ts first/);
    expect(env.worker.resolveEnd).not.toHaveBeenCalled();
    expect(env.pathStart.get()).toEqual(MARK);
  });

  it("shows the panel, clears the mark, brackets busy and posts the names with zero counts", async () => {
    const env = pathEnv();
    const { search: running } = await startSearch(env);
    expect(env.panel.shown).toBe(1);
    expect(env.pathStart.get()).toBeUndefined();
    expect(env.posted).toEqual([{ type: "busy", busy: true }, search()]);
    expect(env.worker.findPath).toHaveBeenCalledWith(
      {
        tsconfig: PROJECT,
        fromId: A_ID,
        toId: B_ID,
        limits: { timeLimitMs: 60000, maxBoxes: 200 },
        changedFiles: [],
      },
      expect.any(Function),
    );
    env.finds.runs[0]?.cancelled();
    await running;
    expect(env.posted.at(-2)).toEqual(ended);
    expect(env.posted.at(-1)).toEqual({ type: "busy", busy: false });
  });

  it("turns progress into pathSearch posts with the counts", async () => {
    const env = pathEnv();
    const { search: running } = await startSearch(env);
    env.finds.runs[0]?.progress({ checked: 5, routes: 2, routesCapped: false });
    expect(env.posted.at(-1)).toEqual(search(5, 2));
    env.finds.runs[0]?.cancelled();
    await running;
  });

  it("annotates marks, records the graph and posts pathFound with the drained version", async () => {
    const env = pathEnv();
    env.diff.changes.mockResolvedValue({
      changes: new Map([["src/a.ts", { kind: "added" as const }]]),
      fellBack: false,
    });
    env.changes.mark("/repo/src/x.ts");
    const { search: running } = await startSearch(env);
    env.changes.mark("/repo/src/x.ts");
    env.finds.runs[0]?.done(foundResult());
    await running;

    const found = env.posted.find((message) => message.type === "pathFound");
    if (found?.type !== "pathFound") throw new Error("no pathFound");
    expect(found.sourceVersion).toBe(1);
    expect(found.project).toBe(PROJECT);
    expect(found.slice.focusId).toBe(A_ID);
    expect(found.slice.nodes.map((n) => n.change)).toEqual(["added", "added"]);
    expect(found.route.nodes.map((n) => [n.id, n.change])).toEqual([
      [A_ID, "added"],
      [B_ID, undefined],
    ]);
    expect(found.path.endId).toBe(B_ID);
    expect(env.jumps.nodeTarget(PROJECT, B_ID)).toBeDefined();
    expect(env.jumps.nodeTarget(PROJECT, "src/a.ts#callee")).toBeDefined();
    expect(env.jumps.callSiteTarget(PROJECT, "a->b")).toBeDefined();
    expect(env.session.currentGraph()).toEqual({
      slice: found.slice,
      repoRoot: "/repo",
      tsconfig: PROJECT,
    });
    expect(env.types().slice(-3)).toEqual(["pathFound", "pathSearch", "busy"]);
    expect(env.posted.at(-2)).toEqual(ended);
  });

  it("posts no path found and ends the state", async () => {
    const env = pathEnv();
    const { search: running } = await startSearch(env);
    env.finds.runs[0]?.done(outcome({ status: "none", checked: 4 }));
    await running;
    expect(env.posted.slice(2)).toEqual([
      { type: "analysisError", message: "No path found from f to g" },
      ended,
      { type: "busy", busy: false },
    ]);
  });

  it("adds the time limit to a none that the limit ended", async () => {
    const env = pathEnv();
    const { search: running } = await startSearch(env);
    env.finds.runs[0]?.done(
      outcome({ status: "none", checked: 4, stoppedBy: "time" }),
    );
    await running;
    expect(env.posted[2]).toEqual({
      type: "analysisError",
      message: "No path found from f to g within the time limit",
    });
  });

  it("runs the search with a clicked box as the end", async () => {
    const env = pathEnv();
    env.pathStart.set(MARK);
    const running = env.session.paths.click({ project: PROJECT, nodeId: B_ID });
    expect(env.worker.resolveEnd).not.toHaveBeenCalled();
    expect(env.worker.findPath).toHaveBeenCalledWith(
      expect.objectContaining({ tsconfig: PROJECT, fromId: A_ID, toId: B_ID }),
      expect.any(Function),
    );
    expect(env.pathStart.get()).toBeUndefined();
    expect(env.posted.at(-1)).toEqual(search());
    env.finds.runs[0]?.cancelled();
    await running;
  });

  it("cancels the first search when a second starts and drops its answer", async () => {
    const env = pathEnv();
    const { search: first } = await startSearch(env);
    env.pathStart.set(MARK);
    const second = env.session.paths.finishAt(CURSOR);
    await vi.waitFor(() => expect(env.finds.runs).toHaveLength(2));
    const [one, two] = env.finds.runs;
    expect(one?.cancel).toHaveBeenCalledOnce();
    expect(env.posted.at(-1)).toEqual({
      type: "pathSearch",
      search: { ...search().search, id: 2 },
    });
    const before = env.posted.length;
    one?.done(foundResult());
    await first;
    expect(env.posted).toHaveLength(before);
    expect(env.types()).not.toContain("pathFound");
    two?.done(foundResult());
    await second;
    expect(env.types().filter((t) => t === "pathFound")).toHaveLength(1);
    expect(env.posted.at(-1)).toEqual({ type: "busy", busy: false });
  });

  it("reads the limits when each search starts", async () => {
    const env = pathEnv();
    env.limits.value = pathLimits(10, 20);
    const { search: first } = await startSearch(env);
    env.finds.runs[0]?.cancelled();
    await first;
    env.limits.value = pathLimits(30, 40);
    const { search: second } = await startSearch(env);
    env.finds.runs[1]?.cancelled();
    await second;
    const limits = env.finds.start.mock.calls.map(
      ([args]) => (args as { limits: unknown }).limits,
    );
    expect(limits).toEqual([
      { timeLimitMs: 10000, maxBoxes: 20 },
      { timeLimitMs: 30000, maxBoxes: 40 },
    ]);
  });

  it("consumes the mark even when the search fails or finds nothing", async () => {
    const env = pathEnv();
    const { search: failing } = await startSearch(env);
    env.finds.runs[0]?.fail(new Error("boom"));
    await failing;
    expect(env.pathStart.get()).toBeUndefined();
    const { search: empty } = await startSearch(env);
    env.finds.runs[1]?.done(outcome({ status: "none", checked: 0 }));
    await empty;
    expect(env.pathStart.get()).toBeUndefined();
  });

  it("warns that the marked start no longer exists when the start is gone", async () => {
    const env = pathEnv();
    const { search: running } = await startSearch(env);
    env.finds.runs[0]?.done(outcome({ status: "gone", nodeId: A_ID }));
    await running;
    expect(env.notifier.warn.mock.calls).toEqual([
      ["Code Spider: the marked start (f) no longer exists."],
    ]);
    expect(env.types()).not.toContain("analysisError");
    expect(env.posted.at(-2)).toEqual(ended);
  });

  it("posts an error when the end is gone", async () => {
    const env = pathEnv();
    const { search: running } = await startSearch(env);
    env.finds.runs[0]?.done(outcome({ status: "gone", nodeId: B_ID }));
    await running;
    expect(env.posted.slice(2)).toEqual([
      {
        type: "analysisError",
        message: "Code Spider: the end (g) no longer exists.",
      },
      ended,
      { type: "busy", busy: false },
    ]);
    expect(env.notifier.warn).not.toHaveBeenCalled();
  });

  it("refuses a click on a box of another project, keeps the mark and cancels nothing", async () => {
    const env = pathEnv();
    const { search: first } = await startSearch(env);
    const other = { ...MARK, project: "/other/tsconfig.json" };
    env.pathStart.set(other);
    await env.session.paths.click({ project: PROJECT, nodeId: B_ID });
    expect(env.notifier.warn.mock.calls).toEqual([
      [
        "Code Spider: f and g belong to different TypeScript projects, so they cannot be searched together.",
      ],
    ]);
    expect(env.pathStart.get()).toEqual(other);
    expect(env.finds.runs).toHaveLength(1);
    expect(env.finds.runs[0]?.cancel).not.toHaveBeenCalled();
    env.finds.runs[0]?.cancelled();
    await first;
  });
});
