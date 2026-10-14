import { describe, expect, it } from "vitest";
import { NO_BASE_MESSAGE } from "../../src/diff/change-reader.js";
import { parseDiff } from "../../src/diff/parse-diff.js";
import {
  known,
  PROJECT,
  request,
  resultFor,
} from "../support/session-setup.js";

const SHOW = {
  file: "/repo/src/a.ts",
  line: 1,
  character: 2,
  isDirty: false,
};
const EXPAND = { project: PROJECT, nodeId: "src/a.ts#g", generation: 4 };

describe("GraphSession with a diff mode", () => {
  it("showGraph reads the changes in the current mode", async () => {
    const { session, diff, mode } = known();
    mode.value = "pr";
    await session.showGraph(SHOW);
    expect(diff.changes).toHaveBeenCalledWith("/repo", "pr");
    mode.value = "uncommitted";
    await session.showGraph(SHOW);
    expect(diff.changes).toHaveBeenLastCalledWith("/repo", "uncommitted");
  });

  it("expand reads the changes in the current mode", async () => {
    const { session, diff, mode } = known();
    mode.value = "pr";
    await session.expand(EXPAND);
    expect(diff.changes).toHaveBeenCalledWith("/repo", "pr");
  });

  it("refresh marks the centre and the expansions in the current mode", async () => {
    const { session, diff, mode, posted } = known({
      refresh: async (_tsconfig, focusId) => ({
        tsconfig: PROJECT,
        repoRoot: "/repo",
        centre: resultFor(focusId).slice,
        expansions: [
          { nodeId: "src/a.ts#g", slice: resultFor("src/a.ts#g").slice },
        ],
      }),
    });
    mode.value = "pr";
    diff.changes.mockImplementation(async (_root, readMode) => ({
      changes: parseDiff("", readMode === "pr" ? ["src/a.ts"] : []),
      fellBack: false,
    }));
    await session.refresh(request());
    expect(diff.changes).toHaveBeenCalledWith("/repo", "pr");
    const refreshed = posted.find((message) => message.type === "refreshed");
    if (refreshed?.type !== "refreshed") throw new Error("no refreshed");
    expect(refreshed.centre.nodes[0]?.change).toBe("added");
    expect(refreshed.expansions[0]?.slice.nodes[0]?.change).toBe("added");
  });

  it("a fell-back pr reading warns once across showGraph, expand and refresh", async () => {
    const { session, diff, mode, notifier } = known();
    mode.value = "pr";
    diff.changes.mockResolvedValue({ changes: new Map(), fellBack: true });
    await session.showGraph(SHOW);
    await session.expand(EXPAND);
    await session.refresh(request());
    expect(notifier.warn.mock.calls).toEqual([[NO_BASE_MESSAGE]]);
  });

  it("uncommitted mode never warns", async () => {
    const { session, notifier } = known();
    await session.showGraph(SHOW);
    await session.expand(EXPAND);
    await session.refresh(request());
    expect(notifier.warn).not.toHaveBeenCalled();
  });
});
