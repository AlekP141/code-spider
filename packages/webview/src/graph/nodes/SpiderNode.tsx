import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useContext } from "react";
import { NodeBox } from "./NodeBox.js";
import { NodeLabels } from "./NodeLabels.js";
import { NodeContext } from "./node-context.js";
import { nodeControl } from "./node-controls.js";
import type { SpiderFlowNode } from "../to-flow.js";

/** Suppliers sit left of consumers, so edges leave on the right and enter on the left. */
export function SpiderNode({ data }: NodeProps<SpiderFlowNode>) {
  const context = useContext(NodeContext);
  const controls = context && {
    pinned: data.pinned,
    loading: nodeControl(data.node, context.graph, context.ui) === "loading",
    failure: context.failures[data.node.id]?.message,
    onUnpin: context.onUnpin,
  };
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <NodeBox
        node={data.node}
        isFocus={data.isFocus}
        open={data.open}
        {...controls}
      />
      <NodeLabels lines={data.labels} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}
