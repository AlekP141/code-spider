import type { GraphNode } from "@code-spider/core/types";
import { Fragment, type MouseEvent } from "react";
import { splitCodeLines } from "./code-lines.js";
import {
  CODE_PADDING_Y,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  MAX_CODE_LINES,
} from "../constants.js";
import type { NodeActions } from "./node-context.js";
import { codeRegionHeight, hasCodeRegion } from "./node-size.js";

export type NodeBoxProps = {
  node: GraphNode;
  isFocus: boolean;
  pinned?: boolean;
  open?: boolean;
  loading?: boolean;
  failure?: string;
  onUnpin?: NodeActions["onUnpin"];
  onOpen?: NodeActions["onOpen"];
  onClose?: NodeActions["onClose"];
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5.5 2.5 11 8l-5.5 5.5-1.4-1.4L8.2 8 4.1 3.9z"
        transform={open ? "rotate(90 8 8)" : undefined}
      />
    </svg>
  );
}

function Markers({
  node,
  pinned,
  open,
  loading,
  onUnpin,
  onOpen,
  onClose,
}: Pick<
  NodeBoxProps,
  "pinned" | "loading" | "onUnpin" | "onOpen" | "onClose"
> & {
  node: GraphNode;
  open: boolean;
}) {
  const hasCode = hasCodeRegion(node);
  if (!pinned && !loading && !hasCode) return null;
  const label = open ? "Hide code" : "Show code";
  return (
    <span className="node-controls nodrag" onClick={stop} onDoubleClick={stop}>
      {pinned ? (
        <button
          type="button"
          className="node-control"
          title="Unpin"
          aria-label="Unpin"
          onClick={() => onUnpin?.(node.id)}
        >
          <PinIcon />
        </button>
      ) : null}
      {loading ? (
        <span className="node-spinner" role="status" aria-label="Loading" />
      ) : null}
      {hasCode ? (
        <button
          type="button"
          className="node-control"
          title={label}
          aria-label={label}
          onClick={() => (open ? onClose : onOpen)?.(node.id)}
        >
          <ChevronIcon open={open} />
        </button>
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
  open = false,
  loading,
  failure,
  onUnpin,
  onOpen,
  onClose,
}: NodeBoxProps) {
  const showsCode = open && hasCodeRegion(node);
  const classes = ["node-box", `kind-${node.kind}`];
  if (isFocus) classes.push("is-focus");
  if (node.change) classes.push(`change-${node.change}`);
  classes.push(showsCode ? "is-open" : "is-closed");
  const clipped = node.lineCount > MAX_CODE_LINES;

  return (
    <>
      {node.isAsync ? <span className="node-async">async</span> : null}
      <div className={classes.join(" ")}>
        <div className="node-header" style={{ height: HEADER_HEIGHT }}>
          <span className="node-name" title={nameTitle(node)}>
            {node.name}
          </span>
          <span className="node-input" title={node.inputType || undefined}>
            {node.inputType}
          </span>
          <Markers
            node={node}
            pinned={pinned}
            open={showsCode}
            loading={loading}
            onUnpin={onUnpin}
            onOpen={onOpen}
            onClose={onClose}
          />
        </div>
        {showsCode ? (
          <pre
            className={clipped ? "node-code is-clipped" : "node-code"}
            style={{
              height: codeRegionHeight(node),
              lineHeight: `${LINE_HEIGHT}px`,
              padding: `${CODE_PADDING_Y}px 8px`,
            }}
          >
            {splitCodeLines(node.codePreview).map((line, index) => (
              <Fragment key={index}>
                {index > 0 ? "\n" : null}
                {line.indent}
                {line.text === "" ? null : (
                  <span className="code-text">{line.text}</span>
                )}
              </Fragment>
            ))}
          </pre>
        ) : null}
      </div>
      {failure ? (
        <div className="node-failure" role="alert" title={failure}>
          {failure}
        </div>
      ) : null}
    </>
  );
}
