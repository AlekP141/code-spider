import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffPort } from "../ports.js";
import { parseDiff, type ChangeMap } from "./parse-diff.js";

const run = promisify(execFile);
const GIT_OPTIONS = { maxBuffer: 64 * 1024 * 1024 };

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-c", "core.quotepath=off", ...args], {
    cwd,
    ...GIT_OPTIONS,
  });
  return stdout;
}

/** Uncommitted changes against HEAD, relative to `cwd`; empty outside a repository. */
export async function readChanges(cwd: string): Promise<ChangeMap> {
  try {
    const [diff, untracked] = await Promise.all([
      git(cwd, [
        "diff",
        "HEAD",
        "-U0",
        "--no-color",
        "--no-ext-diff",
        "--no-renames",
        "--relative",
      ]),
      git(cwd, ["ls-files", "--others", "--exclude-standard"]),
    ]);
    return parseDiff(diff, untracked.split("\n").filter(Boolean));
  } catch {
    return new Map();
  }
}

export const gitDiff: DiffPort = { changes: readChanges };
