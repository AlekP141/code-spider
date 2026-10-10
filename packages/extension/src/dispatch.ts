import type { WebviewToExtension } from "@code-spider/webview/protocol";
import type { JumpMessage } from "./navigation.js";
import type { GraphSession } from "./session.js";

export interface JumpPort {
  handle(message: JumpMessage): Promise<void>;
}

export type Dispatch = (message: WebviewToExtension) => Promise<void>;

/**
 * `ready` belongs to the panel's gate. `refresh` is M3b, and `setColumnGap`
 * gets its store in a later task.
 */
export function createDispatcher(deps: {
  jumps: JumpPort;
  session: Pick<GraphSession, "focusNode" | "expand">;
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
      case "ready":
      case "refresh":
      case "setColumnGap":
        return;
    }
  };
}
