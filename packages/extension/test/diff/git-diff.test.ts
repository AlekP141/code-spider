import { realpathSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { readChanges } from "../../src/diff/git-diff.js";
import {
  createRepo,
  lines,
  removeTempDirs,
  tempDir,
  type TestRepo,
} from "../support/git-repo.js";

afterEach(removeTempDirs);

const SIX = lines("l1", "l2", "l3", "l4", "l5", "l6");

function baseRepo(branch = "main"): TestRepo {
  const repo = createRepo(branch);
  repo.write("a.ts", SIX);
  repo.write("c.ts", SIX);
  repo.commit("base");
  return repo;
}

function modifiedLines(changes: Map<string, unknown>, path: string) {
  const change = changes.get(path);
  return change && typeof change === "object" && "lines" in change
    ? change.lines
    : undefined;
}

describe("readChanges", () => {
  it("uncommitted mode reports uncommitted edits and untracked files, not commits already made on the branch", async () => {
    const repo = baseRepo();
    repo.git("checkout", "-b", "feature");
    repo.write("a.ts", lines("l1", "edited", "l3", "l4", "l5", "l6"));
    repo.write("b.ts", "b\n");
    repo.commit("on the branch");
    repo.write("a.ts", lines("l1", "edited", "l3", "l4", "again", "l6"));
    repo.write("u.ts", "u\n");

    const { changes, fellBack } = await readChanges(repo.dir, "uncommitted");

    expect(fellBack).toBe(false);
    expect([...changes.keys()].sort()).toEqual(["a.ts", "u.ts"]);
    expect(modifiedLines(changes, "a.ts")).toEqual([{ start: 5, end: 5 }]);
    expect(changes.get("u.ts")).toEqual({ kind: "added" });
  });

  it("pr mode reports commits on the branch, uncommitted edits and untracked files, and not what landed on the base after branching", async () => {
    const repo = baseRepo();
    repo.git("checkout", "-b", "feature");
    repo.write("a.ts", lines("l1", "edited", "l3", "l4", "l5", "l6"));
    repo.write("d.ts", "d\n");
    repo.commit("on the branch");
    repo.git("checkout", "main");
    repo.write("c.ts", lines("main edit", "l2", "l3", "l4", "l5", "l6"));
    repo.commit("landed on main");
    repo.git("checkout", "feature");
    repo.write("a.ts", lines("l1", "edited", "l3", "l4", "again", "l6"));
    repo.write("u.ts", "u\n");

    const { changes, fellBack } = await readChanges(repo.dir, "pr");

    expect(fellBack).toBe(false);
    expect([...changes.keys()].sort()).toEqual(["a.ts", "d.ts", "u.ts"]);
    expect(modifiedLines(changes, "a.ts")).toEqual([
      { start: 2, end: 2 },
      { start: 5, end: 5 },
    ]);
    expect(changes.get("d.ts")).toEqual({ kind: "added" });
  });

  it("pr spans use the line numbers of the file on disk (an uncommitted line added above a committed change shifts it)", async () => {
    const repo = baseRepo();
    repo.git("checkout", "-b", "feature");
    repo.write("a.ts", lines("l1", "l2", "edited", "l4", "l5", "l6"));
    repo.commit("on the branch");
    repo.write("a.ts", lines("top", "l1", "l2", "edited", "l4", "l5", "l6"));

    const { changes } = await readChanges(repo.dir, "pr");

    expect(modifiedLines(changes, "a.ts")).toEqual([
      { start: 1, end: 1 },
      { start: 4, end: 4 },
    ]);
  });

  it("pr uses the remote default branch whatever its name, ahead of a local main", async () => {
    const repo = baseRepo();
    repo.fakeRemoteDefault("trunk");
    repo.write("x.ts", "x\n");
    repo.commit("main moved on");
    repo.git("checkout", "-b", "feature");
    repo.write("f.ts", "f\n");
    repo.commit("on the branch");

    const { changes, fellBack } = await readChanges(repo.dir, "pr");

    expect(fellBack).toBe(false);
    expect([...changes.keys()].sort()).toEqual(["f.ts", "x.ts"]);
  });

  it("pr skips an origin/HEAD that points at a missing ref and uses local main", async () => {
    const repo = baseRepo();
    repo.git(
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "refs/remotes/origin/gone",
    );
    repo.git("checkout", "-b", "feature");
    repo.write("f.ts", "f\n");
    repo.commit("on the branch");

    const { changes, fellBack } = await readChanges(repo.dir, "pr");

    expect(fellBack).toBe(false);
    expect([...changes.keys()]).toEqual(["f.ts"]);
  });

  it("pr uses local main when there is no origin/HEAD", async () => {
    const repo = baseRepo();
    repo.git("checkout", "-b", "feature");
    repo.write("f.ts", "f\n");
    repo.commit("on the branch");

    const { changes, fellBack } = await readChanges(repo.dir, "pr");

    expect(fellBack).toBe(false);
    expect([...changes.keys()]).toEqual(["f.ts"]);
  });

  it("pr uses master when there is no main", async () => {
    const repo = baseRepo("master");
    repo.git("checkout", "-b", "feature");
    repo.write("f.ts", "f\n");
    repo.commit("on the branch");

    const { changes, fellBack } = await readChanges(repo.dir, "pr");

    expect(fellBack).toBe(false);
    expect([...changes.keys()]).toEqual(["f.ts"]);
  });

  it("pr prefers main over master", async () => {
    const repo = baseRepo();
    repo.git("checkout", "-b", "master");
    repo.write("x.ts", "x\n");
    repo.commit("master moved on");
    repo.git("checkout", "-b", "feature");
    repo.write("f.ts", "f\n");
    repo.commit("on the branch");

    const { changes } = await readChanges(repo.dir, "pr");

    expect([...changes.keys()].sort()).toEqual(["f.ts", "x.ts"]);
  });

  it("pr with no base branch reads the uncommitted changes and sets fellBack", async () => {
    const repo = baseRepo("dev");
    repo.write("b.ts", "b\n");
    repo.commit("committed on dev");
    repo.write("a.ts", lines("l1", "l2", "l3", "l4", "l5", "edited"));
    repo.write("u.ts", "u\n");

    const reading = await readChanges(repo.dir, "pr");
    const uncommitted = await readChanges(repo.dir, "uncommitted");

    expect(reading.fellBack).toBe(true);
    expect(reading.changes).toEqual(uncommitted.changes);
    expect([...reading.changes.keys()].sort()).toEqual(["a.ts", "u.ts"]);
  });

  it("pr on the base branch itself equals the uncommitted reading and does not fall back", async () => {
    const repo = baseRepo();
    repo.write("a.ts", lines("edited", "l2", "l3", "l4", "l5", "l6"));
    repo.write("u.ts", "u\n");

    const reading = await readChanges(repo.dir, "pr");
    const uncommitted = await readChanges(repo.dir, "uncommitted");

    expect(reading.fellBack).toBe(false);
    expect(reading.changes).toEqual(uncommitted.changes);
    expect(reading.changes.size).toBe(2);
  });

  it("outside a git repository both modes give an empty map and no fallback", async () => {
    const dir = tempDir();
    for (const mode of ["uncommitted", "pr"] as const) {
      const { changes, fellBack } = await readChanges(dir, mode);
      expect(changes.size).toBe(0);
      expect(fellBack).toBe(false);
    }
  });

  it("a repository with no commit gives an empty map and no fallback in both modes", async () => {
    const repo = createRepo();
    repo.write("a.ts", SIX);
    for (const mode of ["uncommitted", "pr"] as const) {
      const { changes, fellBack } = await readChanges(repo.dir, mode);
      expect(changes.size).toBe(0);
      expect(fellBack).toBe(false);
    }
  });
});

describe("TestRepo", () => {
  it("builds its own repository even when GIT_DIR points elsewhere", () => {
    const outside = tempDir();
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = outside;
    try {
      const repo = baseRepo();
      const top = repo.git("rev-parse", "--show-toplevel").trim();
      expect(realpathSync(top)).toBe(realpathSync(repo.dir));
      expect(repo.git("log", "--format=%s").trim()).toBe("base");
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
    }
  });
});
