import type { GraphNode } from "@code-spider/core/types";
import {
  CODE_PADDING_Y,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  MAX_CODE_LINES,
  MIN_CODE_LINES,
} from "./constants.js";

type Sized = Pick<GraphNode, "lineCount" | "codePreview">;

export function codeLines(lineCount: number): number {
  return Math.min(MAX_CODE_LINES, Math.max(MIN_CODE_LINES, lineCount));
}

/** Chips (external, unknown, module) carry no source, so they have no code region. */
export function hasCodeRegion(node: Pick<GraphNode, "codePreview">): boolean {
  return node.codePreview !== "";
}

export function codeRegionHeight(node: Sized): number {
  if (!hasCodeRegion(node)) return 0;
  return codeLines(node.lineCount) * LINE_HEIGHT + 2 * CODE_PADDING_Y;
}

/** Pure arithmetic, available before ELK runs; never measured from the DOM. */
export function nodeHeight(node: Sized): number {
  return HEADER_HEIGHT + codeRegionHeight(node);
}
