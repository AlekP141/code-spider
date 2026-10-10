import { useCallback, useEffect, useRef } from "react";
import type { LocalAction } from "../app-state.js";
import { postToExtension } from "../vscode-api.js";
import { createSpacingControl, type SpacingControl } from "./spacing-control.js";

export function useSpacingControl(
  dispatch: (action: LocalAction) => void,
  tidy: () => void,
): (value: number) => void {
  const control = useRef<SpacingControl | undefined>(undefined);

  useEffect(() => {
    const created = createSpacingControl({
      dispatch,
      tidy,
      post: postToExtension,
    });
    control.current = created;
    return () => created.dispose();
  }, [dispatch, tidy]);

  return useCallback((value: number) => control.current?.change(value), []);
}
