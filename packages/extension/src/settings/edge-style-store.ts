import {
  normaliseEdgeStyle,
  type EdgeStyle,
} from "@code-spider/webview/edge-style";
import type { MementoPort } from "./column-gap.js";
import { STATE_EDGE_STYLE } from "../ids.js";

export class EdgeStyleStore {
  constructor(
    private readonly memento: MementoPort,
    private readonly announce: () => void,
  ) {}

  get(): EdgeStyle {
    return normaliseEdgeStyle(this.memento.get(STATE_EDGE_STYLE));
  }

  async set(raw: unknown): Promise<void> {
    await this.memento.update(STATE_EDGE_STYLE, normaliseEdgeStyle(raw));
    this.announce();
  }
}
