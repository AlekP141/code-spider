import { useEffect, useReducer } from "react";
import { initialState, reduceMessage } from "./app-state.js";
import { GraphView } from "./graph/GraphView.js";
import { isExtensionMessage } from "./messages.js";
import { useDelayedFlag } from "./use-delayed-flag.js";
import { postToExtension } from "./vscode-api.js";

/** Work shorter than this never shows a spinner (perf note). */
export const SPINNER_DELAY_MS = 500;

export function App() {
  const [state, dispatch] = useReducer(reduceMessage, initialState);
  const spinner = useDelayedFlag(state.busy, SPINNER_DELAY_MS);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isExtensionMessage(event.data)) dispatch(event.data);
    };
    window.addEventListener("message", onMessage);
    postToExtension({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="app">
      {state.indexing ? (
        <div className="banner" role="status">
          Indexing the project so the first graph appears quickly...
        </div>
      ) : null}
      {state.error ? (
        <div className="banner banner-error" role="alert">
          {state.error}
        </div>
      ) : null}
      {spinner ? (
        <div className="spinner" role="status" aria-label="Analysing" />
      ) : null}
      <section className="content">
        {state.slice ? (
          <GraphView slice={state.slice} onJump={postToExtension} />
        ) : (
          <p className="status">
            Place the cursor in a function and run Code Spider: Show Graph.
          </p>
        )}
      </section>
    </main>
  );
}
