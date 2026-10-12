import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type MenuEntry = { command: string; when?: string; group?: string };

export type Manifest = {
  engines: { vscode: string };
  main: string;
  files: string[];
  repository: { type: string; url: string };
  activationEvents: string[];
  contributes: {
    commands: { command: string; title: string; category?: string }[];
    keybindings?: { command: string; key: string; when?: string }[];
    menus?: Record<string, MenuEntry[]>;
    configuration?: {
      properties: Record<
        string,
        { type: string; default: unknown; minimum?: number }
      >;
    };
  };
};

const here = dirname(fileURLToPath(import.meta.url));

export function readManifest(): Manifest {
  const path = join(here, "../../package.json");
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}
