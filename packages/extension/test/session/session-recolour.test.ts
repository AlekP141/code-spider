import { describe, expect, it } from "vitest";
import { NO_BASE_MESSAGE } from "../../src/diff/change-reader.js";
import { parseDiff } from "../../src/diff/parse-diff.js";
import type { DiffReading } from "../../src/ports.js";
import {
  deferred,
  known,
  PROJECT,
  resultFor,
  setup,
} from "../support/session-setup.js";

const added = (...files: string[]): DiffReading => ({
  changes: parseDiff("", files),
  fellBack: false,
});

describe("GraphSession.recolour", () => {
  it("posts changeMarks for the project with the marks of the current mode", async () => {
    const { session, diff, mode, posted } = known();
    diff.changes.mockImplementation(async (_root, current) =>
      added(current === "pr" ? "src/a.ts" : "src/other.ts"),
    );
    mode.value = "pr";
    await session.recolour();
    expect(diff.changes).toHaveBeenCalledWith("/repo", "pr");
    expect(posted).toEqual([
      {
        type: "changeMarks",
        project: PROJECT,
        marks: { "src/a.ts#f": "added" },
      },
    ]);
  });

  it("posts one message per project the panel was sent", async () => {
    const { session, jumps, diff, posted } = known();
    const other = "/other/tsconfig.json";
    jumps.add(other, {
      ...resultFor("src/z.ts#z"),
      repoRoot: "/other",
      tsconfig: other,
    });
    diff.changes.mockImplementation(async (root) =>
      added(root === "/repo" ? "src/a.ts" : "src/z.ts"),
    );
    await session.recolour();
    expect(diff.changes.mock.calls.map(([root]) => root)).toEqual([
      "/repo",
      "/other",
    ]);
    expect(posted).toEqual([
      {
        type: "changeMarks",
        project: PROJECT,
        marks: { "src/a.ts#f": "added" },
      },
      {
        type: "changeMarks",
        project: other,
        marks: { "src/z.ts#z": "added" },
      },
    ]);
  });

  it("includes a node that was sent while git was running", async () => {
    const { session, jumps, diff, posted } = known();
    const reading = deferred<DiffReading>();
    diff.changes.mockReturnValue(reading.promise);
    const done = session.recolour();
    jumps.add(PROJECT, resultFor("src/a.ts#f", ["src/late.ts#late"]));
    reading.resolve(added("src/late.ts"));
    await done;
    expect(posted).toEqual([
      {
        type: "changeMarks",
        project: PROJECT,
        marks: { "src/late.ts#late": "added" },
      },
    ]);
  });

  it("runs no git and posts nothing when no project is known", async () => {
    const { session, diff, posted } = setup();
    await session.recolour();
    expect(diff.changes).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
  });

  it("posts nothing when the panel closed while git ran", async () => {
    const { session, panel, diff, posted } = known();
    const reading = deferred<DiffReading>();
    diff.changes.mockReturnValue(reading.promise);
    const done = session.recolour();
    panel.open = false;
    reading.resolve(added("src/a.ts"));
    await done;
    expect(posted).toEqual([]);
  });

  it("a fell-back pr recolour warns once, and the next recolour warns again", async () => {
    const { session, jumps, diff, mode, notifier } = known();
    jumps.add("/other/tsconfig.json", {
      ...resultFor("src/z.ts#z"),
      repoRoot: "/other",
      tsconfig: "/other/tsconfig.json",
    });
    diff.changes.mockResolvedValue({ changes: new Map(), fellBack: true });
    mode.value = "pr";
    await session.recolour();
    expect(notifier.warn.mock.calls).toEqual([[NO_BASE_MESSAGE]]);
    await session.recolour();
    expect(notifier.warn.mock.calls).toEqual([
      [NO_BASE_MESSAGE],
      [NO_BASE_MESSAGE],
    ]);
  });

  it("posts no busy message and leaves currentGraph alone", async () => {
    const { session, diff, posted, types } = known();
    await session.showGraph({
      file: "/repo/src/a.ts",
      line: 1,
      character: 2,
      isDirty: false,
    });
    const graph = session.currentGraph();
    posted.length = 0;
    diff.changes.mockResolvedValue(added("src/a.ts"));
    await session.recolour();
    expect(types()).toEqual(["changeMarks"]);
    expect(session.currentGraph()).toBe(graph);
  });
});
