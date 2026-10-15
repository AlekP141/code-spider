import {
  annotateRefresh,
  noPathRefreshMessage,
  noticeUnsavedEdits,
  PATH_ENDS_GONE_MESSAGE,
  recordRefresh,
  refreshedMessage,
  refreshFailedMessage,
  REFRESH_CANCELLED_MESSAGE,
} from "./session-refresh.js";
import type { PathRefreshRequest, PathSearchDeps } from "./path-search.js";
import type { Live, PathTracker } from "./path-track.js";

/** A path refresh does not clear the mark and never starts a centre request. */
export async function refreshPath(
  deps: PathSearchDeps,
  tracker: PathTracker,
  request: PathRefreshRequest,
): Promise<void> {
  const { project, generation, focusId, expanded, endId } = request;
  const { worker, panel, notifier, changes, jumps, documents } = deps;
  const { requests, failures, reader, remember } = deps;
  const token = requests.latest();
  tracker.cancelActive();
  const limits = deps.pathLimits();
  const names = new Map(jumps.nodes(project).map((n) => [n.id, n.name]));
  const from = names.get(focusId) ?? focusId;
  const to = names.get(endId) ?? endId;
  const failed = (message: string, live: Live) => {
    if (live()) panel.post(refreshFailedMessage(generation, message));
  };

  await requests.busy(() => {
    noticeUnsavedEdits(project, jumps, documents, notifier);
    const { files, version } = changes.drain();
    return tracker.track({
      purpose: "refresh",
      from,
      to,
      token,
      start: (onProgress) =>
        worker.refreshPath(
          project,
          focusId,
          endId,
          expanded,
          files,
          limits,
          onProgress,
        ),
      settle: async (outcome, live, cancelledByUser) => {
        if (outcome.status === "cancelled") {
          return failed(REFRESH_CANCELLED_MESSAGE, cancelledByUser);
        }
        const analysed = outcome.value;
        const { centre, pathStatus } = analysed;
        if (pathStatus === "none") {
          const timedOut = analysed.pathStoppedBy === "time";
          return failed(noPathRefreshMessage(from, to, timedOut), live);
        }
        if (!centre || pathStatus === "gone") {
          return failed(PATH_ENDS_GONE_MESSAGE, live);
        }
        const marks = await reader.read(analysed.repoRoot);
        const result = annotateRefresh(analysed, marks);
        if (!live() || !result.centre) return;
        remember(recordRefresh(jumps, result, result.centre));
        panel.post(
          refreshedMessage(generation, version, result, result.centre),
        );
      },
      fail: (error) => {
        const message = failures.describe(error, true);
        panel.post(refreshFailedMessage(generation, message));
        failures.notifyCrash(error, message);
      },
    });
  });
}
