import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Manifest = {
  engines: { vscode: string };
  main: string;
  activationEvents: string[];
  contributes: {
    commands: { command: string; title: string; category: string }[];
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
