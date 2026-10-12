import { COLUMN_GAP } from "../settings/column-gap.js";
import { EDGE_STYLES, type EdgeStyle } from "../settings/edge-style.js";

export type ToolbarProps = {
  canBack: boolean;
  canTidy: boolean;
  canRefresh: boolean;
  changedSince: boolean;
  columnGap: number;
  edgeStyle: EdgeStyle;
  onBack(): void;
  onTidy(): void;
  onRefresh(): void;
  onColumnGap(value: number): void;
  onEdgeStyle(value: EdgeStyle): void;
};

const REFRESH_TITLE = "Re-read the code for this graph";
const STYLE_LABELS: Record<EdgeStyle, string> = {
  stepped: "Stepped",
  curved: "Curved",
};
const CHANGED_LABEL = "Files changed since this graph was drawn";

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
      <button
        type="button"
        className="toolbar-button"
        title={props.changedSince ? CHANGED_LABEL : REFRESH_TITLE}
        disabled={!props.canRefresh}
        onClick={props.onRefresh}
      >
        Refresh
        {props.changedSince ? (
          <span className="toolbar-dot" role="img" aria-label={CHANGED_LABEL} />
        ) : null}
      </button>
      <div className="toolbar-lines" role="group" aria-label="Lines">
        {EDGE_STYLES.map((style) => {
          const pressed = style === props.edgeStyle;
          return (
            <button
              key={style}
              type="button"
              className="toolbar-button toolbar-toggle"
              aria-pressed={pressed}
              onClick={() => {
                if (!pressed) props.onEdgeStyle(style);
              }}
            >
              {STYLE_LABELS[style]}
            </button>
          );
        })}
      </div>
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
