import type { NodeId } from "@code-spider/core";
import type { PathMark } from "@code-spider/webview/protocol";
import { annotateSlice } from "../diff/annotate.js";
import type { ChangeReader } from "../diff/change-reader.js";
import type { FindPathResult, ResolvedEnd } from "../worker/protocol.js";
import { WorkerCrashedError } from "../worker/worker-client.js";
import type { CentreRequests } from "./centre-requests.js";
import type { FailureReporter } from "./failures.js";
import { PathTracker } from "./path-track.js";
import { refreshPath } from "./path-refresh.js";
import { annotateRoute, routeSlice } from "./session-refresh.js";
import type {
  CurrentGraph,
  FocusRequest,
  NodeRequest,
  RefreshGraphRequest,
  SessionDeps,
} from "./session.js";
import {
  differentProjectsWarning,
  endGoneMessage,
  MARK_FIRST_WARNING,
  noPathMessage,
  NO_FUNCTION_WARNING,
  sameFunctionWarning,
  savedFirstWarning,
  staleMarkWarning,
} from "./warnings.js";

export type PathRefreshRequest = RefreshGraphRequest & { endId: NodeId };

export type PathSearchDeps = Pick<
  SessionDeps,
  | "worker"
  | "panel"
  | "notifier"
  | "changes"
  | "jumps"
  | "documents"
  | "pathStart"
  | "pathLimits"
> & {
  requests: CentreRequests;
  failures: FailureReporter;
  reader: ChangeReader;
  remember: (graph: CurrentGraph) => void;
};

type End = { tsconfig: string; nodeId: NodeId; name: string };

export class PathSearcher {
  private readonly tracker: PathTracker;

  constructor(private readonly deps: PathSearchDeps) {
    this.tracker = new PathTracker(deps.panel, deps.requests);
  }

  async markStart(request: FocusRequest): Promise<void> {
    const { notifier, requests, pathStart } = this.deps;
    if (request.isDirty) {
      notifier.warn(savedFirstWarning(request.file));
      return;
    }
    await requests.busy(async () => {
      const end = await this.resolve(request);
      if (!end) return;
      const { tsconfig: project, nodeId, name } = end;
      pathStart.set({ project, nodeId, name });
    });
  }

  async finishAt(request: FocusRequest): Promise<void> {
    const { notifier, requests, pathStart } = this.deps;
    if (request.isDirty) {
      notifier.warn(savedFirstWarning(request.file));
      return;
    }
    if (!pathStart.get()) {
      notifier.warn(MARK_FIRST_WARNING);
      return;
    }
    await requests.busy(async () => {
      const end = await this.resolve(request);
      const mark = pathStart.get();
      if (end && mark && this.compatible(mark, end)) {
        await this.search(mark, end);
      }
    });
  }

  async click(request: NodeRequest): Promise<void> {
    const { jumps, pathStart, requests } = this.deps;
    const { project, nodeId } = request;
    const node = jumps.nodes(project).find((n) => n.id === nodeId);
    if (node?.kind !== "function" && node?.kind !== "component") return;
    const mark = pathStart.get();
    if (!mark) {
      pathStart.set({ project, nodeId, name: node.name });
    } else if (mark.project === project && mark.nodeId === nodeId) {
      pathStart.clear();
    } else {
      const end = { tsconfig: project, nodeId, name: node.name };
      if (this.compatible(mark, end)) {
        await requests.busy(() => this.search(mark, end));
      }
    }
  }

  cancel(id: number): void {
    this.tracker.cancel(id);
  }

  cancelActive(): void {
    this.tracker.cancelActive();
  }

  panelClosed(): void {
    this.tracker.abandon();
  }

  refresh(request: PathRefreshRequest): Promise<void> {
    return refreshPath(this.deps, this.tracker, request);
  }

  private async resolve(
    request: FocusRequest,
  ): Promise<ResolvedEnd | undefined> {
    const { worker, changes, notifier, failures } = this.deps;
    try {
      const { files } = changes.drain();
      const changed = [...new Set([...files, request.file])];
      const end = await worker.resolveEnd(
        request.file,
        request.line,
        request.character,
        changed,
      );
      if (!end) notifier.warn(NO_FUNCTION_WARNING);
      return end;
    } catch (error) {
      const message = failures.describe(error);
      failures.notifyCrash(error, message);
      if (!(error instanceof WorkerCrashedError)) notifier.error(message);
      return undefined;
    }
  }

  /** A refused request leaves the mark and cancels nothing. */
  private compatible(mark: PathMark, end: End): boolean {
    const { notifier } = this.deps;
    if (mark.project !== end.tsconfig) {
      notifier.warn(differentProjectsWarning(mark.name, end.name));
      return false;
    }
    if (mark.nodeId === end.nodeId) {
      notifier.warn(sameFunctionWarning(end.name));
      return false;
    }
    return true;
  }

  private async search(mark: PathMark, end: End): Promise<void> {
    const { worker, panel, notifier, changes, jumps, pathStart } = this.deps;
    const { requests, failures, reader, remember } = this.deps;
    pathStart.clear();
    const token = requests.next();
    const limits = this.deps.pathLimits();
    const { files, version } = changes.drain();
    const args = {
      tsconfig: mark.project,
      fromId: mark.nodeId,
      toId: end.nodeId,
      limits,
      changedFiles: files,
    };
    panel.show();
    await this.tracker.track<FindPathResult>({
      purpose: "search",
      from: mark.name,
      to: end.name,
      token,
      start: (onProgress) => worker.findPath(args, onProgress),
      settle: async (outcome, live) => {
        if (outcome.status === "cancelled") return;
        const { tsconfig, repoRoot, outcome: found } = outcome.value;
        if (found.status === "none") {
          const timedOut = found.stoppedBy === "time";
          if (live()) {
            panel.post({
              type: "analysisError",
              message: noPathMessage(mark.name, end.name, timedOut),
            });
          }
        } else if (found.status === "gone") {
          if (!live()) return;
          if (found.nodeId === mark.nodeId) {
            notifier.warn(staleMarkWarning(mark.name));
          } else {
            panel.post({
              type: "analysisError",
              message: endGoneMessage(end.name),
            });
          }
        } else if (found.status === "found") {
          const marks = await reader.read(repoRoot);
          const slice = annotateSlice(found.centre, marks);
          const route = annotateRoute(found.route, marks);
          if (!live()) return;
          const graph = { slice, repoRoot, tsconfig };
          jumps.add(tsconfig, graph);
          jumps.add(tsconfig, {
            slice: routeSlice(slice.focusId, route),
            repoRoot,
            tsconfig,
          });
          remember(graph);
          panel.post({
            type: "pathFound",
            project: tsconfig,
            slice,
            route,
            path: found.path,
            sourceVersion: version,
          });
        }
      },
      fail: (error) => {
        const message = failures.describe(error, true);
        panel.post({ type: "analysisError", message });
        failures.notifyCrash(error, message);
      },
    });
  }
}
