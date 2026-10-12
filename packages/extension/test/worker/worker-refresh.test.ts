import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkerHandler } from "../../src/worker/handler.js";
import type { WorkerResponse } from "../../src/worker/protocol.js";
import { fixturePath } from "../support/fixtures.js";

const basicTsconfig = fixturePath("basic", "tsconfig.json");

describe("createWorkerHandler refresh", () => {
  const refresh = (
    overrides: Partial<{
      focusId: string;
      expanded: string[];
      changedFiles: string[];
    }> = {},
  ) =>
    createWorkerHandler()({
      id: 8,
      kind: "refresh",
      tsconfig: basicTsconfig,
      focusId: "src/signup.ts#handleSignup",
      expanded: [],
      changedFiles: [],
      ...overrides,
    });

  function refreshed(response: WorkerResponse) {
    if (response.kind !== "refreshed") throw new Error(response.kind);
    return response.result;
  }

  it("answers the centre and the expansions in the order asked", () => {
    const response = refresh({
      expanded: ["src/signup.ts#validateUser", "src/signup.ts#createUser"],
    });
    expect(response.id).toBe(8);
    const result = refreshed(response);
    expect(result.centre?.focusId).toBe("src/signup.ts#handleSignup");
    expect(result.expansions.map((item) => item.nodeId)).toEqual([
      "src/signup.ts#validateUser",
      "src/signup.ts#createUser",
    ]);
    expect(result.expansions.map((item) => item.slice.focusId)).toEqual([
      "src/signup.ts#validateUser",
      "src/signup.ts#createUser",
    ]);
    expect(result.repoRoot).toBe(fixturePath("basic"));
    expect(result.tsconfig).toBe(basicTsconfig);
  });

  it("answers no centre and no expansions when the centre is missing", () => {
    const result = refreshed(
      refresh({
        focusId: "src/signup.ts#renamedAway",
        expanded: ["src/signup.ts#validateUser"],
      }),
    );
    expect(result.centre).toBeUndefined();
    expect(result.expansions).toEqual([]);
    expect(result.repoRoot).toBe(fixturePath("basic"));
  });

  it("leaves out a missing expanded id and keeps the others", () => {
    const result = refreshed(
      refresh({
        expanded: [
          "src/signup.ts#validateUser",
          "src/gone.ts#anything",
          "src/signup.ts#renamedAway",
          "src/signup.ts#createUser",
        ],
      }),
    );
    expect(result.centre).toBeDefined();
    expect(result.expansions.map((item) => item.nodeId)).toEqual([
      "src/signup.ts#validateUser",
      "src/signup.ts#createUser",
    ]);
  });

  it("fails the whole request for an expanded id that cannot be expanded", () => {
    const response = refresh({
      expanded: ["src/signup.ts#validateUser", "external:tiny-lib#persist"],
    });
    expect(response.kind).toBe("failed");
    if (response.kind === "failed") {
      expect(response.message).toContain("not expandable");
    }
  });
});

describe("createWorkerHandler refresh with changed files", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "code-spider-refresh-changes-"));
    cpSync(fixturePath("basic"), dir, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("applies the changed files before the slices are made", () => {
    const handle = createWorkerHandler();
    const request = (changedFiles: string[]) =>
      handle({
        id: 9,
        kind: "refresh",
        tsconfig: join(dir, "tsconfig.json"),
        focusId: "src/signup.ts#handleSignup",
        expanded: ["src/signup.ts#validateUser"],
        changedFiles,
      });
    const nodeIds = (response: WorkerResponse) => {
      if (response.kind !== "refreshed") throw new Error(response.kind);
      return response.result.centre?.nodes.map((node) => node.id);
    };
    expect(nodeIds(request([]))).not.toContain("src/signup.ts#extra");

    const file = join(dir, "src/signup.ts");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "  return user\n}",
        "  extra()\n  return user\n}\n\nexport function extra(): number {\n  return 1\n}",
      ),
    );
    expect(nodeIds(request([file]))).toContain("src/signup.ts#extra");
  });
});
