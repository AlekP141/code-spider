import type { NodeId, PathLimits } from "@code-spider/core";

export type Cancellable<T> =
  | { status: "cancelled" }
  | { status: "done"; value: T };

export interface PathRun<T> {
  result: Promise<Cancellable<T>>;
  cancel(): void;
}

export type FindPathArgs = {
  tsconfig: string;
  fromId: NodeId;
  toId: NodeId;
  limits: PathLimits;
  changedFiles: string[];
};

/** `send` gets the run's own 4-byte flag; cancelling stores 1 in it. */
export function startPathRun<T>(
  send: (cancel: SharedArrayBuffer) => Promise<T>,
  wasCancelled: (value: T) => boolean,
): PathRun<T> {
  const buffer = new SharedArrayBuffer(4);
  const flag = new Int32Array(buffer);
  const result = send(buffer).then(
    (value): Cancellable<T> =>
      wasCancelled(value) ? { status: "cancelled" } : { status: "done", value },
  );
  return { result, cancel: () => Atomics.store(flag, 0, 1) };
}
