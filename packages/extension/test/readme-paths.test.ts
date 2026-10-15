import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COMMAND_PATH_FROM,
  COMMAND_PATH_TO,
  SETTING_PATH_MAX_BOXES,
  SETTING_PATH_TIME_LIMIT,
} from "../src/ids.js";
import { readManifest } from "./support/manifest.js";

const here = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(join(here, "../../../README.md"), "utf8");

describe("root README, paths", () => {
  const manifest = readManifest();

  it("names Path from here and Path to here and their keys with the Mac forms", () => {
    for (const id of [COMMAND_PATH_FROM, COMMAND_PATH_TO]) {
      const command = manifest.contributes.commands.find(
        (entry) => entry.command === id,
      );
      const binding = manifest.contributes.keybindings?.find(
        (entry) => entry.command === id,
      );
      expect(command).toBeDefined();
      expect(readme).toContain(`${command?.category}: ${command?.title}`);
      expect(binding?.key).toBeDefined();
      expect(readme.toLowerCase()).toContain(binding?.key);
      const macKey = binding?.mac?.replace("alt", "option");
      expect(macKey).toBeDefined();
      expect(readme.toLowerCase()).toContain(`\`${macKey}\` on a mac`);
    }
  });

  it("names the two path settings", () => {
    expect(readme).toContain(SETTING_PATH_TIME_LIMIT);
    expect(readme).toContain(SETTING_PATH_MAX_BOXES);
  });
});
