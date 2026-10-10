import type { NodeId } from "@code-spider/core/types";
import { useCallback, useEffect, useMemo, useReducer } from "react";
import { createAppState, reduceApp } from "./app-state.js";
import { GraphView } from "./graph/GraphView.js";
import { expandMessage } from "./graph/jump.js";
import type { NodeActions } from "./graph/node-context.js";
import { useGraphLayout } from "./graph/use-layout.js";
import { isExtensionMessage } from "./messages.js";
import { useDelayedFlag } from "./use-delayed-flag.js";
import { usePersistedView } from "./use-persisted-view.js";
import { useWalkTimers } from "./use-walk-timers.js";
import { getSavedState, postToExtension } from "./vscode-api.js";
import type { Point } from "./view/types.js";

/** Work shorter than this never shows a spinner (perf note). */
export const SPINNER_DELAY_MS = 500;

export function App() {
  const [state, dispatch] = useReducer(reduceApp, undefined, () =>
    createAppState(getSavedState()),
  );
  useGraphLayout(state, dispatch);
  usePersistedView(state.view);
  useWalkTimers(state, dispatch);
  const spinner = useDelayedFlag(state.busy, SPINNER_DELAY_MS);
  const graph = state.view.current;
  const project = graph?.project;
  const generation = graph?.generation;

  const actions = useMemo<NodeActions>(
    () => ({
      onExpand: (nodeId) => {
        if (project === undefined || generation === undefined) return;
        dispatch({ type: "expandStarted", nodeId });
        postToExtension(expandMessage(nodeId, project, generation));
      },
      onCollapse: (nodeId) => dispatch({ type: "collapsed", nodeId }),
      onUnpin: (nodeId) => dispatch({ type: "unpinned", nodeId }),
    }),
    [project, generation],
  );

  const onDragStop = useCallback(
    (positions: Record<NodeId, Point>) =>
      dispatch({ type: "dragStopped", positions }),
    [],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isExtensionMessage(event.data)) dispatch(event.data);
    };
    window.addEventListener("message", onMessage);
    postToExtension({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="app">
      {state.indexing ? (
        <div className="banner" role="status">
          Indexing the project so the first graph appears quickly...
        </div>
      ) : null}
      {state.error ? (
        <div className="banner banner-error" role="alert">
          {state.error}
        </div>
      ) : null}
      {spinner ? (
        <div className="spinner" role="status" aria-label="Analysing" />
      ) : null}
      <section className="content">
        {graph ? (
          <GraphView
            graph={graph}
            fit={state.fit}
            ui={state}
            actions={actions}
            onPost={postToExtension}
            onDragStop={onDragStop}
          />
        ) : (
          <p className="status">
            Place the cursor in a function and run Code Spider: Show Graph.
          </p>
        )}
      </section>
    </main>
  );
}
