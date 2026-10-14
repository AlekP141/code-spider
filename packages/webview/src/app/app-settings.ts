import type { AppState } from "./app-state.js";
import { normaliseColumnGap } from "../settings/column-gap.js";
import { normaliseDiffMode } from "../settings/diff-mode.js";
import {
  DEFAULT_EDGE_STYLE,
  normaliseEdgeStyle,
} from "../settings/edge-style.js";
import type { ExtensionToWebview } from "../host/protocol.js";
import { withTestVisibility } from "./app-test-visibility.js";

type SettingsMessage = Extract<ExtensionToWebview, { type: "settings" }>;

export function withColumnGap(state: AppState, raw: number): AppState {
  const columnGap = normaliseColumnGap(raw);
  if (columnGap === state.view.columnGap) return state;
  return { ...state, view: { ...state.view, columnGap } };
}

export function withEdgeStyle(state: AppState, raw: unknown): AppState {
  const edgeStyle = normaliseEdgeStyle(raw);
  if (edgeStyle === (state.view.edgeStyle ?? DEFAULT_EDGE_STYLE)) return state;
  return { ...state, view: { ...state.view, edgeStyle } };
}

export function withDiffMode(state: AppState, raw: unknown): AppState {
  const diffMode = normaliseDiffMode(raw);
  return diffMode === state.diffMode ? state : { ...state, diffMode };
}

/** Only the first `settings` after each load applies; it never runs Tidy. */
export function applySettings(
  state: AppState,
  message: SettingsMessage,
): AppState {
  if (state.settingsApplied) return state;
  const gapApplied = withColumnGap(state, message.columnGap);
  const styleApplied = withEdgeStyle(gapApplied, message.edgeStyle);
  const diffApplied = withDiffMode(styleApplied, message.diffMode);
  return {
    ...withTestVisibility(diffApplied, message.testVisibility),
    settingsApplied: true,
  };
}
