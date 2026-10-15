import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANALYSABLE_LANGUAGE_IDS } from "../src/changes/changes.js";
import {
  COMMAND_SHOW_GRAPH,
  COMMAND_SHOW_IN_CODE_SPIDER,
  SETTING_MAX_HEAP_MB,
} from "../src/ids.js";
import {
  DEFAULT_MAX_HEAP_MB,
  MIN_MAX_HEAP_MB,
} from "../src/settings/settings-values.js";
import { readManifest } from "./support/manifest.js";

const here = dirname(fileURLToPath(import.meta.url));

const languageClause = ANALYSABLE_LANGUAGE_IDS.map(
  (id) => `editorLangId == ${id}`,
).join(" || ");

describe("extension manifest", () => {
  const { contributes, activationEvents, main, files, repository } =
    readManifest();

  it("contributes Show Graph under the Code Spider category", () => {
    const command = contributes.commands.find(
      (entry) => entry.command === COMMAND_SHOW_GRAPH,
    );
    expect(command).toMatchObject({
      title: "Show Graph",
      category: "Code Spider",
    });
  });

  it("contributes the context-menu command with the spec's title", () => {
    const command = contributes.commands.find(
      (entry) => entry.command === COMMAND_SHOW_IN_CODE_SPIDER,
    );
    expect(command?.title).toBe("Show in Code Spider");
  });

  it("points main at the CommonJS bundle", () => {
    expect(main).toBe("./dist/extension.cjs");
  });

  it("activates when a TypeScript or JavaScript file opens", () => {
    const expected = ANALYSABLE_LANGUAGE_IDS.map((id) => `onLanguage:${id}`);
    expect([...activationEvents].sort()).toEqual([...expected].sort());
  });

  it("binds Show Graph to Shift+Alt+2, repeated in mac, in TS/JS editors only", () => {
    expect(contributes.keybindings).toContainEqual({
      command: COMMAND_SHOW_GRAPH,
      key: "shift+alt+2",
      mac: "shift+alt+2",
      when: `editorTextFocus && (${languageClause})`,
    });
    expect(contributes.keybindings).toHaveLength(3);
  });

  it("adds Show in Code Spider to the editor context menu for TS/JS only", () => {
    expect(contributes.menus?.["editor/context"]).toEqual([
      {
        command: COMMAND_SHOW_IN_CODE_SPIDER,
        when: languageClause,
        group: "navigation",
      },
    ]);
  });

  it("keeps the menu-only command and non-TS/JS editors out of the palette", () => {
    const palette = contributes.menus?.commandPalette ?? [];
    expect(palette).toContainEqual({
      command: COMMAND_SHOW_IN_CODE_SPIDER,
      when: "false",
    });
    expect(palette).toContainEqual({
      command: COMMAND_SHOW_GRAPH,
      when: languageClause,
    });
  });

  it("declares the worker heap setting with the shared default and minimum", () => {
    const setting = contributes.configuration?.properties[SETTING_MAX_HEAP_MB];
    expect(setting).toMatchObject({
      type: "number",
      default: DEFAULT_MAX_HEAP_MB,
      minimum: MIN_MAX_HEAP_MB,
    });
  });

  it("ships only the four bundle outputs", () => {
    expect(files).toEqual([
      "dist/extension.cjs",
      "dist/worker.cjs",
      "dist/webview/index.js",
      "dist/webview/index.css",
    ]);
    expect(files).toContain(main.replace("./", ""));
  });

  it("names the repository, with the same url as the root package.json", () => {
    const rootPath = join(here, "../../../package.json");
    const root = JSON.parse(readFileSync(rootPath, "utf8")) as {
      repository: { type: string; url: string };
    };
    expect(repository).toEqual(root.repository);
  });
});
