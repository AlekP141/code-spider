import type { NodeId, PathLimits } from "@code-spider/core";
import type { DiffMode } from "@code-spider/webview/diff-mode";
import type { ChangeTracker } from "../changes/changes.js";
import type {
  AnalysisPort,
  DiffPort,
  DocumentsPort,
  IndexingIndicator,
  JumpRegistry,
  Notifier,
  PanelPort,
} from "../ports.js";
import { annotateSlice } from "../diff/annotate.js";
import { ChangeReader } from "../diff/change-reader.js";
import {
  annotateRefresh,
  CENTRE_GONE_MESSAGE,
  noticeUnsavedEdits,
  recordRefresh,
  refreshedMessage,
  refreshFailedMessage,
} from "./session-refresh.js";
import type { FocusResult } from "../worker/protocol.js";
import { PathSearcher } from "./path-search.js";
import type { PathStart } from "./path-start.js";
import { postChangeMarks } from "./session-recolour.js";
import { CentreRequests } from "./centre-requests.js";
import { FailureReporter } from "./failures.js";
import { savedFirstWarning } from "./warnings.js";

export type FocusRequest = {
  /** Absolute path of the document. */
  file: string;
  /** Zero-based cursor line. */
  line: number;
  /** Zero-based cursor character. */
  character: number;
  isDirty: boolean;
};

/** A node of a project the panel already shows, named by the webview. */
export type NodeRequest = { project: string; nodeId: NodeId };
export type ExpandRequest = NodeRequest & { generation: number };

export type RefreshGraphRequest = {
  project: string;
  generation: number;
  focusId: NodeId;
  expanded: NodeId[];
  pathEndId?: NodeId;
};

export type CurrentGraph = FocusResult;

export type SessionDeps = {
  worker: AnalysisPort;
  panel: PanelPort;
  notifier: Notifier;
  indexing: IndexingIndicator;
  changes: ChangeTracker;
  maxHeapMb: () => number;
  jumps: JumpRegistry;
  documents: DocumentsPort;
  diff: DiffPort;
  diffMode: () => DiffMode;
  pathStart: PathStart;
  pathLimits: () => PathLimits;
};

const UNKNOWN_PROJECT = "Unknown project";

export class GraphSession {
  private graph: CurrentGraph | undefined;
  private warming = 0;

  private readonly changeReader: ChangeReader;
  private readonly requests: CentreRequests;
  private readonly failures: FailureReporter;
  readonly paths: PathSearcher;

  constructor(private readonly deps: SessionDeps) {
    this.changeReader = new ChangeReader(
      deps.diff,
      deps.diffMode,
      deps.notifier,
    );
    this.requests = new CentreRequests(deps.panel);
    this.failures = new FailureReporter(deps.notifier, deps.maxHeapMb);
    this.paths = new PathSearcher({
      ...deps,
      requests: this.requests,
      failures: this.failures,
      reader: this.changeReader,
      remember: (graph) => {
        this.graph = graph;
      },
    });
  }

  currentGraph(): CurrentGraph | undefined {
    return this.graph;
  }

  async showGraph(request: FocusRequest): Promise<void> {
    const { worker, panel, notifier, changes } = this.deps;
    if (request.isDirty) {
      notifier.warn(savedFirstWarning(request.file));
      return;
    }

    panel.show();
    await this.replaceGraph(async () => {
      const { files, version } = changes.drain();
      const changedFiles = [...new Set([...files, request.file])];
      const result = await worker.focus(
        request.file,
        request.line,
        request.character,
        changedFiles,
      );
      return { result, version };
    });
  }

  async focusNode(request: NodeRequest): Promise<void> {
    const { worker, panel, changes, jumps } = this.deps;
    if (!jumps.has(request.project)) {
      panel.post({ type: "analysisError", message: UNKNOWN_PROJECT });
      return;
    }
    await this.replaceGraph(async () => {
      const { files, version } = changes.drain();
      const result = await worker.sliceForNode(
        request.project,
        request.nodeId,
        files,
      );
      return { result, version };
    });
  }

