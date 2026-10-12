import { describe, expect, it } from "vitest";
import {
  ANALYSABLE_LANGUAGE_IDS,
  ChangeTracker,
  isAnalysableLanguage,
} from "../../src/changes/changes.js";

describe("isAnalysableLanguage", () => {
  it("accepts TypeScript, TSX, JavaScript and JSX", () => {
    expect([...ANALYSABLE_LANGUAGE_IDS].sort()).toEqual([
      "javascript",
      "javascriptreact",
      "typescript",
      "typescriptreact",
    ]);
    for (const id of ANALYSABLE_LANGUAGE_IDS) {
      expect(isAnalysableLanguage(id)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    expect(isAnalysableLanguage("json")).toBe(false);
    expect(isAnalysableLanguage("markdown")).toBe(false);
  });
});

describe("ChangeTracker", () => {
  it("ignores untracked paths without a version change or callback", () => {
    const seen: number[] = [];
    const tracker = new ChangeTracker((version) => seen.push(version));
    tracker.mark("/repo/package.json");
    tracker.mark("/repo/node_modules/lib/index.ts");
    expect(seen).toEqual([]);
    expect(tracker.drain()).toEqual({ files: [], version: 0 });
  });

  it("raises the version per tracked mark, also for a path already waiting", () => {
    const seen: number[] = [];
    const tracker = new ChangeTracker((version) => seen.push(version));
    tracker.mark("/repo/a.ts");
    tracker.mark("/repo/a.ts");
    tracker.mark("/repo/tsconfig.json");
    expect(seen).toEqual([1, 2, 3]);
  });

  it("drains the files once, deduplicated, and keeps the version", () => {
    const tracker = new ChangeTracker();
    tracker.mark("/repo/a.ts");
    tracker.mark("/repo/b.tsx");
    tracker.mark("/repo/a.ts");
    const drained = tracker.drain();
    expect([...drained.files].sort()).toEqual(["/repo/a.ts", "/repo/b.tsx"]);
    expect(drained.version).toBe(3);
    expect(tracker.drain()).toEqual({ files: [], version: 3 });
  });
});
