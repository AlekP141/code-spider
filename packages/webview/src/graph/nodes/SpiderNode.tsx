import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import { useContext, useEffect } from "react";
import { NodeBox } from "./NodeBox.js";
import { NodeLabels } from "./NodeLabels.js";
import { NodeContext } from "./node-context.js";
import { nodeControl } from "./node-controls.js";
import type { SpiderFlowNode } from "../to-flow.js";

/** Suppliers sit left of consumers, so edges leave on the right and enter on the left. */
export function SpiderNode({ id, data }: NodeProps<SpiderFlowNode>) {
  const context = useContext(NodeContext);
  const updateNodeInternals = useUpdateNodeInternals();
  const { routeHandles } = data;
  useEffect(() => {
    if (routeHandles) updateNodeInternals(id);
  }, [id, routeHandles, updateNodeInternals]);
  const controls = context && {
    pinned: data.pinned,
    loading: nodeControl(data.node, context.graph, context.ui) === "loading",
    failure: context.failures[data.node.id]?.message,
    onUnpin: context.onUnpin,
    onOpen: context.onOpen,
    onClose: context.onClose,
  };
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <NodeBox
        node={data.node}
        isFocus={data.isFocus}
        open={data.open}
        onRoute={data.onRoute}
        routeTag={data.tag}
        marked={data.marked}
        {...controls}
      />
      <NodeLabels lines={data.labels} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
      {routeHandles ? (
        <>
          <Handle
            id="source-left"
            type="source"
            position={Position.Left}
            isConnectable={false}
          />
          <Handle
            id="target-right"
            type="target"
            position={Position.Right}
            isConnectable={false}
          />
        </>
      ) : null}
    </>
  );
}
