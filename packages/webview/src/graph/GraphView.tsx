import type { GraphSlice } from "@code-spider/core";
import { Controls, MarkerType, ReactFlow, type NodeTypes } from "@xyflow/react";
import type { WebviewToExtension } from "../protocol.js";
import { edgeClickMessage, nodeClickMessage } from "./jump.js";
import { SpiderNode } from "./SpiderNode.js";
import { useLayout } from "./use-layout.js";

/** Defined once: React Flow re-creates every node if this object changes. */
const nodeTypes: NodeTypes = { spider: SpiderNode };

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
};

export type GraphViewProps = {
  slice: GraphSlice;
  onJump: (message: WebviewToExtension) => void;
};

export function GraphView({ slice, onJump }: GraphViewProps) {
  const { laid, error } = useLayout(slice);

  if (error) {
    return <p className="status">Could not lay out the graph: {error}</p>;
  }
  if (!laid) return null;

  return (
    <div className="graph-canvas">
      <ReactFlow
        key={laid.key}
        nodes={laid.nodes}
        edges={laid.edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.1}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_event, node) => {
          const message = nodeClickMessage(node.data.node);
          if (message) onJump(message);
        }}
        onEdgeClick={(_event, edge) => onJump(edgeClickMessage(edge.id))}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
