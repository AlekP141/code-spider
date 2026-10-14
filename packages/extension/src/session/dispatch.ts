import type { WebviewToExtension } from "@code-spider/webview/protocol";
import type { ColumnGapStore } from "../settings/column-gap.js";
import type { DiffModeStore } from "../settings/diff-mode-store.js";
import type { EdgeStyleStore } from "../settings/edge-style-store.js";
import type { TestVisibilityStore } from "../settings/test-visibility-store.js";
import type { JumpMessage } from "./navigation.js";
import type { GraphSession } from "./session.js";

export interface JumpPort {
  handle(message: JumpMessage): Promise<void>;
}

export type Dispatch = (message: WebviewToExtension) => Promise<void>;

/** `ready` belongs to the panel's gate. */
export function createDispatcher(deps: {
  jumps: JumpPort;
  session: Pick<GraphSession, "focusNode" | "expand" | "refresh" | "recolour">;
  columnGap: Pick<ColumnGapStore, "set">;
  edgeStyle: Pick<EdgeStyleStore, "set">;
  diffMode: Pick<DiffModeStore, "set">;
  testVisibility: Pick<TestVisibilityStore, "set">;
}): Dispatch {
  return async (message) => {
    switch (message.type) {
      case "openInEditor":
      case "openCallSite":
        return deps.jumps.handle(message);
      case "focus":
        return deps.session.focusNode({
          project: message.project,
          nodeId: message.nodeId,
        });
      case "expand":
        return deps.session.expand({
          project: message.project,
          nodeId: message.nodeId,
          generation: message.generation,
        });
      case "refresh":
        return deps.session.refresh({
          project: message.project,
          generation: message.generation,
          focusId: message.focusId,
          expanded: message.expanded,
        });
      case "setColumnGap":
        return deps.columnGap.set(message.value);
      case "setEdgeStyle":
        return deps.edgeStyle.set(message.value);
      case "setDiffMode":
        await deps.diffMode.set(message.value);
        return deps.session.recolour();
      case "setTestVisibility":
        return deps.testVisibility.set(message.value);
      case "ready":
        return;
    }
  };
}
