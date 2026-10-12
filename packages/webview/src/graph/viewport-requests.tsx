import { useReactFlow, useStoreApi } from "@xyflow/react";
import { useEffect, useRef } from "react";
import type { AppState, FitRequest } from "../app/app-state.js";
import { panToReveal } from "./pan-to-reveal.js";

export const FIT_OPTIONS = { padding: 0.2, maxZoom: 1 };

const REVEAL_PAN_MS = 200;

/** Refits whenever the app asks; the first fit is the `fitView` prop's. */
export function FitOnRequest({ fit }: { fit: FitRequest }) {
  const { fitView } = useReactFlow();
  const handled = useRef(fit.token);

  useEffect(() => {
    if (handled.current === fit.token) return;
    const frame = requestAnimationFrame(() => {
      handled.current = fit.token;
      void fitView({ ...FIT_OPTIONS, duration: fit.duration });
    });
    return () => cancelAnimationFrame(frame);
  }, [fit, fitView]);

  return null;
}

/** Pans just far enough to show newly added boxes; never zooms. */
export function RevealOnRequest({ reveal }: { reveal: AppState["reveal"] }) {
  const { getViewport, setViewport } = useReactFlow();
  const store = useStoreApi();
  const handled = useRef(reveal?.token);

  useEffect(() => {
    if (!reveal || handled.current === reveal.token) return;
    const frame = requestAnimationFrame(() => {
      handled.current = reveal.token;
      const { width, height } = store.getState();
      if (width === 0 || height === 0) return;
      const next = panToReveal(getViewport(), { width, height }, reveal.rect);
      if (next) void setViewport(next, { duration: REVEAL_PAN_MS });
    });
    return () => cancelAnimationFrame(frame);
  }, [reveal, store, getViewport, setViewport]);

  return null;
}
