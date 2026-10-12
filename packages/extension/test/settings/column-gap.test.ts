import { describe, expect, it, vi } from "vitest";
import {
  ColumnGapStore,
  type MementoPort,
} from "../../src/settings/column-gap.js";
import { STATE_COLUMN_GAP } from "../../src/ids.js";

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

describe("ColumnGapStore", () => {
  it("defaults to 192 when nothing or junk is stored", () => {
    expect(new ColumnGapStore(memento().port, vi.fn()).get()).toBe(192);
    const junk = memento({ [STATE_COLUMN_GAP]: "wide" });
    expect(new ColumnGapStore(junk.port, vi.fn()).get()).toBe(192);
  });

  it("normalises a stored value on read", () => {
    const stored = memento({ [STATE_COLUMN_GAP]: 100 });
    expect(new ColumnGapStore(stored.port, vi.fn()).get()).toBe(96);
  });

  it("stores the normalised value on set, then announces once", async () => {
    const { port, values } = memento();
    const seen: number[] = [];
    const announce = vi.fn(() => seen.push(store.get()));
    const store = new ColumnGapStore(port, announce);
    await store.set(100);
    expect(values.get(STATE_COLUMN_GAP)).toBe(96);
    expect(store.get()).toBe(96);
    expect(announce.mock.calls).toEqual([[]]);
    expect(seen).toEqual([96]);
  });

  it("announces nothing on construction or read", () => {
    const announce = vi.fn();
    new ColumnGapStore(memento().port, announce).get();
    expect(announce).not.toHaveBeenCalled();
  });

  it("reads the value back through a new store over the same memento", async () => {
    const { port } = memento();
    await new ColumnGapStore(port, vi.fn()).set(320);
    expect(new ColumnGapStore(port, vi.fn()).get()).toBe(320);
  });
});
