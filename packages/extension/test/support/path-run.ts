import type { PathProgress } from "@code-spider/core";
import type { PathMark } from "@code-spider/webview/protocol";
import { expect, vi } from "vitest";
import type { FocusRequest } from "../../src/session/session.js";
import type { AnalysisPort } from "../../src/ports.js";
import type { Cancellable, PathRun } from "../../src/worker/path-run.js";
import type {
  FindPathResult,
  RefreshResult,
  ResolvedEnd,
} from "../../src/worker/protocol.js";
import { deferred, FOCUS, known, PROJECT, resultFor } from "./session-setup.js";

export const A_ID = FOCUS;
export const B_ID = "src/b.ts#g";
export const MARK: PathMark = { project: PROJECT, nodeId: A_ID, name: "f" };
export const CURSOR: FocusRequest = {
  file: "/repo/src/b.ts",
  line: 1,
  character: 2,
  isDirty: false,
};

export type ControlledRun<T> = PathRun<T> & {
  cancel: ReturnType<typeof vi.fn>;
  progress(value: PathProgress): void;
  done(value: T): void;
  cancelled(): void;
  fail(error: unknown): void;
};

/** Each started run waits until the test settles it. */
export function controlledRuns<T>() {
  const runs: ControlledRun<T>[] = [];
  const start = vi.fn((...args: [...unknown[], (p: PathProgress) => void]) => {
    const waiting = deferred<Cancellable<T>>();
    const run: ControlledRun<T> = {
      result: waiting.promise,
      cancel: vi.fn(),
      progress: args[args.length - 1] as (p: PathProgress) => void,
      done: (value) => waiting.resolve({ status: "done", value }),
      cancelled: () => waiting.resolve({ status: "cancelled" }),
      fail: waiting.reject,
    };
    runs.push(run);
    return run;
  });
  return { start, runs };
}

export function resolved(nodeId: string, name: string): ResolvedEnd {
  return {
    tsconfig: PROJECT,
    repoRoot: "/repo",
    nodeId,
    name,
    isTest: false,
  };
}

const info = {
  endId: B_ID,
  boxes: [
    { id: A_ID, column: 0 },
    { id: B_ID, column: 1 },
  ],
  edgeIds: ["a->b"],
  summary: { routes: 1, routesCapped: false, leftOut: 0, checked: 3 },
};

const routeEdge = {
  id: "a->b",
  from: A_ID,
  to: B_ID,
  kind: "call" as const,
  supplies: "",
  callSite: { startLine: 3, startColumn: 1, endLine: 3, endColumn: 4 },
  resolved: true,
};

export function route() {
  return {
    nodes: resultFor(A_ID, [B_ID]).slice.nodes,
    edges: [routeEdge],
  };
}

export function centre() {
  return resultFor(A_ID, ["src/a.ts#callee"]).slice;
}

export function foundResult(): FindPathResult {
  return {
    tsconfig: PROJECT,
    repoRoot: "/repo",
    outcome: { status: "found", centre: centre(), route: route(), path: info },
  };
}

export function refreshedResult(
  extra: Partial<RefreshResult> = {},
): RefreshResult {
  return {
    tsconfig: PROJECT,
    repoRoot: "/repo",
    centre: centre(),
    expansions: [],
    route: route(),
    path: info,
    ...extra,
  };
}

export function pathEnv(overrides: Partial<AnalysisPort> = {}) {
  const finds = controlledRuns<FindPathResult>();
  const refreshes = controlledRuns<RefreshResult>();
  const env = known({
    resolveEnd: vi.fn(async () => resolved(B_ID, "g")),
    findPath: finds.start,
    refreshPath: refreshes.start,
    ...overrides,
  });
  env.jumps.add(PROJECT, resultFor(FOCUS, [B_ID]));
  return { ...env, finds, refreshes };
}

export type PathEnv = ReturnType<typeof pathEnv>;

/** Marks A, then starts a search that waits for the test to settle it. */
export async function startSearch(
  env: PathEnv,
): Promise<{ search: Promise<void> }> {
  const before = env.finds.runs.length;
  env.pathStart.set(MARK);
  const search = env.session.paths.finishAt(CURSOR);
  await vi.waitFor(() => expect(env.finds.runs.length).toBe(before + 1));
  return { search };
}
