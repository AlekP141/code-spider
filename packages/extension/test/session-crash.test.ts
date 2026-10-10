import { describe, expect, it } from "vitest";
import type { FocusResult } from "../src/worker/protocol.js";
import { WorkerCrashedError } from "../src/worker/worker-client.js";
import {
  deferred,
  PROJECT,
  resultFor,
  setup,
} from "./support/session-setup.js";

const crash = () => new WorkerCrashedError("The worker stopped", false);

function inFlight() {
  const waiting: ReturnType<typeof deferred<FocusResult>>[] = [];
  const env = setup({
    sliceForNode: () => {
      const next = deferred<FocusResult>();
      waiting.push(next);
      return next.promise;
    },
  });
  env.jumps.add(PROJECT, resultFor("src/a.ts#f"));
  const requests = [
    env.session.expand({
      project: PROJECT,
      nodeId: "src/a.ts#g",
      generation: 1,
    }),
    env.session.expand({
      project: PROJECT,
      nodeId: "src/a.ts#h",
      generation: 1,
    }),
    env.session.focusNode({ project: PROJECT, nodeId: "src/a.ts#k" }),
  ];
  return { ...env, waiting, requests };
}

describe("a worker crash with several requests in flight", () => {
  it("raises one notification and still fails every request", async () => {
    const { waiting, requests, notifier, posted } = inFlight();
    const error = crash();
    for (const request of waiting) request.reject(error);
    await Promise.all(requests);

    expect(notifier.error).toHaveBeenCalledTimes(1);
    const failures = posted.filter(
      (message) =>
        message.type === "expandFailed" || message.type === "analysisError",
    );
    expect(failures.map((message) => message.type).sort()).toEqual([
      "analysisError",
      "expandFailed",
      "expandFailed",
    ]);
  });

  it("notifies again for a different crash", async () => {
    const { session, jumps, notifier } = setup({
      sliceForNode: async () => {
        throw crash();
      },
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));
    const expand = () =>
      session.expand({ project: PROJECT, nodeId: "src/a.ts#g", generation: 1 });
    await expand();
    await expand();
    expect(notifier.error).toHaveBeenCalledTimes(2);
  });
});
