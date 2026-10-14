import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEST_VISIBILITY,
  isTestVisibility,
  normaliseTestVisibility,
  TEST_VISIBILITIES,
} from "../../src/settings/test-visibility.js";

describe("normaliseTestVisibility", () => {
  it("lists show and hide, with show as the default", () => {
    expect(TEST_VISIBILITIES).toEqual(["show", "hide"]);
    expect(DEFAULT_TEST_VISIBILITY).toBe("show");
  });

  it("passes both known names through", () => {
    expect(normaliseTestVisibility("show")).toBe("show");
    expect(normaliseTestVisibility("hide")).toBe("hide");
  });

  it("gives the default for an unknown name, Hide, a number, null and undefined", () => {
    expect(normaliseTestVisibility("fade")).toBe("show");
    expect(normaliseTestVisibility("Hide")).toBe("show");
    expect(normaliseTestVisibility(1)).toBe("show");
    expect(normaliseTestVisibility(null)).toBe("show");
    expect(normaliseTestVisibility(undefined)).toBe("show");
  });

  it("recognises exactly the known names", () => {
    expect(isTestVisibility("hide")).toBe(true);
    expect(isTestVisibility("show")).toBe(true);
    expect(isTestVisibility("Hide")).toBe(false);
    expect(isTestVisibility(undefined)).toBe(false);
  });
});
