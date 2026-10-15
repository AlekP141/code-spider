import { MODULE_NAME } from "../nodes/node-builder.js";
import type { NodeId, Range } from "../types.js";

export type LinkKind = "call" | "jsx" | "passes";

export type Link = {
  supplier: NodeId;
  consumer: NodeId;
  kind: LinkKind;
  site: Range;
};

export interface CallerSource {
  /** One climb; throws SearchStopped to abandon it. */
  callersOf(id: NodeId): Link[];
}

export function isClimbable(id: NodeId): boolean {
  return !id.endsWith(`#${MODULE_NAME}`);
}

export function byId(a: NodeId, b: NodeId): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
