import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffMode } from "@code-spider/webview/diff-mode";
import type { DiffPort, DiffReading } from "../ports.js";
import { parseDiff, type ChangeMap } from "./parse-diff.js";

const run = promisify(execFile);
const GIT_OPTIONS = { maxBuffer: 64 * 1024 * 1024 };
const LOCAL_BASES = ["refs/heads/main", "refs/heads/master"];

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-c", "core.quotepath=off", ...args], {
    cwd,
    ...GIT_OPTIONS,
  });
  return stdout;
}

async function remoteDefault(cwd: string): Promise<string[]> {
  try {
    const name = (
      await git(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
    ).trim();
    return name ? [name] : [];
  } catch {
    return [];
  }
}

async function mergeBase(
  cwd: string,
  candidate: string,
): Promise<string | undefined> {
  try {
    const base = await git(cwd, ["merge-base", "HEAD", candidate]);
    return base.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function findBase(cwd: string): Promise<string | undefined> {
  for (const candidate of [...(await remoteDefault(cwd)), ...LOCAL_BASES]) {
    const base = await mergeBase(cwd, candidate);
    if (base) return base;
  }
  return undefined;
}

async function changesSince(cwd: string, revision: string): Promise<ChangeMap> {
  const [diff, untracked] = await Promise.all([
    git(cwd, [
      "diff",
      revision,
      "-U0",
      "--no-color",
      "--no-ext-diff",
      "--no-renames",
      "--relative",
    ]),
    git(cwd, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  return parseDiff(diff, untracked.split("\n").filter(Boolean));
}

/**
 * Changes relative to `cwd`: uncommitted ones against HEAD, or in "pr" mode
 * everything since the branch left the main branch. Empty outside a
 * repository.
 */
export async function readChanges(
  cwd: string,
  mode: DiffMode,
): Promise<DiffReading> {
  try {
    const base = mode === "pr" ? await findBase(cwd) : undefined;
    const changes = await changesSince(cwd, base ?? "HEAD");
    return { changes, fellBack: mode === "pr" && base === undefined };
  } catch {
    return { changes: new Map(), fellBack: false };
  }
}

export const gitDiff: DiffPort = { changes: readChanges };
