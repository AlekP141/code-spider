import { describe, expect, it } from "vitest";
import { COMMAND_SHOW_GRAPH } from "../src/ids.js";
import { readManifest } from "./support/manifest.js";

describe("extension manifest", () => {
  it("contributes Show Graph under the Code Spider category", () => {
    const command = readManifest().contributes.commands.find(
      (entry) => entry.command === COMMAND_SHOW_GRAPH,
    );
    expect(command).toMatchObject({
      title: "Show Graph",
      category: "Code Spider",
    });
  });

  it("points main at the CommonJS bundle", () => {
    expect(readManifest().main).toBe("./dist/extension.cjs");
  });
});
