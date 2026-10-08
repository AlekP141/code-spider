import { describe, expect, it } from "vitest";
import { analyzeFocus } from "../src/analyze.js";
import {
  loadTestCode,
  memoryProject,
  MEMORY_ROOT,
  testCodePath,
} from "./helpers.js";

function offsetOf(
  project: ReturnType<typeof loadTestCode>["project"],
  file: string,
  needle: string,
) {
  const at = project.getSourceFileOrThrow(file).getFullText().indexOf(needle);
  if (at === -1) throw new Error(`needle not found: ${needle}`);
  return at;
}

describe("analyzeFocus", () => {
  const { project, root } = loadTestCode("basic");
  const req = {
    file: testCodePath("basic", "src/signup.ts"),
    offset: offsetOf(project, "signup.ts", "const valid = validateUser"),
    repoRoot: root,
  };

  it("produces a slice focused on the enclosing function", () => {
    const slice = analyzeFocus(project, req);

    expect(slice.focusId).toBe("src/signup.ts#handleSignup");
    expect(slice.truncated).toBe(false);
  });

  it("includes the focus node itself exactly once", () => {
    const slice = analyzeFocus(project, req);

    expect(slice.nodes.filter((n) => n.id === slice.focusId)).toHaveLength(1);
  });

  it("includes both callers and all callees", () => {
    const slice = analyzeFocus(project, req);

    expect(slice.nodes.map((n) => n.id).sort()).toEqual([
      "src/app.ts#main",
      "src/app.ts#retry",
      "src/signup.ts#createUser",
      "src/signup.ts#handleSignup",
      "src/signup.ts#sendWelcome",
      "src/signup.ts#validateUser",
    ]);
  });

  it("returns nodes and edges in a stable order", () => {
    const slice = analyzeFocus(project, req);
    const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

    expect(analyzeFocus(project, req)).toEqual(slice);
    expect(slice.nodes.map((n) => n.id)).toEqual(
      slice.nodes.map((n) => n.id).sort(byCodeUnit),
    );
    expect(slice.edges.map((e) => e.id)).toEqual(
      slice.edges.map((e) => e.id).sort(byCodeUnit),
    );
  });

  it("matches the golden slice", async () => {
    const slice = analyzeFocus(project, req);

    await expect(JSON.stringify(slice, null, 2)).toMatchFileSnapshot(
      "./__goldens__/basic-handleSignup.json",
    );
  });
});

describe("analyzeFocus — recursion", () => {
  const project = memoryProject({
    "src/rec.ts": [
      "export function countdown(n: number): number {",
      "  if (n <= 0) return 0",
      "  return countdown(n - 1)",
      "}",
      "",
    ].join("\n"),
  });
  const file = `${MEMORY_ROOT}/src/rec.ts`;
  const slice = analyzeFocus(project, {
    file,
    offset: offsetOf(project, file, "countdown(n - 1)"),
    repoRoot: MEMORY_ROOT,
  });

  it("emits no self-loop edge", () => {
    expect(slice.edges.some((e) => e.from === e.to)).toBe(false);
  });

  it("keeps the focus node exactly once", () => {
    expect(slice.nodes.filter((n) => n.id === slice.focusId)).toHaveLength(1);
  });
});

describe("analyzeFocus — jsx golden", () => {
  const { project, root } = loadTestCode("jsx");

  it("matches the golden slice", async () => {
    const slice = analyzeFocus(project, {
      file: testCodePath("jsx", "src/components.tsx"),
      offset: offsetOf(project, "components.tsx", "<SignupForm"),
      repoRoot: root,
    });

    await expect(JSON.stringify(slice, null, 2)).toMatchFileSnapshot(
      "./__goldens__/jsx-Page.json",
    );
  });
});
