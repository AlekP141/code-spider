import { parentPort } from "node:worker_threads";
import { createWorkerHandler } from "./worker/handler.js";
import type { WorkerRequest } from "./worker/protocol.js";

const port = parentPort;
if (!port) throw new Error("worker.ts must run inside a worker thread");

const handle = createWorkerHandler();
port.on("message", (request: WorkerRequest) => {
  port.postMessage(handle(request));
});
