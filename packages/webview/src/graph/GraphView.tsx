import type { NodeId } from "@code-spider/core/types";
import {
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useStore,
  type NodeTypes,
  type OnNodeDrag,
  type OnNodesChange,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { AppState, FitRequest } from "../app/app-state.js";
import type { EdgeStyle } from "../settings/edge-style.js";
import type { PathMark, WebviewToExtension } from "../host/protocol.js";
import type { GraphState, Point } from "../view/types.js";
import {
  codeLineAt,
  edgeClickMessage,
  nodeClickMessage,
} from "./jump.js";
import {
  applyLive,
  recordLive,
  type LivePositions,
} from "./viewport/live-positions.js";
import { canvasClassName, isZoomedOut } from "./viewport/lod.js";
import {
  NodeContext,
  type NodeActions,
  type NodeContextValue,
} from "./nodes/node-context.js";
import {
  doubleClickAction,
  justUnpinned,
  type LastUnpin,
} from "./nodes/node-controls.js";
import { SpiderNode } from "./nodes/SpiderNode.js";
import {
  toFlow,
  type SpiderFlowEdge,
  type SpiderFlowNode,
} from "./to-flow.js";
import {
  FIT_OPTIONS,
  FitOnRequest,
  RevealOnRequest,
} from "./viewport/viewport-requests.js";

/** Defined once: React Flow re-creates every node if this object changes. */
const nodeTypes: NodeTypes = { spider: SpiderNode };

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
};

/** Pointer travel in px before a press becomes a drag; below it, a click. */
const DRAG_THRESHOLD_PX = 4;

/** A single click waits this long, so a double click can cancel it. */
const CLICK_DELAY_MS = 200;

export type GraphViewProps = {
  graph: GraphState;
  /** The view's gap, used for labels when the graph has none of its own. */
  columnGap: number;
  edgeStyle: EdgeStyle;
  /** The extension's start mark; a box that is it shows tag A. */
  mark?: PathMark;
  fit: FitRequest;
  ui: Pick<
    AppState,
    "busy" | "loading" | "failures" | "entering" | "reveal" | "refreshing"
  >;
  actions: NodeActions;
  onPost: (message: WebviewToExtension) => void;
  onDragStop: (positions: Record<NodeId, Point>) => void;
};

/** The code line a click landed on; undefined outside the code. */
function clickedCodeLine(
  event: ReactMouseEvent,
  codePreview: string,
): number | undefined {
  const code = (event.target as Element).closest<HTMLElement>(".node-code");
  if (!code) return undefined;
  const rect = code.getBoundingClientRect();
  const zoom = rect.height / code.offsetHeight;
  return codeLineAt((event.clientY - rect.top) / zoom, codePreview);
}

const ENTERING_CLASS = "is-entering";

function withClass<T extends { className?: string }>(item: T): T {
  const className = [item.className, ENTERING_CLASS].join(" ").trim();
  return { ...item, className };
}

