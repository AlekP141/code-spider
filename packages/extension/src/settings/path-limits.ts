import type { PathLimits } from "@code-spider/core";

export const DEFAULT_PATH_TIME_LIMIT_SECONDS = 60;
export const MIN_PATH_TIME_LIMIT_SECONDS = 5;
export const MAX_PATH_TIME_LIMIT_SECONDS = 3600;
export const DEFAULT_PATH_MAX_BOXES = 200;
export const MIN_PATH_MAX_BOXES = 10;
export const MAX_PATH_MAX_BOXES = 2000;

function clamped(raw: unknown, fallback: number, min: number, max: number) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

export function normaliseTimeLimitSeconds(raw: unknown): number {
  return clamped(
    raw,
    DEFAULT_PATH_TIME_LIMIT_SECONDS,
    MIN_PATH_TIME_LIMIT_SECONDS,
    MAX_PATH_TIME_LIMIT_SECONDS,
  );
}

export function normaliseMaxBoxes(raw: unknown): number {
  return clamped(
    raw,
    DEFAULT_PATH_MAX_BOXES,
    MIN_PATH_MAX_BOXES,
    MAX_PATH_MAX_BOXES,
  );
}

export function pathLimits(
  timeLimitSeconds: unknown,
  maxBoxes: unknown,
): PathLimits {
  return {
    timeLimitMs: normaliseTimeLimitSeconds(timeLimitSeconds) * 1000,
    maxBoxes: normaliseMaxBoxes(maxBoxes),
  };
}
