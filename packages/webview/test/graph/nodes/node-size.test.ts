import { CODE_PREVIEW_MAX_LINES } from "@code-spider/core";
import { describe, expect, it } from "vitest";
import {
  CODE_PADDING_Y,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  MAX_CODE_LINES,
  MIN_CODE_LINES,
} from "../../../src/graph/constants.js";
import {
  codeLines,
  codeRegionHeight,
  hasCodeRegion,
  nodeHeight,
} from "../../../src/graph/nodes/node-size.js";

const withCode = (lineCount: number) => ({ lineCount, codePreview: "x" });
const chip = { lineCount: 0, codePreview: "" };

describe("constants", () => {
  it("keeps the 25-line cap in step with the analyser", () => {
    expect(MAX_CODE_LINES).toBe(CODE_PREVIEW_MAX_LINES);
  });
});

describe("codeLines", () => {
  it("clamps to between 3 and 25 lines", () => {
    expect(codeLines(0)).toBe(MIN_CODE_LINES);
    expect(codeLines(1)).toBe(MIN_CODE_LINES);
    expect(codeLines(3)).toBe(3);
    expect(codeLines(10)).toBe(10);
    expect(codeLines(25)).toBe(25);
    expect(codeLines(26)).toBe(MAX_CODE_LINES);
    expect(codeLines(400)).toBe(MAX_CODE_LINES);
  });
});

describe("nodeHeight", () => {
  it("is header + clamped lines x line height + vertical padding", () => {
    expect(nodeHeight(withCode(10), true)).toBe(
      HEADER_HEIGHT + 10 * LINE_HEIGHT + 2 * CODE_PADDING_Y,
    );
  });

  it("gives a one-line function the three-line minimum", () => {
    expect(nodeHeight(withCode(1), true)).toBe(
      HEADER_HEIGHT + 3 * LINE_HEIGHT + 2 * CODE_PADDING_Y,
    );
  });

  it("stops growing at 25 lines", () => {
    expect(nodeHeight(withCode(500), true)).toBe(
      nodeHeight(withCode(25), true),
    );
  });

  it("makes a node with no preview a header-only chip", () => {
    expect(hasCodeRegion(chip)).toBe(false);
    expect(codeRegionHeight(chip)).toBe(0);
    expect(nodeHeight(chip, true)).toBe(HEADER_HEIGHT);
  });

  it("is the header height for a closed box whatever its line count", () => {
    for (const lineCount of [0, 1, 3, 10, 25, 500]) {
      expect(nodeHeight(withCode(lineCount), false)).toBe(HEADER_HEIGHT);
    }
  });

  it("is still the header height for an open box with no code region", () => {
    expect(nodeHeight(chip, true)).toBe(HEADER_HEIGHT);
    expect(nodeHeight({ lineCount: 40, codePreview: "" }, true)).toBe(
      HEADER_HEIGHT,
    );
  });

  it("is a pure function of the node: a taller function is a taller box", () => {
    expect(nodeHeight(withCode(20), true)).toBeGreaterThan(
      nodeHeight(withCode(5), true),
    );
  });
});
