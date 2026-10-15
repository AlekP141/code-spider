import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type {
  FindPathResult,
  RefreshResult,
  ResolvedEnd,
  WorkerRequest,
  WorkerResponse,
} from "../../src/worker/protocol.js";
import {
  WorkerClient,
  WorkerCrashedError,
  type WorkerLike,
} from "../../src/worker/worker-client.js";

class FakeWorker extends EventEmitter implements WorkerLike {
  readonly posted: WorkerRequest[] = [];
  terminated = false;

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): Promise<number> {
    this.terminated = true;
    return Promise.resolve(0);
  }

  reply(response: WorkerResponse): void {
    this.emit("message", response);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new WorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { workers, client };
}

const limits = { timeLimitMs: 60_000, maxBoxes: 200 };
const args = {
  tsconfig: "/repo/tsconfig.json",
  fromId: "a.ts#f",
  toId: "b.ts#g",
  limits,
  changedFiles: ["/c.ts"],
};
const found: FindPathResult = {
  tsconfig: "/repo/tsconfig.json",
  repoRoot: "/repo",
  outcome: {
    status: "found",
    centre: { focusId: "a.ts#f", nodes: [], edges: [], truncated: false },
    route: { nodes: [], edges: [] },
    path: {
      endId: "b.ts#g",
      boxes: [],
      edgeIds: [],
      summary: { routes: 1, routesCapped: false, leftOut: 0, checked: 2 },
    },
  },
};
const refreshed: RefreshResult = {
  tsconfig: "/repo/tsconfig.json",
  repoRoot: "/repo",
  centre: undefined,
  expansions: [],
};

function cancelOf(request: WorkerRequest | undefined): Int32Array {
  if (request?.kind !== "findPath" && request?.kind !== "refresh") {
    throw new Error("not a path request");
  }
  const buffer =
    request.kind === "findPath" ? request.cancel : request.path?.cancel;
  if (!(buffer instanceof SharedArrayBuffer)) throw new Error("no flag");
  return new Int32Array(buffer);
}

describe("WorkerClient resolveEnd", () => {
  it("posts the request and resolves with the result, and with undefined", async () => {
    const { workers, client } = setup();
    const end: ResolvedEnd = {
      tsconfig: "/repo/tsconfig.json",
      repoRoot: "/repo",
      nodeId: "a.ts#f",
      name: "f",
      isTest: false,
    };
    const first = client.resolveEnd("/a.ts", 3, 4, ["/b.ts"]);
    expect(workers[0]?.posted).toEqual([
      {
        id: 1,
        kind: "resolveEnd",
        file: "/a.ts",
        line: 3,
        character: 4,
        changedFiles: ["/b.ts"],
      },
    ]);
    workers[0]?.reply({ id: 1, kind: "resolved", result: end });
    await expect(first).resolves.toEqual(end);

    const second = client.resolveEnd("/a.ts", 0, 0, []);
    workers[0]?.reply({ id: 2, kind: "resolved", result: undefined });
    await expect(second).resolves.toBeUndefined();
  });
});

