import { describe, expect, it, vi } from "vitest";
import { B_ID, pathEnv, refreshedResult } from "../support/path-run.js";
import {
  deferred,
  PROJECT,
  request,
  resultFor,
} from "../support/session-setup.js";
import type { FocusResult } from "../../src/worker/protocol.js";

describe("GraphSession.refresh with a path end", () => {
  it("is handled by the path searcher and never starts a newer centre request", async () => {
    const focusing = deferred<FocusResult>();
    const env = pathEnv({ focus: () => focusing.promise });
    const showing = env.session.showGraph({
      file: "/repo/src/a.ts",
      line: 0,
      character: 0,
      isDirty: false,
    });
    const refreshing = env.session.refresh({ ...request(), pathEndId: B_ID });
    await vi.waitFor(() => expect(env.refreshes.runs).toHaveLength(1));
    expect(env.worker.refresh).not.toHaveBeenCalled();
    expect(env.worker.refreshPath).toHaveBeenCalledOnce();

    env.refreshes.runs[0]?.done(refreshedResult());
    await refreshing;
    focusing.resolve(resultFor("src/z.ts#z"));
    await showing;

    expect(env.types()).toContain("refreshed");
    expect(env.posted.find((m) => m.type === "slice")).toMatchObject({
      project: PROJECT,
    });
    expect(env.refreshes.runs[0]?.cancel).not.toHaveBeenCalled();
  });
});
