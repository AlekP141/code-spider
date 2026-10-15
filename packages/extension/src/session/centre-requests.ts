import type { PanelPort } from "../ports.js";

/** The newest centre request wins; busy stays on until every bracket ends. */
export class CentreRequests {
  private token = 0;
  private outstanding = 0;
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly panel: Pick<PanelPort, "post">) {}

  next(): number {
    this.token += 1;
    for (const listener of this.listeners) listener();
    return this.token;
  }

  latest(): number {
    return this.token;
  }

  isCurrent(token: number): boolean {
    return token === this.token;
  }

  onNext(listener: () => void): void {
    this.listeners.push(listener);
  }

  async busy(work: () => Promise<void>): Promise<void> {
    this.outstanding += 1;
    this.panel.post({ type: "busy", busy: true });
    try {
      await work();
    } finally {
      this.outstanding -= 1;
      if (this.outstanding === 0) {
        this.panel.post({ type: "busy", busy: false });
      }
    }
  }
}
