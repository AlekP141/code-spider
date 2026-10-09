import { describe, expect, it } from "vitest";
import {
  ANALYSABLE_LANGUAGE_IDS,
  ChangeTracker,
  isAnalysableLanguage,
} from "../src/changes.js";

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
  it("drains the saved TS/JS paths once", () => {
    const tracker = new ChangeTracker();
    tracker.markSaved("typescript", "/repo/a.ts");
    tracker.markSaved("typescriptreact", "/repo/b.tsx");
    tracker.markSaved("typescript", "/repo/a.ts");
    expect(tracker.drain().sort()).toEqual(["/repo/a.ts", "/repo/b.tsx"]);
    expect(tracker.drain()).toEqual([]);
  });

  it("ignores other languages", () => {
    const tracker = new ChangeTracker();
    tracker.markSaved("json", "/repo/package.json");
    expect(tracker.drain()).toEqual([]);
  });
});
