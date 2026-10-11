// Loads the built webview in Electron and runs the checks in checks-*.js.
// Exit codes: 0 all passed, 1 a check failed, 2 Electron could not start.
import { spawn } from "node:child_process";
import {
  copyFileSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { CACHE_PATH, downloadVSCode } from "../../extension/scripts/vscode.mjs";

const require = createRequire(import.meta.url);
const { THEME, fakeApiSource } = require("./fixtures.js");

const here = dirname(fileURLToPath(import.meta.url));
const webview = join(here, "..");
const runDir = join(CACHE_PATH, "probe-run");
const appDir = join(runDir, "resources", "app");
const GLOBAL_TIMEOUT_MS = 120000;
const FIRST_EVENT_TIMEOUT_MS = 20000;
const HINT =
  "Electron could not start. Run: pnpm --filter code-spider-vscode check:electron";
const LOG_NOISE = /dbus|^\s*$/;

function scrubbedEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "ELECTRON_RUN_AS_NODE" || key.startsWith("VSCODE_")) {
      delete env[key];
    }
  }
  return env;
}

function missingThemeVariables(css) {
  const used = new Set(css.match(/--vscode-[\w-]+/g));
  return [...used].filter((name) => !Object.hasOwn(THEME, name)).sort();
}

/** html.ts is bundled here so the probe never carries its own copy of the CSP. */
async function buildPageHtml() {
  const bundled = await build({
    entryPoints: [join(webview, "../extension/src/panel/html.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", bundled.outputFiles[0].text)(
    loaded,
    loaded.exports,
    require,
  );
  const { buildWebviewHtml, createNonce } = loaded.exports;
  const nonce = createNonce();
  const html = buildWebviewHtml({
    cspSource: "file:",
    nonce,
    scriptUri: "index.js",
    styleUri: "index.css",
  });
  const bundleTag = `<script nonce="${nonce}" src="index.js">`;
  if (!html.includes(bundleTag)) {
    throw new Error("html.ts changed the script tag the probe looks for");
  }
  const setup = `<script nonce="${nonce}">${fakeApiSource(THEME)}</script>`;
  return html.replace(bundleTag, `${setup}\n    ${bundleTag}`);
}

// A symlinked binary resolves to the real VS Code directory and would start
// VS Code itself, so the binary is hard-linked (copied across filesystems).
function placeBinary(from, to) {
  try {
    linkSync(from, to);
  } catch {
    copyFileSync(from, to);
  }
}

function assembleRunDir(executable, html) {
  const source = dirname(executable);
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(join(appDir, "page"), { recursive: true });
  for (const name of readdirSync(source)) {
    if (name === "resources") continue;
    const from = join(source, name);
    if (name === basename(executable)) placeBinary(from, join(runDir, name));
    else symlinkSync(from, join(runDir, name));
  }
  for (const name of readdirSync(here)) {
    if (name !== "run.mjs") copyFileSync(join(here, name), join(appDir, name));
  }
  for (const name of ["index.js", "index.css"]) {
    copyFileSync(join(webview, "dist", name), join(appDir, "page", name));
  }
  writeFileSync(join(appDir, "page", "index.html"), html);
}

let running;

function killGroup(child) {
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // The group is already gone.
  }
}

function cleanup() {
  if (running) killGroup(running);
  rmSync(runDir, { recursive: true, force: true });
}

for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.on(signal, () => {
    cleanup();
    process.exit(code);
  });
}
process.on("exit", cleanup);

class SetupError extends Error {}

async function setupStep(name, action) {
  try {
    return await action();
  } catch (error) {
    const reason = error.errors?.[0]?.text ?? error.message ?? String(error);
    throw new SetupError(`Setup failed (${name}): ${reason.split("\n")[0]}`);
  }
}

function note(line, outcome) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }
  const label = `${event.number}. ${event.name}`;
  if (event.event === "setup") {
    outcome.setup = event;
    clearTimeout(outcome.firstEventTimer);
    if (event.ok && event.appPath !== appDir) {
      outcome.wrongApp = event.appPath;
      killGroup(running);
    }
  }
  if (event.event === "start") outcome.running = label;
  if (event.event === "done") outcome.finished = event.count;
  if (event.event === "pass") {
    outcome.passed += 1;
    outcome.running = undefined;
    console.log(`  ok    ${label} (${event.ms} ms)`);
  }
  if (event.event === "fail") {
    outcome.failure = `${label}: ${event.message}`;
    console.log(`  FAIL  ${label}`);
  }
}

