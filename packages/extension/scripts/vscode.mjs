import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";

const pinned = JSON.parse(
  readFileSync(new URL("../vscode-version.json", import.meta.url), "utf8"),
);

/** The VS Code build the keybinding check and the smoke tests run against. */
export const VSCODE_VERSION = pinned.version;

export const CACHE_PATH = fileURLToPath(
  new URL("../.vscode-test", import.meta.url),
);

/** Downloads the pinned build into .vscode-test once; returns its executable. */
export function downloadVSCode() {
  return downloadAndUnzipVSCode({
    version: VSCODE_VERSION,
    cachePath: CACHE_PATH,
  });
}
