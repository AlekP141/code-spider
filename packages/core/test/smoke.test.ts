import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index";

describe("core package", () => {
  it("is importable and report its version", () => {
    expect(VERSION).toBe("0.0.0");
  });
});