function run(executable) {
  const child = spawn(
    join(runDir, basename(executable)),
    [
      "--no-sandbox",
      "--disable-gpu",
      `--user-data-dir=${join(runDir, "user-data")}`,
    ],
    {
      env: scrubbedEnvironment(),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  running = child;
  const outcome = { passed: 0, stderr: "", timedOut: false };
  let pending = "";
  child.stderr.on("data", (chunk) => {
    outcome.stderr += chunk;
  });
  child.stdout.on("data", (chunk) => {
    const lines = (pending + chunk).split("\n");
    pending = lines.pop();
    for (const line of lines) note(line, outcome);
  });
  return new Promise((resolve) => {
    const timeout = (ms) =>
      setTimeout(() => {
        outcome.timedOut = true;
        killGroup(child);
      }, ms);
    const timer = timeout(GLOBAL_TIMEOUT_MS);
    outcome.firstEventTimer = timeout(FIRST_EVENT_TIMEOUT_MS);
    child.on("close", () => {
      clearTimeout(timer);
      clearTimeout(outcome.firstEventTimer);
      killGroup(child);
      resolve(outcome);
    });
  });
}

function printLog(stderr) {
  const lines = stderr.split("\n").filter((line) => !LOG_NOISE.test(line));
  if (lines.length > 0) console.error(lines.slice(-15).join("\n"));
}

function exitCodeFor(outcome) {
  if (outcome.setup === undefined) {
    printLog(outcome.stderr);
    console.error(outcome.timedOut ? `${HINT} (timed out)` : HINT);
    return 2;
  }
  if (outcome.setup.ok === false) {
    console.error(`Page setup failed: ${outcome.setup.message}`);
    return 2;
  }
  if (outcome.wrongApp !== undefined) {
    console.error(
      `Electron started ${outcome.wrongApp}, not the probe app in ${appDir}`,
    );
    return 2;
  }
  if (outcome.failure) {
    printLog(outcome.stderr);
    console.error(`Check failed: ${outcome.failure}`);
    return 1;
  }
  if (outcome.timedOut && outcome.passed === 0 && !outcome.running) return 2;
  if (outcome.running || outcome.finished !== outcome.passed) {
    printLog(outcome.stderr);
    const why = outcome.timedOut ? "timed out" : "Electron stopped";
    const where = outcome.running ?? "after the last check it reported";
    console.error(`Check failed: ${where}: ${why}`);
    return 1;
  }
  console.log(`${outcome.passed} checks passed`);
  return 0;
}

async function main() {
  if (process.platform !== "linux") {
    console.error("The probe assumes the Linux layout of the VS Code build.");
    return 2;
  }
  const css = readFileSync(join(webview, "dist", "index.css"), "utf8");
  const missing = missingThemeVariables(css);
  if (missing.length > 0) {
    console.error(
      `Setup failed: the probe theme does not define ${missing.join(", ")}`,
    );
    return 1;
  }
  try {
    const executable = await setupStep("VS Code download", downloadVSCode);
    const html = await setupStep("bundling html.ts", buildPageHtml);
    await setupStep("run directory", async () =>
      assembleRunDir(executable, html),
    );
    return exitCodeFor(await run(executable));
  } catch (error) {
    if (!(error instanceof SetupError)) throw error;
    console.error(error.message);
    return 2;
  } finally {
    cleanup();
  }
}

process.exit(await main());
