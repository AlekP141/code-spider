import type { EdgeType, NodeId } from "../types.js";

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function makeNodeId(relPath: string, name: string, index = 0): NodeId {
  const suffix = index > 0 ? `~${index}` : "";
  return `${toPosixPath(relPath)}#${name}${suffix}`;
}

export function edgeId(from: NodeId, to: NodeId, kind: EdgeType): string {
  const base = `${from}->${to}`;
  return kind === "call" ? base : `${base}#${kind}`;
}

export function parseNodeId(id: NodeId): {
  file: string;
  name: string;
  index: number;
} {
  const hash = id.lastIndexOf("#");
  if (hash === -1) throw new Error(`Malformed NodeId (no '#'): ${id}`);

  const file = id.slice(0, hash);
  const rest = id.slice(hash + 1);
  if (rest.length === 0)
    throw new Error(`Malformed NodeId (empty name): ${id}`);

  const tilde = rest.lastIndexOf("~");
  if (tilde === -1) return { file, name: rest, index: 0 };

  const index = Number(rest.slice(tilde + 1));
  if (!Number.isInteger(index))
    throw new Error(`Malformed NodeId (bad index): ${id}`);
  return { file, name: rest.slice(0, tilde), index };
}
