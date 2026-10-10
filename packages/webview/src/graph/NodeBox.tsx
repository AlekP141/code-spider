import type { GraphNode } from "@code-spider/core/types";
import type { MouseEvent } from "react";
import {
  CODE_PADDING_Y,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  MAX_CODE_LINES,
} from "./constants.js";
import type { NodeActions } from "./node-context.js";
import type { NodeControl } from "./node-controls.js";
import { codeRegionHeight, hasCodeRegion } from "./node-size.js";

export type NodeBoxProps = {
  node: GraphNode;
  isFocus: boolean;
  pinned?: boolean;
  control?: NodeControl;
  failure?: string;
  actions?: NodeActions;
};

function nameTitle(node: GraphNode): string {
  return node.file === "" ? node.name : `${node.name} (${node.file})`;
}

function stop(event: MouseEvent): void {
  event.stopPropagation();
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.7 1.3 14.7 5.3 13.3 6.7 12.6 6 9.9 8.7l.4 3-1.4 1.4L6.3 10.5 2.7 14.1 1.9 13.3 5.5 9.7 2.9 7.1 4.3 5.7l3 .4L10 3.4 9.3 2.7z"
      />
    </svg>
  );
}

function ControlButton({
  title,
  label,
  disabled,
  onClick,
}: {
  title: string;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="node-control"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Controls({
  node,
  pinned,
  control,
  actions,
}: Pick<NodeBoxProps, "pinned" | "control" | "actions"> & {
  node: GraphNode;
}) {
  const expandable = control === "expand" || control === "expandDisabled";
  if (!pinned && (control === undefined || control === "none")) return null;
  return (
    <span className="node-controls nodrag" onClick={stop} onDoubleClick={stop}>
      {pinned ? (
        <button
          type="button"
          className="node-control node-pin"
          title="Unpin"
          aria-label="Unpin"
          onClick={() => actions?.onUnpin(node.id)}
        >
          <PinIcon />
        </button>
      ) : null}
      {expandable ? (
        <ControlButton
          title="Expand"
          label="+"
          disabled={control === "expandDisabled"}
          onClick={() => actions?.onExpand(node.id)}
        />
      ) : null}
      {control === "collapse" ? (
        <ControlButton
          title="Collapse"
          label={"−"}
          onClick={() => actions?.onCollapse(node.id)}
        />
      ) : null}
      {control === "loading" ? (
        <span className="node-spinner" role="status" aria-label="Loading" />
      ) : null}
    </span>
  );
}

/**
 * Pure markup for one node. Heights come from the same constants the layout
 * uses, so the box fills exactly the space ELK reserved for it.
 */
export function NodeBox({
  node,
  isFocus,
  pinned,
  control,
  failure,
  actions,
}: NodeBoxProps) {
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
        <Controls
          node={node}
          pinned={pinned}
          control={control}
          actions={actions}
        />
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
      {failure ? (
        <div className="node-failure" role="alert" title={failure}>
          {failure}
        </div>
      ) : null}
    </div>
  );
}
