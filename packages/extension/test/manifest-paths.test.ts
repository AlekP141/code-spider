import { describe, expect, it } from "vitest";
import { ANALYSABLE_LANGUAGE_IDS } from "../src/changes/changes.js";
import {
  COMMAND_CLEAR_PATH_START,
  COMMAND_PATH_FROM,
  COMMAND_PATH_TO,
  COMMAND_SHOW_GRAPH,
  CONTEXT_PATH_START_MARKED,
  SETTING_PATH_MAX_BOXES,
  SETTING_PATH_TIME_LIMIT,
} from "../src/ids.js";
import { CENTRE_GONE_MESSAGE } from "../src/session/session-refresh.js";
import {
  DEFAULT_PATH_MAX_BOXES,
  DEFAULT_PATH_TIME_LIMIT_SECONDS,
  MAX_PATH_MAX_BOXES,
  MAX_PATH_TIME_LIMIT_SECONDS,
  MIN_PATH_MAX_BOXES,
  MIN_PATH_TIME_LIMIT_SECONDS,
} from "../src/settings/path-limits.js";
import { readManifest } from "./support/manifest.js";

const languageClause = ANALYSABLE_LANGUAGE_IDS.map(
  (id) => `editorLangId == ${id}`,
).join(" || ");

describe("path entries in the extension manifest", () => {
  const { contributes } = readManifest();
  const keybindings = contributes.keybindings ?? [];

  it("contributes Path from here, Path to here and Clear Path Start under the Code Spider category", () => {
    const commandOf = (id: string) =>
      contributes.commands.find((entry) => entry.command === id);
    expect(commandOf(COMMAND_PATH_FROM)).toMatchObject({
      title: "Path from here",
      category: "Code Spider",
    });
    expect(commandOf(COMMAND_PATH_TO)).toMatchObject({
      title: "Path to here",
      category: "Code Spider",
    });
    expect(commandOf(COMMAND_CLEAR_PATH_START)).toMatchObject({
      title: "Clear Path Start",
      category: "Code Spider",
    });
  });

  it("binds the three chords with the same text on a Mac, in TS/JS editors only, Show Graph on 2", () => {
    const when = `editorTextFocus && (${languageClause})`;
    const chord = (command: string, key: string) => ({
      command,
      key,
      mac: key,
      when,
    });
    expect(keybindings).toEqual([
      chord(COMMAND_PATH_FROM, "shift+alt+1"),
      chord(COMMAND_SHOW_GRAPH, "shift+alt+2"),
      chord(COMMAND_PATH_TO, "shift+alt+3"),
    ]);
  });

  it("leaves nothing bound to ctrl+alt+s or cmd+ctrl+s", () => {
    const old = new Set(["ctrl+alt+s", "cmd+ctrl+s"]);
    const bound = keybindings.flatMap((entry) => [entry.key, entry.mac ?? ""]);
    expect(bound.filter((key) => old.has(key))).toEqual([]);
  });

  it("shows the palette entries for TS/JS editors, and Clear Path Start only while a start is marked", () => {
    const palette = contributes.menus?.commandPalette ?? [];
    expect(palette).toContainEqual({
      command: COMMAND_PATH_FROM,
      when: languageClause,
    });
    expect(palette).toContainEqual({
      command: COMMAND_PATH_TO,
      when: languageClause,
    });
    expect(palette).toContainEqual({
      command: COMMAND_CLEAR_PATH_START,
      when: CONTEXT_PATH_START_MARKED,
    });
  });

  it("declares the two path settings with type, default and range from the shared constants", () => {
    const properties = contributes.configuration?.properties ?? {};
    expect(properties[SETTING_PATH_TIME_LIMIT]).toMatchObject({
      type: "number",
      default: DEFAULT_PATH_TIME_LIMIT_SECONDS,
      minimum: MIN_PATH_TIME_LIMIT_SECONDS,
      maximum: MAX_PATH_TIME_LIMIT_SECONDS,
    });
    expect(properties[SETTING_PATH_MAX_BOXES]).toMatchObject({
      type: "integer",
      default: DEFAULT_PATH_MAX_BOXES,
      minimum: MIN_PATH_MAX_BOXES,
      maximum: MAX_PATH_MAX_BOXES,
    });
  });

  it("tells the user to press Shift+Alt+2 when the centre is gone", () => {
    expect(CENTRE_GONE_MESSAGE).toContain("press Shift+Alt+2");
    expect(CENTRE_GONE_MESSAGE).not.toContain("Ctrl+Alt+S");
  });
});
