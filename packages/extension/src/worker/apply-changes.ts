import { existsSync } from "node:fs";
import type { ProjectEntry } from "./project-cache.js";

export function applyChangedFiles(
  entry: ProjectEntry,
  files: Iterable<string>,
): void {
  const candidates: string[] = [];
  for (const file of files) {
    const known = entry.project.getSourceFile(file);
    if (known) {
      known.refreshFromFileSystemSync();
    } else if (!entry.notIncluded.has(file) && existsSync(file)) {
      candidates.push(file);
    }
  }
  if (candidates.length === 0) return;
  entry.project.addSourceFilesFromTsConfig(entry.tsconfig);
  for (const file of candidates) {
    if (!entry.project.getSourceFile(file)) entry.notIncluded.add(file);
  }
}
