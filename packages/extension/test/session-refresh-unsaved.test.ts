import { describe, expect, it, vi } from "vitest";
import { unsavedEditsMessage } from "../src/session-refresh.js";
import {
  known,
  PROJECT,
  request,
  resultFor,
  setup,
} from "./support/session-setup.js";

describe("GraphSession.refresh unsaved edits", () => {
  it("names the one unsaved project file and still refreshes", async () => {
    const { session, worker, notifier, documents, types } = known();
    documents.unsavedFiles.mockReturnValue(["/repo/src/a.ts"]);
    await session.refresh(request());
    expect(notifier.status).toHaveBeenCalledOnce();
    expect(notifier.status).toHaveBeenCalledWith(
      "Code Spider: a.ts has unsaved changes; the graph shows the saved version.",
    );
    expect(notifier.status.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(worker.refresh).mock.invocationCallOrder[0] ?? 0,
    );
    expect(types()).toEqual(["busy", "refreshed", "busy"]);
    expect(notifier.warn).not.toHaveBeenCalled();
    expect(notifier.error).not.toHaveBeenCalled();
  });

  it("counts several unsaved project files", async () => {
    const { session, jumps, notifier, documents } = known();
    jumps.add(PROJECT, resultFor("src/b.ts#g"));
    documents.unsavedFiles.mockReturnValue([
      "/repo/src/a.ts",
      "/repo/src/b.ts",
    ]);
    await session.refresh(request());
    expect(notifier.status).toHaveBeenCalledOnce();
    expect(notifier.status).toHaveBeenCalledWith(
      "Code Spider: 2 files have unsaved changes; the graph shows the saved version.",
    );
  });

  it("ignores unsaved documents outside the project", async () => {
    const { session, notifier, documents } = known();
    documents.unsavedFiles.mockReturnValue([
      "/elsewhere/a.ts",
      "/repo/src/z.ts",
    ]);
    await session.refresh(request());
    expect(documents.unsavedFiles).toHaveBeenCalled();
    expect(notifier.status).not.toHaveBeenCalled();
  });

  it("shows no status message for an unknown project", async () => {
    const { session, notifier, documents } = setup();
    documents.unsavedFiles.mockReturnValue(["/repo/src/a.ts"]);
    await session.refresh(request());
    expect(notifier.status).not.toHaveBeenCalled();
  });

  it("fails the refresh and leaves busy off when listing documents throws", async () => {
    const { session, worker, changes, documents, posted, types } = known();
    documents.unsavedFiles.mockImplementation(() => {
      throw new Error("documents unavailable");
    });
    changes.mark("/repo/src/a.ts");
    await session.refresh(request());
    expect(types()).toEqual(["busy", "refreshFailed", "busy"]);
    expect(posted[0]).toEqual({ type: "busy", busy: true });
    expect(posted[1]).toEqual({
      type: "refreshFailed",
      generation: 4,
      message: "documents unavailable",
    });
    expect(posted[2]).toEqual({ type: "busy", busy: false });
    expect(worker.refresh).not.toHaveBeenCalled();
    expect(changes.drain().files).toEqual(["/repo/src/a.ts"]);
  });
});

describe("unsavedEditsMessage", () => {
  it("is undefined for no files", () => {
    expect(unsavedEditsMessage([])).toBeUndefined();
  });

  it("names a single file by its base name", () => {
    expect(unsavedEditsMessage(["/repo/src/signup.ts"])).toBe(
      "Code Spider: signup.ts has unsaved changes; the graph shows the saved version.",
    );
  });

  it("counts several files", () => {
    expect(unsavedEditsMessage(["/repo/a.ts", "/repo/b.ts", "/c.ts"])).toBe(
      "Code Spider: 3 files have unsaved changes; the graph shows the saved version.",
    );
  });
});
