import { describe, expect, it } from "vitest";
import { splitCodeLines } from "../../../src/graph/nodes/code-lines.js";

describe("splitCodeLines", () => {
  it("splits at newlines", () => {
    expect(splitCodeLines("a\nb\nc").map((line) => line.text)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("drops a trailing carriage return only at the line end", () => {
    expect(splitCodeLines("a\r\nb\rc\r")).toEqual([
      { indent: "", text: "a" },
      { indent: "", text: "b\rc" },
    ]);
  });

  it("takes spaces and tabs as the indent and nothing else", () => {
    expect(splitCodeLines("  \t x = 1\n y")).toEqual([
      { indent: "  \t ", text: "x = 1" },
      { indent: "", text: " y" },
    ]);
  });

  it("gives empty text for blank and whitespace-only lines", () => {
    expect(splitCodeLines("a\n\n \t\nb")).toEqual([
      { indent: "", text: "a" },
      { indent: "", text: "" },
      { indent: " \t", text: "" },
      { indent: "", text: "b" },
    ]);
  });

  it("restores the input, minus carriage returns, when rejoined", () => {
    const input = "function f() {\r\n  if (a) {\n\t\treturn 1;\n\n  }\r\n}";
    const joined = splitCodeLines(input)
      .map((line) => line.indent + line.text)
      .join("\n");
    expect(joined).toBe(input.replaceAll("\r", ""));
  });
});
