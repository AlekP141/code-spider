export const COLUMN_GAP = {
  min: 32,
  max: 480,
  step: 16,
  default: 192,
} as const;

export function normaliseColumnGap(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return COLUMN_GAP.default;
  }
  const clamped = Math.min(COLUMN_GAP.max, Math.max(COLUMN_GAP.min, raw));
  return Math.round(clamped / COLUMN_GAP.step) * COLUMN_GAP.step;
}
