import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { findNearestTsconfig, loadProject } from "../src/project.js";
import type { Project } from "ts-morph";

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute path to a file inside a test-code project. */
export function testCodePath(name: string, rel = ""): string {
  return resolve(here, "../../../test-code", name, rel);
}

/** Load a test-code project as a Project, plus its root directory (the repo root for IDs). */
export function loadTestCode(name: string): { project: Project; root: string } {
  const root = testCodePath(name);
  const project = loadProject(join(root, "tsconfig.json"));
  return { project, root };
}