  /** Takes no token and no busy state: expansions may overlap each other. */
  async expand(request: ExpandRequest): Promise<void> {
    const { worker, panel, changes, jumps } = this.deps;
    const { project, nodeId, generation } = request;
    if (!jumps.has(project)) {
      panel.post({
        type: "expandFailed",
        nodeId,
        generation,
        message: UNKNOWN_PROJECT,
      });
      return;
    }
    try {
      const result = await this.withChanges(
        await worker.sliceForNode(project, nodeId, changes.drain().files),
      );
      if (!jumps.has(project)) return;
      jumps.add(result.tsconfig, result);
      panel.post({
        type: "slice",
        slice: result.slice,
        project: result.tsconfig,
        mode: { kind: "expansion", nodeId, generation },
      });
    } catch (error) {
      if (!jumps.has(project)) return;
      const message = this.failures.describe(error);
      panel.post({ type: "expandFailed", nodeId, generation, message });
      this.failures.notifyCrash(error, message);
    }
  }

  /** Rebuilds the graph on screen; never starts a newer centre request. */
  async refresh(request: RefreshGraphRequest): Promise<void> {
    const { worker, panel, changes, jumps, documents, notifier } = this.deps;
    const { project, generation, focusId, expanded } = request;
    if (!jumps.has(project)) {
      panel.post(refreshFailedMessage(generation, UNKNOWN_PROJECT));
      return;
    }
    if (request.pathEndId !== undefined) {
      return this.paths.refresh({ ...request, endId: request.pathEndId });
    }
    const token = this.requests.latest();
    await this.requests.busy(async () => {
      try {
        noticeUnsavedEdits(project, jumps, documents, notifier);
        const { files, version } = changes.drain();
        const analysed = await worker.refresh(
          project,
          focusId,
          expanded,
          files,
        );
        const marks = await this.changeReader.read(analysed.repoRoot);
        const result = annotateRefresh(analysed, marks);
        if (!this.requests.isCurrent(token) || !panel.isOpen()) return;
        const { centre } = result;
        if (!centre) {
          panel.post(refreshFailedMessage(generation, CENTRE_GONE_MESSAGE));
          return;
        }
        this.graph = recordRefresh(jumps, result, centre);
        panel.post(refreshedMessage(generation, version, result, centre));
      } catch (error) {
        if (!this.requests.isCurrent(token) || !panel.isOpen()) return;
        const message = this.failures.describe(error);
        panel.post(refreshFailedMessage(generation, message));
        this.failures.notifyCrash(error, message);
      }
    });
  }

  /** Recolours what the panel shows; no busy state, no new graph. */
  async recolour(): Promise<void> {
    this.changeReader.resetWarning();
    await postChangeMarks({
      jumps: this.deps.jumps,
      panel: this.deps.panel,
      reader: this.changeReader,
    });
  }

  /** Loads and warms the project so the first focus is fast (perf note). */
  async warm(file: string): Promise<void> {
    const { worker, changes } = this.deps;
    this.warming += 1;
    this.setIndexing(true);
    try {
      await worker.warm(file, changes.drain().files);
    } catch (error) {
      this.failures.notifyCrash(error, this.failures.describe(error));
    } finally {
      this.warming -= 1;
      if (this.warming === 0) this.setIndexing(false);
    }
  }

  private async withChanges(result: FocusResult): Promise<FocusResult> {
    const changes = await this.changeReader.read(result.repoRoot);
    return { ...result, slice: annotateSlice(result.slice, changes) };
  }

  /** The newest centre request wins; older answers are dropped. */
  private async replaceGraph(
    analyse: () => Promise<{ result: FocusResult; version: number }>,
  ): Promise<void> {
    const { panel, jumps } = this.deps;
    const token = this.requests.next();
    await this.requests.busy(async () => {
      try {
        const analysed = await analyse();
        const result = await this.withChanges(analysed.result);
        const { version } = analysed;
        if (!this.requests.isCurrent(token) || !panel.isOpen()) return;
        this.graph = result;
        jumps.add(result.tsconfig, result);
        panel.post({
          type: "slice",
          slice: result.slice,
          project: result.tsconfig,
          mode: { kind: "centre", sourceVersion: version },
        });
      } catch (error) {
        if (!this.requests.isCurrent(token) || !panel.isOpen()) return;
        const message = this.failures.describe(error);
        panel.post({ type: "analysisError", message });
        this.failures.notifyCrash(error, message);
      }
    });
  }

  private setIndexing(active: boolean): void {
    this.deps.indexing.set(active);
    this.deps.panel.post({ type: "indexing", indexing: active });
  }
}
