import { LOD_ZOOM } from "./constants.js";

export function isZoomedOut(zoom: number): boolean {
  return zoom < LOD_ZOOM;
}

export function canvasClassName(zoomedOut: boolean): string {
  return zoomedOut ? "graph-canvas is-zoomed-out" : "graph-canvas";
}
