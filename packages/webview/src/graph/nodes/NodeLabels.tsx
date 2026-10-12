import type { LabelLine } from "./supplier-labels.js";

export function NodeLabels({ lines }: { lines: readonly LabelLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="node-labels">
      {lines.map((line) => (
        <span
          key={line.kind}
          className={`node-label label-${line.kind}`}
          title={line.text}
        >
          {line.text}
        </span>
      ))}
    </div>
  );
}
