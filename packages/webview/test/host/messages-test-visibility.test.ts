import { describe, expect, it } from "vitest";
import { isExtensionMessage } from "../../src/host/messages.js";

const settings = {
  type: "settings",
  columnGap: 192,
  edgeStyle: "stepped",
  diffMode: "uncommitted",
};

describe("settings", () => {
  it("needs a known testVisibility", () => {
    expect(isExtensionMessage(settings)).toBe(false);
    for (const testVisibility of ["fade", "Show", 1, null]) {
      expect(isExtensionMessage({ ...settings, testVisibility })).toBe(false);
    }
    for (const testVisibility of ["show", "hide"]) {
      expect(isExtensionMessage({ ...settings, testVisibility })).toBe(true);
    }
  });
});
