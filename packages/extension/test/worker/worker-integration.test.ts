import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnAnalysisWorker } from "../../src/worker/spawn.js";
import {
  WorkerClient,
  WorkerCrashedError,
} from "../../src/worker/worker-client.js";
import { fixturePath, positionOf } from "../support/fixtures.js";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workerPath = join(packageDir, "dist/worker.cjs");
const scratch = mkdtempSync(join(tmpdir(), "code-spider-oom-"));
const hungryWorker = join(scratch, "hungry.cjs");

const signup = fixturePath("basic", "src/signup.ts");
const { line, character } = positionOf(signup, "validateUser(input)", 3);

beforeAll(() => {
  execFileSync(process.execPath, ["build.mjs"], {
    cwd: packageDir,
    stdio: "pipe",
  });
  writeFileSync(
    hungryWorker,
    `const { parentPort } = require("node:worker_threads");
parentPort.on("message", () => {
  const keep = [];
  for (;;) keep.push(new Array(100000).fill(1));
});
`,
  );
}, 120_000);

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("bundled analysis worker", () => {
  it("warms and analyses a fixture in a real worker thread", async () => {
    const client = new WorkerClient(() =>
      spawnAnalysisWorker(workerPath, 2048),
    );
    try {
      await client.warm(signup, []);
      const { slice, repoRoot } = await client.focus(
        signup,
        line,
        character,
        [],
      );
      expect(slice.focusId).toBe("src/signup.ts#handleSignup");
      expect(repoRoot).toBe(fixturePath("basic"));
    } finally {
      client.dispose();
    }
  });

  it("slices around a node of a known tsconfig in a real worker thread", async () => {
    const client = new WorkerClient(() =>
      spawnAnalysisWorker(workerPath, 2048),
    );
    try {
      const tsconfig = fixturePath("basic", "tsconfig.json");
      const answer = await client.sliceForNode(
        tsconfig,
        "src/signup.ts#validateUser",
        [],
      );
      expect(answer.slice.focusId).toBe("src/signup.ts#validateUser");
      expect(answer.repoRoot).toBe(fixturePath("basic"));
      expect(answer.tsconfig).toBe(tsconfig);
    } finally {
      client.dispose();
    }
  });

  it("refreshes a centre and its expansions in a real worker thread", async () => {
    const client = new WorkerClient(() =>
      spawnAnalysisWorker(workerPath, 2048),
    );
    try {
      const tsconfig = fixturePath("basic", "tsconfig.json");
      const answer = await client.refresh(
        tsconfig,
        "src/signup.ts#handleSignup",
        ["src/signup.ts#validateUser", "src/signup.ts#renamedAway"],
        [],
      );
      expect(answer.centre?.focusId).toBe("src/signup.ts#handleSignup");
      expect(answer.expansions.map((item) => item.nodeId)).toEqual([
        "src/signup.ts#validateUser",
      ]);
      expect(answer.repoRoot).toBe(fixturePath("basic"));
      expect(answer.tsconfig).toBe(tsconfig);

      const gone = await client.refresh(tsconfig, "src/gone.ts#f", [], []);
      expect(gone.centre).toBeUndefined();
      expect(gone.expansions).toEqual([]);
    } finally {
      client.dispose();
    }
  });

  it("survives a real out-of-memory worker and starts a fresh one", async () => {
    let spawned = 0;
    const client = new WorkerClient(() => {
      spawned += 1;
      return spawned === 1
        ? spawnAnalysisWorker(hungryWorker, 64)
        : spawnAnalysisWorker(workerPath, 2048);
    });
    try {
      const error = await client
        .focus(signup, line, character, [])
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(WorkerCrashedError);
      expect((error as WorkerCrashedError).outOfMemory).toBe(true);

      const { slice } = await client.focus(signup, line, character, []);
      expect(slice.focusId).toBe("src/signup.ts#handleSignup");
    } finally {
      client.dispose();
    }
  });
});
