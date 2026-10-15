import { describe, expect, it } from "vitest";
import { callerHits } from "../../src/callers/callers.js";
import { toFocusTarget } from "../../src/focus/focus.js";
import { memoryProject, MEMORY_ROOT } from "../helpers.js";

const LIB =
  "export function target(n: number): number { return n }\nexport function Card() { return null }\n";

function hitsOf(files: Record<string, string>, name = "target") {
  const project = memoryProject({ "src/lib.ts": LIB, ...files });
  const lib = project.getSourceFileOrThrow(`${MEMORY_ROOT}/src/lib.ts`);
  const target = toFocusTarget(lib.getFunctionOrThrow(name), lib);
  return [...callerHits(target.nameNode)];
}

describe("callerHits", () => {
  it("yields call, JSX and passes hits in reference order with their use-site nodes", () => {
    const hits = hitsOf(
      {
        "src/use.tsx": [
          'import { Card } from "./lib.js"',
          "export function a() { return Card() }",
          "export function b() { return [1].map(Card) }",
          "export const c = () => <Card />",
        ].join("\n"),
      },
      "Card",
    );
    expect(hits.map((hit) => hit.kind)).toEqual(["call", "passes", "jsx"]);
    expect(hits[0]?.site.getText()).toBe("Card()");
    expect(hits[1]?.site.getText()).toBe("[1].map(Card)");
    expect(hits[2]?.site.getText()).toBe("<Card />");
    expect(hits[0]?.ref.getText()).toBe("Card");
  });

  it("yields a hit with no caller for top-level use", () => {
    const [hit] = hitsOf({
      "src/use.ts": 'import { target } from "./lib.js"\ntarget(1)\n',
    });
    expect(hit?.caller).toBeUndefined();
    expect(hit?.sourceFile.getBaseName()).toBe("use.ts");
  });

  it("leaves out the target's own name and references that are no use", () => {
    const hits = hitsOf({
      "src/use.ts": [
        'import { target } from "./lib.js"',
        "export type T = typeof target",
        "export function a() { return target(1) }",
      ].join("\n"),
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.caller?.name).toBe("a");
    expect(hits.every((hit) => hit.ref.getText() === "target")).toBe(true);
  });

  it("follows const alias chains", () => {
    const hits = hitsOf({
      "src/use.ts": [
        'import { target } from "./lib.js"',
        "const first = target",
        "const second = first",
        "export function a() { return second(1) }",
      ].join("\n"),
    });
    const callers = hits.filter((hit) => hit.kind === "call");
    expect(callers.map((hit) => hit.caller?.name)).toEqual(["a"]);
  });

  it("a hit's caller is the innermost named function (arrow const, method)", () => {
    const hits = hitsOf({
      "src/use.ts": [
        'import { target } from "./lib.js"',
        "export const arrow = () => target(1)",
        "export class Box { run() { return target(2) } }",
        "export function outer() { return [1].map((n) => target(n)) }",
      ].join("\n"),
    });
    expect(hits.map((hit) => hit.caller?.name)).toEqual([
      "arrow",
      "run",
      "outer",
    ]);
  });
});
