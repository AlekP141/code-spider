import { ts } from "ts-morph";

export type StopReason = "cancelled" | "time";

export interface StopSignal {
  isRequested(): boolean;
  reason(): StopReason | undefined;
}

export class SearchStopped extends Error {
  override name = "SearchStopped";
}

export function createStopSignal(
  flag: Int32Array,
  timeLimitMs: number,
  now: () => number = Date.now,
): StopSignal {
  const deadline = now() + timeLimitMs;
  const reason = (): StopReason | undefined => {
    if (Atomics.load(flag, 0) !== 0) return "cancelled";
    return now() >= deadline ? "time" : undefined;
  };
  return { isRequested: () => reason() !== undefined, reason };
}

export function cancellationToken(signal: StopSignal): ts.CancellationToken {
  return {
    isCancellationRequested: () => signal.isRequested(),
    throwIfCancellationRequested() {
      if (signal.isRequested()) throw new ts.OperationCanceledException();
    },
  };
}
