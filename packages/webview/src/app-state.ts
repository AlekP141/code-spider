import type { GraphSlice } from "@code-spider/core/types";
import type { ExtensionToWebview } from "./protocol.js";

export type AppState = {
  slice: GraphSlice | undefined;
  error: string | undefined;
  busy: boolean;
  indexing: boolean;
};

export const initialState: AppState = {
  slice: undefined,
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
      return { ...state, slice: message.slice, error: undefined };
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
  }
}
