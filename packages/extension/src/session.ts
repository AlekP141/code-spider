import { basename } from "node:path";
import type { ChangeTracker } from "./changes.js";
import { positionToOffset } from "./positions.js";
import type {
  AnalysisPort,
  IndexingIndicator,
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

/** What the panel currently shows; click-to-jump resolves ids against it. */
export type CurrentGraph = FocusResult;

export type SessionDeps = {
  worker: AnalysisPort;
  panel: PanelPort;
  notifier: Notifier;
  indexing: IndexingIndicator;
  changes: ChangeTracker;
  maxHeapMb: () => number;
};

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
    const token = ++this.latest;
    this.outstanding += 1;
    panel.post({ type: "busy", busy: true });
    try {
      const offset = positionToOffset(
        request.text,
        request.line,
        request.character,
      );
      const changedFiles = [...new Set([...changes.drain(), request.file])];
      const result = await worker.focus(request.file, offset, changedFiles);
      if (token !== this.latest) return;
      this.graph = result;
      panel.post({ type: "slice", slice: result.slice });
    } catch (error) {
      if (token !== this.latest) return;
      const message = this.describeFailure(error);
      panel.post({ type: "analysisError", message });
      if (error instanceof WorkerCrashedError) notifier.error(message);
    } finally {
      this.outstanding -= 1;
      if (this.outstanding === 0) panel.post({ type: "busy", busy: false });
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
