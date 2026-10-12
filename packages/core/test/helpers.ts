import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Project, ts } from "ts-morph";
import { collectCalleeEdges } from "../src/callees/callees.js";
import { toFocusTarget } from "../src/focus/focus.js";
import { loadProject } from "../src/project/project.js";

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

export const MEMORY_ROOT = "/proj";

/** An in-memory project rooted at MEMORY_ROOT, with the JSX shim preloaded. */
export function memoryProject(files: Record<string, string>): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
      strict: true,
    },
  });
  const shim = readFileSync(testCodePath("jsx", "src/jsx-shim.d.ts"), "utf8");
  project.createSourceFile(`${MEMORY_ROOT}/src/jsx-shim.d.ts`, shim);
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${MEMORY_ROOT}/${path}`, text);
  }
  return project;
}

/** Callee edges of `Page` in `src/page.tsx` within an in-memory project. */
export function collectMemoryPage(files: Record<string, string>) {
  const project = memoryProject(files);
  const file = project.getSourceFileOrThrow(`${MEMORY_ROOT}/src/page.tsx`);
  const target = toFocusTarget(file.getFunctionOrThrow("Page"), file);
  return collectCalleeEdges(target, "src/page.tsx#Page", {
    repoRoot: MEMORY_ROOT,
  });
}