describe("WorkerClient paths", () => {
  it("sends a 4-byte shared flag and cancel() stores 1 in it", () => {
    const { workers, client } = setup();
    const run = client.findPath(args, () => undefined);
    const posted = workers[0]?.posted[0];
    expect(posted).toMatchObject({
      id: 1,
      kind: "findPath",
      tsconfig: "/repo/tsconfig.json",
      fromId: "a.ts#f",
      toId: "b.ts#g",
      limits,
      changedFiles: ["/c.ts"],
    });
    const flag = cancelOf(posted);
    expect(flag.byteLength).toBe(4);
    expect(Atomics.load(flag, 0)).toBe(0);
    run.cancel();
    expect(Atomics.load(flag, 0)).toBe(1);
  });

  it("gives each run its own flag", () => {
    const { workers, client } = setup();
    const first = client.findPath(args, () => undefined);
    client.findPath(args, () => undefined);
    first.cancel();
    expect(Atomics.load(cancelOf(workers[0]?.posted[0]), 0)).toBe(1);
    expect(Atomics.load(cancelOf(workers[0]?.posted[1]), 0)).toBe(0);
  });

  it("passes progress to the callback and does not settle the run", async () => {
    const { workers, client } = setup();
    const onProgress = vi.fn();
    const run = client.findPath(args, onProgress);
    const settled = vi.fn();
    void run.result.then(settled);
    const progress = { checked: 3, routes: 1, routesCapped: false };
    workers[0]?.reply({ id: 1, kind: "pathProgress", progress });
    await Promise.resolve();
    expect(onProgress).toHaveBeenCalledWith(progress);
    expect(settled).not.toHaveBeenCalled();
    workers[0]?.reply({ id: 1, kind: "pathDone", result: found });
    await expect(run.result).resolves.toEqual({
      status: "done",
      value: found,
    });
  });

  it("resolves a cancelled outcome as cancelled and a found one as done", async () => {
    const { workers, client } = setup();
    const cancelled = client.findPath(args, () => undefined);
    workers[0]?.reply({
      id: 1,
      kind: "pathDone",
      result: { ...found, outcome: { status: "cancelled" } },
    });
    await expect(cancelled.result).resolves.toEqual({ status: "cancelled" });

    const done = client.findPath(args, () => undefined);
    workers[0]?.reply({ id: 2, kind: "pathDone", result: found });
    await expect(done.result).resolves.toEqual({
      status: "done",
      value: found,
    });
  });

  it("rejects the run on a crash and keeps the out-of-memory flag", async () => {
    const { workers, client } = setup();
    const run = client.findPath(args, () => undefined);
    workers[0]?.emit(
      "error",
      Object.assign(new Error("heap"), { code: "ERR_WORKER_OUT_OF_MEMORY" }),
    );
    const error = await run.result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WorkerCrashedError);
    expect((error as WorkerCrashedError).outOfMemory).toBe(true);
  });

  it("rejects the run on recycle", async () => {
    const { client } = setup();
    const run = client.findPath(args, () => undefined);
    client.recycle();
    await expect(run.result).rejects.toThrow("restarted");
  });

  it("resolves a refresh run as cancelled for pathStatus cancelled and done otherwise", async () => {
    const { workers, client } = setup();
    const onProgress = vi.fn();
    const first = client.refreshPath(
      "/repo/tsconfig.json",
      "a.ts#f",
      "b.ts#g",
      ["a.ts#h"],
      ["/c.ts"],
      limits,
      onProgress,
    );
    expect(workers[0]?.posted[0]).toMatchObject({
      id: 1,
      kind: "refresh",
      tsconfig: "/repo/tsconfig.json",
      focusId: "a.ts#f",
      expanded: ["a.ts#h"],
      changedFiles: ["/c.ts"],
      path: { endId: "b.ts#g", limits },
    });
    const progress = { checked: 1, routes: 0, routesCapped: false };
    workers[0]?.reply({ id: 1, kind: "pathProgress", progress });
    expect(onProgress).toHaveBeenCalledWith(progress);
    workers[0]?.reply({
      id: 1,
      kind: "refreshed",
      result: { ...refreshed, pathStatus: "cancelled" },
    });
    await expect(first.result).resolves.toEqual({ status: "cancelled" });

    const second = client.refreshPath(
      "/repo/tsconfig.json",
      "a.ts#f",
      "b.ts#g",
      [],
      [],
      limits,
      () => undefined,
    );
    const result = { ...refreshed, pathStatus: "none" as const };
    workers[0]?.reply({ id: 2, kind: "refreshed", result });
    await expect(second.result).resolves.toEqual({
      status: "done",
      value: result,
    });
    second.cancel();
    expect(Atomics.load(cancelOf(workers[0]?.posted[1]), 0)).toBe(1);
  });

  it("settles the run with its result when the progress callback throws", async () => {
    const { workers, client } = setup();
    const run = client.findPath(args, () => {
      throw new Error("callback failed");
    });
    expect(() =>
      workers[0]?.reply({
        id: 1,
        kind: "pathProgress",
        progress: { checked: 1, routes: 0, routesCapped: false },
      }),
    ).not.toThrow();
    workers[0]?.reply({ id: 1, kind: "pathDone", result: found });
    await expect(run.result).resolves.toEqual({
      status: "done",
      value: found,
    });
  });

  it("ignores progress for an unknown request id", async () => {
    const { workers, client } = setup();
    const onProgress = vi.fn();
    const run = client.findPath(args, onProgress);
    workers[0]?.reply({
      id: 99,
      kind: "pathProgress",
      progress: { checked: 1, routes: 0, routesCapped: false },
    });
    expect(onProgress).not.toHaveBeenCalled();
    workers[0]?.reply({ id: 1, kind: "pathDone", result: found });
    await expect(run.result).resolves.toMatchObject({ status: "done" });
  });
});
