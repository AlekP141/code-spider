import { describe, expect, it, vi } from "vitest";
import type { MementoPort } from "../../src/settings/column-gap.js";
import { TestVisibilityStore } from "../../src/settings/test-visibility-store.js";
import { STATE_TEST_VISIBILITY } from "../../src/ids.js";

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

describe("TestVisibilityStore", () => {
  it("defaults to show when nothing or junk is stored", () => {
    expect(new TestVisibilityStore(memento().port, vi.fn()).get()).toBe("show");
    for (const junk of ["fade", 3, null]) {
      const stored = memento({ [STATE_TEST_VISIBILITY]: junk });
      expect(new TestVisibilityStore(stored.port, vi.fn()).get()).toBe("show");
    }
  });

  it("keeps its state under the codeSpider.testVisibility key", () => {
    expect(STATE_TEST_VISIBILITY).toBe("codeSpider.testVisibility");
  });

  it("stores the normalised value on set, then announces once", async () => {
    const { port, values } = memento();
    const seen: string[] = [];
    const announce = vi.fn(() => seen.push(store.get()));
    const store = new TestVisibilityStore(port, announce);
    await store.set("hide");
    expect(values.get(STATE_TEST_VISIBILITY)).toBe("hide");
    expect(announce.mock.calls).toEqual([[]]);
    expect(seen).toEqual(["hide"]);
    await store.set("fade");
    expect(values.get(STATE_TEST_VISIBILITY)).toBe("show");
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("reads the value back through a new store over the same memento", async () => {
    const { port } = memento();
    await new TestVisibilityStore(port, vi.fn()).set("hide");
    expect(new TestVisibilityStore(port, vi.fn()).get()).toBe("hide");
  });
});
