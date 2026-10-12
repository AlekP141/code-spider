import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { compareFileLists } from "./vsix-files.mjs";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = join(packageDir, "../..");

function fail(message) {
  console.error(`check:vsix failed: ${message}`);
  process.exitCode = 1;
}

function readVsix() {
  const { name, version } = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  );
  const vsixPath = join(repoRoot, `${name}-${version}.vsix`);
  if (!existsSync(vsixPath)) {
    fail(`${vsixPath} does not exist; run pnpm package first`);
    return undefined;
  }
  return unzipSync(new Uint8Array(readFileSync(vsixPath)));
}

function listProblems(entries) {
  const { missing, unexpected } = compareFileLists(Object.keys(entries));
  for (const name of missing) console.error(`missing: ${name}`);
  for (const name of unexpected) console.error(`unexpected: ${name}`);
  return missing.length + unexpected.length > 0;
}

function writeEntries(entries, folder) {
  for (const [name, bytes] of Object.entries(entries)) {
    const target = join(folder, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
}

function readmeMatches(folder) {
  const packaged = readFileSync(join(folder, "extension/readme.md"));
  const source = readFileSync(join(repoRoot, "README.md"));
  return packaged.equals(source);
}

let child;
let stopped = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopped = true;
    child?.kill(signal);
  });
}

function runSmoke(extensionPath) {
  if (stopped) return Promise.resolve(null);
  child = spawn(
    process.execPath,
    ["dist/smoke/run.cjs", "--extension-path", extensionPath],
    { cwd: packageDir, stdio: "inherit" },
  );
  return new Promise((resolve) => {
    child.once("error", () => resolve(null));
    child.once("exit", resolve);
  });
}

async function main() {
  const entries = readVsix();
  if (!entries) return;
  if (listProblems(entries)) {
    fail("the .vsix does not hold exactly the expected files");
    return;
  }

  const folder = mkdtempSync(join(tmpdir(), "code-spider-vsix-"));
  try {
    writeEntries(entries, folder);
    if (!readmeMatches(folder)) {
      fail(
        "extension/readme.md differs from the root README.md; vsce rewrites relative links and #<number> references, so the root README must not use them",
      );
      return;
    }
    if ((await runSmoke(join(folder, "extension"))) !== 0) {
      fail("the smoke tests failed on the unpacked .vsix");
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

await main();
