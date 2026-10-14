export type FileChange =
  { kind: "added" } | { kind: "modified"; lines: LineSpan[] };

/** One-based, inclusive lines of the new file. */
export type LineSpan = { start: number; end: number };

/** Keyed by path relative to the directory the diff was run in. */
export type ChangeMap = Map<string, FileChange>;

const HUNK = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/;

/**
 * Parses `git diff HEAD -U0 --no-renames` plus the untracked paths. A pure
 * deletion has no new lines, so it is the span between the two lines it
 * falls between.
 */
export function parseDiff(
  diff: string,
  untracked: readonly string[],
): ChangeMap {
  const changes: ChangeMap = new Map();
  for (const path of untracked) changes.set(path, { kind: "added" });

  let isNew = false;
  let current: FileChange | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      isNew = false;
      current = undefined;
    } else if (line.startsWith("--- ")) {
      isNew = line === "--- /dev/null";
    } else if (line.startsWith("+++ ")) {
      if (line === "+++ /dev/null") continue;
      const path = line.slice("+++ b/".length).replace(/\t$/, "");
      current = isNew ? { kind: "added" } : { kind: "modified", lines: [] };
      changes.set(path, current);
    } else if (current?.kind === "modified") {
      const hunk = HUNK.exec(line);
      if (!hunk) continue;
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      current.lines.push(
        count === 0
          ? { start, end: start + 1 }
          : { start, end: start + count - 1 },
      );
    }
  }
  return changes;
}
