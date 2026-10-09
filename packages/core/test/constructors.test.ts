import { describe, expect, it } from "vitest";
import { analyzeFocus, expandNode } from "../src/analyze.js";
import { MEMORY_ROOT, memoryProject } from "./helpers.js";

const project = memoryProject({
  "src/store.ts": [
    "export function log(m: string): string { return m }",
    "export function load(): string[] { return [] }",
    "export class Store {",
    "  items = load()",
    "  constructor(readonly name: string) {",
    "    log(name)",
    "  }",
    "  save(): void {",
    "    log('save')",
    "  }",
    "}",
    "export class Plain {",
    "  value = 1",
    "}",
    "export class Base {",
    "  constructor(n: number) {}",
    "}",
    "export class Sub extends Base {",
    "  constructor() {",
    "    super(1)",
    "  }",
    "}",
    "",
  ].join("\n"),
  "src/app.tsx": [
    'import { Store, Plain } from "./store";',
    "declare class Component<P> { props: P }",
    "export function boot(): void {",
    "  const s = new Store('s')",
    "  const p = new Plain()",
    "  const m = new Map()",
    "}",
    "export class Counter extends Component<{ start: number }> {",
    "  render(): JSX.Element {",
    "    return <div />",
    "  }",
    "}",
    "export function Page(): JSX.Element {",
    "  return <Counter start={1} />",
    "}",
    "",
  ].join("\n"),
});

function sliceAt(rel: string, needle: string) {
  const file = `${MEMORY_ROOT}/${rel}`;
  const text = project.getSourceFileOrThrow(file).getFullText();
  const offset = text.indexOf(needle);
  if (offset === -1) throw new Error(`needle not found: ${needle}`);
  return analyzeFocus(project, { file, offset, repoRoot: MEMORY_ROOT });
}

const into = (slice: ReturnType<typeof sliceAt>) =>
  slice.edges.filter((e) => e.to === slice.focusId);

describe("classes and constructors", () => {
  it("connects new X() to the class", () => {
    const boot = sliceAt("src/app.tsx", "new Store");
    expect(into(boot).map((e) => [e.from, e.kind, e.supplies])).toEqual([
      ["external:lib#Map", "external", expect.any(String)],
      ["src/store.ts#Plain", "call", "Plain"],
      ["src/store.ts#Store", "call", "Store"],
    ]);
  });

  it("focuses the class from inside its constructor", () => {
    const store = sliceAt("src/store.ts", "log(name)");
    expect(store.focusId).toBe("src/store.ts#Store");
    const focus = store.nodes.find((n) => n.id === store.focusId);
    expect(focus).toMatchObject({ name: "Store", inputType: "string" });
    expect(focus?.codePreview).toMatch(/^export class Store \{/);
  });

  it("gives the class what runs during construction, not its methods' calls", () => {
    const store = sliceAt("src/store.ts", "log(name)");
    expect(into(store).map((e) => e.from)).toEqual([
      "src/store.ts#load",
      "src/store.ts#log",
    ]);
    const save = sliceAt("src/store.ts", "log('save')");
    expect(save.focusId).toBe("src/store.ts#Store.save");
  });

  it("finds where the class is constructed", () => {
    const store = sliceAt("src/store.ts", "log(name)");
    const out = store.edges.filter((e) => e.from === store.focusId);
    expect(out.map((e) => [e.to, e.kind])).toEqual([
      ["src/app.tsx#boot", "call"],
    ]);
  });

  it("expands classes with and without a constructor", () => {
    for (const id of ["src/store.ts#Store", "src/store.ts#Plain"]) {
      expect(expandNode(project, id, MEMORY_ROOT).focusId).toBe(id);
    }
  });

  it("connects super(...) to the base class", () => {
    const sub = sliceAt("src/store.ts", "super(1)");
    expect(into(sub).map((e) => e.from)).toEqual(["src/store.ts#Base"]);
  });

  it("treats a class with a JSX render method as a component", () => {
    const page = sliceAt("src/app.tsx", "<Counter");
    expect(into(page)).toMatchObject([
      {
        from: "src/app.tsx#Counter",
        kind: "jsx",
        supplies: "{ start: number; }",
      },
    ]);
    expect(page.nodes.find((n) => n.id === "src/app.tsx#Counter")?.kind).toBe(
      "component",
    );
  });
});
