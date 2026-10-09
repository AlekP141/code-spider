import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeFocus, loadProject } from "@code-spider/core";
import { afterAll, describe, expect, it } from "vitest";
import { findCallableDeclarations } from "../src/declarations.js";
import { positionToOffset } from "../src/positions.js";
import { fixturePath } from "./support/fixtures.js";

/** `src/a.ts#Store.save~1` ends with the declaration named `save`. */
function idEndsWith(focusId: string, name: string): boolean {
  return new RegExp(`#(?:[\\w$]+\\.)*${name}(?:~\\d+)?$`).test(focusId);
}

/** Focus every lens position with the real analyser and return the ids. */
function focusAll(projectRoot: string, relativeFile: string) {
  const file = join(projectRoot, relativeFile);
  const text = readFileSync(file, "utf8");
  const project = loadProject(join(projectRoot, "tsconfig.json"));
  const declarations = findCallableDeclarations(text, file);
  expect(declarations.length).toBeGreaterThan(0);

  return declarations.map((declaration) => {
    const offset = positionToOffset(
      text,
      declaration.line,
      declaration.character,
    );
    const slice = analyzeFocus(project, {
      file,
      offset,
      repoRoot: projectRoot,
    });
    return { name: declaration.name, focusId: slice.focusId };
  });
}

describe("CodeLens positions against the analyser", () => {
  it("focus the declaration they sit above in the basic fixture", () => {
    for (const { name, focusId } of focusAll(
      fixturePath("basic"),
      "src/signup.ts",
    )) {
      expect(idEndsWith(focusId, name), `${name} -> ${focusId}`).toBe(true);
    }
  });

  it("focus the components in the jsx fixture", () => {
    const results = focusAll(fixturePath("jsx"), "src/components.tsx");
    expect(results.map((result) => result.name)).toEqual([
      "SignupForm",
      "Page",
    ]);
    for (const { name, focusId } of results) {
      expect(idEndsWith(focusId, name), `${name} -> ${focusId}`).toBe(true);
    }
  });

  describe("every declaration shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-spider-lens-"));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("focuses what the lens names", () => {
      mkdirSync(join(dir, "src"));
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            strict: true,
            types: [],
          },
          include: ["src"],
        }),
      );
      writeFileSync(
        join(dir, "src/mod.ts"),
        [
          "export function plain(): number { return 1 }",
          "export const arrow = (): number => 2",
          "export const expr = function (): number { return 3 }",
          "function useCallback<T>(fn: T): T { return fn }",
          "export const wrapped = useCallback((): number => 4)",
          "export const cast = ((): number => 5) as () => number",
          "export class Store {",
          "  count = 0",
          "  bump = (): number => this.count + 1",
          "  save(): number { return this.count }",
          "  static make(): Store { return new Store() }",
          "}",
          "export default function (): number { return 6 }",
          "",
        ].join("\n"),
      );

      const results = focusAll(dir, "src/mod.ts");
      expect(results.map((result) => result.name)).toEqual([
        "plain",
        "arrow",
        "expr",
        "useCallback",
        "wrapped",
        "cast",
        "Store",
        "bump",
        "save",
        "make",
        "default",
      ]);
      for (const { name, focusId } of results) {
        expect(idEndsWith(focusId, name), `${name} -> ${focusId}`).toBe(true);
      }
    });
  });
});
