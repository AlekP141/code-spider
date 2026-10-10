import { COLUMN_GAP } from "../column-gap.js";

export type ToolbarProps = {
  canBack: boolean;
  canTidy: boolean;
  columnGap: number;
  onBack(): void;
  onTidy(): void;
  onColumnGap(value: number): void;
};

export function Toolbar(props: ToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Graph controls">
      <button
        type="button"
        className="toolbar-button"
        disabled={!props.canBack}
        onClick={props.onBack}
      >
        {"← Back"}
      </button>
      <button
        type="button"
        className="toolbar-button"
        disabled={!props.canTidy}
        onClick={props.onTidy}
      >
        Tidy
      </button>
      <label className="toolbar-spacing">
        <span>Spacing</span>
        <input
          type="range"
          min={COLUMN_GAP.min}
          max={COLUMN_GAP.max}
          step={COLUMN_GAP.step}
          value={props.columnGap}
          onChange={(event) =>
            props.onColumnGap(Number(event.currentTarget.value))
          }
        />
        <span className="toolbar-value">{`${props.columnGap}px`}</span>
      </label>
    </div>
  );
}
