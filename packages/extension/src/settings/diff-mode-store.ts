import {
  normaliseDiffMode,
  type DiffMode,
} from "@code-spider/webview/diff-mode";
import type { MementoPort } from "./column-gap.js";
import { STATE_DIFF_MODE } from "../ids.js";

export class DiffModeStore {
  constructor(
    private readonly memento: MementoPort,
    private readonly announce: () => void,
  ) {}

  get(): DiffMode {
    return normaliseDiffMode(this.memento.get(STATE_DIFF_MODE));
  }

  async set(raw: unknown): Promise<void> {
    await this.memento.update(STATE_DIFF_MODE, normaliseDiffMode(raw));
    this.announce();
  }
}
