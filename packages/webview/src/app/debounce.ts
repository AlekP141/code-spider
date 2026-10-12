export class TrailingDebounce<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly delayMs: number,
    private readonly run: (value: T) => void,
  ) {}

  push(value: T): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.run(value);
    }, this.delayMs);
  }

  dispose(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
