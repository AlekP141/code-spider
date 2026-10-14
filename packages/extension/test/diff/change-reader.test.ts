import { describe, expect, it, vi } from "vitest";
import type { DiffMode } from "@code-spider/webview/diff-mode";
import { ChangeReader, NO_BASE_MESSAGE } from "../../src/diff/change-reader.js";
import type { DiffReading } from "../../src/ports.js";
import { deferred } from "../support/session-setup.js";

const reading = (fellBack: boolean, ...paths: string[]): DiffReading => ({
  changes: new Map(paths.map((path) => [path, { kind: "added" as const }])),
  fellBack,
});

function setup(first: DiffReading = reading(false)) {
  const mode = { value: "uncommitted" as DiffMode };
  const diff = { changes: vi.fn(
    async (_root: string, _mode: DiffMode): Promise<DiffReading> => first,
  ) };
  const notifier = { warn: vi.fn(), error: vi.fn(), status: vi.fn() };
  const reader = new ChangeReader(diff, () => mode.value, notifier);
  return { mode, diff, notifier, reader };
}

describe("ChangeReader", () => {
  it("asks the port for the mode in force when it reads, and returns the map", async () => {
    const { mode, diff, reader } = setup(reading(false, "a.ts"));
    mode.value = "pr";
    const changes = await reader.read("/repo");
    expect(diff.changes).toHaveBeenCalledTimes(1);
    expect(diff.changes).toHaveBeenCalledWith("/repo", "pr");
    expect([...changes.keys()]).toEqual(["a.ts"]);
  });

  it("warns once with NO_BASE_MESSAGE when a pr reading fell back, and not on later reads", async () => {
    const { mode, notifier, reader } = setup(reading(true));
    mode.value = "pr";
    await reader.read("/repo");
    await reader.read("/repo");
    expect(notifier.warn.mock.calls).toEqual([[NO_BASE_MESSAGE]]);
    expect(NO_BASE_MESSAGE).toBe(
      "Code Spider: no main branch found, showing uncommitted changes.",
    );
  });

  it("warns again after resetWarning", async () => {
    const { mode, notifier, reader } = setup(reading(true));
    mode.value = "pr";
    await reader.read("/repo");
    reader.resetWarning();
    await reader.read("/repo");
    expect(notifier.warn).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when the reading did not fall back", async () => {
    const { mode, notifier, reader } = setup(reading(false));
    mode.value = "pr";
    await reader.read("/repo");
    expect(notifier.warn).not.toHaveBeenCalled();
  });

  it("reads again when the mode changed while git ran, and returns the second reading", async () => {
    const { mode, diff, reader } = setup();
    const slow = deferred<DiffReading>();
    diff.changes
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(async () => reading(false, "second.ts"));
    const pending = reader.read("/repo");
    mode.value = "pr";
    slow.resolve(reading(false, "first.ts"));
    const changes = await pending;
    expect(diff.changes.mock.calls).toEqual([
      ["/repo", "uncommitted"],
      ["/repo", "pr"],
    ]);
    expect([...changes.keys()]).toEqual(["second.ts"]);
  });

  it("does not warn for a fell-back reading it threw away", async () => {
    const { mode, diff, notifier, reader } = setup();
    mode.value = "pr";
    const slow = deferred<DiffReading>();
    diff.changes
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(async () => reading(false));
    const pending = reader.read("/repo");
    mode.value = "uncommitted";
    slow.resolve(reading(true));
    await pending;
    expect(notifier.warn).not.toHaveBeenCalled();
  });
});
