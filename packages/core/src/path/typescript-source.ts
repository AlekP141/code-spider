import { ts, type Project, type SourceFile } from "ts-morph";
import { callerHits, type CallerHit } from "../callers/callers.js";
import type { CallableDeclaration, FocusTarget } from "../focus/focus.js";
import {
  moduleIdOf,
  nodeIdOf,
  rangeOf,
  type BuildContext,
} from "../nodes/node-builder.js";
import { parseNodeId } from "../nodes/node-id.js";
import { isTestPath } from "../nodes/test-path.js";
import type { NodeId } from "../types.js";
import { targetFor } from "./ends.js";
import type { CallerSource, Link } from "./links.js";
import { cancellationToken, SearchStopped, type StopSignal } from "./signal.js";

/** The caller search over a ts-morph project, one climb per call. */
export class TypeScriptSource implements CallerSource {
  private readonly ctx: BuildContext;
  private readonly token: ts.CancellationToken;
  private readonly targets = new Map<NodeId, FocusTarget>();
  private readonly modules = new Map<NodeId, SourceFile>();
  private readonly declarationIds = new Map<CallableDeclaration, NodeId>();
  private readonly fileIds = new Map<SourceFile, NodeId>();

  constructor(
    private readonly project: Project,
    private readonly repoRoot: string,
    private readonly ends: { a: NodeId; b: NodeId },
    private readonly signal: StopSignal,
  ) {
    this.ctx = { repoRoot };
    this.token = cancellationToken(signal);
  }

  callersOf(id: NodeId): Link[] {
    const target = this.targetOf(id);
    if (!target) throw new Error(`Not a function: ${id}`);

    const links = new Map<string, Link>();
    try {
      for (const hit of callerHits(target.nameNode, this.token)) {
        this.addLink(links, id, hit);
        if (this.signal.isRequested()) throw new SearchStopped();
      }
    } catch (error) {
      if (error instanceof ts.OperationCanceledException) {
        throw new SearchStopped();
      }
      throw error;
    }
    return [...links.values()];
  }

  targetOf(id: NodeId): FocusTarget | undefined {
    const known = this.targets.get(id);
    if (known) return known;
    try {
      const target = targetFor(this.project, id, this.repoRoot);
      this.targets.set(id, target);
      return target;
    } catch {
      return undefined;
    }
  }

  moduleFileOf(id: NodeId): SourceFile | undefined {
    return this.modules.get(id);
  }

  private addLink(links: Map<string, Link>, climbed: NodeId, hit: CallerHit) {
    const consumer = this.consumerOf(hit);
    if (consumer === climbed || this.isDropped(consumer)) return;

    const key = `${consumer}|${hit.kind}`;
    if (links.has(key)) return;
    links.set(key, {
      supplier: climbed,
      consumer,
      kind: hit.kind,
      site: rangeOf(hit.site),
    });
    this.remember(consumer, hit);
  }

  private isDropped(consumer: NodeId): boolean {
    const { a, b } = this.ends;
    return (
      consumer !== a && consumer !== b && isTestPath(parseNodeId(consumer).file)
    );
  }

  private consumerOf({ caller, sourceFile }: CallerHit): NodeId {
    if (!caller) return this.moduleId(sourceFile);
    const known = this.declarationIds.get(caller.declaration);
    if (known) return known;
    const id = nodeIdOf(caller, this.ctx);
    this.declarationIds.set(caller.declaration, id);
    return id;
  }

  private moduleId(sourceFile: SourceFile): NodeId {
    const known = this.fileIds.get(sourceFile);
    if (known) return known;
    const id = moduleIdOf(sourceFile, this.ctx);
    this.fileIds.set(sourceFile, id);
    return id;
  }

  private remember(consumer: NodeId, { caller, sourceFile }: CallerHit) {
    if (caller) {
      if (!this.targets.has(consumer)) this.targets.set(consumer, caller);
    } else {
      this.modules.set(consumer, sourceFile);
    }
  }
}
