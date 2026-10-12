import { normaliseColumnGap } from "@code-spider/webview/column-gap";
import { STATE_COLUMN_GAP } from "../ids.js";

export type MementoPort = {
  get(key: string): unknown;
  update(key: string, value: unknown): PromiseLike<void>;
};

export class ColumnGapStore {
  constructor(
    private readonly memento: MementoPort,
    private readonly announce: () => void,
  ) {}

  get(): number {
    return normaliseColumnGap(this.memento.get(STATE_COLUMN_GAP));
  }

  async set(raw: unknown): Promise<void> {
    await this.memento.update(STATE_COLUMN_GAP, normaliseColumnGap(raw));
    this.announce();
  }
}
