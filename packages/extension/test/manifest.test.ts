import { describe, expect, it } from "vitest";
import { ANALYSABLE_LANGUAGE_IDS } from "../src/changes.js";
import { COMMAND_SHOW_GRAPH, SETTING_MAX_HEAP_MB } from "../src/ids.js";
import {
  DEFAULT_MAX_HEAP_MB,
  MIN_MAX_HEAP_MB,
} from "../src/settings-values.js";
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

  it("activates when a TypeScript or JavaScript file opens", () => {
    const expected = ANALYSABLE_LANGUAGE_IDS.map((id) => `onLanguage:${id}`);
    expect(readManifest().activationEvents.sort()).toEqual(expected.sort());
  });

  it("declares the worker heap setting with the shared default and minimum", () => {
    const setting =
      readManifest().contributes.configuration?.properties[SETTING_MAX_HEAP_MB];
    expect(setting).toMatchObject({
      type: "number",
      default: DEFAULT_MAX_HEAP_MB,
      minimum: MIN_MAX_HEAP_MB,
    });
  });
});
