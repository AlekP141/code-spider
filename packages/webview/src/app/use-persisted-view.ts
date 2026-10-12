import { useEffect, useRef } from "react";
import { TrailingDebounce } from "./debounce.js";
import { saveState } from "../host/vscode-api.js";
import type { ViewState } from "../view/types.js";

export const PERSIST_DELAY_MS = 250;

/**
 * Saves the view with the webview's `setState` after it has stopped changing.
 * Drags live in the canvas until they end, so a half-finished drag is never
 * saved. The banner, `busy`, `indexing` and requests in flight are not part of
 * the view.
 */
export function usePersistedView(view: ViewState): void {
  const debounce = useRef<TrailingDebounce<ViewState> | undefined>(undefined);

  useEffect(() => {
    const created = new TrailingDebounce<ViewState>(
      PERSIST_DELAY_MS,
      saveState,
    );
    debounce.current = created;
    return () => created.dispose();
  }, []);

  useEffect(() => {
    debounce.current?.push(view);
  }, [view]);
}
