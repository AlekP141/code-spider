import "@xyflow/react/dist/style.css";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./graph/graph.css";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(<App />);
