import { isTrackedPath } from "./watched-paths.js";

export const ANALYSABLE_LANGUAGE_IDS: readonly string[] = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
];

export function isAnalysableLanguage(languageId: string): boolean {
  return ANALYSABLE_LANGUAGE_IDS.includes(languageId);
}

export type Drained = { files: string[]; version: number };

/** Changed paths since the last request, and a count of every change recorded. */
export class ChangeTracker {
  private readonly changed = new Set<string>();
  private version = 0;

  constructor(private readonly onMarked?: (version: number) => void) {}

  mark(fsPath: string): void {
    if (!isTrackedPath(fsPath)) return;
    this.changed.add(fsPath);
    this.version += 1;
    this.onMarked?.(this.version);
  }

  drain(): Drained {
    const files = [...this.changed];
    this.changed.clear();
    return { files, version: this.version };
  }
}