function GraphCanvas({
  graph,
  columnGap,
  edgeStyle,
  mark,
  fit,
  ui,
  actions,
  onPost,
  onDragStop,
}: GraphViewProps) {
  const zoomedOut = useStore((state) => isZoomedOut(state.transform[2]));
  const flow = useMemo(
    () => toFlow(graph, edgeStyle, { mark }),
    [graph, edgeStyle, mark],
  );
  const { generation, project } = graph;
  const { busy, loading, failures, entering, reveal, refreshing } = ui;
  const [live, setLive] = useState<LivePositions | undefined>(undefined);
  const enteringIds = useMemo(() => new Set(entering.ids), [entering.ids]);
  const nodes = useMemo(() => {
    const placed = applyLive(flow.nodes, live, generation);
    if (enteringIds.size === 0) return placed;
    return placed.map((node) =>
      enteringIds.has(node.id) ? withClass(node) : node,
    );
  }, [flow.nodes, live, generation, enteringIds]);
  const edges = useMemo(() => {
    if (enteringIds.size === 0) return flow.edges;
    return flow.edges.map((edge) =>
      enteringIds.has(edge.source) || enteringIds.has(edge.target)
        ? withClass(edge)
        : edge,
    );
  }, [flow.edges, enteringIds]);
  const nodeUi = useMemo(
    () => ({ busy, loading, refreshing }),
    [busy, loading, refreshing],
  );
  const { onExpand, onCollapse, onOpen, onClose } = actions;
  const lastUnpin = useRef<LastUnpin>(undefined);
  const onUnpin = useCallback<NodeActions["onUnpin"]>(
    (nodeId) => {
      lastUnpin.current = { nodeId, at: performance.now() };
      actions.onUnpin(nodeId);
    },
    [actions],
  );
  const context = useMemo<NodeContextValue>(
    () => ({ graph, ui: nodeUi, failures, onUnpin, onOpen, onClose }),
    [graph, nodeUi, failures, onUnpin, onOpen, onClose],
  );

  const onNodesChange = useCallback<OnNodesChange<SpiderFlowNode>>(
    (changes) => {
      const moved = changes.flatMap((change) =>
        change.type === "position" && change.dragging && change.position
          ? [[change.id, change.position] as const]
          : [],
      );
      if (moved.length === 0) return;
      setLive((previous) => recordLive(previous, generation, moved));
    },
    [generation],
  );

  const onNodeDragStop = useCallback<OnNodeDrag<SpiderFlowNode>>(
    (_event, _node, dragged) => {
      onDragStop(
        Object.fromEntries(dragged.map((node) => [node.id, node.position])),
      );
      setLive(undefined);
    },
    [onDragStop],
  );

  const pendingClick = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pendingClick.current), []);

  const onNodeClick = useCallback(
    (event: ReactMouseEvent, node: SpiderFlowNode) => {
      if (justUnpinned(lastUnpin.current, node.id, performance.now())) return;
      const line = clickedCodeLine(event, node.data.node.codePreview);
      clearTimeout(pendingClick.current);
      pendingClick.current = setTimeout(() => {
        if (line === undefined && node.data.open) return onClose(node.id);
        const message = nodeClickMessage(node.data.node, project, line);
        if (message) onPost(message);
        onOpen(node.id);
      }, CLICK_DELAY_MS);
    },
    [project, onPost, onOpen, onClose],
  );

  const onNodeDoubleClick = useCallback(
    (_event: unknown, node: SpiderFlowNode) => {
      clearTimeout(pendingClick.current);
      if (justUnpinned(lastUnpin.current, node.id, performance.now())) return;
      const action = doubleClickAction(node.data.node, graph, nodeUi);
      if (action === "expand") onExpand(node.id);
      if (action === "collapse") onCollapse(node.id);
    },
    [graph, nodeUi, onExpand, onCollapse],
  );

  const onEdgeClick = useCallback(
    (_event: unknown, edge: SpiderFlowEdge) =>
      onPost(edgeClickMessage(edge.id, project)),
    [project, onPost],
  );

  const labelGap = graph.columnGap ?? columnGap;
  const canvasStyle = useMemo(
    () => ({ "--column-gap": `${labelGap}px` }) as CSSProperties,
    [labelGap],
  );

  return (
    <div className={canvasClassName(zoomedOut)} style={canvasStyle}>
      <NodeContext.Provider value={context}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          fitViewOptions={FIT_OPTIONS}
          minZoom={0.1}
          nodesConnectable={false}
          nodeDragThreshold={DRAG_THRESHOLD_PX}
          nodeClickDistance={DRAG_THRESHOLD_PX}
          selectNodesOnDrag={false}
          zoomOnDoubleClick={false}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeClick={onEdgeClick}
        >
          <FitOnRequest fit={fit} />
          <RevealOnRequest reveal={reveal} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </NodeContext.Provider>
    </div>
  );
}

/** The provider puts the store above the canvas element, which reads the zoom. */
export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
