import { describe, expect, it } from "vitest";
import { findCallableDeclarations } from "../src/declarations.js";

const find = (lines: string[], fileName = "mod.ts") =>
  findCallableDeclarations(lines.join("\n"), fileName);

describe("findCallableDeclarations", () => {
  it("lists function declarations with bodies, once per implementation", () => {
    expect(
      find([
        "export function plain(a: number): number {",
        "  return a;",
        "}",
        "export async function later(): Promise<void> {}",
        "declare function ambient(): void;",
        "function overload(a: string): void;",
        "function overload(a: number): void;",
        "function overload(a: unknown): void {}",
      ]),
    ).toEqual([
      { name: "plain", lensLine: 0, line: 0, character: 0 },
      { name: "later", lensLine: 3, line: 3, character: 0 },
      { name: "overload", lensLine: 7, line: 7, character: 0 },
    ]);
  });

  it("lists anonymous default exports as default", () => {
    expect(find(["export default function () {}"])).toEqual([
      { name: "default", lensLine: 0, line: 0, character: 0 },
    ]);
    expect(find(["export default () => 1;"])).toEqual([
      { name: "default", lensLine: 0, line: 0, character: 15 },
    ]);
  });

  it("lists arrow and function-expression consts, focusing inside the function", () => {
    expect(
      find([
        "export const arrow = (a: number) => a;",
        "const expr = function () {};",
        "const notAFunction = 3;",
        "const { destructured } = { destructured: () => 1 };",
      ]),
    ).toEqual([
      { name: "arrow", lensLine: 0, line: 0, character: 21 },
      { name: "expr", lensLine: 1, line: 1, character: 13 },
    ]);
  });

  it("looks through as, satisfies, parentheses and known wrappers", () => {
    const names = find([
      "const a = (() => 1) as () => number;",
      "const b = (() => 1) satisfies () => number;",
      "const c = memo(() => null);",
      "const d = React.forwardRef(function Inner() { return null; });",
      "const e = useCallback(async () => {}, []);",
      "const f = memo(forwardRef(() => null));",
      "const g = someOtherCall(() => 1);",
    ]).map((declaration) => declaration.name);
    expect(names).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("lists classes and their named methods and arrow properties", () => {
    expect(
      find([
        "export class Store {",
        "  count = 0;",
        "  bump = () => this.count + 1;",
        "  constructor() {}",
        "  save(): number {",
        "    return this.count;",
        "  }",
        "  #hidden() {}",
        "  static make(): Store {",
        "    return new Store();",
        "  }",
        "}",
      ]),
    ).toEqual([
      { name: "Store", lensLine: 0, line: 0, character: 0 },
      { name: "bump", lensLine: 2, line: 2, character: 9 },
      { name: "save", lensLine: 4, line: 4, character: 2 },
      { name: "make", lensLine: 8, line: 8, character: 2 },
    ]);
  });

  it("lists an anonymous default class as default", () => {
    expect(find(["export default class {}"])).toEqual([
      { name: "default", lensLine: 0, line: 0, character: 0 },
    ]);
  });

  it("skips functions nested inside other functions", () => {
    const names = find([
      "export function outer() {",
      "  const inner = () => 1;",
      "  function deeper() {}",
      "  return inner;",
      "}",
    ]).map((declaration) => declaration.name);
    expect(names).toEqual(["outer"]);
  });

  it("parses JSX in TSX and JSX files", () => {
    const source = ["export const Page = () => <div>hi</div>;"];
    expect(find(source, "page.tsx").map((d) => d.name)).toEqual(["Page"]);
    expect(find(source, "page.jsx").map((d) => d.name)).toEqual(["Page"]);
  });

  it("puts the lens on the declaration line, not on a leading comment", () => {
    expect(
      find(["/** Docs. */", "", "export function documented() {}"]),
    ).toEqual([{ name: "documented", lensLine: 2, line: 2, character: 0 }]);
  });

  it("lists nothing in declaration files", () => {
    expect(
      find(
        ["export declare class Foo {}", "export declare function f(): void;"],
        "types.d.ts",
      ),
    ).toEqual([]);
  });

  it("returns nothing for an empty file", () => {
    expect(find([""])).toEqual([]);
  });
});
