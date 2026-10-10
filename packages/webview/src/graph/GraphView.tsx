import type { NodeId } from "@code-spider/core/types";
import {
  Controls,
  MarkerType,
  ReactFlow,
  type NodeTypes,
  type OnNodeDrag,
  type OnNodesChange,
} from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { AppState, FitRequest } from "../app-state.js";
import type { WebviewToExtension } from "../protocol.js";
import type { GraphState, Point } from "../view/types.js";
import { edgeClickMessage, nodeClickMessage } from "./jump.js";
import { applyLive, recordLive, type LivePositions } from "./live-positions.js";
import {
  NodeContext,
  type NodeActions,
  type NodeContextValue,
} from "./node-context.js";
import {
  doubleClickAction,
  justUnpinned,
  type LastUnpin,
} from "./node-controls.js";
import { SpiderNode } from "./SpiderNode.js";
import {
  toFlow,
  type SpiderFlowEdge,
  type SpiderFlowNode,
} from "./to-flow.js";
import {
  FIT_OPTIONS,
  FitOnRequest,
  RevealOnRequest,
} from "./viewport-requests.js";

/** Defined once: React Flow re-creates every node if this object changes. */
const nodeTypes: NodeTypes = { spider: SpiderNode };

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
};

/** Pointer travel in px before a press becomes a drag; below it, a click. */
const DRAG_THRESHOLD_PX = 4;

export type GraphViewProps = {
  graph: GraphState;
  fit: FitRequest;
  ui: Pick<AppState, "busy" | "loading" | "failures" | "entering" | "reveal">;
  actions: NodeActions;
  onPost: (message: WebviewToExtension) => void;
  onDragStop: (positions: Record<NodeId, Point>) => void;
};

const ENTERING_CLASS = "is-entering";

function withClass<T extends { className?: string }>(item: T): T {
  const className = [item.className, ENTERING_CLASS].join(" ").trim();
  return { ...item, className };
}

export function GraphView({
  graph,
  fit,
  ui,
  actions,
  onPost,
  onDragStop,
}: GraphViewProps) {
  const flow = useMemo(() => toFlow(graph), [graph]);
  const { generation, project } = graph;
  const { busy, loading, failures, entering, reveal } = ui;
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
  const nodeUi = useMemo(() => ({ busy, loading }), [busy, loading]);
  const { onExpand, onCollapse } = actions;
  const lastUnpin = useRef<LastUnpin>(undefined);
  const onUnpin = useCallback<NodeActions["onUnpin"]>(
    (nodeId) => {
      lastUnpin.current = { nodeId, at: performance.now() };
      actions.onUnpin(nodeId);
    },
    [actions],
  );
  const context = useMemo<NodeContextValue>(
    () => ({ graph, ui: nodeUi, failures, onUnpin }),
    [graph, nodeUi, failures, onUnpin],
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

  const onNodeClick = useCallback(
    (_event: unknown, node: SpiderFlowNode) => {
      if (justUnpinned(lastUnpin.current, node.id, performance.now())) return;
      const message = nodeClickMessage(node.data.node, project);
      if (message) onPost(message);
    },
    [project, onPost],
  );

  const onNodeDoubleClick = useCallback(
    (_event: unknown, node: SpiderFlowNode) => {
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

  return (
    <div className="graph-canvas">
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
