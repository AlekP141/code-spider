import type { AppState } from "./app-state.js";
import { normaliseColumnGap } from "../settings/column-gap.js";
import {
  DEFAULT_EDGE_STYLE,
  normaliseEdgeStyle,
} from "../settings/edge-style.js";
import type { ExtensionToWebview } from "../host/protocol.js";

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

/** Only the first `settings` after each load applies; it never runs Tidy. */
export function applySettings(
  state: AppState,
  message: SettingsMessage,
): AppState {
  if (state.settingsApplied) return state;
  const gapApplied = withColumnGap(state, message.columnGap);
  return {
    ...withEdgeStyle(gapApplied, message.edgeStyle),
    settingsApplied: true,
  };
}
