import type { GraphSlice } from "@code-spider/core/types";
import type { ExtensionToWebview } from "./protocol.js";

export type AppState = {
  centre: { slice: GraphSlice; project: string } | undefined;
  error: string | undefined;
  busy: boolean;
  indexing: boolean;
};

export const initialState: AppState = {
  centre: undefined,
  error: undefined,
  busy: false,
  indexing: false,
};

export function reduceMessage(
  state: AppState,
  message: ExtensionToWebview,
): AppState {
  switch (message.type) {
    case "slice":
      if (message.mode.kind !== "centre") return state;
      return {
        ...state,
        centre: { slice: message.slice, project: message.project },
        error: undefined,
      };
    case "analysisError":
      return { ...state, error: message.message };
    case "busy":
      return {
        ...state,
        busy: message.busy,
        error: message.busy ? undefined : state.error,
      };
    case "indexing":
      return { ...state, indexing: message.indexing };
    case "expandFailed":
    case "settings":
      return state;
  }
}
