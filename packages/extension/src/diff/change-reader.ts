import type { DiffMode } from "@code-spider/webview/diff-mode";
import type { DiffPort, Notifier } from "../ports.js";
import type { ChangeMap } from "./parse-diff.js";

export const NO_BASE_MESSAGE =
  "Code Spider: no main branch found, showing uncommitted changes.";

export class ChangeReader {
  private warned = false;

  constructor(
    private readonly diff: DiffPort,
    private readonly mode: () => DiffMode,
    private readonly notifier: Notifier,
  ) {}

  /** Reads again when the mode changed while git ran. */
  async read(repoRoot: string): Promise<ChangeMap> {
    for (;;) {
      const mode = this.mode();
      const reading = await this.diff.changes(repoRoot, mode);
      if (this.mode() !== mode) continue;
      if (reading.fellBack && !this.warned) {
        this.warned = true;
        this.notifier.warn(NO_BASE_MESSAGE);
      }
      return reading.changes;
    }
  }

  resetWarning(): void {
    this.warned = false;
  }
}
