import { describe, expect, it } from "vitest";
import { makeNodeId, parseNodeId, toPosixPath } from "../src/node-id";

describe("toPosixPath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(toPosixPath("src\\app\\route.ts")).toBe("src/app/route.ts");
  });

  it("strips a leading ./", () => {
    expect(toPosixPath("./src/a.ts")).toBe("src/a.ts");
  });
});

describe("makeNodeId", () => {
  it("joins path and name with #", () => {
    expect(makeNodeId("src/signup.ts", "validateUser")).toBe(
      "src/signup.ts#validateUser",
    );
  });

  it("omits the disambiguator for index 0", () => {
    expect(makeNodeId("src/a.ts", "f", 0)).toBe("src/a.ts#f");
  });

  it("appends a disambiguator for index > 0", () => {
    expect(makeNodeId("src/a.ts", "f", 2)).toBe("src/a.ts#f~2");
  });

  it("normalises the path", () => {
    expect(makeNodeId(".\\src\\a.ts", "f")).toBe("src/a.ts#f");
  });
});

describe("parseNodeId", () => {
  it("round-trips a plain id", () => {
    expect(parseNodeId("src/signup.ts#validateUser")).toEqual({
      file: "src/signup.ts",
      name: "validateUser",
      index: 0,
    });
  });

  it("round-trips a disambiguated id", () => {
    expect(parseNodeId("src/a.ts#f~2")).toEqual({
      file: "src/a.ts",
      name: "f",
      index: 2,
    });
  });

  it("handles external ids that carry a colon in the file part", () => {
    expect(parseNodeId("external:fs#readFile")).toEqual({
      file: "external:fs",
      name: "readFile",
      index: 0,
    });
  });

  it("throws on a malformed id", () => {
    expect(() => parseNodeId("no-hash-here")).toThrow(/Malformed NodeId/);
  });
});
