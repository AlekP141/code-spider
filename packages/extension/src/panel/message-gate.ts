import type { ExtensionToWebview } from "@code-spider/webview/protocol";

type Replayed =
  | "settings"
  | "indexing"
  | "busy"
  | "sourceChanged"
  | "pathStart"
  | "pathSearch";
type Kind = Replayed | "content" | "ephemeral";

function kindOf(message: ExtensionToWebview): Kind {
  switch (message.type) {
    case "slice":
      return message.mode.kind === "centre" ? "content" : "ephemeral";
    case "analysisError":
    case "pathFound":
      return "content";
    case "expandFailed":
    case "refreshed":
    case "refreshFailed":
    case "changeMarks":
      return "ephemeral";
    case "settings":
    case "indexing":
    case "busy":
    case "sourceChanged":
    case "pathStart":
    case "pathSearch":
      return message.type;
  }
}

const REPLAY_ORDER: Replayed[] = [
  "settings",
  "indexing",
  "busy",
  "sourceChanged",
  "pathStart",
  "pathSearch",
];

const isReplayed = (kind: Kind): kind is Replayed =>
  (REPLAY_ORDER as Kind[]).includes(kind);

/**
 * The webview cannot receive messages until its script has run and posted
 * `ready`, and it restores its own graph from saved state. So the gate keeps
 * three kinds apart:
 * - content (a centre slice, a found path, an error) waits for the first
 *   `ready` and is delivered once;
 * - ephemeral messages (an expansion slice, a failed expansion, a refresh
 *   answer, change marks) are sent when ready and dropped otherwise, so a
 *   late answer never reaches a new panel;
 * - settings, indexing, busy, sourceChanged, pathStart and pathSearch are
 *   state: the latest of each replays on every `ready`.
 */
export class MessageGate {
  private ready = false;
  private content: ExtensionToWebview | undefined;
  private readonly replayed = new Map<Replayed, ExtensionToWebview>();

  constructor(private readonly send: (message: ExtensionToWebview) => void) {}

  post(message: ExtensionToWebview): void {
    const kind = kindOf(message);
    if (isReplayed(kind)) this.replayed.set(kind, message);
    if (this.ready) {
      this.send(message);
    } else if (kind === "content") {
      this.content = message;
    }
  }

  markReady(): void {
    this.ready = true;
    for (const kind of REPLAY_ORDER) {
      const message = this.replayed.get(kind);
      if (message) this.send(message);
    }
    if (this.content) {
      this.send(this.content);
      this.content = undefined;
    }
  }

  reset(): void {
    this.ready = false;
    this.content = undefined;
  }
}
