import { describe, expect, it, vi } from "vitest";
import type { MementoPort } from "../../src/settings/column-gap.js";
import { EdgeStyleStore } from "../../src/settings/edge-style-store.js";
import { STATE_EDGE_STYLE } from "../../src/ids.js";

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

describe("EdgeStyleStore", () => {
  it("defaults to stepped when nothing or junk is stored", () => {
    expect(new EdgeStyleStore(memento().port, vi.fn()).get()).toBe("stepped");
    for (const junk of ["wavy", 3, null]) {
      const stored = memento({ [STATE_EDGE_STYLE]: junk });
      expect(new EdgeStyleStore(stored.port, vi.fn()).get()).toBe("stepped");
    }
  });

  it("keeps its state under the codeSpider.edgeStyle key", () => {
    expect(STATE_EDGE_STYLE).toBe("codeSpider.edgeStyle");
  });

  it("stores the normalised value on set, then announces once", async () => {
    const { port, values } = memento();
    const seen: string[] = [];
    const announce = vi.fn(() => seen.push(store.get()));
    const store = new EdgeStyleStore(port, announce);
    await store.set("curved");
    expect(values.get(STATE_EDGE_STYLE)).toBe("curved");
    expect(announce.mock.calls).toEqual([[]]);
    expect(seen).toEqual(["curved"]);
    await store.set("wavy");
    expect(values.get(STATE_EDGE_STYLE)).toBe("stepped");
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("reads the value back through a new store over the same memento", async () => {
    const { port } = memento();
    await new EdgeStyleStore(port, vi.fn()).set("curved");
    expect(new EdgeStyleStore(port, vi.fn()).get()).toBe("curved");
  });
});
