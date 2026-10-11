import { describe, expect, it } from "vitest";
import { expandNode } from "../src/analyze.js";
import { NodeNotFoundError } from "../src/errors.js";
import { loadTestCode } from "./helpers.js";

describe("NodeNotFoundError", () => {
  const { project, root } = loadTestCode("basic");

  function thrownBy(nodeId: string): unknown {
    try {
      expandNode(project, nodeId, root);
    } catch (error) {
      return error;
    }
    throw new Error("expandNode did not throw");
  }

  it("is thrown for a missing file with the old message", () => {
    const error = thrownBy("src/gone.ts#createUser");
    expect(error).toBeInstanceOf(NodeNotFoundError);
    expect((error as Error).message).toBe(
      "Node not found (missing file): src/gone.ts#createUser",
    );
  });

  it("is thrown for a missing declaration with the old message", () => {
    const error = thrownBy("src/signup.ts#deleted");
    expect(error).toBeInstanceOf(NodeNotFoundError);
    expect((error as Error).message).toBe(
      "Node not found: src/signup.ts#deleted",
    );
  });

  it("is not thrown for an external or module id", () => {
    for (const id of ["external:tiny-lib#persist", "src/signup.ts#<module>"]) {
      const error = thrownBy(id);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(NodeNotFoundError);
      expect((error as Error).message).toContain("not expandable");
    }
  });
});
