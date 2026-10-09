import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeBox } from "./NodeBox.js";
import type { SpiderFlowNode } from "./to-flow.js";

/** Suppliers sit left of consumers, so edges leave on the right and enter on the left. */
export function SpiderNode({ data }: NodeProps<SpiderFlowNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <NodeBox node={data.node} isFocus={data.isFocus} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}
