import {
  normaliseTestVisibility,
  type TestVisibility,
} from "@code-spider/webview/test-visibility";
import type { MementoPort } from "./column-gap.js";
import { STATE_TEST_VISIBILITY } from "../ids.js";

export class TestVisibilityStore {
  constructor(
    private readonly memento: MementoPort,
    private readonly announce: () => void,
  ) {}

  get(): TestVisibility {
    return normaliseTestVisibility(this.memento.get(STATE_TEST_VISIBILITY));
  }

  async set(raw: unknown): Promise<void> {
    await this.memento.update(
      STATE_TEST_VISIBILITY,
      normaliseTestVisibility(raw),
    );
    this.announce();
  }
}
