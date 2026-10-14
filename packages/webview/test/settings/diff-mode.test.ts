import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIFF_MODE,
  DIFF_MODES,
  isDiffMode,
  normaliseDiffMode,
} from "../../src/settings/diff-mode.js";

describe("normaliseDiffMode", () => {
  it("lists uncommitted and pr, with uncommitted as the default", () => {
    expect(DIFF_MODES).toEqual(["uncommitted", "pr"]);
    expect(DEFAULT_DIFF_MODE).toBe("uncommitted");
  });

  it("passes both known names through", () => {
    expect(normaliseDiffMode("uncommitted")).toBe("uncommitted");
    expect(normaliseDiffMode("pr")).toBe("pr");
  });

  it("gives the default for an unknown name, PR, a number, null and undefined", () => {
    expect(normaliseDiffMode("staged")).toBe("uncommitted");
    expect(normaliseDiffMode("PR")).toBe("uncommitted");
    expect(normaliseDiffMode(1)).toBe("uncommitted");
    expect(normaliseDiffMode(null)).toBe("uncommitted");
    expect(normaliseDiffMode(undefined)).toBe("uncommitted");
  });

  it("recognises exactly the known names", () => {
    expect(isDiffMode("pr")).toBe(true);
    expect(isDiffMode("uncommitted")).toBe(true);
    expect(isDiffMode("PR")).toBe(false);
    expect(isDiffMode(undefined)).toBe(false);
  });
});
