import type { LocalAction } from "../app-state.js";
import { TrailingDebounce } from "../debounce.js";
import type { WebviewToExtension } from "../protocol.js";

export const SPACING_DELAY_MS = 250;

export type SpacingControl = { change(value: number): void; dispose(): void };

/**
 * The slider takes effect at once but Tidy and the save wait until it stops
 * moving: Tidy reads the column gap after the render that follows the change.
 */
export function createSpacingControl(deps: {
  dispatch: (action: LocalAction) => void;
  tidy: () => void;
  post: (message: WebviewToExtension) => void;
  delayMs?: number;
}): SpacingControl {
  const settle = new TrailingDebounce<number>(
    deps.delayMs ?? SPACING_DELAY_MS,
    (value) => {
      deps.tidy();
      deps.post({ type: "setColumnGap", value });
    },
  );
  return {
    change(value) {
      deps.dispatch({ type: "columnGapChanged", value });
      settle.push(value);
    },
    dispose: () => settle.dispose(),
  };
}
