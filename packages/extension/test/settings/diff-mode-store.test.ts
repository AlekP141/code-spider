import { describe, expect, it, vi } from "vitest";
import type { MementoPort } from "../../src/settings/column-gap.js";
import { DiffModeStore } from "../../src/settings/diff-mode-store.js";
import { STATE_DIFF_MODE } from "../../src/ids.js";

function memento(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  const port: MementoPort = {
    get: (key) => values.get(key),
    update: async (key, value) => {
      values.set(key, value);
    },
  };
  return { port, values };
}

describe("DiffModeStore", () => {
  it("defaults to uncommitted when nothing or junk is stored", () => {
    expect(new DiffModeStore(memento().port, vi.fn()).get()).toBe(
      "uncommitted",
    );
    for (const junk of ["staged", 3, null]) {
      const stored = memento({ [STATE_DIFF_MODE]: junk });
      expect(new DiffModeStore(stored.port, vi.fn()).get()).toBe("uncommitted");
    }
  });

  it("keeps its state under the codeSpider.diffMode key", () => {
    expect(STATE_DIFF_MODE).toBe("codeSpider.diffMode");
  });

  it("stores the normalised value on set, then announces once", async () => {
    const { port, values } = memento();
    const seen: string[] = [];
    const announce = vi.fn(() => seen.push(store.get()));
    const store = new DiffModeStore(port, announce);
    await store.set("pr");
    expect(values.get(STATE_DIFF_MODE)).toBe("pr");
    expect(announce.mock.calls).toEqual([[]]);
    expect(seen).toEqual(["pr"]);
    await store.set("staged");
    expect(values.get(STATE_DIFF_MODE)).toBe("uncommitted");
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("reads the value back through a new store over the same memento", async () => {
    const { port } = memento();
    await new DiffModeStore(port, vi.fn()).set("pr");
    expect(new DiffModeStore(port, vi.fn()).get()).toBe("pr");
  });
});
