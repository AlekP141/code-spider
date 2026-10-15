import type { PathMark } from "@code-spider/webview/protocol";

export class PathStart {
  private mark: PathMark | undefined;
  private readonly listeners: ((mark: PathMark | undefined) => void)[] = [];

  get(): PathMark | undefined {
    return this.mark;
  }

  set(mark: PathMark): void {
    this.mark = mark;
    this.notify();
  }

  clear(): void {
    if (!this.mark) return;
    this.mark = undefined;
    this.notify();
  }

  onChange(listener: (mark: PathMark | undefined) => void): void {
    this.listeners.push(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.mark);
  }
}
