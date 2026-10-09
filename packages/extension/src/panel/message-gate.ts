import type { ExtensionToWebview } from "@code-spider/webview/protocol";

type Channel = "content" | "busy" | "indexing";

const CHANNEL_OF: Record<ExtensionToWebview["type"], Channel> = {
  slice: "content",
  analysisError: "content",
  busy: "busy",
  indexing: "indexing",
};

const REPLAY_ORDER: Channel[] = ["indexing", "busy", "content"];

/**
 * The webview cannot receive messages until its script has run and posted
 * `ready`. The gate remembers the latest message per channel and replays them
 * on every `ready`, which also restores a reloaded webview.
 */
export class MessageGate {
  private ready = false;
  private readonly latest = new Map<Channel, ExtensionToWebview>();

  constructor(private readonly send: (message: ExtensionToWebview) => void) {}

  post(message: ExtensionToWebview): void {
    this.latest.set(CHANNEL_OF[message.type], message);
    if (this.ready) this.send(message);
  }

  markReady(): void {
    this.ready = true;
    for (const channel of REPLAY_ORDER) {
      const message = this.latest.get(channel);
      if (message) this.send(message);
    }
  }

  reset(): void {
    this.ready = false;
    this.latest.delete("content");
  }
}
