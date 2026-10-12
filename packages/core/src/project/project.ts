import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Project, ts } from "ts-morph";
import { memoiseTsMorphPaths } from "./ts-morph-paths.js";

export { Project };

/**
 * The largest tsconfig.json above `file` that actually includes it, so a file
 * inside a package of a split-up repo sees callers in the rest of the repo.
 * The search stops at the git repository root; outside a repository it falls
 * back to the nearest tsconfig.json.
 */
export function findTsconfig(file: string): string {
  const candidates = tsconfigsAbove(file);
  const nearest = candidates[0];
  if (!nearest) throw new Error(`No tsconfig.json found above ${file}`);
  const largest = candidates
    .slice(1)
    .reverse()
    .find((tsconfig) => includesFile(tsconfig, file));
  return largest ?? nearest;
}

/** Nearest first, up to the git root; just the nearest outside a repository. */
function tsconfigsAbove(file: string): string[] {
  const found: string[] = [];
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const candidate = join(dir, "tsconfig.json");
    if (existsSync(candidate)) found.push(candidate);
    if (existsSync(join(dir, ".git"))) return found;
    if (dirname(dir) === dir) return found.slice(0, 1);
  }
}

function includesFile(tsconfig: string, file: string): boolean {
  const { config, error } = ts.readConfigFile(tsconfig, ts.sys.readFile);
  if (error) return false;
  const { fileNames } = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    dirname(tsconfig),
  );
  const target = resolve(file);
  return fileNames.some((name) => resolve(name) === target);
}

export function loadProject(tsConfigFilePath: string): Project {
  memoiseTsMorphPaths();
  return new Project({ tsConfigFilePath });
}

/**
 * Builds what the first analysis would otherwise build: the type checker,
 * which binds every file.
 */
export function warmProject(project: Project): void {
  project.getProgram().compilerObject.getTypeChecker();
}
