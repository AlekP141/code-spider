import type { NodeId } from "./types.js";

export class NodeNotFoundError extends Error {
  constructor(
    message: string,
    readonly nodeId?: NodeId,
  ) {
    super(message);
    this.name = "NodeNotFoundError";
  }
}
