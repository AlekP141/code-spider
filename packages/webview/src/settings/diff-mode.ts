export const DIFF_MODES = ["uncommitted", "pr"] as const;
export type DiffMode = (typeof DIFF_MODES)[number];
export const DEFAULT_DIFF_MODE: DiffMode = "uncommitted";

export function isDiffMode(raw: unknown): raw is DiffMode {
  return DIFF_MODES.some((mode) => mode === raw);
}

export function normaliseDiffMode(raw: unknown): DiffMode {
  return isDiffMode(raw) ? raw : DEFAULT_DIFF_MODE;
}
