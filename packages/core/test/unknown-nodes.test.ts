import { describe, expect, it } from "vitest";
import { analyzeFocus, expandNode } from "../src/analyze.js";
import { MEMORY_ROOT, memoryProject } from "./helpers.js";

const project = memoryProject({
  "src/page.tsx": [
    "type Props = { onPick: () => void }",
    "export function Shell(props: Props): void {",
    "  props.onPick()",
    "}",
    "export function Other(props: Props): void {",
    "  props.onPick()",
    "}",
    "",
  ].join("\n"),
});

function unknownIdsOf(needle: string): string[] {
  const file = `${MEMORY_ROOT}/src/page.tsx`;
  const text = project.getSourceFileOrThrow(file).getFullText();
  const slice = analyzeFocus(project, {
    file,
    offset: text.indexOf(needle),
    repoRoot: MEMORY_ROOT,
  });
  return slice.nodes.filter((n) => n.kind === "unknown").map((n) => n.id);
}

describe("unknown nodes", () => {
  it("belong to the function that makes the call", () => {
    const shell = unknownIdsOf("export function Shell");
    const other = unknownIdsOf("export function Other");
    expect(shell).toEqual(["unknown:src/page.tsx#Shell#props.onPick"]);
    expect(other).toEqual(["unknown:src/page.tsx#Other#props.onPick"]);
  });

  it("are not expandable", () => {
    expect(() =>
      expandNode(
        project,
        "unknown:src/page.tsx#Shell#props.onPick",
        MEMORY_ROOT,
      ),
    ).toThrow(/not expandable/);
  });
});
