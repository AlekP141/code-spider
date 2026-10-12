import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMAND_SHOW_GRAPH, COMMAND_SHOW_IN_CODE_SPIDER } from "../src/ids.js";
import { readManifest } from "./support/manifest.js";

const here = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(join(here, "../../../README.md"), "utf8");

describe("root README", () => {
  const manifest = readManifest();

  function commandOf(id: string) {
    const command = manifest.contributes.commands.find(
      (entry) => entry.command === id,
    );
    if (!command) throw new Error(`No command ${id} in the manifest`);
    return command;
  }

  it("names the VS Code version the manifest requires", () => {
    const [major, minor] = manifest.engines.vscode.replace("^", "").split(".");
    expect(readme).toContain(`VS Code ${major}.${minor} or newer`);
  });

  it("gives the three ways to open a graph", () => {
    const binding = manifest.contributes.keybindings?.find(
      (entry) => entry.command === COMMAND_SHOW_GRAPH,
    );
    const key = binding?.key;
    const macKey = binding?.mac?.replace("alt", "option");
    const showGraph = commandOf(COMMAND_SHOW_GRAPH);
    const contextMenu = commandOf(COMMAND_SHOW_IN_CODE_SPIDER);

    expect(key).toBeDefined();
    expect(readme.toLowerCase()).toContain(key);
    expect(macKey).toBeDefined();
    expect(readme.toLowerCase()).toContain(`\`${macKey}\` on a mac`);
    expect(readme).toContain(`${showGraph.category}: ${showGraph.title}`);
    expect(readme).toContain(contextMenu.title);
  });

  it("gives the build and install commands and the extension id", () => {
    const id = `${manifest.publisher}.${manifest.name}`;

    expect(readme).toContain("pnpm install");
    expect(readme).toContain("pnpm package");
    expect(readme).toContain("code --install-extension");
    expect(readme).toContain("Install from VSIX");
    expect(readme).toContain(`code --uninstall-extension ${id}`);
  });

  it("has no relative links, images or issue numbers", () => {
    const links = [...readme.matchAll(/!?\[[^\]]*\]\(([^)]*)\)/g)];
    const relative = links.filter(
      (link) => !/^(https?:|mailto:)/.test(link[1] ?? ""),
    );

    expect(relative).toEqual([]);
    expect(readme).not.toMatch(/!\[/);
    expect(readme).not.toMatch(/<(img|a)\b/i);
    expect(readme).not.toMatch(/#\d/);
  });
});
