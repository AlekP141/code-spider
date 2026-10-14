import { basename } from "node:path";
import type { NodeId } from "@code-spider/core";
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
  CENTRE_GONE_MESSAGE,
  noticeUnsavedEdits,
  recordRefresh,
  refreshedMessage,
  refreshFailedMessage,
} from "./session-refresh.js";
import type { FocusResult } from "../worker/protocol.js";
import { postChangeMarks } from "./session-recolour.js";
import { WorkerCrashedError } from "../worker/worker-client.js";

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
};

const UNKNOWN_PROJECT = "Unknown project";

export class GraphSession {
  private graph: CurrentGraph | undefined;
  private latest = 0;
  private outstanding = 0;
  private warming = 0;
  private lastNotifiedCrash: WorkerCrashedError | undefined;

  private readonly changeReader: ChangeReader;

  constructor(private readonly deps: SessionDeps) {
    this.changeReader = new ChangeReader(
      deps.diff,
      deps.diffMode,
      deps.notifier,
    );
  }

  currentGraph(): CurrentGraph | undefined {
    return this.graph;
  }

  async showGraph(request: FocusRequest): Promise<void> {
    const { worker, panel, notifier, changes } = this.deps;
    if (request.isDirty) {
      notifier.warn(
        `Save ${basename(request.file)} first. Code Spider reads files from disk, so an unsaved edit would be analysed at the wrong position.`,
      );
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
      const message = this.describeFailure(error);
      panel.post({ type: "expandFailed", nodeId, generation, message });
      this.notifyCrash(error, message);
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
    const token = this.latest;
    await this.withBusy(async () => {
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
        const result = {
          ...analysed,
          centre: analysed.centre && annotateSlice(analysed.centre, marks),
          expansions: analysed.expansions.map(({ nodeId, slice }) => ({
            nodeId,
            slice: annotateSlice(slice, marks),
          })),
        };
        if (token !== this.latest || !panel.isOpen()) return;
        const { centre } = result;
        if (!centre) {
          panel.post(refreshFailedMessage(generation, CENTRE_GONE_MESSAGE));
          return;
        }
        this.graph = recordRefresh(jumps, result, centre);
        panel.post(refreshedMessage(generation, version, result, centre));
      } catch (error) {
        if (token !== this.latest || !panel.isOpen()) return;
        const message = this.describeFailure(error);
        panel.post(refreshFailedMessage(generation, message));
        this.notifyCrash(error, message);
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
      this.notifyCrash(error, this.describeFailure(error));
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
    const token = ++this.latest;
    await this.withBusy(async () => {
      try {
        const analysed = await analyse();
        const result = await this.withChanges(analysed.result);
        const { version } = analysed;
        if (token !== this.latest || !panel.isOpen()) return;
        this.graph = result;
        jumps.add(result.tsconfig, result);
        panel.post({
          type: "slice",
          slice: result.slice,
          project: result.tsconfig,
          mode: { kind: "centre", sourceVersion: version },
        });
      } catch (error) {
        if (token !== this.latest || !panel.isOpen()) return;
        const message = this.describeFailure(error);
        panel.post({ type: "analysisError", message });
        this.notifyCrash(error, message);
      }
    });
  }

  /** Busy stays on until every centre request and refresh has settled. */
  private async withBusy(work: () => Promise<void>): Promise<void> {
    const { panel } = this.deps;
    this.outstanding += 1;
    panel.post({ type: "busy", busy: true });
    try {
      await work();
    } finally {
      this.outstanding -= 1;
      if (this.outstanding === 0) panel.post({ type: "busy", busy: false });
    }
  }

  /** A crash rejects every waiting request with one error: notify once. */
  private notifyCrash(error: unknown, message: string): void {
    if (!(error instanceof WorkerCrashedError)) return;
    if (error === this.lastNotifiedCrash) return;
    this.lastNotifiedCrash = error;
    this.deps.notifier.error(message);
  }

  private setIndexing(active: boolean): void {
    this.deps.indexing.set(active);
    this.deps.panel.post({ type: "indexing", indexing: active });
  }

  private describeFailure(error: unknown): string {
    if (error instanceof WorkerCrashedError) {
      return error.outOfMemory
        ? `Code Spider ran out of memory analysing this project (limit ${this.deps.maxHeapMb()} MB). Raise "codeSpider.worker.maxHeapMb" in settings and try again.`
        : `${error.message}. The next request starts a fresh worker.`;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
