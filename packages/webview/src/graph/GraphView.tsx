import type { NodeId } from "@code-spider/core/types";
import {
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type NodeTypes,
  type OnNodeDrag,
  type OnNodesChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FitRequest } from "../app-state.js";
import type { WebviewToExtension } from "../protocol.js";
import type { GraphState, Point } from "../view/types.js";
import { edgeClickMessage, nodeClickMessage } from "./jump.js";
import { applyLive, recordLive, type LivePositions } from "./live-positions.js";
import { SpiderNode } from "./SpiderNode.js";
import {
  toFlow,
  type SpiderFlowEdge,
  type SpiderFlowNode,
} from "./to-flow.js";

/** Defined once: React Flow re-creates every node if this object changes. */
const nodeTypes: NodeTypes = { spider: SpiderNode };

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
};

const FIT_OPTIONS = { padding: 0.2, maxZoom: 1 };

/** Pointer travel in px before a press becomes a drag; below it, a click. */
const DRAG_THRESHOLD_PX = 4;

/** Refits whenever the app asks; the first fit is the `fitView` prop's. */
function FitOnRequest({ fit }: { fit: FitRequest }) {
  const { fitView } = useReactFlow();
  const handled = useRef(fit.token);

  useEffect(() => {
    if (handled.current === fit.token) return;
    const frame = requestAnimationFrame(() => {
      handled.current = fit.token;
      void fitView({ ...FIT_OPTIONS, duration: fit.duration });
    });
    return () => cancelAnimationFrame(frame);
  }, [fit, fitView]);

  return null;
}

export type GraphViewProps = {
  graph: GraphState;
  fit: FitRequest;
  onPost: (message: WebviewToExtension) => void;
  onDragStop: (positions: Record<NodeId, Point>) => void;
};

export function GraphView({ graph, fit, onPost, onDragStop }: GraphViewProps) {
  const flow = useMemo(() => toFlow(graph), [graph]);
  const { generation, project } = graph;
  const [live, setLive] = useState<LivePositions | undefined>(undefined);
  const nodes = useMemo(
    () => applyLive(flow.nodes, live, generation),
    [flow.nodes, live, generation],
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
      const message = nodeClickMessage(node.data.node, project);
      if (message) onPost(message);
    },
    [project, onPost],
  );

  const onEdgeClick = useCallback(
    (_event: unknown, edge: SpiderFlowEdge) =>
      onPost(edgeClickMessage(edge.id, project)),
    [project, onPost],
  );

  return (
    <div className="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={flow.edges}
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
        onEdgeClick={onEdgeClick}
      >
        <FitOnRequest fit={fit} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
