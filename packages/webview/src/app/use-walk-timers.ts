import { useEffect, useRef, type Dispatch } from "react";
import type { AppAction, AppState } from "./app-state.js";

export const FAILURE_MS = 4000;
export const ENTERING_MS = 300;

/** Expires a box's failure message and the fade-in class by dispatching. */
export function useWalkTimers(
  state: Pick<AppState, "failures" | "entering">,
  dispatch: Dispatch<AppAction>,
): void {
  const { failures, entering } = state;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    for (const [nodeId, { token }] of Object.entries(failures)) {
      const key = `${nodeId}\n${token}`;
      if (timers.current.has(key)) continue;
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          dispatch({ type: "failureExpired", nodeId, token });
        }, FAILURE_MS),
      );
    }
  }, [failures, dispatch]);

  useEffect(() => {
    if (entering.ids.length === 0) return;
    const timer = setTimeout(
      () => dispatch({ type: "enteringExpired", token: entering.token }),
      ENTERING_MS,
    );
    return () => clearTimeout(timer);
  }, [entering, dispatch]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);
}
