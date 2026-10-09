import { useEffect, useReducer } from "react";
import { initialState, reduceMessage } from "./app-state.js";
import { isExtensionMessage } from "./messages.js";
import { postToExtension } from "./vscode-api.js";

export function App() {
  const [state, dispatch] = useReducer(reduceMessage, initialState);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isExtensionMessage(event.data)) dispatch(event.data);
    };
    window.addEventListener("message", onMessage);
    postToExtension({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="status">
      <h1>Code Spider</h1>
      {state.slice ? (
        <p>Received a graph for {state.slice.focusId}.</p>
      ) : (
        <p>Place the cursor in a function and run Code Spider: Show Graph.</p>
      )}
    </main>
  );
}
