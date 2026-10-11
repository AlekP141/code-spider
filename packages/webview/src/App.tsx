import type { NodeId } from "@code-spider/core/types";
import { useCallback, useEffect, useMemo, useReducer } from "react";
import { canRefresh, showsChangeDot } from "./app-refresh.js";
import { createAppState, isWorking, reduceApp } from "./app-state.js";
import { DEFAULT_EDGE_STYLE, type EdgeStyle } from "./edge-style.js";
import { GraphView } from "./graph/GraphView.js";
import { expandMessage, refreshMessage } from "./graph/jump.js";
import type { NodeActions } from "./graph/node-context.js";
import { useGraphLayout } from "./graph/use-layout.js";
import { isExtensionMessage } from "./messages.js";
import { Toolbar } from "./toolbar/Toolbar.js";
import { useSpacingControl } from "./toolbar/use-spacing-control.js";
import { useDelayedFlag } from "./use-delayed-flag.js";
import { usePersistedView } from "./use-persisted-view.js";
import { useWalkTimers } from "./use-walk-timers.js";
import { getSavedState, postToExtension } from "./vscode-api.js";
import type { Point } from "./view/types.js";
import { canGoBack } from "./view/view-state.js";

/** Work shorter than this never shows a spinner (perf note). */
export const SPINNER_DELAY_MS = 500;

export function App() {
  const [state, dispatch] = useReducer(reduceApp, undefined, () =>
    createAppState(getSavedState()),
  );
  const { tidy } = useGraphLayout(state, dispatch);
  const onColumnGap = useSpacingControl(dispatch, tidy);
  usePersistedView(state.view);
  useWalkTimers(state, dispatch);
  const working = isWorking(state);
  const spinner = useDelayedFlag(working, SPINNER_DELAY_MS);
  const edgeStyle = state.view.edgeStyle ?? DEFAULT_EDGE_STYLE;
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

  const onBack = useCallback(() => dispatch({ type: "back" }), []);

  const refreshable = canRefresh(state);
  const onRefresh = useCallback(() => {
    if (!refreshable || !graph) return;
    dispatch({ type: "refreshStarted" });
    postToExtension(refreshMessage(graph));
  }, [refreshable, graph]);

  const onEdgeStyle = useCallback((value: EdgeStyle) => {
    dispatch({ type: "edgeStyleChanged", value });
    postToExtension({ type: "setEdgeStyle", value });
  }, []);

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
      <Toolbar
        canBack={canGoBack(state.view) && !working}
        canTidy={graph !== undefined}
        canRefresh={refreshable}
        changedSince={showsChangeDot(state)}
        columnGap={state.view.columnGap}
        edgeStyle={edgeStyle}
        onBack={onBack}
        onTidy={tidy}
        onRefresh={onRefresh}
        onColumnGap={onColumnGap}
        onEdgeStyle={onEdgeStyle}
      />
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
            columnGap={state.view.columnGap}
            edgeStyle={edgeStyle}
            fit={state.fit}
            ui={{ ...state, busy: working }}
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
