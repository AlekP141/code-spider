import { describe, expect, it, vi } from "vitest";
import {
  A_ID,
  B_ID,
  CURSOR,
  MARK,
  pathEnv,
  resolved,
} from "../support/path-run.js";
import { deferred, PROJECT, resultFor } from "../support/session-setup.js";
import type { ResolvedEnd } from "../../src/worker/protocol.js";
import { WorkerCrashedError } from "../../src/worker/worker-client.js";

describe("PathSearcher marking", () => {
  it("sets the mark from the resolved cursor and does not open the panel", async () => {
    const env = pathEnv({
      resolveEnd: vi.fn(async () => resolved(A_ID, "f")),
    });
    env.changes.mark("/repo/src/x.ts");
    await env.session.paths.markStart(CURSOR);
    expect(env.pathStart.get()).toEqual(MARK);
    expect(env.panel.shown).toBe(0);
    expect(env.worker.resolveEnd).toHaveBeenCalledWith("/repo/src/b.ts", 1, 2, [
      "/repo/src/x.ts",
      "/repo/src/b.ts",
    ]);
  });

  it("runs inside the busy bracket", async () => {
    const waiting = deferred<ResolvedEnd>();
    const env = pathEnv({ resolveEnd: () => waiting.promise });
    const marking = env.session.paths.markStart(CURSOR);
    expect(env.posted).toEqual([{ type: "busy", busy: true }]);
    waiting.resolve(resolved(A_ID, "f"));
    await marking;
    expect(env.posted).toEqual([
      { type: "busy", busy: true },
      { type: "busy", busy: false },
    ]);
  });

  it("moves the mark when run again", async () => {
    const answers = [resolved(A_ID, "f"), resolved(B_ID, "g")];
    const env = pathEnv({ resolveEnd: vi.fn(async () => answers.shift()) });
    await env.session.paths.markStart(CURSOR);
    await env.session.paths.markStart(CURSOR);
    expect(env.pathStart.get()).toEqual({
      project: PROJECT,
      nodeId: B_ID,
      name: "g",
    });
  });

  it("refuses a document with unsaved edits with the Show Graph warning", async () => {
    const env = pathEnv();
    await env.session.paths.markStart({ ...CURSOR, isDirty: true });
    expect(env.notifier.warn.mock.calls).toEqual([
      [
        "Save b.ts first. Code Spider reads files from disk, so an unsaved edit would be analysed at the wrong position.",
      ],
    ]);
    expect(env.worker.resolveEnd).not.toHaveBeenCalled();
    expect(env.pathStart.get()).toBeUndefined();
    expect(env.posted).toEqual([]);
  });

  it("warns when no function is found at the cursor", async () => {
    const env = pathEnv({ resolveEnd: vi.fn(async () => undefined) });
    await env.session.paths.markStart(CURSOR);
    expect(env.notifier.warn.mock.calls).toEqual([
      ["Code Spider: no function found at the cursor."],
    ]);
    expect(env.pathStart.get()).toBeUndefined();
  });

  it("marks a clicked box with the name the jump table knows", async () => {
    const env = pathEnv();
    await env.session.paths.click({ project: PROJECT, nodeId: B_ID });
    expect(env.pathStart.get()).toEqual({
      project: PROJECT,
      nodeId: B_ID,
      name: "g",
    });
    expect(env.finds.runs).toHaveLength(0);
    expect(env.posted).toEqual([]);
  });

  it("clears the mark when the marked box is clicked", async () => {
    const env = pathEnv();
    env.pathStart.set(MARK);
    await env.session.paths.click({ project: PROJECT, nodeId: A_ID });
    expect(env.pathStart.get()).toBeUndefined();
    expect(env.finds.runs).toHaveLength(0);
  });

  it("ignores a click on an unknown project or a box that is not a function", async () => {
    const env = pathEnv();
    const module = resultFor("src/m.ts#m");
    const [node] = module.slice.nodes;
    if (!node) throw new Error("no node");
    node.kind = "module";
    env.jumps.add(PROJECT, module);
    await env.session.paths.click({
      project: "/other/tsconfig.json",
      nodeId: A_ID,
    });
    await env.session.paths.click({ project: PROJECT, nodeId: "src/m.ts#m" });
    await env.session.paths.click({
      project: PROJECT,
      nodeId: "src/none.ts#x",
    });
    expect(env.pathStart.get()).toBeUndefined();
    env.pathStart.set(MARK);
    await env.session.paths.click({ project: PROJECT, nodeId: "src/m.ts#m" });
    expect(env.pathStart.get()).toEqual(MARK);
    expect(env.finds.runs).toHaveLength(0);
    expect(env.posted).toEqual([]);
  });

  it("reports a failed cursor lookup with the failure text and sets no mark", async () => {
    const env = pathEnv({
      resolveEnd: vi.fn(async () => {
        throw new Error("broken tsconfig");
      }),
    });
    await expect(env.session.paths.markStart(CURSOR)).resolves.toBeUndefined();
    expect(env.notifier.error.mock.calls).toEqual([["broken tsconfig"]]);
    expect(env.pathStart.get()).toBeUndefined();
    expect(env.posted).toEqual([
      { type: "busy", busy: true },
      { type: "busy", busy: false },
    ]);
  });

  it("describes a crash while resolving without the time-limit advice", async () => {
    const crash = new WorkerCrashedError("oom", true);
    const env = pathEnv({
      resolveEnd: vi.fn(async () => {
        throw crash;
      }),
    });
    await env.session.paths.markStart(CURSOR);
    expect(env.notifier.error.mock.calls).toEqual([
      [
        'Code Spider ran out of memory analysing this project (limit 4096 MB). Raise "codeSpider.worker.maxHeapMb" in settings and try again.',
      ],
    ]);
    expect(env.pathStart.get()).toBeUndefined();
  });

  it("notifies the same crash only once", async () => {
    const crash = new WorkerCrashedError("The worker stopped", false);
    const env = pathEnv({
      resolveEnd: vi.fn(async () => {
        throw crash;
      }),
    });
    await env.session.paths.markStart(CURSOR);
    await env.session.paths.markStart(CURSOR);
    expect(env.notifier.error.mock.calls).toEqual([
      ["The worker stopped. The next request starts a fresh worker."],
    ]);
  });

  it("keeps the mark and starts no search when finishAt cannot resolve the cursor", async () => {
    const env = pathEnv({
      resolveEnd: vi.fn(async () => {
        throw new Error("broken tsconfig");
      }),
    });
    env.pathStart.set(MARK);
    await env.session.paths.finishAt(CURSOR);
    expect(env.notifier.error.mock.calls).toEqual([["broken tsconfig"]]);
    expect(env.pathStart.get()).toEqual(MARK);
    expect(env.finds.runs).toHaveLength(0);
    expect(env.types()).toEqual(["busy", "busy"]);
  });
});
