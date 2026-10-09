/**
 * Reports `true` only after the input has stayed on for `delayMs`, and `false`
 * as soon as it turns off, so quick work never flashes a spinner.
 */
export class DelayedFlag {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private shown = false;

  constructor(
    private readonly delayMs: number,
    private readonly onChange: (shown: boolean) => void,
  ) {}

  set(active: boolean): void {
    if (active) {
      if (this.shown || this.timer !== undefined) return;
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.shown = true;
        this.onChange(true);
      }, this.delayMs);
      return;
    }
    this.cancel();
    if (this.shown) {
      this.shown = false;
      this.onChange(false);
    }
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
