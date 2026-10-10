import { basename } from "node:path";
import type { NodeId } from "@code-spider/core";
import type { ChangeTracker } from "./changes.js";
import { positionToOffset } from "./positions.js";
import type {
  AnalysisPort,
  IndexingIndicator,
  JumpRegistry,
  Notifier,
  PanelPort,
} from "./ports.js";
import type { FocusResult } from "./worker/protocol.js";
import { WorkerCrashedError } from "./worker/worker-client.js";

export type FocusRequest = {
  /** Absolute path of the document. */
  file: string;
  /** The document text, as VS Code holds it. */
  text: string;
  /** Zero-based cursor line. */
  line: number;
  /** Zero-based cursor character. */
  character: number;
  isDirty: boolean;
};

/** A node of a project the panel already shows, named by the webview. */
export type NodeRequest = { project: string; nodeId: NodeId };
export type ExpandRequest = NodeRequest & { generation: number };

/** What the latest centre request returned. */
export type CurrentGraph = FocusResult;

export type SessionDeps = {
  worker: AnalysisPort;
  panel: PanelPort;
  notifier: Notifier;
  indexing: IndexingIndicator;
  changes: ChangeTracker;
  maxHeapMb: () => number;
  jumps: JumpRegistry;
};

const UNKNOWN_PROJECT = "Unknown project";

export class GraphSession {
  private graph: CurrentGraph | undefined;
  private latest = 0;
  private outstanding = 0;
  private warming = 0;

  constructor(private readonly deps: SessionDeps) {}

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
    await this.replaceGraph(() => {
      const offset = positionToOffset(
        request.text,
        request.line,
        request.character,
      );
      const changedFiles = [...new Set([...changes.drain(), request.file])];
      return worker.focus(request.file, offset, changedFiles);
    });
  }

  /** Re-centres on a node of a project the panel already shows. */
  async focusNode(request: NodeRequest): Promise<void> {
    const { worker, panel, changes, jumps } = this.deps;
    if (!jumps.has(request.project)) {
      panel.post({ type: "analysisError", message: UNKNOWN_PROJECT });
      return;
    }
    await this.replaceGraph(() =>
      worker.sliceForNode(request.project, request.nodeId, changes.drain()),
    );
  }

  /** Takes no token and no busy state: expansions may overlap each other. */
  async expand(request: ExpandRequest): Promise<void> {
    const { worker, panel, notifier, changes, jumps } = this.deps;
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
      const result = await worker.sliceForNode(
        project,
        nodeId,
        changes.drain(),
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
      if (error instanceof WorkerCrashedError) notifier.error(message);
    }
  }

  /** Loads and warms the project so the first focus is fast (perf note). */
  async warm(file: string): Promise<void> {
    const { worker, notifier, changes } = this.deps;
    this.warming += 1;
    this.setIndexing(true);
    try {
      await worker.warm(file, changes.drain());
    } catch (error) {
      if (error instanceof WorkerCrashedError) {
        notifier.error(this.describeFailure(error));
      }
    } finally {
      this.warming -= 1;
      if (this.warming === 0) this.setIndexing(false);
    }
  }

  /** The newest centre request wins; older answers are dropped. */
  private async replaceGraph(
    analyse: () => Promise<FocusResult>,
  ): Promise<void> {
    const { panel, notifier, jumps } = this.deps;
    const token = ++this.latest;
    this.outstanding += 1;
    panel.post({ type: "busy", busy: true });
    try {
      const result = await analyse();
      if (token !== this.latest || !panel.isOpen()) return;
      this.graph = result;
      jumps.add(result.tsconfig, result);
      panel.post({
        type: "slice",
        slice: result.slice,
        project: result.tsconfig,
        mode: { kind: "centre" },
      });
    } catch (error) {
      if (token !== this.latest || !panel.isOpen()) return;
      const message = this.describeFailure(error);
      panel.post({ type: "analysisError", message });
      if (error instanceof WorkerCrashedError) notifier.error(message);
    } finally {
      this.outstanding -= 1;
      if (this.outstanding === 0) panel.post({ type: "busy", busy: false });
    }
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
