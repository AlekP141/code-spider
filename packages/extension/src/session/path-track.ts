import type { PathProgress } from "@code-spider/core";
import type { PathSearch } from "@code-spider/webview/protocol";
import type { PanelPort } from "../ports.js";
import type { Cancellable, PathRun } from "../worker/path-run.js";
import type { CentreRequests } from "./centre-requests.js";

export type Live = () => boolean;

export type Job<T> = {
  purpose: PathSearch["purpose"];
  from: string;
  to: string;
  token: number;
  start: (onProgress: (progress: PathProgress) => void) => PathRun<T>;
  settle: (
    outcome: Cancellable<T>,
    live: Live,
    cancelledByUser: Live,
  ) => Promise<void>;
  fail: (error: unknown) => void;
};

export class PathTracker {
  private active:
    | { id: number; cancel: () => void; userCancelled: boolean }
    | undefined;
  private lastId = 0;

  constructor(
    private readonly panel: PanelPort,
    private readonly requests: CentreRequests,
  ) {
    requests.onNext(() => this.cancelActive());
  }

  cancel(id: number): void {
    if (this.active?.id !== id) return;
    this.active.userCancelled = true;
    this.active.cancel();
  }

  /** The panel closed: cancel and end the state now, so a reopened panel replays none. */
  abandon(): void {
    const active = this.active;
    if (!active) return;
    active.cancel();
    this.active = undefined;
    this.panel.post({ type: "pathSearch", search: undefined });
  }

  cancelActive(): void {
    this.active?.cancel();
  }

  /**
   * One run at a time owns the `pathSearch` state. A run that a newer one
   * replaced posts nothing; every other exit ends the state.
   */
  async track<T>(job: Job<T>): Promise<void> {
    const { panel, requests } = this;
    const id = ++this.lastId;
    let run: PathRun<T> | undefined;
    const entry = { id, cancel: () => run?.cancel(), userCancelled: false };
    this.active = entry;
    const owns = () => this.active === entry;
    const current = () =>
      owns() && requests.isCurrent(job.token) && panel.isOpen();
    const live = () => current() && !entry.userCancelled;
    const cancelledByUser = () => current() && entry.userCancelled;
    const post = (search: PathSearch | undefined) =>
      panel.post({ type: "pathSearch", search });
    const state: PathSearch = {
      id,
      purpose: job.purpose,
      from: job.from,
      to: job.to,
      checked: 0,
      routes: 0,
      routesCapped: false,
    };
    post(state);
    try {
      run = job.start((progress) => {
        if (owns()) post({ ...state, ...progress });
      });
      await job.settle(await run.result, live, cancelledByUser);
    } catch (error) {
      if (live()) job.fail(error);
    } finally {
      if (owns()) {
        this.active = undefined;
        post(undefined);
      }
    }
  }
}
