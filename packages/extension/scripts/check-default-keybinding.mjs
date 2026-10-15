// Checks the Shift+Alt+1, Shift+Alt+2 and Shift+Alt+3 chords (Option on a Mac) against the
// downloaded VS Code build. Shift+Alt+1 is known to be Move Editor into First Group; the other
// two must be unbound. A chord is the modifiers + the key code: Ctrl/Cmd 2048, Shift 1024,
// Alt 512, WinCtrl 256; Digit1 to Digit3 are 22 to 24 and KeyF is 36.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_PATH, VSCODE_VERSION } from "./vscode.mjs";

const SHIFT_ALT = 1024 + 512;
const SHIFT_ALT_1 = SHIFT_ALT + 22;
const SHIFT_ALT_2 = SHIFT_ALT + 23;
const SHIFT_ALT_3 = SHIFT_ALT + 24;
const SHIFT_ALT_F = SHIFT_ALT + 36;
const KNOWN_CLASH = "Move Editor into First Group";
const CONTEXT_CHARS = 200;

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

/** The text before every standalone use of a key code except localisation lookups like `d(1583,`. */
function bindingsFor(code) {
  const pattern = new RegExp(`(?<![\\d.])${code}(?![\\d.])`, "g");
  const hits = [];
  for (const match of bundle.matchAll(pattern)) {
    const before = bundle.slice(
      Math.max(0, match.index - CONTEXT_CHARS),
      match.index,
    );
    if (!/\bd\($/.test(before)) hits.push(before + code);
  }
  return hits;
}

const builtInPackages = readdirSync(join(app, "extensions"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(app, "extensions", entry.name, "package.json"));

function builtInKeys(pattern) {
  return builtInPackages.filter((path) => {
    try {
      return pattern.test(readFileSync(path, "utf8"));
    } catch {
      return false;
    }
  });
}

if (bindingsFor(SHIFT_ALT_F).length === 0) {
  throw new Error(
    "Sanity check failed: Shift+Alt+F (Format Document) not found",
  );
}

const problems = [];

for (const [name, code, keys] of [
  ["Shift+Alt+2", SHIFT_ALT_2, "shift\\+(alt|option)\\+2"],
  ["Shift+Alt+3", SHIFT_ALT_3, "shift\\+(alt|option)\\+3"],
]) {
  const found = [
    ...bindingsFor(code),
    ...builtInKeys(new RegExp(`"key"\\s*:\\s*"${keys}"`, "i")),
  ];
  if (found.length > 0) problems.push(`${name} is already bound:`, found);
}

const first = bindingsFor(SHIFT_ALT_1);
const known = first.filter((text) => text.includes(KNOWN_CLASH));
if (first.length !== 1 || known.length !== 1) {
  problems.push(
    `Shift+Alt+1 should have exactly one default binding, "${KNOWN_CLASH}", but has:`,
    first,
  );
}
const builtInFirst = builtInKeys(/"key"\s*:\s*"shift\+(alt|option)\+1"/i);
if (builtInFirst.length > 0) {
  problems.push("A built-in extension binds Shift+Alt+1:", builtInFirst);
}

if (problems.length > 0) {
  console.error(`The Code Spider chords clash in ${install}:`, ...problems);
  process.exit(1);
}
console.log(
  `Shift+Alt+2 and Shift+Alt+3 are unbound in ${install}; Shift+Alt+1 only has the known "${KNOWN_CLASH}"`,
);
