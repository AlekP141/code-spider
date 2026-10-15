import type { NodeId } from "@code-spider/core/types";
import { useCallback, useEffect, useMemo, useReducer } from "react";
import { canRefresh, showsChangeDot } from "./app/app-refresh.js";
import { createAppState, reduceApp } from "./app/app-state.js";
import { isWorking } from "./app/app-working.js";
import type { DiffMode } from "./settings/diff-mode.js";
import { DEFAULT_EDGE_STYLE, type EdgeStyle } from "./settings/edge-style.js";
import type { TestVisibility } from "./settings/test-visibility.js";
import { GraphView } from "./graph/GraphView.js";
import { expandMessage, refreshMessage } from "./graph/jump.js";
import type { NodeActions } from "./graph/nodes/node-context.js";
import { useGraphLayout } from "./graph/layout/use-layout.js";
import { isExtensionMessage } from "./host/messages.js";
import { PathOverlay } from "./path/PathOverlay.js";
import { pathSummaryText } from "./path/path-text.js";
import { Toolbar } from "./toolbar/Toolbar.js";
import { useSpacingControl } from "./toolbar/use-spacing-control.js";
import { useDelayedFlag } from "./app/use-delayed-flag.js";
import { usePersistedView } from "./app/use-persisted-view.js";
import { useWalkTimers } from "./app/use-walk-timers.js";
import { getSavedState, postToExtension } from "./host/vscode-api.js";
import { hiddenIds, visibleGraph } from "./view/test-visibility.js";
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
  const delayed = useDelayedFlag(working, SPINNER_DELAY_MS);
  const spinner = delayed && state.pathSearch === undefined;
  const edgeStyle = state.view.edgeStyle ?? DEFAULT_EDGE_STYLE;
  const graph = state.view.current;
  const hidden = useMemo(
    () => (graph ? hiddenIds(graph, state.testVisibility) : undefined),
    [graph, state.testVisibility],
  );
  const shown = useMemo(
    () => (graph && hidden ? visibleGraph(graph, hidden) : undefined),
    [graph, hidden],
  );
  const pathSummary = useMemo(
    () => (graph ? pathSummaryText(graph) : undefined),
    [graph],
  );
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
      onOpen: (nodeId) => dispatch({ type: "nodeOpened", nodeId }),
      onClose: (nodeId) => dispatch({ type: "nodeClosed", nodeId }),
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

  const onDiffMode = useCallback((value: DiffMode) => {
    dispatch({ type: "diffModeChanged", value });
    postToExtension({ type: "setDiffMode", value });
  }, []);

  const onTestVisibility = useCallback((value: TestVisibility) => {
    dispatch({ type: "testVisibilityChanged", value });
    postToExtension({ type: "setTestVisibility", value });
  }, []);

  const onCancelPath = useCallback((id: number) => {
    dispatch({ type: "pathCancelRequested" });
    postToExtension({ type: "cancelPath", id });
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
        diffMode={state.diffMode}
        testVisibility={state.testVisibility}
        hiddenTests={hidden?.size ?? 0}
        pathSummary={pathSummary}
        onBack={onBack}
        onTidy={tidy}
        onRefresh={onRefresh}
        onColumnGap={onColumnGap}
        onEdgeStyle={onEdgeStyle}
        onDiffMode={onDiffMode}
        onTestVisibility={onTestVisibility}
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
        {state.pathSearch ? (
          <PathOverlay
            search={state.pathSearch}
            cancelling={state.cancelling}
            onCancel={onCancelPath}
          />
        ) : null}
        {shown ? (
          <GraphView
            graph={shown}
            columnGap={state.view.columnGap}
            edgeStyle={edgeStyle}
            mark={state.pathStart}
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
