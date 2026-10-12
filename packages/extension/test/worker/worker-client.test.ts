import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type {
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

const result = {
  slice: { focusId: "a.ts#f", nodes: [], edges: [], truncated: false },
  repoRoot: "/repo",
  tsconfig: "/repo/tsconfig.json",
};

function outOfMemory(): Error {
  return Object.assign(new Error("heap out of memory"), {
    code: "ERR_WORKER_OUT_OF_MEMORY",
  });
}

describe("WorkerClient", () => {
  it("starts the worker lazily and reuses it", async () => {
    const { workers, client } = setup();
    expect(workers).toHaveLength(0);
    const first = client.warm("/a.ts", []);
    workers[0]?.reply({ id: 1, kind: "warmed" });
    await first;
    const second = client.warm("/a.ts", []);
    workers[0]?.reply({ id: 2, kind: "warmed" });
    await second;
    expect(workers).toHaveLength(1);
  });

  it("posts focus requests and resolves with the result", async () => {
    const { workers, client } = setup();
    const pending = client.focus("/a.ts", 3, 4, ["/b.ts"]);
    expect(workers[0]?.posted).toEqual([
      {
        id: 1,
        kind: "focus",
        file: "/a.ts",
        line: 3,
        character: 4,
        changedFiles: ["/b.ts"],
      },
    ]);
    workers[0]?.reply({ id: 1, kind: "focused", result });
    await expect(pending).resolves.toEqual(result);
  });

  it("posts sliceForNode requests and resolves with the result", async () => {
    const { workers, client } = setup();
    const pending = client.sliceForNode("/repo/tsconfig.json", "a.ts#f", [
      "/b.ts",
    ]);
    expect(workers[0]?.posted).toEqual([
      {
        id: 1,
        kind: "sliceForNode",
        tsconfig: "/repo/tsconfig.json",
        nodeId: "a.ts#f",
        changedFiles: ["/b.ts"],
      },
    ]);
    workers[0]?.reply({ id: 1, kind: "sliced", result });
    await expect(pending).resolves.toEqual(result);
  });

  it("rejects sliceForNode with the worker's message and on a mismatched reply", async () => {
    const { workers, client } = setup();
    const missing = client.sliceForNode("/repo/tsconfig.json", "a.ts#gone", []);
    workers[0]?.reply({
      id: 1,
      kind: "failed",
      message: "Node not found: a.ts#gone",
    });
    await expect(missing).rejects.toThrow("Node not found");

    const mismatched = client.sliceForNode("/repo/tsconfig.json", "a.ts#f", []);
    workers[0]?.reply({ id: 2, kind: "focused", result });
    await expect(mismatched).rejects.toThrow("Unexpected worker response");
  });

  it("posts refresh requests and resolves with the result; a mismatched reply rejects", async () => {
    const { workers, client } = setup();
    const refreshed = {
      tsconfig: "/repo/tsconfig.json",
      repoRoot: "/repo",
      centre: result.slice,
      expansions: [{ nodeId: "a.ts#g", slice: result.slice }],
    };
    const pending = client.refresh(
      "/repo/tsconfig.json",
      "a.ts#f",
      ["a.ts#g"],
      ["/b.ts"],
    );
    expect(workers[0]?.posted).toEqual([
      {
        id: 1,
        kind: "refresh",
        tsconfig: "/repo/tsconfig.json",
        focusId: "a.ts#f",
        expanded: ["a.ts#g"],
        changedFiles: ["/b.ts"],
      },
    ]);
    workers[0]?.reply({ id: 1, kind: "refreshed", result: refreshed });
    await expect(pending).resolves.toEqual(refreshed);

    const mismatched = client.refresh("/repo/tsconfig.json", "a.ts#f", [], []);
    workers[0]?.reply({ id: 2, kind: "sliced", result });
    await expect(mismatched).rejects.toThrow("Unexpected worker response");
  });

  it("matches out-of-order replies by id", async () => {
    const { workers, client } = setup();
    const first = client.focus("/a.ts", 1, 0, []);
    const second = client.focus("/a.ts", 2, 0, []);
    workers[0]?.reply({ id: 2, kind: "failed", message: "second failed" });
    workers[0]?.reply({ id: 1, kind: "focused", result });
    await expect(first).resolves.toEqual(result);
    await expect(second).rejects.toThrow("second failed");
  });

  it("rejects with the worker's message when the request fails", async () => {
    const { workers, client } = setup();
    const pending = client.focus("/a.ts", 0, 0, []);
    workers[0]?.reply({ id: 1, kind: "failed", message: "No callable found" });
    await expect(pending).rejects.toThrow("No callable found");
  });

  it("reports an out-of-memory worker and starts a fresh one next time", async () => {
    const { workers, client } = setup();
    const pending = client.focus("/a.ts", 0, 0, []);
    workers[0]?.emit("error", outOfMemory());
    workers[0]?.emit("exit", 1);
    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WorkerCrashedError);
    expect((error as WorkerCrashedError).outOfMemory).toBe(true);
    expect(workers[0]?.terminated).toBe(true);

    const next = client.focus("/a.ts", 0, 0, []);
    expect(workers).toHaveLength(2);
    workers[1]?.reply({ id: 2, kind: "focused", result });
    await expect(next).resolves.toEqual(result);
  });

  it("treats an unexpected exit as a crash, not an out-of-memory", async () => {
    const { workers, client } = setup();
    const pending = client.focus("/a.ts", 0, 0, []);
    workers[0]?.emit("exit", 3);
    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WorkerCrashedError);
    expect((error as WorkerCrashedError).outOfMemory).toBe(false);
    expect((error as WorkerCrashedError).message).toContain("3");
  });

  it("rejects every in-flight request when the worker dies", async () => {
    const { workers, client } = setup();
    const first = client.focus("/a.ts", 1, 0, []);
    const second = client.focus("/a.ts", 2, 0, []);
    workers[0]?.emit("error", new Error("boom"));
    await expect(first).rejects.toBeInstanceOf(WorkerCrashedError);
    await expect(second).rejects.toBeInstanceOf(WorkerCrashedError);
  });

  it("ignores late events from a worker that was already replaced", async () => {
    const { workers, client } = setup();
    const first = client.focus("/a.ts", 0, 0, []);
    workers[0]?.emit("error", outOfMemory());
    await first.catch(() => undefined);

    const next = client.focus("/a.ts", 0, 0, []);
    workers[0]?.emit("exit", 1);
    workers[1]?.reply({ id: 2, kind: "focused", result });
    await expect(next).resolves.toEqual(result);
  });

  it("rejects requests after dispose without starting a worker", async () => {
    const { workers, client } = setup();
    const pending = client.focus("/a.ts", 0, 0, []);
    client.dispose();
    await expect(pending).rejects.toThrow("restarted");
    await expect(client.focus("/a.ts", 0, 0, [])).rejects.toThrow("disposed");
    await expect(client.warm("/a.ts", [])).rejects.toThrow("disposed");
    expect(workers).toHaveLength(1);
  });

  it("recycle terminates the worker, rejects pending work and restarts lazily", async () => {
    const { workers, client } = setup();
    const pending = client.focus("/a.ts", 0, 0, []);
    client.recycle();
    expect(workers[0]?.terminated).toBe(true);
    await expect(pending).rejects.toThrow("restarted");

    const next = client.warm("/a.ts", []);
    expect(workers).toHaveLength(2);
    workers[1]?.reply({ id: 2, kind: "warmed" });
    await next;
  });
});
