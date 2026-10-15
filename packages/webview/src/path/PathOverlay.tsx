import type { PathSearch } from "../host/protocol.js";
import { pathOverlayText } from "./path-text.js";

export type PathOverlayProps = {
  search: PathSearch;
  cancelling: boolean;
  onCancel(id: number): void;
};

export function PathOverlay({
  search,
  cancelling,
  onCancel,
}: PathOverlayProps) {
  return (
    <div className="path-overlay" role="status" aria-live="polite">
      <div className="path-overlay-card">
        <span className="path-overlay-text">{pathOverlayText(search)}</span>
        <button
          type="button"
          className="toolbar-button"
          disabled={cancelling}
          onClick={() => onCancel(search.id)}
        >
          {cancelling ? "Cancelling..." : "Cancel"}
        </button>
      </div>
    </div>
  );
}
