import { describe, expect, it } from "vitest";
import { isExtensionMessage } from "../../src/host/messages.js";

const settings = { type: "settings", columnGap: 192, edgeStyle: "stepped" };

describe("settings", () => {
  it("needs a known diffMode", () => {
    expect(isExtensionMessage(settings)).toBe(false);
    for (const diffMode of ["merge", 1, null]) {
      expect(isExtensionMessage({ ...settings, diffMode })).toBe(false);
    }
    for (const diffMode of ["uncommitted", "pr"]) {
      expect(isExtensionMessage({ ...settings, diffMode })).toBe(true);
    }
  });
});

describe("changeMarks", () => {
  const marks = (value: unknown) => ({
    type: "changeMarks",
    project: "/repo/tsconfig.json",
    marks: value,
  });

  it("accepts a project with added or modified marks, or none", () => {
    const both = marks({ "a#f": "added", "a#g": "modified" });
    expect(isExtensionMessage(both)).toBe(true);
    expect(isExtensionMessage(marks({}))).toBe(true);
  });

  it("rejects a missing project and marks that are not a plain map of kinds", () => {
    expect(isExtensionMessage({ type: "changeMarks", marks: {} })).toBe(false);
    expect(
      isExtensionMessage({ type: "changeMarks", project: 1, marks: {} }),
    ).toBe(false);
    for (const bad of [undefined, null, "added", 3, ["added"]]) {
      expect(isExtensionMessage(marks(bad))).toBe(false);
    }
    for (const kind of ["deleted", "", 1, null, undefined]) {
      expect(isExtensionMessage(marks({ "a#f": kind }))).toBe(false);
    }
    expect(isExtensionMessage(marks({ "a#f": "added", "a#g": "gone" }))).toBe(
      false,
    );
  });
});
