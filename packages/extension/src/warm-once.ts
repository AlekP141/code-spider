import { isAnalysableLanguage } from "./changes.js";

export type WarmCandidate = {
  languageId: string;
  uri: { scheme: string; fsPath: string };
};

/** Warms the project of the first TS/JS file the user has open, once. */
export class WarmOnce {
  private done = false;

  constructor(private readonly warm: (file: string) => void) {}

  offer(document: WarmCandidate | undefined): void {
    if (this.done || !document) return;
    if (document.uri.scheme !== "file") return;
    if (!isAnalysableLanguage(document.languageId)) return;
    this.done = true;
    this.warm(document.uri.fsPath);
  }
}
