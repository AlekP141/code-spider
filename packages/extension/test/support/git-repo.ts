import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const IDENTITY = [
  "-c",
  "user.name=Test",
  "-c",
  "user.email=test@example.com",
  "-c",
  "commit.gpgsign=false",
];
const REPO_LOCATING_VARIABLES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_COMMON_DIR",
];

function isolatedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  for (const name of REPO_LOCATING_VARIABLES) delete env[name];
  return env;
}

const created: string[] = [];

export function removeTempDirs(): void {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "code-spider-git-"));
  created.push(dir);
  return dir;
}

export class TestRepo {
  constructor(readonly dir: string) {}

  git(...args: string[]): string {
    return execFileSync("git", [...IDENTITY, ...args], {
      cwd: this.dir,
      env: isolatedEnv(),
      encoding: "utf8",
    });
  }

  write(path: string, content: string): void {
    const full = join(this.dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  commit(message: string): void {
    this.git("add", "-A");
    this.git("commit", "-m", message);
  }

  fakeRemoteDefault(name: string, at = "HEAD"): void {
    this.git("update-ref", `refs/remotes/origin/${name}`, at);
    this.git(
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      `refs/remotes/origin/${name}`,
    );
  }
}

export function createRepo(branch = "main"): TestRepo {
  const repo = new TestRepo(tempDir());
  repo.git("init", "-b", branch);
  return repo;
}

export const lines = (...rows: string[]): string => rows.join("\n") + "\n";
