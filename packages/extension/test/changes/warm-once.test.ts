import { describe, expect, it, vi } from "vitest";
import { WarmOnce } from "../../src/changes/warm-once.js";

const file = (languageId: string, fsPath: string, scheme = "file") => ({
  languageId,
  uri: { scheme, fsPath },
});

describe("WarmOnce", () => {
  it("ignores an offer with no document", () => {
    const warm = vi.fn();
    new WarmOnce(warm).offer(undefined);
    expect(warm).not.toHaveBeenCalled();
  });

  it("ignores documents that are not TS/JS files on disk", () => {
    const warm = vi.fn();
    const once = new WarmOnce(warm);
    once.offer(file("markdown", "/repo/README.md"));
    once.offer(file("typescript", "/repo/a.ts", "untitled"));
    expect(warm).not.toHaveBeenCalled();
  });

  it("warms for the first eligible document only", () => {
    const warm = vi.fn();
    const once = new WarmOnce(warm);
    once.offer(file("json", "/repo/package.json"));
    once.offer(file("typescriptreact", "/repo/a.tsx"));
    once.offer(file("typescript", "/repo/b.ts"));
    expect(warm).toHaveBeenCalledOnce();
    expect(warm).toHaveBeenCalledWith("/repo/a.tsx");
  });

  it("warms again after a reset", () => {
    const warm = vi.fn();
    const once = new WarmOnce(warm);
    once.offer(file("typescript", "/repo/a.ts"));
    once.reset();
    once.offer(file("typescript", "/repo/b.ts"));
    expect(warm).toHaveBeenCalledTimes(2);
    expect(warm).toHaveBeenLastCalledWith("/repo/b.ts");
  });
});
