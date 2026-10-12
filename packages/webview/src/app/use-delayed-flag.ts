import { useEffect, useState } from "react";
import { DelayedFlag } from "./delayed-flag.js";

export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const flag = new DelayedFlag(delayMs, setShown);
    flag.set(active);
    return () => {
      flag.dispose();
      setShown(false);
    };
  }, [active, delayMs]);

  return shown;
}
