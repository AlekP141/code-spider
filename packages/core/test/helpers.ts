import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { findNearestTsconfig, loadProject } from "../src/project.js";
import type { Project } from "ts-morph";

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute path to a file inside a fixture project. */
export function fixturePath(fixture: string, rel = ""): string {
  return resolve(here, "../../../fixtures", fixture, rel);
}

/** Load a fixture as a Project, plus its root directory (the repo root for IDs). */
export function loadFixture(fixture: string): { project: Project; root: string } {
  const root = fixturePath(fixture);
  const project = loadProject(join(root, "tsconfig.json"));
  return { project, root };
}
