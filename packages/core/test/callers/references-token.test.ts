import { describe, expect, it } from "vitest";
import { ts, type Node } from "ts-morph";
import { callerHits } from "../../src/callers/callers.js";
import { findReferenceNodes } from "../../src/callers/references.js";
import { memoryProject, MEMORY_ROOT } from "../helpers.js";

const FILES = {
  "src/lib.ts": "export function target() {}\n",
  "src/a.ts":
    'import { target } from "./lib.js"\nexport const alias = target\n',
  "src/b.ts":
    'import { alias } from "./a.js"\nexport function x() { alias() }\n',
};

function targetName(): Node {
  const lib = memoryProject(FILES).getSourceFileOrThrow(
    `${MEMORY_ROOT}/src/lib.ts`,
  );
  return lib.getFunctionOrThrow("target").getNameNodeOrThrow();
}

function tokenTrippingAfter(allowed: number) {
  let checks = 0;
  const token: ts.CancellationToken = {
    isCancellationRequested: () => checks > allowed,
    throwIfCancellationRequested() {
      checks += 1;
      if (checks > allowed) throw new ts.OperationCanceledException();
    },
  };
  return { token, checks: () => checks };
}

describe("findReferenceNodes with a token", () => {
  it("a token that trips on its first check throws OperationCanceledException", () => {
    const { token } = tokenTrippingAfter(0);
    expect(() => findReferenceNodes(targetName(), token)).toThrow(
      ts.OperationCanceledException,
    );
  });

  it("the token reaches the references of an alias chain too", () => {
    const counting = tokenTrippingAfter(Infinity);
    findReferenceNodes(targetName(), counting.token);
    const plain = counting.checks();
    expect(plain).toBeGreaterThan(0);

    const full = tokenTrippingAfter(Infinity);
    [...callerHits(targetName(), full.token)];
    expect(full.checks()).toBeGreaterThan(plain);

    const tripping = tokenTrippingAfter(plain);
    expect(() => [...callerHits(targetName(), tripping.token)]).toThrow(
      ts.OperationCanceledException,
    );
  });
});
