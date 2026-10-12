import type { Rect, Size } from "../layout/placement.js";

export type Viewport = { x: number; y: number; zoom: number };

/** Screen pixels left clear around the revealed box. */
export const REVEAL_PADDING = 24;

/** A shift below this is rounding noise, not a pan worth making. */
const MIN_SHIFT = 0.5;

export function boundingRect(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The shift along one axis, in screen pixels, for a box spanning start..end. */
function shiftFor(
  start: number,
  end: number,
  area: number,
  padding: number,
): number {
  if (end - start > area - 2 * padding) return area / 2 - (start + end) / 2;
  if (start < padding) return padding - start;
  if (end > area - padding) return area - padding - end;
  return 0;
}

/**
 * The least pan that puts `rect` (flow coordinates) inside the visible area
 * (screen pixels) with `padding` clear; an axis the box does not fit on is
 * centred. Undefined when nothing needs to move.
 */
export function panToReveal(
  viewport: Viewport,
  size: Size,
  rect: Rect,
  padding: number = REVEAL_PADDING,
): Viewport | undefined {
  const left = rect.x * viewport.zoom + viewport.x;
  const top = rect.y * viewport.zoom + viewport.y;
  const dx = shiftFor(
    left,
    left + rect.width * viewport.zoom,
    size.width,
    padding,
  );
  const dy = shiftFor(
    top,
    top + rect.height * viewport.zoom,
    size.height,
    padding,
  );
  const moveX = Math.abs(dx) < MIN_SHIFT ? 0 : dx;
  const moveY = Math.abs(dy) < MIN_SHIFT ? 0 : dy;
  if (moveX === 0 && moveY === 0) return undefined;
  return { ...viewport, x: viewport.x + moveX, y: viewport.y + moveY };
}
