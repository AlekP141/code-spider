export const DEFAULT_MAX_HEAP_MB = 8192;
export const MIN_MAX_HEAP_MB = 512;

export function normaliseHeapMb(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_MAX_HEAP_MB;
  }
  return Math.max(MIN_MAX_HEAP_MB, Math.floor(raw));
}
