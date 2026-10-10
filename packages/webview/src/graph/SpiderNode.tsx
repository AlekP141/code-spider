import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useContext } from "react";
import { NodeBox } from "./NodeBox.js";
import { NodeContext } from "./node-context.js";
import { nodeControl } from "./node-controls.js";
import type { SpiderFlowNode } from "./to-flow.js";

/** Suppliers sit left of consumers, so edges leave on the right and enter on the left. */
export function SpiderNode({ data }: NodeProps<SpiderFlowNode>) {
  const context = useContext(NodeContext);
  const controls = context && {
    pinned: data.pinned,
    control: nodeControl(data.node, context.graph, context.ui),
    failure: context.failures[data.node.id]?.message,
    actions: context.actions,
  };
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <NodeBox node={data.node} isFocus={data.isFocus} {...controls} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}
