import type { GraphNode } from "@code-spider/core";
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import { vi } from "vitest";
import { ChangeTracker } from "../../src/changes.js";
import { JumpTable } from "../../src/jump-table.js";
import type { AnalysisPort, PanelPort } from "../../src/ports.js";
import { GraphSession } from "../../src/session.js";
import type { FocusResult } from "../../src/worker/protocol.js";

export const PROJECT = "/repo/tsconfig.json";

function fakeNode(id: string): GraphNode {
  const [file = "", name = ""] = id.split("#");
  return {
    id,
    kind: "function",
    name,
    file,
    range: { startLine: 3, startColumn: 1, endLine: 5, endColumn: 2 },
    inputType: "",
    returnType: "",
    isAsync: false,
    lineCount: 3,
    codePreview: "x",
  };
}

export function resultFor(
  focusId: string,
  otherIds: string[] = [],
): FocusResult {
  return {
    slice: {
      focusId,
      nodes: [focusId, ...otherIds].map(fakeNode),
      edges: [],
      truncated: false,
    },
    repoRoot: "/repo",
    tsconfig: PROJECT,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function setup(overrides: Partial<AnalysisPort> = {}) {
  const posted: ExtensionToWebview[] = [];
  const panel: PanelPort & { shown: number; open: boolean } = {
    shown: 0,
    open: true,
    show() {
      this.shown += 1;
      this.open = true;
    },
    isOpen() {
      return this.open;
    },
    post: (message) => posted.push(message),
  };
  const worker: AnalysisPort = {
    warm: vi.fn(async () => undefined),
    focus: vi.fn(async () => resultFor("src/a.ts#f")),
    sliceForNode: vi.fn(async (_tsconfig: string, nodeId: string) =>
      resultFor(nodeId),
    ),
    ...overrides,
  };
  const notifier = { warn: vi.fn(), error: vi.fn() };
  const indexing = { set: vi.fn() };
  const changes = new ChangeTracker();
  const jumps = new JumpTable();
  const session = new GraphSession({
    worker,
    panel,
    notifier,
    indexing,
    changes,
    maxHeapMb: () => 4096,
    jumps,
  });
  const types = () => posted.map((message) => message.type);
  return {
    session,
    panel,
    worker,
    notifier,
    indexing,
    changes,
    jumps,
    posted,
    types,
  };
}
