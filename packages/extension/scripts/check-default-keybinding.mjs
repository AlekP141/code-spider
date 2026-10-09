// Fails if Shift+Alt+Q is bound by default in the downloaded VS Code build.
// A chord is Shift (1024) + Alt (512) + the key code; KeyQ is 47, KeyF is 36.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_PATH, VSCODE_VERSION } from "./vscode.mjs";

const SHIFT_ALT = 1024 + 512;
const SHIFT_ALT_Q = SHIFT_ALT + 47;
const SHIFT_ALT_F = SHIFT_ALT + 36;

const install = `vscode-linux-x64-${VSCODE_VERSION}`;
const app = join(CACHE_PATH, install, "resources/app");
if (!existsSync(app)) {
  throw new Error(
    `No ${install} under ${CACHE_PATH}: run pnpm download:vscode first`,
  );
}
const bundle = readFileSync(
  join(app, "out/vs/workbench/workbench.desktop.main.js"),
  "utf8",
);

/** Every standalone use of a key code except localisation lookups like `d(1583,`. */
function bindingsFor(code) {
  const pattern = new RegExp(`(?<![\\d.])${code}(?![\\d.])`, "g");
  const hits = [];
  for (const match of bundle.matchAll(pattern)) {
    const before = bundle.slice(Math.max(0, match.index - 40), match.index);
    if (!/\bd\($/.test(before)) hits.push(before + code);
  }
  return hits;
}

if (bindingsFor(SHIFT_ALT_F).length === 0) {
  throw new Error(
    "Sanity check failed: Shift+Alt+F (Format Document) not found",
  );
}

const builtIn = readdirSync(join(app, "extensions"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(app, "extensions", entry.name, "package.json"))
  .filter((path) => {
    try {
      return /"key"\s*:\s*"shift\+alt\+q"/i.test(readFileSync(path, "utf8"));
    } catch {
      return false;
    }
  });

const conflicts = [...bindingsFor(SHIFT_ALT_Q), ...builtIn];
if (conflicts.length > 0) {
  console.error(`Shift+Alt+Q is already bound in ${install}:`, conflicts);
  process.exit(1);
}
console.log(`Shift+Alt+Q is unbound by default in ${install}`);
