// Smoke-test prerequisite: can the pinned VS Code (Electron) start on this machine?
// Exit codes: 0 ready, 2 something must be installed or configured first.
import { execFileSync } from "node:child_process";
import { downloadVSCode, VSCODE_VERSION } from "./vscode.mjs";

/** Shared library (as `ldd` prints it) to the Debian/Ubuntu package that provides it. */
const PACKAGE_OF = {
  "libnspr4.so": "libnss3",
  "libnss3.so": "libnss3",
  "libnssutil3.so": "libnss3",
  "libsmime3.so": "libnss3",
  "libasound.so.2": "libasound2",
  "libatk-1.0.so.0": "libatk1.0-0",
  "libatk-bridge-2.0.so.0": "libatk-bridge2.0-0",
  "libatspi.so.0": "libatspi2.0-0",
  "libcairo.so.2": "libcairo2",
  "libcups.so.2": "libcups2",
  "libdbus-1.so.3": "libdbus-1-3",
  "libdrm.so.2": "libdrm2",
  "libexpat.so.1": "libexpat1",
  "libgbm.so.1": "libgbm1",
  "libgtk-3.so.0": "libgtk-3-0",
  "libpango-1.0.so.0": "libpango-1.0-0",
  "libX11.so.6": "libx11-6",
  "libXcomposite.so.1": "libxcomposite1",
  "libXdamage.so.1": "libxdamage1",
  "libXext.so.6": "libxext6",
  "libXfixes.so.3": "libxfixes3",
  "libXrandr.so.2": "libxrandr2",
  "libXss.so.1": "libxss1",
  "libxcb.so.1": "libxcb1",
  "libxkbcommon.so.0": "libxkbcommon0",
};

const executable = await downloadVSCode();

const missing = execFileSync("ldd", [executable], { encoding: "utf8" })
  .split("\n")
  .filter((line) => line.includes("not found"))
  .map((line) => line.trim().split(" ")[0]);

let ready = true;

if (missing.length > 0) {
  ready = false;
  const packages = new Set();
  const unmapped = [];
  for (const library of missing) {
    const name = PACKAGE_OF[library];
    if (name) packages.add(name);
    else unmapped.push(library);
  }
  console.error(
    `VS Code's Electron cannot start: missing ${missing.join(", ")}`,
  );
  if (packages.size > 0) {
    console.error(
      `Install them with:\n  sudo apt install -y ${[...packages].join(" ")}`,
    );
    if (packages.has("libasound2")) {
      console.error(
        "(On Ubuntu 24.04 the sound library package is libasound2t64.)",
      );
    }
  }
  if (unmapped.length > 0) {
    console.error(
      `No package known for: ${unmapped.join(", ")} (try: apt-file search <library>)`,
    );
  }
}

if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  ready = false;
  console.error(
    "No display: DISPLAY is unset. On WSL2 with WSLg it is :0; otherwise run under xvfb-run.",
  );
}

if (ready) console.log(`VS Code ${VSCODE_VERSION} can start here.`);
process.exit(ready ? 0 : 2);
