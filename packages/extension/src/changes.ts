export const ANALYSABLE_LANGUAGE_IDS: readonly string[] = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
];

export function isAnalysableLanguage(languageId: string): boolean {
  return ANALYSABLE_LANGUAGE_IDS.includes(languageId);
}

/** Paths saved since the last analysis request, sent to the worker (spec §8.2). */
export class ChangeTracker {
  private readonly saved = new Set<string>();

  markSaved(languageId: string, fsPath: string): void {
    if (isAnalysableLanguage(languageId)) this.saved.add(fsPath);
  }

  drain(): string[] {
    const files = [...this.saved];
    this.saved.clear();
    return files;
  }
}
