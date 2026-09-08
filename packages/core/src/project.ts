import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { Project } from "ts-morph";

export { Project };

/**
 * Walk up from `startFile` looking for the nearest tsconfig.json.
 * Spec §11 risk 3: in a monorepo with several tsconfigs this picks the nearest,
 * which is a documented v1 limitation.
 */
export function findNearestTsconfig(startFile: string): string {
  let dir = dirname(startFile);
  const root = parse(dir).root;

  for (;;) {
    const candidate = join(dir, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    if (dir === root) break;
    dir = dirname(dir);
  }

  throw new Error(`No tsconfig.json found above ${startFile}`);
}

export function loadProject(tsConfigFilePath: string): Project {
  return new Project({ tsConfigFilePath });
}
