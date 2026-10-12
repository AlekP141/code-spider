"use strict";

const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { Harness, sleep } = require("./harness.js");

const CHECK_TIMEOUT_MS = 45000;
const checks = [
  ...require("./checks-basic.js"),
  ...require("./checks-detail.js"),
];

const emit = (event) => console.log(JSON.stringify(event));

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

async function openPage() {
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: { offscreen: true },
  });
  const loaded = new Promise((resolve) =>
    win.webContents.once("did-finish-load", resolve),
  );
  win.loadFile(path.join(__dirname, "page", "index.html"));
  await loaded;
  const harness = new Harness(win);
  await harness.installHelpers();
  await harness.frame();
  return harness;
}

async function runCheck(harness, shared, check) {
  const timeout = sleep(CHECK_TIMEOUT_MS).then(() => {
    throw new Error(`no answer within ${CHECK_TIMEOUT_MS / 1000}s`);
  });
  await Promise.race([check.run(harness, shared), timeout]);
  const problems = await harness.pageProblems();
  if (problems.length > 0) {
    throw new Error(`the page reported: ${problems.join("; ")}`);
  }
}

async function main() {
  let harness;
  try {
    harness = await openPage();
  } catch (error) {
    emit({ event: "setup", ok: false, message: messageOf(error) });
    app.exit(2);
    return;
  }
  emit({ event: "setup", ok: true, appPath: app.getAppPath() });
  const shared = {};
  for (const [index, check] of checks.entries()) {
    const number = index + 1;
    const started = performance.now();
    emit({ event: "start", number, name: check.name });
    try {
      await runCheck(harness, shared, check);
    } catch (error) {
      const message = messageOf(error);
      emit({ event: "fail", number, name: check.name, message });
      app.exit(1);
      return;
    }
    const ms = Math.round(performance.now() - started);
    emit({ event: "pass", number, name: check.name, ms });
  }
  emit({ event: "done", count: checks.length });
  app.exit(0);
}

app.disableHardwareAcceleration();
app.whenReady().then(main);
