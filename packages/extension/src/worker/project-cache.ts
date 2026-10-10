import { dirname } from "node:path";
import {
  findTsconfig,
  loadProject,
  warmProject,
  type Project,
} from "@code-spider/core";

/** Warm projects are large; keep only the few most recently used. */
const MAX_PROJECTS = 3;

export type ProjectEntry = {
  tsconfig: string;
  repoRoot: string;
  project: Project;
  warmed: boolean;
};

export class ProjectCache {
  private readonly tsconfigByFile = new Map<string, string>();
  /** Insertion order doubles as recency: the first key is the oldest. */
  private readonly entries = new Map<string, ProjectEntry>();
  private readonly pending = new Map<string, Set<string>>();
  /** Focused files outside a tsconfig's include; kept across eviction. */
  private readonly addedFiles = new Map<string, Set<string>>();

  /** Saved files are applied to each project the next time it is used. */
  noteChanged(files: readonly string[]): void {
    for (const queue of this.pending.values()) {
      for (const file of files) queue.add(file);
    }
  }

  open(file: string): ProjectEntry {
    const entry = this.openTsconfig(this.tsconfigFor(file));
    if (
      !entry.project.getSourceFile(file) &&
      entry.project.addSourceFileAtPathIfExists(file)
    ) {
      this.rememberAdded(entry.tsconfig, file);
    }
    return entry;
  }

  /** Reuses the warm project, or reloads it if it was evicted. */
  openTsconfig(tsconfig: string): ProjectEntry {
    const entry = this.touch(tsconfig) ?? this.load(tsconfig);
    this.refreshChanged(entry);
    return entry;
  }

  warm(entry: ProjectEntry): void {
    if (entry.warmed) return;
    warmProject(entry.project);
    entry.warmed = true;
  }

  private tsconfigFor(file: string): string {
    const known = this.tsconfigByFile.get(file);
    if (known) return known;
    const found = findTsconfig(file);
    this.tsconfigByFile.set(file, found);
    return found;
  }

  private touch(tsconfig: string): ProjectEntry | undefined {
    const entry = this.entries.get(tsconfig);
    if (!entry) return undefined;
    this.entries.delete(tsconfig);
    this.entries.set(tsconfig, entry);
    return entry;
  }

  private load(tsconfig: string): ProjectEntry {
    const entry: ProjectEntry = {
      tsconfig,
      repoRoot: dirname(tsconfig),
      project: loadProject(tsconfig),
      warmed: false,
    };
    for (const file of this.addedFiles.get(tsconfig) ?? []) {
      entry.project.addSourceFileAtPathIfExists(file);
    }
    this.entries.set(tsconfig, entry);
    this.pending.set(tsconfig, new Set());
    this.evictOldest();
    return entry;
  }

  private evictOldest(): void {
    while (this.entries.size > MAX_PROJECTS) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
      this.pending.delete(oldest);
      this.forgetFiles(oldest);
    }
  }

  private rememberAdded(tsconfig: string, file: string): void {
    const files = this.addedFiles.get(tsconfig) ?? new Set<string>();
    files.add(file);
    this.addedFiles.set(tsconfig, files);
  }

  private forgetFiles(tsconfig: string): void {
    for (const [file, owner] of this.tsconfigByFile) {
      if (owner === tsconfig) this.tsconfigByFile.delete(file);
    }
  }

  private refreshChanged(entry: ProjectEntry): void {
    const queue = this.pending.get(entry.tsconfig);
    if (!queue) return;
    for (const file of queue) {
      entry.project.getSourceFile(file)?.refreshFromFileSystemSync();
    }
    queue.clear();
  }
}
