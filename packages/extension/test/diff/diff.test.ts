import { describe, expect, it } from "vitest";
import { annotateSlice } from "../../src/diff/annotate.js";
import { parseDiff } from "../../src/diff/parse-diff.js";
import { resultFor, setup } from "../support/session-setup.js";

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -2,0 +3,2 @@ x
+one
+two
@@ -9 +11 @@ y
-old
+new
@@ -20,2 +22,0 @@ z
-gone
-gone
diff --git a/src/b c.ts b/src/b c.ts
new file mode 100644
--- /dev/null
+++ b/src/b c.ts\t
@@ -0,0 +1,3 @@
+a
diff --git a/src/del.ts b/src/del.ts
deleted file mode 100644
--- a/src/del.ts
+++ /dev/null
@@ -1 +0,0 @@
-x
`;

describe("parseDiff", () => {
  const changes = parseDiff(DIFF, ["src/new.ts"]);

  it("records the new-side lines of each hunk, deletions as the gap", () => {
    expect(changes.get("src/a.ts")).toEqual({
      kind: "modified",
      lines: [
        { start: 3, end: 4 },
        { start: 11, end: 11 },
        { start: 22, end: 23 },
      ],
    });
  });

  it("treats new files and untracked files as added, and ignores deletions", () => {
    expect(changes.get("src/b c.ts")).toEqual({ kind: "added" });
    expect(changes.get("src/new.ts")).toEqual({ kind: "added" });
    expect(changes.has("src/del.ts")).toBe(false);
  });
});

describe("annotateSlice", () => {
  const slice = resultFor("src/a.ts#f", ["src/b.ts#g", "src/c.ts#h"]).slice;
  const changes = parseDiff(DIFF, ["src/c.ts"]);

  it("marks nodes by file status and overlapping lines", () => {
    const marked = annotateSlice(slice, changes);
    expect(marked.nodes.map((node) => node.change)).toEqual([
      "modified",
      undefined,
      "added",
    ]);
  });

  it("leaves nodes outside the edited lines unmarked", () => {
    const far = parseDiff(
      "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -30 +30 @@\n",
      [],
    );
    expect(annotateSlice(slice, far).nodes[0]?.change).toBeUndefined();
  });
});

describe("GraphSession with a diff", () => {
  it("posts slices with the change marks", async () => {
    const { session, diff, posted } = setup();
    diff.changes.mockResolvedValue({
      changes: parseDiff("", ["src/a.ts"]),
      fellBack: false,
    });
    await session.showGraph({
      file: "/repo/src/a.ts",
      line: 1,
      character: 2,
      isDirty: false,
    });
    const slice = posted.find((message) => message.type === "slice");
    expect(slice?.type === "slice" && slice.slice.nodes[0]?.change).toBe(
      "added",
    );
    expect(diff.changes).toHaveBeenCalledWith("/repo", "uncommitted");
  });
});
