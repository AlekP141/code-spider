import { describe, expect, it } from "vitest";
import { NodeNotFoundError } from "../../src/errors.js";
import { identifyAt, targetFor } from "../../src/path/ends.js";
import { memoryProject, MEMORY_ROOT } from "../helpers.js";

const FILES = {
  "src/fns.ts": "export function plain() {\n  return 1\n}\n",
  "src/comp.tsx": "export const Card = () => <div />\n",
  "src/dup.ts": "export class A { run() {} static run() {} }\n",
  "src/only.ts": "export default function () {}\nconst x = 1\n",
  "src/bare.ts": "export const value = 1\n",
  "src/fns.test.ts": "export function check() {}\n",
};

const project = memoryProject(FILES);
const at = (file: string, line: number, character: number) => ({
  file: `${MEMORY_ROOT}/${file}`,
  line,
  character,
  repoRoot: MEMORY_ROOT,
});

describe("identifyAt", () => {
  it("names the function at the cursor with its kind and isTest false", () => {
    expect(identifyAt(project, at("src/fns.ts", 1, 3))).toEqual({
      id: "src/fns.ts#plain",
      name: "plain",
      kind: "function",
      isTest: false,
    });
  });

  it("reports a component as kind component", () => {
    expect(identifyAt(project, at("src/comp.tsx", 0, 25))).toMatchObject({
      id: "src/comp.tsx#Card",
      kind: "component",
    });
  });

  it("falls back to the file's default export", () => {
    expect(identifyAt(project, at("src/only.ts", 1, 2))).toMatchObject({
      id: "src/only.ts#default",
      name: "default",
    });
  });

  it("returns undefined when no function is found", () => {
    expect(identifyAt(project, at("src/bare.ts", 0, 5))).toBeUndefined();
  });

  it("flags a function in a test file", () => {
    expect(identifyAt(project, at("src/fns.test.ts", 0, 20))).toMatchObject({
      id: "src/fns.test.ts#check",
      isTest: true,
    });
  });

  it("still throws for a file that is not in the project", () => {
    expect(() => identifyAt(project, at("src/missing.ts", 0, 0))).toThrow(
      "File is not in project",
    );
  });
});

describe("targetFor", () => {
  it("finds a function by id, including a ~1 duplicate", () => {
    const first = targetFor(project, "src/dup.ts#A.run", MEMORY_ROOT);
    expect(first.name).toBe("run");
    const second = targetFor(project, "src/dup.ts#A.run~1", MEMORY_ROOT);
    expect(second.name).toBe("run");
    expect(second.declaration).not.toBe(first.declaration);
  });

  it("throws NodeNotFoundError with the id for a missing file and for a missing name", () => {
    for (const id of ["src/gone.ts#plain", "src/fns.ts#deleted"]) {
      let error: unknown;
      try {
        targetFor(project, id, MEMORY_ROOT);
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(NodeNotFoundError);
      expect((error as NodeNotFoundError).nodeId).toBe(id);
    }
  });

  it('throws "Not a function" for module, external and unknown ids', () => {
    for (const id of [
      "src/fns.ts#<module>",
      "external:tiny-lib#persist",
      "unknown:thing#x",
    ]) {
      expect(() => targetFor(project, id, MEMORY_ROOT)).toThrow(
        `Not a function: ${id}`,
      );
    }
  });
});
