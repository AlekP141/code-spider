import type { GraphNode } from "@code-spider/core";
import {
  CODE_PADDING_Y,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  MAX_CODE_LINES,
} from "./constants.js";
import { codeRegionHeight, hasCodeRegion } from "./node-size.js";

export type NodeBoxProps = { node: GraphNode; isFocus: boolean };

function nameTitle(node: GraphNode): string {
  return node.file === "" ? node.name : `${node.name} (${node.file})`;
}

/**
 * Pure markup for one node. Heights come from the same constants the layout
 * uses, so the box fills exactly the space ELK reserved for it.
 */
export function NodeBox({ node, isFocus }: NodeBoxProps) {
  const classes = ["node-box", `kind-${node.kind}`];
  if (isFocus) classes.push("is-focus");
  const clipped = node.lineCount > MAX_CODE_LINES;

  return (
    <div className={classes.join(" ")}>
      <div className="node-header" style={{ height: HEADER_HEIGHT }}>
        <span className="node-name" title={nameTitle(node)}>
          {node.name}
        </span>
        {node.isAsync ? <span className="node-async">async</span> : null}
        <span className="node-input" title={node.inputType || undefined}>
          {node.inputType}
        </span>
      </div>
      {hasCodeRegion(node) ? (
        <pre
          className={clipped ? "node-code is-clipped" : "node-code"}
          style={{
            height: codeRegionHeight(node),
            lineHeight: `${LINE_HEIGHT}px`,
            padding: `${CODE_PADDING_Y}px 8px`,
          }}
        >
          {node.codePreview}
        </pre>
      ) : null}
    </div>
  );
}
