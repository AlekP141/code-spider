# Code Spider — M2 First Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to
> validate this plan and hand it to `subagent-driven-development` for
> task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the analyser on screen. A `Code Spider: Show Graph` command (also
`Shift+Alt+Q`, a `⧉ Graph` CodeLens and a "Show in Code Spider" context-menu
entry) analyses the function under the cursor in a worker thread and draws its
radius-1 slice in a webview with React Flow and ELK. Clicking a node jumps to its
declaration; clicking an edge jumps to the exact call site. This includes the
extension and webview skeleton that milestone M0 never delivered.

**Architecture:** The extension host (one CommonJS bundle, `vscode` external)
owns editor integration: commands, keybinding, CodeLens, context menu, one reused
webview panel, and click-to-jump. All analysis runs in a `node:worker_threads`
worker bundled from `@code-spider/core`, started with a raised heap (a setting,
default 8192 MB), holding one warm ts-morph project per `findTsconfig(file)`
result; saved TS/JS paths travel with each request and are refreshed from disk.
The extension and the worker talk through a small request/response protocol
behind `WorkerClient`, which turns out-of-memory and crashes into a clear error
and starts a fresh worker on the next request. The extension and the webview talk
through the message protocol defined once in `packages/webview/src/protocol.ts`
and imported type-only by the extension. The webview (an esbuild IIFE bundle
placed under `packages/extension/dist/webview/`) maps a slice to React Flow
nodes and edges with analytically computed sizes, lays them out with ELK
(layered, direction RIGHT) and is themed only with `--vscode-*` variables.
Logic lives in pure modules unit-tested with vitest (HTML/CSP builder, message
gate, worker handler and client, session orchestration against ports, position
and range conversion, declaration finder, slice-to-flow mapping, layout input);
the `vscode`-dependent glue stays thin and is covered by four
`@vscode/test-electron` smoke tests.

**Tech Stack:** TypeScript 5.6+ (strict, `noUncheckedIndexedAccess`), pnpm
workspaces, esbuild ^0.28 (CommonJS for extension and worker, IIFE for the
webview), VS Code API ^1.140 (`@types/vscode`), React 19.3, `@xyflow/react`
12.12, `elkjs` 0.12 (`elk.bundled.js`), Vitest 2 for unit tests, mocha 12 with
`@vscode/test-electron` 3.1 for smoke tests. `ts-morph` 23 arrives through
`@code-spider/core`. (`elkjs` is licensed EPL-2.0 or GPL-3.0; fine for a
private tool, worth a look before anything is published in M4.)

**Spec:** docs/superpowers/specs/2026-08-22-code-spider-design.md

## Global Constraints

Every task's requirements include these.

**Scope (decided by the user; do not reopen).** M2 only: the missing M0
skeleton plus "first graph on screen". Out of scope, so do not build them and do
not design them in: expand-on-demand, position pinning, the refresh button, zoom
level-of-detail, the truncation "+N more" UI, polished unknown/error states, and
`.vsix` packaging (M3 and M4). The protocol type unions may list `focus`,
`expand` and `refresh`, but nothing handles them.

**Repository rules (from the owner's instructions).**
- Never stage, commit or push. Implementers do not commit; the owner commits one
  task at a time. Every task ends with a delta inspection and a proposed commit
  message. After a task is reviewed and approved, STOP.
- Commit messages are short, lowercase and scoped, like `feat(extension): ...`
  or `feat(webview): ...`. Never add a `Co-Authored-By` line or any other
  attribution trailer.
- Keep comments to a minimum: only for logic that is hard to follow, and prefer
  refactoring it into simpler code.
- Files stay under 300 lines (hard cap 500). Split by responsibility.
- Style: Prettier defaults (double quotes, semicolons, trailing commas), two-space
  indent. Prettier is not installed and must not be added; the code in this plan
  already follows it, so match it by hand.
- `packages/core` never imports `vscode`, and this plan does not change core.
- The existing packages are `"type": "module"` with `.js` import specifiers and
  `moduleResolution: Bundler`. The extension and worker bundles are CommonJS
  (`.cjs`); the webview bundle is an IIFE.
- Code must pass the repo's strict TypeScript settings (`noUncheckedIndexedAccess`
  and friends). Do not weaken `tsconfig.base.json`.
- Every task must leave `pnpm -r typecheck` and `pnpm -r test` green (baseline:
  231 core and 43 CLI tests), plus `pnpm build` where the task touches a bundle.
  The smoke tests are not part of `pnpm -r test`.

**How to run things.**
- A shell command starts in an unknown directory: begin every Bash command with
  `cd /home/motodox/code/AlekP141/code-spider && `. The paths in this plan are
  relative to that directory; file tools need the absolute path (prepend it).
- Select packages with `pnpm --filter code-spider-vscode <script>` (the
  extension) and `pnpm --filter @code-spider/webview <script>`. To run one test
  file, add its name after the script, with no `--`:
  `pnpm --filter code-spider-vscode test worker-client`.
- Block syntax in this plan: `Create` writes a new file with exactly the code
  shown; `Replace ... with:` overwrites a file you have already created with
  exactly the code shown; `Edit ... replace: ... with:` replaces the old text
  (which occurs exactly once) with the new text. Do not "improve" the code while
  copying it. If something fails to compile or a test fails, report it.
- `git status` may show the owner's pending edit to
  `docs/superpowers/specs/2026-08-22-code-spider-design.md`. It is not part of
  any task; leave it alone.
- Delta inspection: `git diff` and `git diff --check` do not show untracked
  files, so each task's last step also runs
  `for f in $(git ls-files --others --exclude-standard -- <paths>); do git diff --no-index --check -- /dev/null "$f"; done`.
  An exit status of 1 from `git diff --no-index` only means the file differs
  from `/dev/null`; whitespace warnings are what matter.

**Design constraints taken from the spec and the perf note.**
- Edges point supplier to consumer (`from` is the callee, `to` is the caller);
  an edge label is the edge's `supplies`.
- Node size is computed from `lineCount`, never measured from the DOM. Width is
  uniform; height is `header + clamp(lineCount, 3, 25) * lineHeight` (plus fixed
  padding). A node with no source preview (`external`, `unknown`, `module`) is a
  header-only chip.
- Analysis never runs on the extension host thread. The worker heap limit is the
  setting `codeSpider.worker.maxHeapMb` (default 8192, minimum 512).
- The first TS/JS editor's project is loaded and warmed ahead of the first
  request, shown as an "indexing" state. The panel shows a spinner only for work
  longer than 500 ms.
- A dirty (unsaved) focused document is not analysed: a message asks the user to
  save, because analysis reads files from disk and every offset would be wrong.
- The webview uses a strict CSP with a nonce: `default-src 'none'`, scripts only
  from the nonce-tagged bundle, `style-src` with the webview `cspSource` plus
  `'unsafe-inline'` (React Flow positions nodes with inline styles). No
  `'unsafe-eval'`: use `elkjs/lib/elk.bundled.js` (no web worker).
- The webview imports `@code-spider/core` for types only (`import type`), so the
  analyser never enters its bundle. The extension imports the protocol from
  `@code-spider/webview/protocol` for types only.
- Theme through VS Code's CSS variables (`--vscode-*`); no hard-coded palette.

**Environment facts (checked on this machine when the plan was written).**
Ubuntu 22.04 on WSL2 with WSLg (`DISPLAY=:0`), Node 23.9, pnpm 11.24, VS Code
1.141.0 (`code --version` works through the remote CLI). The Electron that
`@vscode/test-electron` downloads cannot start because `libnss3` and
`libasound2` are missing, and implementers cannot use `sudo`: Task 9 begins with
a check that reports the exact `sudo apt install ...` line and stops. The shell
agents run in inherits `ELECTRON_RUN_AS_NODE` and `VSCODE_*` variables from the
editor; the smoke runner removes them (see Task 9).

**Dependency versions** (confirmed with `pnpm view` on 2026-10-09; ranges use
`^` like the existing packages): `react` ^19.3.0, `react-dom` ^19.3.0,
`@types/react` ^19.3.0, `@types/react-dom` ^19.3.0, `@xyflow/react` ^12.12.0,
`elkjs` ^0.12.0, `esbuild` ^0.28.2, `@types/vscode` ^1.140.0 (with
`engines.vscode` `^1.140.0`; the installed VS Code is 1.141.0),
`@vscode/test-electron` ^3.1.0, `mocha` ^12.0.3, `@types/mocha` ^10.0.10. Kept at
the repository's existing ranges on purpose: `typescript` ^5.6.0 (resolves to
5.9.3; npm's latest 7.x is a different compiler line), `vitest` ^2.1.0 (latest is
5.x), `@types/node` ^26.5.0.

## Agent Execution Contract

- Each task uses exactly one isolated `workflow-implementer` (Haiku, `high`)
  implementer and exactly one independent read-only `workflow-reviewer` (Sonnet,
  `high`) reviewer.
- Reuse both task agents with `SendMessage` for every fix and re-review.
- After two failed fix rounds on the same substantive issue, stop and ask
  whether to replace that task's implementer with a Sonnet `workflow-author`;
  keep the same reviewer. Never replace an unresumable task agent silently.
- A single-task plan has no additional whole-plan reviewer. A multi-task plan
  uses one fresh `workflow-reviewer` (Sonnet, `high`) integration reviewer,
  reused for all integration rechecks.
- After each task is reviewed and approved, STOP so the user can commit before the next task starts.

---

## File Structure

Created unless marked "modified". Every file has one responsibility and stays
under 300 lines.

```
.vscode/launch.json                      F5 "Run Code Spider": extension host on test-code/basic
.vscode/tasks.json                       pre-launch task: pnpm build
package.json                             (modified) root `build` script = pnpm -r build

packages/extension/                      the VS Code extension (package "code-spider-vscode")
  package.json                           manifest: command, keybinding, menus, settings, scripts
  tsconfig.json                          strict TS config; includes src, test, smoke
  vitest.config.ts                       unit-test config (test/**/*.test.ts only)
  vscode-version.json                    the one pinned VS Code version for tests and checks
  build.mjs                              esbuild: dist/extension.cjs, dist/worker.cjs, copies the webview bundle
  build-smoke.mjs                        esbuild: smoke runner and suite into dist/smoke/
  scripts/vscode.mjs                     VSCODE_VERSION and downloadVSCode() into .vscode-test/
  scripts/download-vscode.mjs            `pnpm download:vscode`
  scripts/check-default-keybinding.mjs   fails if Shift+Alt+Q is a built-in VS Code default
  scripts/check-electron-libs.mjs        smoke prerequisite: reports missing Electron libraries
  smoke/run.ts                           launches VS Code via @vscode/test-electron
  smoke/suite/index.ts                   mocha entry run inside the extension host
  smoke/suite/extension.smoke.ts         the four smoke cases
  src/extension.ts                       activate/deactivate: wires everything together
  src/ids.ts                             command, view-type and setting ids shared with the manifest
  src/changes.ts                         TS/JS language ids; tracks saved paths to send to the worker
  src/positions.ts                       zero-based position to character offset (pure)
  src/ranges.ts                          core one-based Range to zero-based range (pure)
  src/settings-values.ts                 heap setting default, minimum and normalising (pure)
  src/warm-once.ts                       picks the first TS/JS file on disk to warm (pure)
  src/ports.ts                           interfaces the session depends on (worker, panel, notifier, indexing)
  src/session.ts                         GraphSession: dirty check, busy, supersede, errors, indexing
  src/navigation.ts                      node/edge id to jump target; JumpHandler (pure)
  src/declarations.ts                    CodeLens declaration finder, syntax-only TypeScript parser (pure)
  src/worker.ts                          worker-thread entry: message in, handler, message out
  src/worker/protocol.ts                 worker request/response types
  src/worker/project-cache.ts            warm ts-morph project per tsconfig, changed-file refresh
  src/worker/handler.ts                  request to response; never throws
  src/worker/worker-client.ts            WorkerClient, WorkerLike, WorkerCrashedError (out-of-memory, restart)
  src/worker/spawn.ts                    new Worker(...) with resourceLimits.maxOldGenerationSizeMb
  src/panel/html.ts                      webview HTML with strict CSP and nonce (pure)
  src/panel/message-gate.ts              holds and replays messages until the webview is ready (pure)
  src/panel/messages.ts                  validates messages coming from the webview (pure)
  src/panel/graph-panel.ts               the single webview panel, beside the editor
  src/vscode/focus-request.ts            document and position for a command invocation
  src/vscode/notifier.ts                 warning and error notifications
  src/vscode/settings.ts                 reads the heap setting
  src/vscode/status-bar.ts               "indexing" status bar item
  src/vscode/editor.ts                   EditorRevealer: opens a file at a range in the code column
  src/vscode/codelens.ts                 CodeLens provider (lazy-loads TypeScript)
  test/                                  vitest unit tests, one file per module above
  test/support/fixtures.ts               test-code paths, offsets, golden slices
  test/support/manifest.ts               reads package.json for manifest tests

packages/webview/                        the React Flow + ELK UI (package "@code-spider/webview")
  package.json                           exports only ./protocol; React, React Flow, ELK
  tsconfig.json                          strict TS config with the DOM lib and JSX
  vitest.config.ts                       unit-test config (node environment)
  build.mjs                              esbuild IIFE bundle: dist/index.js and dist/index.css
  src/protocol.ts                        the single message protocol definition (types only)
  src/messages.ts                        runtime guard for extension-to-webview messages
  src/app-state.ts                       reducer for slice, error, busy and indexing state (pure)
  src/delayed-flag.ts                    "on only after N ms" timer behind the spinner (pure)
  src/use-delayed-flag.ts                React hook around DelayedFlag
  src/vscode-api.ts                      typed acquireVsCodeApi wrapper
  src/main.tsx                           entry: stylesheets and React root
  src/App.tsx                            message listener, banners, spinner, graph or hint
  src/styles.css                         page, banner and spinner styles
  src/graph/constants.ts                 node width, header height, line height, caps
  src/graph/node-size.ts                 analytic node height (pure)
  src/graph/edge-appearance.ts           edge kind and resolved flag to class and dash style (pure)
  src/graph/to-flow.ts                   slice to React Flow nodes and edges (pure)
  src/graph/layout.ts                    ELK input, layout, applying positions
  src/graph/jump.ts                      node and edge click to protocol message (pure)
  src/graph/NodeBox.tsx                  presentational node: header and clipped code
  src/graph/SpiderNode.tsx               React Flow node wrapper with handles
  src/graph/use-layout.ts                hook: slice to laid-out nodes and edges
  src/graph/GraphView.tsx                the React Flow canvas and its click handlers
  src/graph/graph.css                    node, edge and React Flow theming
  test/                                  vitest unit tests (node environment)
  test/support/slices.ts                 slice builders and golden loader
```

Tasks, each one commit:

1. Extension skeleton, empty panel, launch config.
2. Webview skeleton, message protocol, ready handshake.
3. Analysis worker: project cache, handler, client, out-of-memory recovery.
4. Show Graph command wiring: cursor to worker to panel, busy, indexing, errors.
5. Graph model: slice to flow, analytic sizing, edge styles, ELK layout.
6. Graph rendering: React Flow node and edge components, theming.
7. Click-to-jump: node to declaration, edge to call site.
8. Gestures: Shift+Alt+Q, CodeLens, editor context menu.
9. Smoke tests in a real VS Code, and the manual check list.

How this plan was checked: every code block was applied in order to a scratch
copy of the repository. `pnpm -r typecheck`, `pnpm -r test` and `pnpm build`
were green after each task, the four smoke tests passed in VS Code 1.141.0, and
the built webview rendered correctly in Chromium with a dark theme.

---

### Task 1: Extension skeleton, empty panel, launch config

**Files:**
- Create: `packages/extension/package.json`
- Create: `packages/extension/tsconfig.json`
- Create: `packages/extension/vitest.config.ts`
- Create: `packages/extension/build.mjs`
- Create: `packages/extension/src/ids.ts`
- Create: `packages/extension/src/panel/html.ts`
- Create: `packages/extension/src/panel/graph-panel.ts`
- Create: `packages/extension/src/extension.ts`
- Create: `.vscode/launch.json`
- Create: `.vscode/tasks.json`
- Modify: `package.json` (root: add a `build` script)
- Modify: `pnpm-lock.yaml` (written by `pnpm install`; never edit by hand)
- Test: `packages/extension/test/support/manifest.ts`
- Test: `packages/extension/test/html.test.ts`
- Test: `packages/extension/test/manifest.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. Uses the `vscode` API (types from
  `@types/vscode`).
- Produces:
  - `COMMAND_SHOW_GRAPH = "codeSpider.showGraph"`, `PANEL_VIEW_TYPE =
    "codeSpider.graph"`, `PANEL_TITLE = "Code Spider"` from `src/ids.ts`.
  - `buildWebviewHtml(input: WebviewHtmlInput): string`, `createNonce():
    string`, `escapeAttribute(value: string): string` from
    `src/panel/html.ts`, where `WebviewHtmlInput = { cspSource: string;
    nonce: string; scriptUri: string; styleUri: string }`.
  - `class GraphPanel implements vscode.Disposable` with
    `constructor(extensionUri: vscode.Uri)`, `show(): void`, `dispose(): void`
    from `src/panel/graph-panel.ts`. `show()` opens one panel in
    `ViewColumn.Beside` and reuses it afterwards.
  - `readManifest()` test helper from `test/support/manifest.ts`.
  - `activate(context)` / `deactivate()` from `src/extension.ts`, registering
    the `codeSpider.showGraph` command.
  - Bundle output `packages/extension/dist/extension.cjs` (CommonJS, `vscode`
    external).
  - Root `pnpm build` runs every package's `build` script.
  - The panel loads `dist/webview/index.js` and `dist/webview/index.css`, which
    Task 2 produces. Until then the panel is blank and the webview console
    reports two 404s. That is expected.

- [ ] **Step 1: Check the installed VS Code satisfies the engine range**

Run: `code --version | head -1`
Expected: a version of `1.140.0` or newer (the plan was written against
`1.141.0`). If it is older, stop and report the version; do not lower
`engines.vscode`.

- [ ] **Step 2: Create the package files and install**

Edit `package.json` — replace:

```
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
```

with:

```
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
```

Create `packages/extension/package.json`:

```json
{
  "name": "code-spider-vscode",
  "displayName": "Code Spider",
  "description": "Shows the callers and callees of the function under the cursor as a typed graph.",
  "version": "0.0.0",
  "private": true,
  "publisher": "code-spider",
  "license": "ISC",
  "type": "module",
  "engines": { "vscode": "^1.140.0" },
  "categories": ["Visualization"],
  "main": "./dist/extension.cjs",
  "activationEvents": [],
  "contributes": {
    "commands": [
      {
        "command": "codeSpider.showGraph",
        "title": "Show Graph",
        "category": "Code Spider"
      }
    ]
  },
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^26.5.0",
    "@types/vscode": "^1.140.0",
    "esbuild": "^0.28.2",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

The package is named `code-spider-vscode` (not `@code-spider/extension`) because
`vsce` rejects scoped names; M4 then needs no rename. Select it with
`pnpm --filter code-spider-vscode <script>`.

Create `packages/extension/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

Create `packages/extension/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], testTimeout: 30_000 },
});
```

Create `packages/extension/build.mjs`:

```js
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: { extension: "src/extension.ts" },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const watcher = await context(options);
  await watcher.watch();
} else {
  await build(options);
}
```

Run: `pnpm install`
Expected: completes without errors; `pnpm-lock.yaml` gains a
`packages/extension` importer. `pnpm-workspace.yaml` already allows esbuild's
build script, so no approval prompt appears.

- [ ] **Step 3: Write the failing tests**

Create `packages/extension/src/ids.ts`:

```ts
export const COMMAND_SHOW_GRAPH = "codeSpider.showGraph";
export const PANEL_VIEW_TYPE = "codeSpider.graph";
export const PANEL_TITLE = "Code Spider";
```

Create `packages/extension/test/support/manifest.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Manifest = {
  engines: { vscode: string };
  main: string;
  activationEvents: string[];
  contributes: {
    commands: { command: string; title: string; category: string }[];
  };
};

const here = dirname(fileURLToPath(import.meta.url));

export function readManifest(): Manifest {
  const path = join(here, "../../package.json");
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}
```

Create `packages/extension/test/manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COMMAND_SHOW_GRAPH } from "../src/ids.js";
import { readManifest } from "./support/manifest.js";

describe("extension manifest", () => {
  it("contributes Show Graph under the Code Spider category", () => {
    const command = readManifest().contributes.commands.find(
      (entry) => entry.command === COMMAND_SHOW_GRAPH,
    );
    expect(command).toMatchObject({
      title: "Show Graph",
      category: "Code Spider",
    });
  });

  it("points main at the CommonJS bundle", () => {
    expect(readManifest().main).toBe("./dist/extension.cjs");
  });
});
```

Create `packages/extension/test/html.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildWebviewHtml,
  createNonce,
  escapeAttribute,
} from "../src/panel/html.js";

const input = {
  cspSource: "https://example.vscode-cdn.net",
  nonce: "abc123",
  scriptUri: "https://example.vscode-cdn.net/webview/index.js",
  styleUri: "https://example.vscode-cdn.net/webview/index.css",
};

function cspOf(html: string): string {
  const match = /Content-Security-Policy" content="([^"]*)"/.exec(html);
  return match?.[1] ?? "";
}

describe("buildWebviewHtml", () => {
  it("allows only the nonce-tagged script and local styles", () => {
    const csp = cspOf(buildWebviewHtml(input));
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'nonce-abc123'");
    expect(csp).toContain(
      "style-src https://example.vscode-cdn.net 'unsafe-inline'",
    );
    expect(csp).not.toContain("unsafe-eval");
  });

  it("tags the script element with the same nonce and source", () => {
    const html = buildWebviewHtml(input);
    expect(html).toContain(
      '<script nonce="abc123" src="https://example.vscode-cdn.net/webview/index.js"></script>',
    );
  });

  it("links the stylesheet and provides the mount point", () => {
    const html = buildWebviewHtml(input);
    expect(html).toContain(
      '<link rel="stylesheet" href="https://example.vscode-cdn.net/webview/index.css" />',
    );
    expect(html).toContain('<div id="root"></div>');
  });

  it("escapes attribute values", () => {
    const html = buildWebviewHtml({ ...input, styleUri: 'a"b<c>&d' });
    expect(html).toContain('href="a&quot;b&lt;c&gt;&amp;d"');
  });
});

describe("escapeAttribute", () => {
  it("escapes ampersands, quotes and angle brackets", () => {
    expect(escapeAttribute(`<a href="x">&`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;",
    );
  });
});

describe("createNonce", () => {
  it("returns 32 hex characters and differs between calls", () => {
    const first = createNonce();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(createNonce()).not.toBe(first);
  });
});
```

- [ ] **Step 4: Run the tests and watch them fail**

Run: `pnpm --filter code-spider-vscode test`
Expected: `manifest.test.ts` passes; `html.test.ts` FAILS with an import error
(`Failed to resolve import "../src/panel/html.js"`), so the run reports one
failed file.

- [ ] **Step 5: Implement the HTML builder**

Create `packages/extension/src/panel/html.ts`:

```ts
import { randomBytes } from "node:crypto";

export type WebviewHtmlInput = {
  cspSource: string;
  nonce: string;
  scriptUri: string;
  styleUri: string;
};

export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createNonce(): string {
  return randomBytes(16).toString("hex");
}

/**
 * React Flow positions nodes with inline styles, so `style-src` needs
 * 'unsafe-inline'. Scripts stay locked to the one nonce-tagged bundle.
 */
export function buildWebviewHtml(input: WebviewHtmlInput): string {
  const { cspSource, nonce, scriptUri, styleUri } = input;
  const csp = [
    "default-src 'none'",
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${escapeAttribute(styleUri)}" />
    <title>Code Spider</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${escapeAttribute(nonce)}" src="${escapeAttribute(scriptUri)}"></script>
  </body>
</html>
`;
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm --filter code-spider-vscode test`
Expected: 2 test files, 8 tests, all pass.

- [ ] **Step 7: Add the panel, activation and bundle**

Create `packages/extension/src/panel/graph-panel.ts`:

```ts
import * as vscode from "vscode";
import { PANEL_TITLE, PANEL_VIEW_TYPE } from "../ids.js";
import { buildWebviewHtml, createNonce } from "./html.js";

export class GraphPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  /** Opens the panel beside the editor, or reveals it without moving it. */
  show(): void {
    if (this.panel) {
      this.panel.reveal(undefined, true);
      return;
    }

    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      PANEL_TITLE,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [root],
      },
    );
    const assetUri = (name: string) =>
      panel.webview.asWebviewUri(vscode.Uri.joinPath(root, name)).toString();
    panel.webview.html = buildWebviewHtml({
      cspSource: panel.webview.cspSource,
      nonce: createNonce(),
      scriptUri: assetUri("index.js"),
      styleUri: assetUri("index.css"),
    });
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.panel = panel;
  }

  dispose(): void {
    this.panel?.dispose();
  }
}
```

Create `packages/extension/src/extension.ts`:

```ts
import * as vscode from "vscode";
import { COMMAND_SHOW_GRAPH } from "./ids.js";
import { GraphPanel } from "./panel/graph-panel.js";

export function activate(context: vscode.ExtensionContext): void {
  const panel = new GraphPanel(context.extensionUri);
  context.subscriptions.push(
    panel,
    vscode.commands.registerCommand(COMMAND_SHOW_GRAPH, () => panel.show()),
  );
}

export function deactivate(): void {}
```

Run: `pnpm --filter code-spider-vscode typecheck`
Expected: no output, exit code 0.

Run: `pnpm --filter code-spider-vscode build`
Expected: esbuild prints `dist/extension.cjs` and its map, and finishes with
`Done`.

Run: `grep -c 'require("vscode")' packages/extension/dist/extension.cjs`
Expected: `1` or more (the `vscode` module is external, not bundled).

- [ ] **Step 8: Add the launch configuration**

Run: `ls .vscode 2>&1`
Expected: `ls: cannot access '.vscode'` (the directory does not exist yet). If
it exists, read both files first and merge instead of overwriting.

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Code Spider",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}/packages/extension",
        "${workspaceFolder}/test-code/basic"
      ],
      "outFiles": ["${workspaceFolder}/packages/extension/dist/**/*.cjs"],
      "preLaunchTask": "build: code-spider"
    }
  ]
}
```

Create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "build: code-spider",
      "type": "shell",
      "command": "pnpm build",
      "options": { "cwd": "${workspaceFolder}" },
      "group": "build",
      "problemMatcher": []
    }
  ]
}
```

Run: `node -e "for (const f of ['launch','tasks']) JSON.parse(require('fs').readFileSync('.vscode/'+f+'.json','utf8')); console.log('json ok')"`
Expected: `json ok`.

- [ ] **Step 9: Run the whole verification**

Run: `pnpm -r typecheck`
Expected: every package exits 0.

Run: `pnpm -r test`
Expected: all green: core 231, CLI 43, extension 8 tests.

Run: `pnpm build`
Expected: only the extension package has a `build` script so far; it prints
the esbuild summary and exits 0.

- [ ] **Step 10: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: ` M package.json`, ` M pnpm-lock.yaml`, `?? .vscode/` and
`?? packages/extension/` (`dist/` and `node_modules/` are gitignored).

Run: `git diff --check -- package.json pnpm-lock.yaml`
Expected: no output.

Run: `git diff -- package.json` and `git diff --stat -- pnpm-lock.yaml`
Expected: root `package.json` gains only the `build` script; the lockfile gains
the `packages/extension` importer and its packages.

Run: `for f in $(git ls-files --others --exclude-standard -- .vscode packages/extension); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings. (`git diff --no-index` exits 1 whenever the
file differs from `/dev/null`; that is normal and not an error.)

Read each new file once to confirm it matches this task.

Proposed commit message: `feat(extension): add extension skeleton with empty panel and launch config`

The implementer does not stage or commit; the user does.

### Task 2: Webview skeleton, message protocol, ready handshake

**Files:**
- Create: `packages/webview/package.json`
- Create: `packages/webview/tsconfig.json`
- Create: `packages/webview/vitest.config.ts`
- Create: `packages/webview/build.mjs`
- Create: `packages/webview/src/protocol.ts`
- Create: `packages/webview/src/messages.ts`
- Create: `packages/webview/src/app-state.ts`
- Create: `packages/webview/src/vscode-api.ts`
- Create: `packages/webview/src/main.tsx`
- Create: `packages/webview/src/App.tsx`
- Create: `packages/webview/src/styles.css`
- Create: `packages/extension/src/panel/message-gate.ts`
- Create: `packages/extension/src/panel/messages.ts`
- Modify: `packages/extension/package.json` (add the `@code-spider/webview` dev dependency)
- Modify: `packages/extension/build.mjs` (copy the webview bundle into `dist/webview/`)
- Modify: `packages/extension/src/panel/graph-panel.ts` (ready handshake, `post()`)
- Modify: `pnpm-lock.yaml` (written by `pnpm install`)
- Test: `packages/webview/test/messages.test.ts`
- Test: `packages/webview/test/app-state.test.ts`
- Test: `packages/extension/test/message-gate.test.ts`
- Test: `packages/extension/test/webview-messages.test.ts`

**Interfaces:**
- Consumes (from Task 1): `GraphPanel` in
  `packages/extension/src/panel/graph-panel.ts` (constructor takes
  `extensionUri`; `show()`, `dispose()`), `buildWebviewHtml`, `createNonce`.
- Produces:
  - Package `@code-spider/webview`, exposing only the subpath
    `@code-spider/webview/protocol` (type-only use by the extension).
  - The single protocol definition in `packages/webview/src/protocol.ts`:

    ```ts
    export type ExtensionToWebview =
      | { type: "slice"; slice: GraphSlice }
      | { type: "analysisError"; message: string }
      | { type: "busy"; busy: boolean }
      | { type: "indexing"; indexing: boolean };

    export type WebviewToExtension =
      | { type: "ready" }
      | { type: "openInEditor"; nodeId: NodeId }
      | { type: "openCallSite"; edgeId: string }
      | { type: "focus"; nodeId: NodeId }
      | { type: "expand"; nodeId: NodeId }
      | { type: "refresh" };
    ```

    `focus`, `expand` and `refresh` are part of the spec's protocol but are not
    handled until M3.
  - `isExtensionMessage(value: unknown): value is ExtensionToWebview` from
    `packages/webview/src/messages.ts`.
  - `AppState`, `initialState`, `reduceMessage(state, message): AppState`
    from `packages/webview/src/app-state.ts`.
  - `postToExtension(message: WebviewToExtension): void` from
    `packages/webview/src/vscode-api.ts`.
  - `class MessageGate` in `packages/extension/src/panel/message-gate.ts`:
    `constructor(send: (message: ExtensionToWebview) => void)`,
    `post(message): void`, `markReady(): void`, `reset(): void`. It keeps the
    latest message per channel (`content` = slice or error, `busy`,
    `indexing`) and replays them on every `markReady()`.
  - `parseWebviewMessage(value: unknown): WebviewToExtension | undefined` in
    `packages/extension/src/panel/messages.ts`.
  - `GraphPanel.post(message: ExtensionToWebview): void`.
  - The webview bundle `packages/webview/dist/index.js` and `index.css`,
    copied by the extension build to `packages/extension/dist/webview/`.

- [ ] **Step 1: Create the webview package files and install**

Create `packages/webview/package.json`:

```json
{
  "name": "@code-spider/webview",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./protocol": "./src/protocol.ts"
  },
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  },
  "devDependencies": {
    "@code-spider/core": "workspace:*",
    "@types/node": "^26.5.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "esbuild": "^0.28.2",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`@code-spider/core` is a dev dependency used for types only (`import type`), so
the webview bundle never contains the analyser.

Create `packages/webview/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

Create `packages/webview/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { include: ["test/**/*.test.{ts,tsx}"], testTimeout: 30_000 },
});
```

Create `packages/webview/build.mjs`:

```js
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: { index: "src/main.tsx" },
  outdir: "dist",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  minify: !watch,
  sourcemap: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      watch ? "development" : "production",
    ),
  },
  logLevel: "info",
};

if (watch) {
  const watcher = await context(options);
  await watcher.watch();
} else {
  await build(options);
}
```

Edit `packages/extension/package.json` — replace:

```
  "devDependencies": {
    "@types/node": "^26.5.0",
```

with:

```
  "devDependencies": {
    "@code-spider/webview": "workspace:*",
    "@types/node": "^26.5.0",
```

Run: `pnpm install`
Expected: completes without errors; the lockfile gains the
`packages/webview` importer, `react`, `react-dom` and their type packages, and
`packages/extension` links `@code-spider/webview`.

- [ ] **Step 2: Write the failing webview tests**

Create `packages/webview/src/protocol.ts` (types only, needed by the tests):

```ts
import type { GraphSlice, NodeId } from "@code-spider/core";

export type ExtensionToWebview =
  | { type: "slice"; slice: GraphSlice }
  | { type: "analysisError"; message: string }
  | { type: "busy"; busy: boolean }
  | { type: "indexing"; indexing: boolean };

/** `focus`, `expand` and `refresh` are in the spec's protocol; M3 handles them. */
export type WebviewToExtension =
  | { type: "ready" }
  | { type: "openInEditor"; nodeId: NodeId }
  | { type: "openCallSite"; edgeId: string }
  | { type: "focus"; nodeId: NodeId }
  | { type: "expand"; nodeId: NodeId }
  | { type: "refresh" };
```

Create `packages/webview/test/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isExtensionMessage } from "../src/messages.js";

describe("isExtensionMessage", () => {
  it("accepts each extension-to-webview message", () => {
    const slice = { focusId: "a#b", nodes: [], edges: [], truncated: false };
    expect(isExtensionMessage({ type: "slice", slice })).toBe(true);
    expect(isExtensionMessage({ type: "analysisError", message: "x" })).toBe(
      true,
    );
    expect(isExtensionMessage({ type: "busy", busy: true })).toBe(true);
    expect(isExtensionMessage({ type: "indexing", indexing: false })).toBe(
      true,
    );
  });

  it("rejects malformed payloads", () => {
    expect(isExtensionMessage(undefined)).toBe(false);
    expect(isExtensionMessage("busy")).toBe(false);
    expect(isExtensionMessage({ type: "slice" })).toBe(false);
    expect(isExtensionMessage({ type: "slice", slice: null })).toBe(false);
    expect(isExtensionMessage({ type: "busy", busy: "yes" })).toBe(false);
    expect(isExtensionMessage({ type: "analysisError" })).toBe(false);
    expect(isExtensionMessage({ type: "unknown" })).toBe(false);
  });
});
```

Create `packages/webview/test/app-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialState, reduceMessage } from "../src/app-state.js";

const slice = { focusId: "a#b", nodes: [], edges: [], truncated: false };

describe("reduceMessage", () => {
  it("starts empty", () => {
    expect(initialState).toEqual({
      slice: undefined,
      error: undefined,
      busy: false,
      indexing: false,
    });
  });

  it("stores a slice and clears an earlier error", () => {
    const failed = reduceMessage(initialState, {
      type: "analysisError",
      message: "boom",
    });
    const next = reduceMessage(failed, { type: "slice", slice });
    expect(next.slice).toBe(slice);
    expect(next.error).toBeUndefined();
  });

  it("keeps the previous slice when an error arrives", () => {
    const withSlice = reduceMessage(initialState, { type: "slice", slice });
    const next = reduceMessage(withSlice, {
      type: "analysisError",
      message: "boom",
    });
    expect(next.slice).toBe(slice);
    expect(next.error).toBe("boom");
  });

  it("clears a stale error when new work starts, not when it ends", () => {
    const failed = reduceMessage(initialState, {
      type: "analysisError",
      message: "boom",
    });
    const started = reduceMessage(failed, { type: "busy", busy: true });
    expect(started.busy).toBe(true);
    expect(started.error).toBeUndefined();

    const failedAgain = reduceMessage(started, {
      type: "analysisError",
      message: "again",
    });
    const ended = reduceMessage(failedAgain, { type: "busy", busy: false });
    expect(ended.busy).toBe(false);
    expect(ended.error).toBe("again");
  });

  it("tracks indexing separately from busy", () => {
    const next = reduceMessage(initialState, {
      type: "indexing",
      indexing: true,
    });
    expect(next.indexing).toBe(true);
    expect(next.busy).toBe(false);
  });
});
```

- [ ] **Step 3: Run the webview tests and watch them fail**

Run: `pnpm --filter @code-spider/webview test`
Expected: both files FAIL to import (`Failed to resolve import
"../src/messages.js"` and `"../src/app-state.js"`).

- [ ] **Step 4: Implement the webview logic**

Create `packages/webview/src/messages.ts`:

```ts
import type { ExtensionToWebview } from "./protocol.js";

export function isExtensionMessage(
  value: unknown,
): value is ExtensionToWebview {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case "slice":
      return typeof message.slice === "object" && message.slice !== null;
    case "analysisError":
      return typeof message.message === "string";
    case "busy":
      return typeof message.busy === "boolean";
    case "indexing":
      return typeof message.indexing === "boolean";
    default:
      return false;
  }
}
```

Create `packages/webview/src/app-state.ts`:

```ts
import type { GraphSlice } from "@code-spider/core";
import type { ExtensionToWebview } from "./protocol.js";

export type AppState = {
  slice: GraphSlice | undefined;
  error: string | undefined;
  busy: boolean;
  indexing: boolean;
};

export const initialState: AppState = {
  slice: undefined,
  error: undefined,
  busy: false,
  indexing: false,
};

export function reduceMessage(
  state: AppState,
  message: ExtensionToWebview,
): AppState {
  switch (message.type) {
    case "slice":
      return { ...state, slice: message.slice, error: undefined };
    case "analysisError":
      return { ...state, error: message.message };
    case "busy":
      return {
        ...state,
        busy: message.busy,
        error: message.busy ? undefined : state.error,
      };
    case "indexing":
      return { ...state, indexing: message.indexing };
  }
}
```

Run: `pnpm --filter @code-spider/webview test`
Expected: 2 files, 7 tests, all pass.

- [ ] **Step 5: Add the webview shell and bundle**

Create `packages/webview/src/vscode-api.ts`:

```ts
import type { WebviewToExtension } from "./protocol.js";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToExtension): void;
};

let api: ReturnType<typeof acquireVsCodeApi> | undefined;

export function postToExtension(message: WebviewToExtension): void {
  api ??= acquireVsCodeApi();
  api.postMessage(message);
}
```

Create `packages/webview/src/App.tsx`:

```tsx
import { useEffect, useReducer } from "react";
import { initialState, reduceMessage } from "./app-state.js";
import { isExtensionMessage } from "./messages.js";
import { postToExtension } from "./vscode-api.js";

export function App() {
  const [state, dispatch] = useReducer(reduceMessage, initialState);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isExtensionMessage(event.data)) dispatch(event.data);
    };
    window.addEventListener("message", onMessage);
    postToExtension({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="status">
      <h1>Code Spider</h1>
      {state.slice ? (
        <p>Received a graph for {state.slice.focusId}.</p>
      ) : (
        <p>Place the cursor in a function and run Code Spider: Show Graph.</p>
      )}
    </main>
  );
}
```

Create `packages/webview/src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(<App />);
```

Create `packages/webview/src/styles.css`:

```css
html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}

.status {
  padding: 16px;
}

.status h1 {
  font-size: 1.2em;
  margin: 0 0 8px;
}
```

Run: `pnpm --filter @code-spider/webview typecheck`
Expected: no output, exit code 0.

Run: `pnpm --filter @code-spider/webview build`
Expected: esbuild prints `dist/index.js`, `dist/index.css` and their maps.

Run: `ls packages/webview/dist`
Expected: `index.css  index.css.map  index.js  index.js.map`.

- [ ] **Step 6: Write the failing extension tests**

Create `packages/extension/test/message-gate.test.ts`:

```ts
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import { describe, expect, it } from "vitest";
import { MessageGate } from "../src/panel/message-gate.js";

const slice = (focusId: string): ExtensionToWebview => ({
  type: "slice",
  slice: { focusId, nodes: [], edges: [], truncated: false },
});

function setup() {
  const sent: ExtensionToWebview[] = [];
  const gate = new MessageGate((message) => sent.push(message));
  return { sent, gate };
}

describe("MessageGate", () => {
  it("holds messages until the webview is ready", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    expect(sent).toEqual([]);
  });

  it("delivers only the latest slice on ready", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    gate.post(slice("a#two"));
    gate.markReady();
    expect(sent).toEqual([slice("a#two")]);
  });

  it("lets a later error replace a queued slice and vice versa", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    gate.post({ type: "analysisError", message: "boom" });
    gate.markReady();
    expect(sent).toEqual([{ type: "analysisError", message: "boom" }]);
  });

  it("replays indexing, then busy, then content", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    gate.post({ type: "busy", busy: true });
    gate.post({ type: "indexing", indexing: true });
    gate.markReady();
    expect(sent.map((message) => message.type)).toEqual([
      "indexing",
      "busy",
      "slice",
    ]);
  });

  it("sends straight through once ready", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post({ type: "busy", busy: true });
    gate.post(slice("a#one"));
    expect(sent.map((message) => message.type)).toEqual(["busy", "slice"]);
  });

  it("replays the latest state when the webview reloads and says ready again", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post(slice("a#one"));
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([slice("a#one")]);
  });

  it("queues again after reset", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.reset();
    gate.post(slice("a#one"));
    expect(sent).toEqual([]);
    gate.markReady();
    expect(sent).toEqual([slice("a#one")]);
  });
});
```

Create `packages/extension/test/webview-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseWebviewMessage } from "../src/panel/messages.js";

describe("parseWebviewMessage", () => {
  it("accepts the messages with no payload", () => {
    expect(parseWebviewMessage({ type: "ready" })).toEqual({ type: "ready" });
    expect(parseWebviewMessage({ type: "refresh" })).toEqual({
      type: "refresh",
    });
  });

  it("accepts node messages with a string nodeId", () => {
    for (const type of ["openInEditor", "focus", "expand"] as const) {
      expect(parseWebviewMessage({ type, nodeId: "a.ts#f" })).toEqual({
        type,
        nodeId: "a.ts#f",
      });
    }
  });

  it("accepts openCallSite with a string edgeId", () => {
    expect(parseWebviewMessage({ type: "openCallSite", edgeId: "e1" })).toEqual(
      { type: "openCallSite", edgeId: "e1" },
    );
  });

  it("drops anything malformed or unknown", () => {
    expect(parseWebviewMessage(null)).toBeUndefined();
    expect(parseWebviewMessage("ready")).toBeUndefined();
    expect(parseWebviewMessage({ type: "openInEditor" })).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "openInEditor", nodeId: 3 }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "openCallSite", nodeId: "x" }),
    ).toBeUndefined();
    expect(parseWebviewMessage({ type: "bogus" })).toBeUndefined();
  });
});
```

- [ ] **Step 7: Run the extension tests and watch them fail**

Run: `pnpm --filter code-spider-vscode test`
Expected: the two new files FAIL to import (`../src/panel/message-gate.js`,
`../src/panel/messages.js`); the Task 1 files still pass.

- [ ] **Step 8: Implement the gate and the message parser**

Create `packages/extension/src/panel/message-gate.ts`:

```ts
import type { ExtensionToWebview } from "@code-spider/webview/protocol";

type Channel = "content" | "busy" | "indexing";

const CHANNEL_OF: Record<ExtensionToWebview["type"], Channel> = {
  slice: "content",
  analysisError: "content",
  busy: "busy",
  indexing: "indexing",
};

const REPLAY_ORDER: Channel[] = ["indexing", "busy", "content"];

/**
 * The webview cannot receive messages until its script has run and posted
 * `ready`. The gate remembers the latest message per channel and replays them
 * on every `ready`, which also restores a reloaded webview.
 */
export class MessageGate {
  private ready = false;
  private readonly latest = new Map<Channel, ExtensionToWebview>();

  constructor(private readonly send: (message: ExtensionToWebview) => void) {}

  post(message: ExtensionToWebview): void {
    this.latest.set(CHANNEL_OF[message.type], message);
    if (this.ready) this.send(message);
  }

  markReady(): void {
    this.ready = true;
    for (const channel of REPLAY_ORDER) {
      const message = this.latest.get(channel);
      if (message) this.send(message);
    }
  }

  reset(): void {
    this.ready = false;
  }
}
```

Create `packages/extension/src/panel/messages.ts`:

```ts
import type { WebviewToExtension } from "@code-spider/webview/protocol";

/** Messages arrive from a script context, so shape-check before trusting them. */
export function parseWebviewMessage(
  value: unknown,
): WebviewToExtension | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case "ready":
    case "refresh":
      return { type: message.type };
    case "openInEditor":
    case "focus":
    case "expand":
      return typeof message.nodeId === "string"
        ? { type: message.type, nodeId: message.nodeId }
        : undefined;
    case "openCallSite":
      return typeof message.edgeId === "string"
        ? { type: "openCallSite", edgeId: message.edgeId }
        : undefined;
    default:
      return undefined;
  }
}
```

Run: `pnpm --filter code-spider-vscode test`
Expected: 4 files, 19 tests, all pass.

- [ ] **Step 9: Wire the handshake into the panel and copy the bundle**

Replace `packages/extension/src/panel/graph-panel.ts` with:

```ts
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import * as vscode from "vscode";
import { PANEL_TITLE, PANEL_VIEW_TYPE } from "../ids.js";
import { buildWebviewHtml, createNonce } from "./html.js";
import { MessageGate } from "./message-gate.js";
import { parseWebviewMessage } from "./messages.js";

export class GraphPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly gate = new MessageGate((message) => {
    void this.panel?.webview.postMessage(message);
  });

  constructor(private readonly extensionUri: vscode.Uri) {}

  /** Queued until the webview reports ready, then delivered. */
  post(message: ExtensionToWebview): void {
    this.gate.post(message);
  }

  /** Opens the panel beside the editor, or reveals it without moving it. */
  show(): void {
    if (this.panel) {
      this.panel.reveal(undefined, true);
      return;
    }

    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      PANEL_TITLE,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [root],
      },
    );
    const assetUri = (name: string) =>
      panel.webview.asWebviewUri(vscode.Uri.joinPath(root, name)).toString();
    panel.webview.html = buildWebviewHtml({
      cspSource: panel.webview.cspSource,
      nonce: createNonce(),
      scriptUri: assetUri("index.js"),
      styleUri: assetUri("index.css"),
    });
    this.gate.reset();
    panel.webview.onDidReceiveMessage((raw: unknown) => this.receive(raw));
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.gate.reset();
    });
    this.panel = panel;
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private receive(raw: unknown): void {
    const message = parseWebviewMessage(raw);
    if (message?.type === "ready") this.gate.markReady();
  }
}
```

Replace `packages/extension/build.mjs` with:

```js
import { cpSync, existsSync, rmSync } from "node:fs";
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: { extension: "src/extension.ts" },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

/** The webview bundle is built by its own package; ship it inside dist/. */
function copyWebviewAssets() {
  const source = "../webview/dist";
  if (!existsSync(source)) {
    console.warn(
      "webview bundle missing: run `pnpm build` at the repo root so the panel has assets",
    );
    return;
  }
  rmSync("dist/webview", { recursive: true, force: true });
  cpSync(source, "dist/webview", { recursive: true });
}

if (watch) {
  const watcher = await context(options);
  await watcher.watch();
} else {
  await build(options);
}
copyWebviewAssets();
```

Run: `pnpm --filter code-spider-vscode typecheck`
Expected: no output, exit code 0. (This proves the extension can import the
protocol types from `@code-spider/webview/protocol`.)

- [ ] **Step 10: Full build and verification**

Run: `pnpm build`
Expected: webview builds first, then the extension; the extension prints no
"webview bundle missing" warning.

Run: `ls packages/extension/dist/webview`
Expected: `index.css  index.css.map  index.js  index.js.map`.

Run: `grep -c "ts-morph" packages/webview/dist/index.js`
Expected: `0` (the analyser is not in the webview bundle). `grep -c` exits 1
when the count is 0; that is the expected result here.

Run: `pnpm -r typecheck`
Expected: every package exits 0.

Run: `pnpm -r test`
Expected: all green: core 231, CLI 43, extension 19, webview 7.

- [ ] **Step 11: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: ` M packages/extension/build.mjs`, ` M packages/extension/package.json`,
` M packages/extension/src/panel/graph-panel.ts`, ` M pnpm-lock.yaml`,
`?? packages/webview/`, and untracked `packages/extension/src/panel/message-gate.ts`,
`packages/extension/src/panel/messages.ts` and the two new extension test files.
(Task 1's files are already committed by the user at this point.)

Run: `git diff --check -- packages/extension pnpm-lock.yaml`
Expected: no output.

Run: `git diff -- packages/extension/build.mjs packages/extension/package.json packages/extension/src/panel/graph-panel.ts` and `git diff --stat -- pnpm-lock.yaml`
Expected: only the changes described in Steps 1 and 9, plus lockfile additions.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/webview packages/extension); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `feat(webview): add webview skeleton, message protocol and ready handshake`

The implementer does not stage or commit; the user does.

### Task 3: Analysis worker (handler, client, out-of-memory recovery)

**Files:**
- Create: `packages/extension/src/worker/protocol.ts`
- Create: `packages/extension/src/worker/project-cache.ts`
- Create: `packages/extension/src/worker/handler.ts`
- Create: `packages/extension/src/worker.ts`
- Create: `packages/extension/src/worker/worker-client.ts`
- Create: `packages/extension/src/worker/spawn.ts`
- Modify: `packages/extension/package.json` (add the `@code-spider/core` dev dependency)
- Modify: `packages/extension/build.mjs` (second bundle: `dist/worker.cjs`)
- Modify: `pnpm-lock.yaml` (written by `pnpm install`)
- Test: `packages/extension/test/support/fixtures.ts`
- Test: `packages/extension/test/worker-handler.test.ts`
- Test: `packages/extension/test/worker-client.test.ts`
- Test: `packages/extension/test/worker-integration.test.ts`

**Interfaces:**
- Consumes (from `@code-spider/core`): `findTsconfig(file): string`,
  `loadProject(tsconfig): Project`, `warmProject(project): void`,
  `analyzeFocus(project, { file, offset, repoRoot }): GraphSlice`, types
  `GraphSlice` and `Project`. `analyzeFocus` throws when the file is not in the
  project or no callable encloses the offset; `findTsconfig` throws
  `No tsconfig.json found above <file>`.
- Produces (`packages/extension/src/worker/protocol.ts`):

  ```ts
  export type FocusResult = { slice: GraphSlice; repoRoot: string };
  export type WarmRequest = { kind: "warm"; file: string; changedFiles: string[] };
  export type FocusRequestBody = {
    kind: "focus"; file: string; offset: number; changedFiles: string[];
  };
  export type WorkerRequest = (WarmRequest | FocusRequestBody) & { id: number };
  export type WorkerResponse =
    | { id: number; kind: "warmed" }
    | { id: number; kind: "focused"; result: FocusResult }
    | { id: number; kind: "failed"; message: string };
  ```

  `repoRoot` is `dirname(tsconfig)`, the directory NodeIds are relative to
  (the CLI uses the same rule). The extension needs it later to open files.
- Produces: `class ProjectCache` (`noteChanged(files)`, `open(file):
  ProjectEntry`, `warm(entry)`), `createWorkerHandler(cache?):
  WorkerHandler` where `WorkerHandler = (request: WorkerRequest) =>
  WorkerResponse`. The handler never throws: failures come back as
  `{ kind: "failed", message }`.
- Produces: `WorkerLike` (the slice of `worker_threads.Worker` the client
  uses), `WorkerCrashedError` (`outOfMemory: boolean`), and
  `class WorkerClient` with `constructor(spawn: () => WorkerLike)`,
  `warm(file, changedFiles): Promise<void>`, `focus(file, offset,
  changedFiles): Promise<FocusResult>`, `recycle(): void`, `dispose(): void`
  from `src/worker/worker-client.ts`. A request after a crash spawns a fresh
  worker.
- Produces: `spawnAnalysisWorker(workerPath: string, maxHeapMb: number):
  WorkerLike` from `src/worker/spawn.ts`, passing
  `resourceLimits.maxOldGenerationSizeMb`.
- Produces: bundle `packages/extension/dist/worker.cjs` containing
  `@code-spider/core`, `ts-morph` and TypeScript.
- Contract of `changedFiles`: absolute paths of TS/JS files the user saved since
  the previous request. The cache refreshes those source files from disk the
  next time each project is used (spec §8.2). A file that is not yet in the
  project but is the focus file is added from disk, so a just-created file can
  be focused. New files that only other files reference appear after the worker
  restarts (M3's refresh adds a proper path).

- [ ] **Step 1: Add the core dependency, the worker bundle and the fixture helper**

Edit `packages/extension/package.json` — replace:

```
    "@code-spider/webview": "workspace:*",
```

with:

```
    "@code-spider/core": "workspace:*",
    "@code-spider/webview": "workspace:*",
```

Replace `packages/extension/build.mjs` with:

```js
import { cpSync, existsSync, rmSync } from "node:fs";
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: { extension: "src/extension.ts", worker: "src/worker.ts" },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

/** The webview bundle is built by its own package; ship it inside dist/. */
function copyWebviewAssets() {
  const source = "../webview/dist";
  if (!existsSync(source)) {
    console.warn(
      "webview bundle missing: run `pnpm build` at the repo root so the panel has assets",
    );
    return;
  }
  rmSync("dist/webview", { recursive: true, force: true });
  cpSync(source, "dist/webview", { recursive: true });
}

if (watch) {
  const watcher = await context(options);
  await watcher.watch();
} else {
  await build(options);
}
copyWebviewAssets();
```

Create `packages/extension/test/support/fixtures.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const testCodeRoot = resolve(here, "../../../../test-code");

/** Absolute path to a file inside a test-code project. */
export function fixturePath(name: string, rel = ""): string {
  return join(testCodeRoot, name, rel);
}

/** Zero-based offset of the first `needle` in `file`, plus `delta`. */
export function offsetOf(file: string, needle: string, delta = 0): number {
  const index = readFileSync(file, "utf8").indexOf(needle);
  if (index < 0) throw new Error(`"${needle}" not found in ${file}`);
  return index + delta;
}
```

Run: `pnpm install`
Expected: completes; `packages/extension` now links `@code-spider/core`.

- [ ] **Step 2: Write the failing handler tests**

Create `packages/extension/src/worker/protocol.ts` (types the tests import):

```ts
import type { GraphSlice } from "@code-spider/core";

export type FocusResult = { slice: GraphSlice; repoRoot: string };

export type WarmRequest = {
  kind: "warm";
  file: string;
  changedFiles: string[];
};

export type FocusRequestBody = {
  kind: "focus";
  file: string;
  offset: number;
  changedFiles: string[];
};

export type WorkerRequest = (WarmRequest | FocusRequestBody) & { id: number };

export type WorkerResponse =
  | { id: number; kind: "warmed" }
  | { id: number; kind: "focused"; result: FocusResult }
  | { id: number; kind: "failed"; message: string };
```

Create `packages/extension/test/worker-handler.test.ts`:

```ts
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createWorkerHandler } from "../src/worker/handler.js";
import { ProjectCache } from "../src/worker/project-cache.js";
import type { WorkerResponse } from "../src/worker/protocol.js";
import { fixturePath, offsetOf } from "./support/fixtures.js";

const signup = fixturePath("basic", "src/signup.ts");
const insideHandleSignup = offsetOf(signup, "validateUser(input)", 3);

function idsOf(response: WorkerResponse): string[] {
  if (response.kind !== "focused") throw new Error(`got ${response.kind}`);
  return response.result.slice.nodes.map((node) => node.id);
}

describe("createWorkerHandler", () => {
  it("answers a focus request with the slice and the repo root", () => {
    const handle = createWorkerHandler();
    const response = handle({
      id: 7,
      kind: "focus",
      file: signup,
      offset: insideHandleSignup,
      changedFiles: [],
    });
    expect(response.id).toBe(7);
    if (response.kind !== "focused") throw new Error(response.kind);
    expect(response.result.slice.focusId).toBe("src/signup.ts#handleSignup");
    expect(response.result.repoRoot).toBe(fixturePath("basic"));
  });

  it("answers a warm request", () => {
    const handle = createWorkerHandler();
    expect(
      handle({ id: 1, kind: "warm", file: signup, changedFiles: [] }),
    ).toEqual({ id: 1, kind: "warmed" });
  });

  it("reports a cursor outside any callable as a failure, not a throw", () => {
    const handle = createWorkerHandler();
    const response = handle({
      id: 2,
      kind: "focus",
      file: fixturePath("basic", "src/types.ts"),
      offset: 0,
      changedFiles: [],
    });
    expect(response.kind).toBe("failed");
    if (response.kind === "failed") {
      expect(response.message).toContain("No callable found");
    }
  });

  it("reports a missing tsconfig as a failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-spider-notsconfig-"));
    try {
      const file = join(dir, "a.ts");
      writeFileSync(file, "export const a = 1;\n");
      const response = createWorkerHandler()({
        id: 3,
        kind: "focus",
        file,
        offset: 0,
        changedFiles: [],
      });
      expect(response.kind).toBe("failed");
      if (response.kind === "failed") {
        expect(response.message).toContain("No tsconfig.json found");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ProjectCache", () => {
  it("keeps one warm project per tsconfig", () => {
    const cache = new ProjectCache();
    const first = cache.open(signup);
    const sameProject = cache.open(fixturePath("basic", "src/app.ts"));
    const otherProject = cache.open(fixturePath("jsx", "src/components.tsx"));
    expect(sameProject).toBe(first);
    expect(otherProject).not.toBe(first);
  });

  it("warms a project once", () => {
    const cache = new ProjectCache();
    const entry = cache.open(signup);
    expect(entry.warmed).toBe(false);
    cache.warm(entry);
    expect(entry.warmed).toBe(true);
  });

  it("evicts the least recently used project beyond the cap", () => {
    const cache = new ProjectCache();
    const basic = cache.open(signup);
    cache.open(fixturePath("jsx", "src/components.tsx"));
    cache.open(fixturePath("hub", "src/callers.ts"));
    cache.open(fixturePath("barrel", "src/consumer.ts"));
    expect(cache.open(signup)).not.toBe(basic);
  });
});

describe("changed-file refresh", () => {
  const dir = mkdtempSync(join(tmpdir(), "code-spider-refresh-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("applies saved files on the next request and not before", () => {
    cpSync(fixturePath("basic"), dir, { recursive: true });
    const file = join(dir, "src/signup.ts");
    const offset = offsetOf(file, "validateUser(input)", 3);
    const handle = createWorkerHandler();
    const focus = (changedFiles: string[]) =>
      handle({ id: 1, kind: "focus", file, offset, changedFiles });

    expect(idsOf(focus([]))).not.toContain("src/signup.ts#extra");

    const edited = readFileSync(file, "utf8").replace(
      "  return user\n}",
      "  extra()\n  return user\n}\n\nexport function extra(): number {\n  return 1\n}",
    );
    writeFileSync(file, edited);

    expect(idsOf(focus([]))).not.toContain("src/signup.ts#extra");
    expect(idsOf(focus([file]))).toContain("src/signup.ts#extra");
  });

  it("adds the focus file from disk when it was created after the project loaded", () => {
    const handle = createWorkerHandler();
    const existing = join(dir, "src/signup.ts");
    handle({ id: 1, kind: "warm", file: existing, changedFiles: [] });

    const created = join(dir, "src/created.ts");
    writeFileSync(
      created,
      "export function created(): number {\n  return 1\n}\n",
    );
    const response = handle({
      id: 2,
      kind: "focus",
      file: created,
      offset: offsetOf(created, "return", 1),
      changedFiles: [created],
    });
    expect(idsOf(response)).toContain("src/created.ts#created");
  });
});
```

- [ ] **Step 3: Run the handler tests and watch them fail**

Run: `pnpm --filter code-spider-vscode test worker-handler`
Expected: FAIL to import `../src/worker/handler.js` and
`../src/worker/project-cache.js`.

- [ ] **Step 4: Implement the project cache and the handler**

Create `packages/extension/src/worker/project-cache.ts`:

```ts
import { dirname } from "node:path";
import {
  findTsconfig,
  loadProject,
  warmProject,
  type Project,
} from "@code-spider/core";

/** Warm projects are large; keep only the few most recently used. */
const MAX_PROJECTS = 3;

export type ProjectEntry = {
  tsconfig: string;
  repoRoot: string;
  project: Project;
  warmed: boolean;
};

export class ProjectCache {
  private readonly tsconfigByFile = new Map<string, string>();
  /** Insertion order doubles as recency: the first key is the oldest. */
  private readonly entries = new Map<string, ProjectEntry>();
  private readonly pending = new Map<string, Set<string>>();

  /** Saved files are applied to each project the next time it is used. */
  noteChanged(files: readonly string[]): void {
    for (const queue of this.pending.values()) {
      for (const file of files) queue.add(file);
    }
  }

  open(file: string): ProjectEntry {
    const tsconfig = this.tsconfigFor(file);
    const entry = this.touch(tsconfig) ?? this.load(tsconfig);
    this.refreshChanged(entry);
    if (!entry.project.getSourceFile(file)) {
      entry.project.addSourceFileAtPathIfExists(file);
    }
    return entry;
  }

  warm(entry: ProjectEntry): void {
    if (entry.warmed) return;
    warmProject(entry.project);
    entry.warmed = true;
  }

  private tsconfigFor(file: string): string {
    const known = this.tsconfigByFile.get(file);
    if (known) return known;
    const found = findTsconfig(file);
    this.tsconfigByFile.set(file, found);
    return found;
  }

  private touch(tsconfig: string): ProjectEntry | undefined {
    const entry = this.entries.get(tsconfig);
    if (!entry) return undefined;
    this.entries.delete(tsconfig);
    this.entries.set(tsconfig, entry);
    return entry;
  }

  private load(tsconfig: string): ProjectEntry {
    const entry: ProjectEntry = {
      tsconfig,
      repoRoot: dirname(tsconfig),
      project: loadProject(tsconfig),
      warmed: false,
    };
    this.entries.set(tsconfig, entry);
    this.pending.set(tsconfig, new Set());
    this.evictOldest();
    return entry;
  }

  private evictOldest(): void {
    while (this.entries.size > MAX_PROJECTS) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
      this.pending.delete(oldest);
    }
  }

  private refreshChanged(entry: ProjectEntry): void {
    const queue = this.pending.get(entry.tsconfig);
    if (!queue) return;
    for (const file of queue) {
      entry.project.getSourceFile(file)?.refreshFromFileSystemSync();
    }
    queue.clear();
  }
}
```

Create `packages/extension/src/worker/handler.ts`:

```ts
import { analyzeFocus } from "@code-spider/core";
import { ProjectCache } from "./project-cache.js";
import type { WorkerRequest, WorkerResponse } from "./protocol.js";

export type WorkerHandler = (request: WorkerRequest) => WorkerResponse;

export function createWorkerHandler(
  cache: ProjectCache = new ProjectCache(),
): WorkerHandler {
  return (request) => {
    try {
      cache.noteChanged(request.changedFiles);
      const entry = cache.open(request.file);
      if (request.kind === "warm") {
        cache.warm(entry);
        return { id: request.id, kind: "warmed" };
      }
      const slice = analyzeFocus(entry.project, {
        file: request.file,
        offset: request.offset,
        repoRoot: entry.repoRoot,
      });
      return {
        id: request.id,
        kind: "focused",
        result: { slice, repoRoot: entry.repoRoot },
      };
    } catch (error) {
      return {
        id: request.id,
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
```

Run: `pnpm --filter code-spider-vscode test worker-handler`
Expected: 1 file, 9 tests, all pass (the first run loads fixture projects and
can take several seconds).

- [ ] **Step 5: Write the failing client tests**

Create `packages/extension/test/worker-client.test.ts`:

```ts
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { WorkerRequest, WorkerResponse } from "../src/worker/protocol.js";
import {
  WorkerClient,
  WorkerCrashedError,
  type WorkerLike,
} from "../src/worker/worker-client.js";

class FakeWorker extends EventEmitter implements WorkerLike {
  readonly posted: WorkerRequest[] = [];
  terminated = false;

  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): Promise<number> {
    this.terminated = true;
    return Promise.resolve(0);
  }

  reply(response: WorkerResponse): void {
    this.emit("message", response);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new WorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { workers, client };
}

const result = {
  slice: { focusId: "a.ts#f", nodes: [], edges: [], truncated: false },
  repoRoot: "/repo",
};

function outOfMemory(): Error {
  return Object.assign(new Error("heap out of memory"), {
    code: "ERR_WORKER_OUT_OF_MEMORY",
  });
}

describe("WorkerClient", () => {
  it("starts the worker lazily and reuses it", async () => {
    const { workers, client } = setup();
    expect(workers).toHaveLength(0);
    const first = client.warm("/a.ts", []);
    workers[0]?.reply({ id: 1, kind: "warmed" });
    await first;
    const second = client.warm("/a.ts", []);
    workers[0]?.reply({ id: 2, kind: "warmed" });
    await second;
    expect(workers).toHaveLength(1);
  });

  it("posts focus requests and resolves with the result", async () => {
    const { workers, client } = setup();
    const pending = client.focus("/a.ts", 12, ["/b.ts"]);
    expect(workers[0]?.posted).toEqual([
      {
        id: 1,
        kind: "focus",
        file: "/a.ts",
        offset: 12,
        changedFiles: ["/b.ts"],
      },
    ]);
    workers[0]?.reply({ id: 1, kind: "focused", result });
    await expect(pending).resolves.toEqual(result);
  });

  it("matches out-of-order replies by id", async () => {
    const { workers, client } = setup();
    const first = client.focus("/a.ts", 1, []);
    const second = client.focus("/a.ts", 2, []);
    workers[0]?.reply({ id: 2, kind: "failed", message: "second failed" });
    workers[0]?.reply({ id: 1, kind: "focused", result });
    await expect(first).resolves.toEqual(result);
    await expect(second).rejects.toThrow("second failed");
  });

  it("rejects with the worker's message when the request fails", async () => {
    const { workers, client } = setup();
    const pending = client.focus("/a.ts", 0, []);
    workers[0]?.reply({ id: 1, kind: "failed", message: "No callable found" });
    await expect(pending).rejects.toThrow("No callable found");
  });

  it("reports an out-of-memory worker and starts a fresh one next time", async () => {
    const { workers, client } = setup();
    const pending = client.focus("/a.ts", 0, []);
    workers[0]?.emit("error", outOfMemory());
    workers[0]?.emit("exit", 1);
    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WorkerCrashedError);
    expect((error as WorkerCrashedError).outOfMemory).toBe(true);
    expect(workers[0]?.terminated).toBe(true);

    const next = client.focus("/a.ts", 0, []);
    expect(workers).toHaveLength(2);
    workers[1]?.reply({ id: 2, kind: "focused", result });
    await expect(next).resolves.toEqual(result);
  });

  it("treats an unexpected exit as a crash, not an out-of-memory", async () => {
    const { workers, client } = setup();
    const pending = client.focus("/a.ts", 0, []);
    workers[0]?.emit("exit", 3);
    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WorkerCrashedError);
    expect((error as WorkerCrashedError).outOfMemory).toBe(false);
    expect((error as WorkerCrashedError).message).toContain("3");
  });

  it("rejects every in-flight request when the worker dies", async () => {
    const { workers, client } = setup();
    const first = client.focus("/a.ts", 1, []);
    const second = client.focus("/a.ts", 2, []);
    workers[0]?.emit("error", new Error("boom"));
    await expect(first).rejects.toBeInstanceOf(WorkerCrashedError);
    await expect(second).rejects.toBeInstanceOf(WorkerCrashedError);
  });

  it("ignores late events from a worker that was already replaced", async () => {
    const { workers, client } = setup();
    const first = client.focus("/a.ts", 0, []);
    workers[0]?.emit("error", outOfMemory());
    await first.catch(() => undefined);

    const next = client.focus("/a.ts", 0, []);
    workers[0]?.emit("exit", 1);
    workers[1]?.reply({ id: 2, kind: "focused", result });
    await expect(next).resolves.toEqual(result);
  });

  it("recycle terminates the worker, rejects pending work and restarts lazily", async () => {
    const { workers, client } = setup();
    const pending = client.focus("/a.ts", 0, []);
    client.recycle();
    expect(workers[0]?.terminated).toBe(true);
    await expect(pending).rejects.toThrow("restarted");

    const next = client.warm("/a.ts", []);
    expect(workers).toHaveLength(2);
    workers[1]?.reply({ id: 2, kind: "warmed" });
    await next;
  });
});
```

- [ ] **Step 6: Run the client tests and watch them fail**

Run: `pnpm --filter code-spider-vscode test worker-client`
Expected: FAIL to import `../src/worker/worker-client.js`.

- [ ] **Step 7: Implement the client, the spawner and the worker entry**

Create `packages/extension/src/worker/worker-client.ts`:

```ts
import type {
  FocusRequestBody,
  FocusResult,
  WarmRequest,
  WorkerRequest,
  WorkerResponse,
} from "./protocol.js";

/** The part of `worker_threads.Worker` the client depends on. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  on(event: "message", listener: (message: WorkerResponse) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (exitCode: number) => void): unknown;
  terminate(): Promise<number>;
}

export class WorkerCrashedError extends Error {
  constructor(
    message: string,
    readonly outOfMemory: boolean,
  ) {
    super(message);
    this.name = "WorkerCrashedError";
  }
}

type Waiting = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
};

export class WorkerClient {
  private worker: WorkerLike | undefined;
  private nextId = 1;
  private readonly waiting = new Map<number, Waiting>();

  constructor(private readonly spawn: () => WorkerLike) {}

  async warm(file: string, changedFiles: string[]): Promise<void> {
    await this.request({ kind: "warm", file, changedFiles });
  }

  async focus(
    file: string,
    offset: number,
    changedFiles: string[],
  ): Promise<FocusResult> {
    const response = await this.request({
      kind: "focus",
      file,
      offset,
      changedFiles,
    });
    if (response.kind !== "focused") {
      throw new Error(`Unexpected worker response: ${response.kind}`);
    }
    return response.result;
  }

  /** Drops the current worker; the next request starts a fresh one. */
  recycle(): void {
    const worker = this.worker;
    this.worker = undefined;
    if (worker) void worker.terminate().catch(() => undefined);
    this.rejectAll(new Error("The Code Spider analysis worker was restarted."));
  }

  dispose(): void {
    this.recycle();
  }

  private request(
    body: WarmRequest | FocusRequestBody,
  ): Promise<WorkerResponse> {
    const worker = this.worker ?? this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      worker.postMessage({ ...body, id });
    });
  }

  private start(): WorkerLike {
    const worker = this.spawn();
    this.worker = worker;
    worker.on("message", (message) => this.onMessage(worker, message));
    worker.on("error", (error) => this.onCrash(worker, error));
    worker.on("exit", (code) =>
      this.onCrash(worker, new Error(`exited with code ${code}`)),
    );
    return worker;
  }

  private onMessage(worker: WorkerLike, response: WorkerResponse): void {
    if (worker !== this.worker) return;
    const waiting = this.waiting.get(response.id);
    if (!waiting) return;
    this.waiting.delete(response.id);
    if (response.kind === "failed") waiting.reject(new Error(response.message));
    else waiting.resolve(response);
  }

  private onCrash(worker: WorkerLike, error: Error): void {
    if (worker !== this.worker) return;
    this.worker = undefined;
    void worker.terminate().catch(() => undefined);
    const outOfMemory =
      (error as { code?: unknown }).code === "ERR_WORKER_OUT_OF_MEMORY";
    this.rejectAll(
      new WorkerCrashedError(
        outOfMemory
          ? "The analysis worker ran out of memory."
          : `The analysis worker stopped: ${error.message}`,
        outOfMemory,
      ),
    );
  }

  private rejectAll(error: Error): void {
    const all = [...this.waiting.values()];
    this.waiting.clear();
    for (const waiting of all) waiting.reject(error);
  }
}
```

Create `packages/extension/src/worker/spawn.ts`:

```ts
import { Worker } from "node:worker_threads";
import type { WorkerLike } from "./worker-client.js";

/**
 * Large projects exceed Node's default heap (the lobe-chat measurement in the
 * perf note needed 6 GiB), so the limit is raised per worker.
 */
export function spawnAnalysisWorker(
  workerPath: string,
  maxHeapMb: number,
): WorkerLike {
  return new Worker(workerPath, {
    resourceLimits: { maxOldGenerationSizeMb: maxHeapMb },
  });
}
```

Create `packages/extension/src/worker.ts`:

```ts
import { parentPort } from "node:worker_threads";
import { createWorkerHandler } from "./worker/handler.js";
import type { WorkerRequest } from "./worker/protocol.js";

const port = parentPort;
if (!port) throw new Error("worker.ts must run inside a worker thread");

const handle = createWorkerHandler();
port.on("message", (request: WorkerRequest) => {
  port.postMessage(handle(request));
});
```

Run: `pnpm --filter code-spider-vscode test worker-client`
Expected: 1 file, 9 tests, all pass.

Run: `pnpm --filter code-spider-vscode typecheck`
Expected: no output, exit code 0. (This proves a real `Worker` is assignable to
`WorkerLike`.)

- [ ] **Step 8: Write the integration test against the real bundle**

Create `packages/extension/test/worker-integration.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnAnalysisWorker } from "../src/worker/spawn.js";
import {
  WorkerClient,
  WorkerCrashedError,
} from "../src/worker/worker-client.js";
import { fixturePath, offsetOf } from "./support/fixtures.js";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = join(packageDir, "dist/worker.cjs");
const scratch = mkdtempSync(join(tmpdir(), "code-spider-oom-"));
const hungryWorker = join(scratch, "hungry.cjs");

const signup = fixturePath("basic", "src/signup.ts");
const offset = offsetOf(signup, "validateUser(input)", 3);

beforeAll(() => {
  execFileSync(process.execPath, ["build.mjs"], {
    cwd: packageDir,
    stdio: "pipe",
  });
  writeFileSync(
    hungryWorker,
    `const { parentPort } = require("node:worker_threads");
parentPort.on("message", () => {
  const keep = [];
  for (;;) keep.push(new Array(100000).fill(1));
});
`,
  );
}, 120_000);

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("bundled analysis worker", () => {
  it("warms and analyses a fixture in a real worker thread", async () => {
    const client = new WorkerClient(() =>
      spawnAnalysisWorker(workerPath, 2048),
    );
    try {
      await client.warm(signup, []);
      const { slice, repoRoot } = await client.focus(signup, offset, []);
      expect(slice.focusId).toBe("src/signup.ts#handleSignup");
      expect(repoRoot).toBe(fixturePath("basic"));
    } finally {
      client.dispose();
    }
  });

  it("survives a real out-of-memory worker and starts a fresh one", async () => {
    let spawned = 0;
    const client = new WorkerClient(() => {
      spawned += 1;
      return spawned === 1
        ? spawnAnalysisWorker(hungryWorker, 64)
        : spawnAnalysisWorker(workerPath, 2048);
    });
    try {
      const error = await client
        .focus(signup, offset, [])
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(WorkerCrashedError);
      expect((error as WorkerCrashedError).outOfMemory).toBe(true);

      const { slice } = await client.focus(signup, offset, []);
      expect(slice.focusId).toBe("src/signup.ts#handleSignup");
    } finally {
      client.dispose();
    }
  });
});
```

- [ ] **Step 9: Run the integration test**

Run: `pnpm --filter code-spider-vscode test worker-integration`
Expected: 1 file, 2 tests, pass. The `beforeAll` rebuilds
`packages/extension/dist/` (including `worker.cjs`), so the test works from a
clean checkout.

Run: `ls -la packages/extension/dist/worker.cjs`
Expected: the file exists and is roughly 12 MB (core, ts-morph and TypeScript
are bundled).

- [ ] **Step 10: Full verification**

Run: `pnpm -r typecheck`
Expected: every package exits 0.

Run: `pnpm -r test`
Expected: all green: core 231, CLI 43, webview 7, extension 39.

Run: `pnpm build`
Expected: webview, then extension (both `extension.cjs` and `worker.cjs`)
build without warning messages. (The warning sign esbuild prints next to
`worker.cjs`'s 12 MB size is its large-file marker, not a warning.)

- [ ] **Step 11: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: ` M packages/extension/build.mjs`, ` M packages/extension/package.json`,
` M pnpm-lock.yaml`, and untracked `packages/extension/src/worker.ts`,
`packages/extension/src/worker/`, `packages/extension/test/support/fixtures.ts`
and the three new test files.

Run: `git diff --check -- packages/extension pnpm-lock.yaml`
Expected: no output.

Run: `git diff -- packages/extension/build.mjs packages/extension/package.json` and `git diff --stat -- pnpm-lock.yaml`
Expected: only the entry-point, dependency and lockfile changes from Step 1.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/extension); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `feat(extension): add analysis worker with project cache and out-of-memory recovery`

The implementer does not stage or commit; the user does.

### Task 4: Show Graph command wiring (cursor to worker to panel)

**Files:**
- Create: `packages/extension/src/positions.ts`
- Create: `packages/extension/src/changes.ts`
- Create: `packages/extension/src/settings-values.ts`
- Create: `packages/extension/src/warm-once.ts`
- Create: `packages/extension/src/ports.ts`
- Create: `packages/extension/src/session.ts`
- Create: `packages/extension/src/vscode/focus-request.ts`
- Create: `packages/extension/src/vscode/notifier.ts`
- Create: `packages/extension/src/vscode/settings.ts`
- Create: `packages/extension/src/vscode/status-bar.ts`
- Create: `packages/webview/src/delayed-flag.ts`
- Create: `packages/webview/src/use-delayed-flag.ts`
- Modify: `packages/extension/src/ids.ts`
- Modify: `packages/extension/src/extension.ts`
- Modify: `packages/extension/package.json` (activation events, heap setting)
- Modify: `packages/webview/src/App.tsx`
- Modify: `packages/webview/src/styles.css`
- Test: `packages/extension/test/support/manifest.ts` (replace)
- Test: `packages/extension/test/manifest.test.ts` (replace)
- Test: `packages/extension/test/positions.test.ts`
- Test: `packages/extension/test/changes.test.ts`
- Test: `packages/extension/test/settings-values.test.ts`
- Test: `packages/extension/test/warm-once.test.ts`
- Test: `packages/extension/test/session.test.ts`
- Test: `packages/webview/test/delayed-flag.test.ts`

**Interfaces:**
- Consumes (Task 2): `GraphPanel` with `show()` and `post(message:
  ExtensionToWebview)`; `ExtensionToWebview` from
  `@code-spider/webview/protocol`; webview `reduceMessage`, `initialState`,
  `isExtensionMessage`, `postToExtension`.
- Consumes (Task 3): `WorkerClient` (`warm`, `focus`, `recycle`, `dispose`),
  `WorkerCrashedError`, `spawnAnalysisWorker`, `FocusResult`.
- Produces in `packages/extension/src/ids.ts`:
  `SETTING_MAX_HEAP_MB = "codeSpider.worker.maxHeapMb"` (added to the existing
  constants).
- Produces `positionToOffset(text: string, line: number, character: number):
  number` (zero-based line and character in, zero-based offset out; throws
  `RangeError` for a line outside the text).
- Produces `ANALYSABLE_LANGUAGE_IDS: readonly string[]`,
  `isAnalysableLanguage(languageId: string): boolean`, and
  `class ChangeTracker { markSaved(languageId, fsPath): void; drain():
  string[] }` from `src/changes.ts`.
- Produces `DEFAULT_MAX_HEAP_MB = 8192`, `MIN_MAX_HEAP_MB = 512`,
  `normaliseHeapMb(raw: unknown): number` from `src/settings-values.ts`.
- Produces `class WarmOnce` in `src/warm-once.ts`: `constructor(warm: (file:
  string) => void)` and `offer(document: WarmCandidate | undefined): void`
  where `WarmCandidate = { languageId: string; uri: { scheme: string; fsPath:
  string } }`. It calls `warm` for the first offered document that is a
  TS/JS file on disk and ignores everything else.
- Produces the ports in `src/ports.ts`: `AnalysisPort`, `PanelPort`,
  `Notifier`, `IndexingIndicator`.
- Produces in `src/session.ts`: `FocusRequest = { file: string; text: string;
  line: number; character: number; isDirty: boolean }`, `CurrentGraph =
  FocusResult`, `SessionDeps`, and `class GraphSession` with
  `showGraph(request: FocusRequest): Promise<void>`, `warm(file: string):
  Promise<void>`, `currentGraph(): CurrentGraph | undefined`.
- Produces `resolveFocusRequest(uri?: vscode.Uri, position?: vscode.Position):
  Promise<FocusRequest | undefined>`, `notifier: Notifier`,
  `getMaxHeapMb(): number`, `class IndexingStatusBar implements
  IndexingIndicator, vscode.Disposable`.
- Produces `activate(context): ExtensionApi` with `ExtensionApi = {
  currentGraph(): CurrentGraph | undefined }`; the smoke tests (Task 9) use it.
- Produces in the webview: `DelayedFlag` and `useDelayedFlag(active, delayMs)`,
  and `SPINNER_DELAY_MS = 500` exported from `App.tsx`.

**Behaviour decided here (spec §7.3, §8.1, perf note consequences):**
- Dirty focused document: show a warning asking the user to save, do not
  analyse. Analysis reads files from disk, so an unsaved edit would shift every
  offset. Other unsaved files are analysed as saved on disk.
- The panel opens (`panel.show()`) only for a document that will be analysed.
- Busy state: `busy:true` when a request starts, `busy:false` when the last
  outstanding request ends. The panel shows a spinner only if busy lasts more
  than 500 ms. A newer request supersedes an older one; only the newest result
  reaches the panel.
- Indexing: for the first TS/JS file on disk that becomes the active editor,
  `warm` runs behind an `indexing` message plus a status bar item. It is
  offered at activation and again on every active-editor change, because VS
  Code can activate the extension (on `onLanguage`) just before it reports the
  editor as active.
  Ordinary warm failures (for example no `tsconfig.json`) are silent; the first
  focus reports them. Out-of-memory is reported.
- Failures reach the panel as `analysisError`. Worker crashes, including
  out-of-memory, also raise a VS Code error notification.

- [ ] **Step 1: Write the failing tests for the pure extension modules**

Edit `packages/extension/src/ids.ts` — replace:

```
export const PANEL_TITLE = "Code Spider";
```

with:

```
export const PANEL_TITLE = "Code Spider";
export const SETTING_MAX_HEAP_MB = "codeSpider.worker.maxHeapMb";
```

Create `packages/extension/test/positions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { positionToOffset } from "../src/positions.js";

describe("positionToOffset", () => {
  it("maps positions on the first line", () => {
    expect(positionToOffset("abc\ndef\n", 0, 0)).toBe(0);
    expect(positionToOffset("abc\ndef\n", 0, 2)).toBe(2);
  });

  it("counts the newline of every earlier line", () => {
    expect(positionToOffset("abc\ndef\nghi", 1, 1)).toBe(5);
    expect(positionToOffset("abc\ndef\nghi", 2, 0)).toBe(8);
  });

  it("counts the carriage return of CRLF lines", () => {
    expect(positionToOffset("abc\r\ndef\r\n", 1, 1)).toBe(6);
  });

  it("accepts the end of a line and the empty last line", () => {
    expect(positionToOffset("abc\ndef\n", 0, 3)).toBe(3);
    expect(positionToOffset("abc\n", 1, 0)).toBe(4);
  });

  it("clamps a character past the end of the line", () => {
    expect(positionToOffset("abc\ndef", 0, 99)).toBe(3);
  });

  it("rejects a line outside the text", () => {
    expect(() => positionToOffset("abc", 1, 0)).toThrow(RangeError);
    expect(() => positionToOffset("abc", -1, 0)).toThrow(RangeError);
  });
});
```

Create `packages/extension/test/changes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ANALYSABLE_LANGUAGE_IDS,
  ChangeTracker,
  isAnalysableLanguage,
} from "../src/changes.js";

describe("isAnalysableLanguage", () => {
  it("accepts TypeScript, TSX, JavaScript and JSX", () => {
    expect([...ANALYSABLE_LANGUAGE_IDS].sort()).toEqual([
      "javascript",
      "javascriptreact",
      "typescript",
      "typescriptreact",
    ]);
    for (const id of ANALYSABLE_LANGUAGE_IDS) {
      expect(isAnalysableLanguage(id)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    expect(isAnalysableLanguage("json")).toBe(false);
    expect(isAnalysableLanguage("markdown")).toBe(false);
  });
});

describe("ChangeTracker", () => {
  it("drains the saved TS/JS paths once", () => {
    const tracker = new ChangeTracker();
    tracker.markSaved("typescript", "/repo/a.ts");
    tracker.markSaved("typescriptreact", "/repo/b.tsx");
    tracker.markSaved("typescript", "/repo/a.ts");
    expect(tracker.drain().sort()).toEqual(["/repo/a.ts", "/repo/b.tsx"]);
    expect(tracker.drain()).toEqual([]);
  });

  it("ignores other languages", () => {
    const tracker = new ChangeTracker();
    tracker.markSaved("json", "/repo/package.json");
    expect(tracker.drain()).toEqual([]);
  });
});
```

Create `packages/extension/test/settings-values.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_HEAP_MB,
  MIN_MAX_HEAP_MB,
  normaliseHeapMb,
} from "../src/settings-values.js";

describe("normaliseHeapMb", () => {
  it("defaults to 8192 MB", () => {
    expect(DEFAULT_MAX_HEAP_MB).toBe(8192);
    expect(normaliseHeapMb(undefined)).toBe(8192);
  });

  it("falls back to the default for non-numbers", () => {
    expect(normaliseHeapMb("lots")).toBe(8192);
    expect(normaliseHeapMb(Number.NaN)).toBe(8192);
    expect(normaliseHeapMb(Number.POSITIVE_INFINITY)).toBe(8192);
  });

  it("floors fractions and enforces the minimum", () => {
    expect(normaliseHeapMb(4096.9)).toBe(4096);
    expect(normaliseHeapMb(1)).toBe(MIN_MAX_HEAP_MB);
    expect(normaliseHeapMb(-5)).toBe(MIN_MAX_HEAP_MB);
  });
});
```

Create `packages/extension/test/warm-once.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { WarmOnce } from "../src/warm-once.js";

const file = (languageId: string, fsPath: string, scheme = "file") => ({
  languageId,
  uri: { scheme, fsPath },
});

describe("WarmOnce", () => {
  it("ignores an offer with no document", () => {
    const warm = vi.fn();
    new WarmOnce(warm).offer(undefined);
    expect(warm).not.toHaveBeenCalled();
  });

  it("ignores documents that are not TS/JS files on disk", () => {
    const warm = vi.fn();
    const once = new WarmOnce(warm);
    once.offer(file("markdown", "/repo/README.md"));
    once.offer(file("typescript", "/repo/a.ts", "untitled"));
    expect(warm).not.toHaveBeenCalled();
  });

  it("warms for the first eligible document only", () => {
    const warm = vi.fn();
    const once = new WarmOnce(warm);
    once.offer(file("json", "/repo/package.json"));
    once.offer(file("typescriptreact", "/repo/a.tsx"));
    once.offer(file("typescript", "/repo/b.ts"));
    expect(warm).toHaveBeenCalledOnce();
    expect(warm).toHaveBeenCalledWith("/repo/a.tsx");
  });
});
```

Replace `packages/extension/test/support/manifest.ts` with:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Manifest = {
  engines: { vscode: string };
  main: string;
  activationEvents: string[];
  contributes: {
    commands: { command: string; title: string; category: string }[];
    configuration?: {
      properties: Record<
        string,
        { type: string; default: unknown; minimum?: number }
      >;
    };
  };
};

const here = dirname(fileURLToPath(import.meta.url));

export function readManifest(): Manifest {
  const path = join(here, "../../package.json");
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}
```

Replace `packages/extension/test/manifest.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { ANALYSABLE_LANGUAGE_IDS } from "../src/changes.js";
import { COMMAND_SHOW_GRAPH, SETTING_MAX_HEAP_MB } from "../src/ids.js";
import {
  DEFAULT_MAX_HEAP_MB,
  MIN_MAX_HEAP_MB,
} from "../src/settings-values.js";
import { readManifest } from "./support/manifest.js";

describe("extension manifest", () => {
  it("contributes Show Graph under the Code Spider category", () => {
    const command = readManifest().contributes.commands.find(
      (entry) => entry.command === COMMAND_SHOW_GRAPH,
    );
    expect(command).toMatchObject({
      title: "Show Graph",
      category: "Code Spider",
    });
  });

  it("points main at the CommonJS bundle", () => {
    expect(readManifest().main).toBe("./dist/extension.cjs");
  });

  it("activates when a TypeScript or JavaScript file opens", () => {
    const expected = ANALYSABLE_LANGUAGE_IDS.map((id) => `onLanguage:${id}`);
    expect(readManifest().activationEvents.sort()).toEqual(expected.sort());
  });

  it("declares the worker heap setting with the shared default and minimum", () => {
    const setting =
      readManifest().contributes.configuration?.properties[SETTING_MAX_HEAP_MB];
    expect(setting).toMatchObject({
      type: "number",
      default: DEFAULT_MAX_HEAP_MB,
      minimum: MIN_MAX_HEAP_MB,
    });
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm --filter code-spider-vscode test positions`
Expected: FAIL to import `../src/positions.js`. Likewise `changes`,
`settings-values` and `warm-once`. The manifest tests for activation events and
the setting FAIL (`manifest.test.ts` also fails to import `../src/changes.js`).

- [ ] **Step 3: Implement the pure modules and update the manifest**

Create `packages/extension/src/positions.ts`:

```ts
/**
 * Zero-based line and character to a zero-based character offset into `text`,
 * the same arithmetic the CLI applies to its one-based line:col. A CRLF
 * file's `\r` stays inside its line, so it is counted.
 */
export function positionToOffset(
  text: string,
  line: number,
  character: number,
): number {
  const lines = text.split("\n");
  if (line < 0 || line >= lines.length) {
    throw new RangeError(
      `Line ${line + 1} is out of range (file has ${lines.length} lines)`,
    );
  }

  let offset = 0;
  for (let i = 0; i < line; i += 1) {
    offset += (lines[i] ?? "").length + 1;
  }
  const lineLength = (lines[line] ?? "").length;
  return offset + Math.min(character, lineLength);
}
```

Create `packages/extension/src/changes.ts`:

```ts
export const ANALYSABLE_LANGUAGE_IDS: readonly string[] = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
];

export function isAnalysableLanguage(languageId: string): boolean {
  return ANALYSABLE_LANGUAGE_IDS.includes(languageId);
}

/** Paths saved since the last analysis request, sent to the worker (spec §8.2). */
export class ChangeTracker {
  private readonly saved = new Set<string>();

  markSaved(languageId: string, fsPath: string): void {
    if (isAnalysableLanguage(languageId)) this.saved.add(fsPath);
  }

  drain(): string[] {
    const files = [...this.saved];
    this.saved.clear();
    return files;
  }
}
```

Create `packages/extension/src/settings-values.ts`:

```ts
export const DEFAULT_MAX_HEAP_MB = 8192;
export const MIN_MAX_HEAP_MB = 512;

export function normaliseHeapMb(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_MAX_HEAP_MB;
  }
  return Math.max(MIN_MAX_HEAP_MB, Math.floor(raw));
}
```

Create `packages/extension/src/warm-once.ts`:

```ts
import { isAnalysableLanguage } from "./changes.js";

export type WarmCandidate = {
  languageId: string;
  uri: { scheme: string; fsPath: string };
};

/** Warms the project of the first TS/JS file the user has open, once. */
export class WarmOnce {
  private done = false;

  constructor(private readonly warm: (file: string) => void) {}

  offer(document: WarmCandidate | undefined): void {
    if (this.done || !document) return;
    if (document.uri.scheme !== "file") return;
    if (!isAnalysableLanguage(document.languageId)) return;
    this.done = true;
    this.warm(document.uri.fsPath);
  }
}
```

Edit `packages/extension/package.json` — replace:

```
  "activationEvents": [],
  "contributes": {
```

with:

```
  "activationEvents": [
    "onLanguage:typescript",
    "onLanguage:typescriptreact",
    "onLanguage:javascript",
    "onLanguage:javascriptreact"
  ],
  "contributes": {
    "configuration": {
      "title": "Code Spider",
      "properties": {
        "codeSpider.worker.maxHeapMb": {
          "type": "number",
          "default": 8192,
          "minimum": 512,
          "description": "Maximum heap, in megabytes, of the analysis worker. Raise it if Code Spider reports running out of memory on a very large project. Changing it restarts the worker."
        }
      }
    },
```

Run: `pnpm --filter code-spider-vscode test positions changes settings-values warm-once manifest`
Expected: 5 files, 20 tests, all pass.

- [ ] **Step 4: Write the failing session tests**

Create `packages/extension/src/ports.ts` (the interfaces the tests fake):

```ts
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import type { FocusResult } from "./worker/protocol.js";

export interface AnalysisPort {
  warm(file: string, changedFiles: string[]): Promise<void>;
  focus(
    file: string,
    offset: number,
    changedFiles: string[],
  ): Promise<FocusResult>;
}

export interface PanelPort {
  show(): void;
  post(message: ExtensionToWebview): void;
}

export interface Notifier {
  warn(message: string): void;
  error(message: string): void;
}

export interface IndexingIndicator {
  set(active: boolean): void;
}
```

Create `packages/extension/test/session.test.ts`:

```ts
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import { describe, expect, it, vi } from "vitest";
import { ChangeTracker } from "../src/changes.js";
import type { AnalysisPort, PanelPort } from "../src/ports.js";
import { GraphSession, type FocusRequest } from "../src/session.js";
import type { FocusResult } from "../src/worker/protocol.js";
import { WorkerCrashedError } from "../src/worker/worker-client.js";

function resultFor(focusId: string): FocusResult {
  return {
    slice: { focusId, nodes: [], edges: [], truncated: false },
    repoRoot: "/repo",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const request: FocusRequest = {
  file: "/repo/src/a.ts",
  text: "line0\nline1\nline2\n",
  line: 1,
  character: 2,
  isDirty: false,
};
const REQUEST_OFFSET = 8;

function setup(overrides: Partial<AnalysisPort> = {}) {
  const posted: ExtensionToWebview[] = [];
  const panel: PanelPort & { shown: number } = {
    shown: 0,
    show() {
      this.shown += 1;
    },
    post: (message) => posted.push(message),
  };
  const worker: AnalysisPort = {
    warm: vi.fn(async () => undefined),
    focus: vi.fn(async () => resultFor("src/a.ts#f")),
    ...overrides,
  };
  const notifier = { warn: vi.fn(), error: vi.fn() };
  const indexing = { set: vi.fn() };
  const changes = new ChangeTracker();
  const session = new GraphSession({
    worker,
    panel,
    notifier,
    indexing,
    changes,
    maxHeapMb: () => 4096,
  });
  const types = () => posted.map((message) => message.type);
  return { session, panel, worker, notifier, indexing, changes, posted, types };
}

describe("GraphSession.showGraph", () => {
  it("asks the user to save a dirty document and does nothing else", async () => {
    const { session, panel, worker, notifier } = setup();
    await session.showGraph({ ...request, isDirty: true });
    expect(notifier.warn).toHaveBeenCalledOnce();
    expect(notifier.warn.mock.calls[0]?.[0]).toContain("Save a.ts");
    expect(panel.shown).toBe(0);
    expect(worker.focus).not.toHaveBeenCalled();
  });

  it("opens the panel, marks busy, posts the slice, then clears busy", async () => {
    const { session, panel, worker, posted, types } = setup();
    await session.showGraph(request);
    expect(panel.shown).toBe(1);
    expect(worker.focus).toHaveBeenCalledWith(
      "/repo/src/a.ts",
      REQUEST_OFFSET,
      [],
    );
    expect(types()).toEqual(["busy", "slice", "busy"]);
    expect(posted[0]).toEqual({ type: "busy", busy: true });
    expect(posted[2]).toEqual({ type: "busy", busy: false });
    expect(session.currentGraph()).toEqual(resultFor("src/a.ts#f"));
  });

  it("sends the files saved since the last request, once", async () => {
    const { session, worker, changes } = setup();
    changes.markSaved("typescript", "/repo/src/b.ts");
    await session.showGraph(request);
    await session.showGraph(request);
    expect(worker.focus).toHaveBeenNthCalledWith(
      1,
      "/repo/src/a.ts",
      REQUEST_OFFSET,
      ["/repo/src/b.ts"],
    );
    expect(worker.focus).toHaveBeenNthCalledWith(
      2,
      "/repo/src/a.ts",
      REQUEST_OFFSET,
      [],
    );
  });

  it("shows an ordinary failure in the panel only", async () => {
    const { session, notifier, posted } = setup({
      focus: async () => {
        throw new Error("No callable found at x");
      },
    });
    await session.showGraph(request);
    expect(posted).toContainEqual({
      type: "analysisError",
      message: "No callable found at x",
    });
    expect(posted.at(-1)).toEqual({ type: "busy", busy: false });
    expect(notifier.error).not.toHaveBeenCalled();
  });

  it("reports an out-of-memory worker clearly, in the panel and a notification", async () => {
    const { session, notifier, posted } = setup({
      focus: async () => {
        throw new WorkerCrashedError(
          "The analysis worker ran out of memory.",
          true,
        );
      },
    });
    await session.showGraph(request);
    const error = posted.find((message) => message.type === "analysisError");
    expect(error).toMatchObject({ type: "analysisError" });
    const text = error?.type === "analysisError" ? error.message : "";
    expect(text).toContain("ran out of memory");
    expect(text).toContain("4096 MB");
    expect(text).toContain("codeSpider.worker.maxHeapMb");
    expect(notifier.error).toHaveBeenCalledWith(text);
  });

  it("explains that a crashed worker restarts on the next request", async () => {
    const { session, notifier, posted } = setup({
      focus: async () => {
        throw new WorkerCrashedError(
          "The analysis worker stopped: exited with code 3",
          false,
        );
      },
    });
    await session.showGraph(request);
    const error = posted.find((message) => message.type === "analysisError");
    const text = error?.type === "analysisError" ? error.message : "";
    expect(text).toContain("exited with code 3");
    expect(text).toContain("fresh worker");
    expect(notifier.error).toHaveBeenCalledOnce();
  });

  it("reports a position outside the document as a failure", async () => {
    const { session, worker, posted } = setup();
    await session.showGraph({ ...request, line: 99 });
    expect(worker.focus).not.toHaveBeenCalled();
    expect(posted.some((message) => message.type === "analysisError")).toBe(
      true,
    );
  });

  it("lets only the newest request reach the panel and clears busy once", async () => {
    const first = deferred<FocusResult>();
    const second = deferred<FocusResult>();
    const pending = [first, second];
    const { session, posted, types } = setup({
      focus: () => {
        const next = pending.shift();
        if (!next) throw new Error("unexpected request");
        return next.promise;
      },
    });

    const one = session.showGraph(request);
    const two = session.showGraph(request);
    second.resolve(resultFor("src/a.ts#second"));
    await two;
    first.resolve(resultFor("src/a.ts#first"));
    await one;

    const slices = posted.filter((message) => message.type === "slice");
    expect(slices).toHaveLength(1);
    expect(session.currentGraph()?.slice.focusId).toBe("src/a.ts#second");
    expect(types().filter((type) => type === "busy")).toEqual([
      "busy",
      "busy",
      "busy",
    ]);
    expect(posted.at(-1)).toEqual({ type: "busy", busy: false });
    expect(posted.filter((m) => m.type === "busy" && !m.busy)).toHaveLength(1);
  });
});

describe("GraphSession.warm", () => {
  it("shows the indexing state around the warm-up", async () => {
    const { session, worker, indexing, posted } = setup();
    await session.warm("/repo/src/a.ts");
    expect(worker.warm).toHaveBeenCalledWith("/repo/src/a.ts", []);
    expect(indexing.set.mock.calls).toEqual([[true], [false]]);
    expect(posted).toEqual([
      { type: "indexing", indexing: true },
      { type: "indexing", indexing: false },
    ]);
  });

  it("stays quiet when the warm-up fails for an ordinary reason", async () => {
    const { session, notifier, indexing } = setup({
      warm: async () => {
        throw new Error("No tsconfig.json found above /repo/src/a.ts");
      },
    });
    await session.warm("/repo/src/a.ts");
    expect(notifier.error).not.toHaveBeenCalled();
    expect(indexing.set).toHaveBeenLastCalledWith(false);
  });

  it("reports an out-of-memory warm-up", async () => {
    const { session, notifier, indexing } = setup({
      warm: async () => {
        throw new WorkerCrashedError(
          "The analysis worker ran out of memory.",
          true,
        );
      },
    });
    await session.warm("/repo/src/a.ts");
    expect(notifier.error).toHaveBeenCalledOnce();
    expect(notifier.error.mock.calls[0]?.[0]).toContain("ran out of memory");
    expect(indexing.set).toHaveBeenLastCalledWith(false);
  });
});
```

- [ ] **Step 5: Run the session tests and watch them fail**

Run: `pnpm --filter code-spider-vscode test session`
Expected: FAIL to import `../src/session.js`.

- [ ] **Step 6: Implement the session**

Create `packages/extension/src/session.ts`:

```ts
import { basename } from "node:path";
import type { ChangeTracker } from "./changes.js";
import { positionToOffset } from "./positions.js";
import type {
  AnalysisPort,
  IndexingIndicator,
  Notifier,
  PanelPort,
} from "./ports.js";
import type { FocusResult } from "./worker/protocol.js";
import { WorkerCrashedError } from "./worker/worker-client.js";

export type FocusRequest = {
  /** Absolute path of the document. */
  file: string;
  /** The document text, as VS Code holds it. */
  text: string;
  /** Zero-based cursor line. */
  line: number;
  /** Zero-based cursor character. */
  character: number;
  isDirty: boolean;
};

/** What the panel currently shows; click-to-jump resolves ids against it. */
export type CurrentGraph = FocusResult;

export type SessionDeps = {
  worker: AnalysisPort;
  panel: PanelPort;
  notifier: Notifier;
  indexing: IndexingIndicator;
  changes: ChangeTracker;
  maxHeapMb: () => number;
};

export class GraphSession {
  private graph: CurrentGraph | undefined;
  private latest = 0;
  private outstanding = 0;

  constructor(private readonly deps: SessionDeps) {}

  currentGraph(): CurrentGraph | undefined {
    return this.graph;
  }

  async showGraph(request: FocusRequest): Promise<void> {
    const { worker, panel, notifier, changes } = this.deps;
    if (request.isDirty) {
      notifier.warn(
        `Save ${basename(request.file)} first. Code Spider reads files from disk, so an unsaved edit would be analysed at the wrong position.`,
      );
      return;
    }

    panel.show();
    const token = ++this.latest;
    this.outstanding += 1;
    panel.post({ type: "busy", busy: true });
    try {
      const offset = positionToOffset(
        request.text,
        request.line,
        request.character,
      );
      const result = await worker.focus(request.file, offset, changes.drain());
      if (token !== this.latest) return;
      this.graph = result;
      panel.post({ type: "slice", slice: result.slice });
    } catch (error) {
      if (token !== this.latest) return;
      const message = this.describeFailure(error);
      panel.post({ type: "analysisError", message });
      if (error instanceof WorkerCrashedError) notifier.error(message);
    } finally {
      this.outstanding -= 1;
      if (this.outstanding === 0) panel.post({ type: "busy", busy: false });
    }
  }

  /** Loads and warms the project so the first focus is fast (perf note). */
  async warm(file: string): Promise<void> {
    const { worker, notifier, changes } = this.deps;
    this.setIndexing(true);
    try {
      await worker.warm(file, changes.drain());
    } catch (error) {
      if (error instanceof WorkerCrashedError) {
        notifier.error(this.describeFailure(error));
      }
    } finally {
      this.setIndexing(false);
    }
  }

  private setIndexing(active: boolean): void {
    this.deps.indexing.set(active);
    this.deps.panel.post({ type: "indexing", indexing: active });
  }

  private describeFailure(error: unknown): string {
    if (error instanceof WorkerCrashedError) {
      return error.outOfMemory
        ? `Code Spider ran out of memory analysing this project (limit ${this.deps.maxHeapMb()} MB). Raise "codeSpider.worker.maxHeapMb" in settings and try again.`
        : `${error.message}. The next request starts a fresh worker.`;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
```

Run: `pnpm --filter code-spider-vscode test session`
Expected: 1 file, 11 tests, all pass.

- [ ] **Step 7: Add the VS Code glue and wire activation**

Create `packages/extension/src/vscode/notifier.ts`:

```ts
import * as vscode from "vscode";
import type { Notifier } from "../ports.js";

export const notifier: Notifier = {
  warn: (message) => {
    void vscode.window.showWarningMessage(message);
  },
  error: (message) => {
    void vscode.window.showErrorMessage(message);
  },
};
```

Create `packages/extension/src/vscode/settings.ts`:

```ts
import * as vscode from "vscode";
import { SETTING_MAX_HEAP_MB } from "../ids.js";
import { normaliseHeapMb } from "../settings-values.js";

export function getMaxHeapMb(): number {
  return normaliseHeapMb(
    vscode.workspace.getConfiguration().get(SETTING_MAX_HEAP_MB),
  );
}
```

Create `packages/extension/src/vscode/status-bar.ts`:

```ts
import * as vscode from "vscode";
import type { IndexingIndicator } from "../ports.js";

export class IndexingStatusBar implements IndexingIndicator, vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0,
  );

  constructor() {
    this.item.text = "$(sync~spin) Code Spider: indexing";
    this.item.tooltip =
      "Code Spider is loading the project so the first graph appears quickly.";
  }

  set(active: boolean): void {
    if (active) this.item.show();
    else this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
```

Create `packages/extension/src/vscode/focus-request.ts`:

```ts
import * as vscode from "vscode";
import { isAnalysableLanguage } from "../changes.js";
import type { FocusRequest } from "../session.js";

const NOT_SUPPORTED =
  "Code Spider works on TypeScript and JavaScript files. Open one and place the cursor in a function.";

/**
 * The document and position for a Show Graph invocation. Keybinding and
 * palette pass nothing, the context menu passes the document, and a CodeLens
 * passes the document and the declaration's position.
 */
export async function resolveFocusRequest(
  uri?: vscode.Uri,
  position?: vscode.Position,
): Promise<FocusRequest | undefined> {
  const editor = vscode.window.activeTextEditor;
  const document = uri
    ? await vscode.workspace.openTextDocument(uri)
    : editor?.document;
  if (
    !document ||
    document.uri.scheme !== "file" ||
    !isAnalysableLanguage(document.languageId)
  ) {
    void vscode.window.showInformationMessage(NOT_SUPPORTED);
    return undefined;
  }

  const at =
    position instanceof vscode.Position
      ? position
      : editor?.document === document
        ? editor.selection.active
        : new vscode.Position(0, 0);
  return {
    file: document.uri.fsPath,
    text: document.getText(),
    line: at.line,
    character: at.character,
    isDirty: document.isDirty,
  };
}
```

Replace `packages/extension/src/extension.ts` with:

```ts
import { join } from "node:path";
import * as vscode from "vscode";
import { ChangeTracker } from "./changes.js";
import { COMMAND_SHOW_GRAPH, SETTING_MAX_HEAP_MB } from "./ids.js";
import { GraphPanel } from "./panel/graph-panel.js";
import { GraphSession, type CurrentGraph } from "./session.js";
import { WarmOnce } from "./warm-once.js";
import { resolveFocusRequest } from "./vscode/focus-request.js";
import { notifier } from "./vscode/notifier.js";
import { getMaxHeapMb } from "./vscode/settings.js";
import { IndexingStatusBar } from "./vscode/status-bar.js";
import { spawnAnalysisWorker } from "./worker/spawn.js";
import { WorkerClient } from "./worker/worker-client.js";

/** What `activate` returns, so the smoke tests can inspect the extension. */
export type ExtensionApi = {
  currentGraph(): CurrentGraph | undefined;
};

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const workerPath = join(context.extensionPath, "dist", "worker.cjs");
  const worker = new WorkerClient(() =>
    spawnAnalysisWorker(workerPath, getMaxHeapMb()),
  );
  const panel = new GraphPanel(context.extensionUri);
  const statusBar = new IndexingStatusBar();
  const changes = new ChangeTracker();
  const session = new GraphSession({
    worker,
    panel,
    notifier,
    indexing: statusBar,
    changes,
    maxHeapMb: getMaxHeapMb,
  });

  context.subscriptions.push(
    { dispose: () => worker.dispose() },
    panel,
    statusBar,
    vscode.commands.registerCommand(
      COMMAND_SHOW_GRAPH,
      async (uri?: vscode.Uri, position?: vscode.Position) => {
        const request = await resolveFocusRequest(uri, position);
        if (request) await session.showGraph(request);
      },
    ),
    vscode.workspace.onDidSaveTextDocument((document) =>
      changes.markSaved(document.languageId, document.uri.fsPath),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SETTING_MAX_HEAP_MB)) worker.recycle();
    }),
  );

  const warmOnce = new WarmOnce((file) => void session.warm(file));
  warmOnce.offer(vscode.window.activeTextEditor?.document);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) =>
      warmOnce.offer(editor?.document),
    ),
  );

  return { currentGraph: () => session.currentGraph() };
}

export function deactivate(): void {}
```

Run: `pnpm --filter code-spider-vscode typecheck`
Expected: no output, exit code 0.

Run: `pnpm --filter code-spider-vscode build`
Expected: both bundles build.

- [ ] **Step 8: Write the failing webview test for the spinner delay**

Create `packages/webview/test/delayed-flag.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelayedFlag } from "../src/delayed-flag.js";

describe("DelayedFlag", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const changes: boolean[] = [];
    const flag = new DelayedFlag(500, (shown) => changes.push(shown));
    return { changes, flag };
  }

  it("stays hidden for work shorter than the delay", () => {
    const { changes, flag } = setup();
    flag.set(true);
    vi.advanceTimersByTime(499);
    flag.set(false);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([]);
  });

  it("shows after the delay and hides immediately", () => {
    const { changes, flag } = setup();
    flag.set(true);
    vi.advanceTimersByTime(500);
    expect(changes).toEqual([true]);
    flag.set(false);
    expect(changes).toEqual([true, false]);
  });

  it("does not restart the delay when set(true) repeats", () => {
    const { changes, flag } = setup();
    flag.set(true);
    vi.advanceTimersByTime(300);
    flag.set(true);
    vi.advanceTimersByTime(200);
    expect(changes).toEqual([true]);
  });

  it("does not report a change for set(false) while hidden", () => {
    const { changes, flag } = setup();
    flag.set(false);
    expect(changes).toEqual([]);
  });

  it("dispose cancels a pending show", () => {
    const { changes, flag } = setup();
    flag.set(true);
    flag.dispose();
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([]);
  });
});
```

- [ ] **Step 9: Run it and watch it fail, then implement the delay and the UI states**

Run: `pnpm --filter @code-spider/webview test delayed-flag`
Expected: FAIL to import `../src/delayed-flag.js`.

Create `packages/webview/src/delayed-flag.ts`:

```ts
/**
 * Reports `true` only after the input has stayed on for `delayMs`, and `false`
 * as soon as it turns off, so quick work never flashes a spinner.
 */
export class DelayedFlag {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private shown = false;

  constructor(
    private readonly delayMs: number,
    private readonly onChange: (shown: boolean) => void,
  ) {}

  set(active: boolean): void {
    if (active) {
      if (this.shown || this.timer !== undefined) return;
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.shown = true;
        this.onChange(true);
      }, this.delayMs);
      return;
    }
    this.cancel();
    if (this.shown) {
      this.shown = false;
      this.onChange(false);
    }
  }

  dispose(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
```

Run: `pnpm --filter @code-spider/webview test`
Expected: 3 files, 12 tests, all pass.

Create `packages/webview/src/use-delayed-flag.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import { DelayedFlag } from "./delayed-flag.js";

export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  const flag = useRef<DelayedFlag | undefined>(undefined);

  useEffect(() => {
    const created = new DelayedFlag(delayMs, setShown);
    flag.current = created;
    return () => created.dispose();
  }, [delayMs]);

  useEffect(() => {
    flag.current?.set(active);
  }, [active]);

  return shown;
}
```

Replace `packages/webview/src/App.tsx` with:

```tsx
import { useEffect, useReducer } from "react";
import { initialState, reduceMessage } from "./app-state.js";
import { isExtensionMessage } from "./messages.js";
import { useDelayedFlag } from "./use-delayed-flag.js";
import { postToExtension } from "./vscode-api.js";

/** Work shorter than this never shows a spinner (perf note). */
export const SPINNER_DELAY_MS = 500;

export function App() {
  const [state, dispatch] = useReducer(reduceMessage, initialState);
  const spinner = useDelayedFlag(state.busy, SPINNER_DELAY_MS);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isExtensionMessage(event.data)) dispatch(event.data);
    };
    window.addEventListener("message", onMessage);
    postToExtension({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="app">
      {state.indexing ? (
        <div className="banner" role="status">
          Indexing the project so the first graph appears quickly...
        </div>
      ) : null}
      {state.error ? (
        <div className="banner banner-error" role="alert">
          {state.error}
        </div>
      ) : null}
      {spinner ? (
        <div className="spinner" role="status" aria-label="Analysing" />
      ) : null}
      <section className="content">
        {state.slice ? (
          <p className="status">
            Graph for {state.slice.focusId}: {state.slice.nodes.length} nodes,{" "}
            {state.slice.edges.length} edges.
          </p>
        ) : (
          <p className="status">
            Place the cursor in a function and run Code Spider: Show Graph.
          </p>
        )}
      </section>
    </main>
  );
}
```

Replace `packages/webview/src/styles.css` with:

```css
html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.content {
  flex: 1;
  min-height: 0;
  position: relative;
}

.status {
  margin: 0;
  padding: 16px;
}

.banner {
  background: var(--vscode-editorWidget-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  padding: 6px 12px;
}

.banner-error {
  border-bottom-color: var(--vscode-errorForeground);
  color: var(--vscode-errorForeground);
}

.spinner {
  animation: spin 0.8s linear infinite;
  border: 2px solid var(--vscode-progressBar-background);
  border-radius: 50%;
  border-right-color: transparent;
  height: 18px;
  position: absolute;
  right: 12px;
  top: 12px;
  width: 18px;
  z-index: 10;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

Run: `pnpm --filter @code-spider/webview typecheck`
Expected: no output, exit code 0.

Run: `pnpm --filter @code-spider/webview build`
Expected: esbuild prints `dist/index.js` and `dist/index.css`.

- [ ] **Step 10: Full verification**

Run: `pnpm -r typecheck`
Expected: every package exits 0.

Run: `pnpm -r test`
Expected: all green: core 231, CLI 43, webview 12, extension 68.

Run: `pnpm build`
Expected: webview, then extension, with no warning messages.

- [ ] **Step 11: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: modified `packages/extension/package.json`,
`packages/extension/src/extension.ts`, `packages/extension/src/ids.ts`,
`packages/extension/test/manifest.test.ts`,
`packages/extension/test/support/manifest.ts`, `packages/webview/src/App.tsx`,
`packages/webview/src/styles.css`; new files under `packages/extension/src`
(`positions.ts`, `changes.ts`, `settings-values.ts`, `warm-once.ts`, `ports.ts`,
`session.ts`, `vscode/`), the new extension tests,
`packages/webview/src/delayed-flag.ts`,
`packages/webview/src/use-delayed-flag.ts` and
`packages/webview/test/delayed-flag.test.ts`.

Run: `git diff --check -- packages/extension packages/webview`
Expected: no output.

Run: `git diff -- packages/extension packages/webview`
Expected: only the changes described in this task.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/extension packages/webview); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `feat(extension): wire the show graph command through the worker`

The implementer does not stage or commit; the user does.

### Task 5: Graph model (slice to flow, analytic sizing, edge styles, ELK layout)

This task is pure logic. Nothing renders yet; Task 6 adds the React components.

**Files:**
- Create: `packages/webview/src/graph/constants.ts`
- Create: `packages/webview/src/graph/node-size.ts`
- Create: `packages/webview/src/graph/edge-appearance.ts`
- Create: `packages/webview/src/graph/to-flow.ts`
- Create: `packages/webview/src/graph/layout.ts`
- Modify: `packages/webview/package.json` (add `@xyflow/react`, `elkjs`)
- Modify: `pnpm-lock.yaml` (written by `pnpm install`)
- Test: `packages/webview/test/support/slices.ts`
- Test: `packages/webview/test/node-size.test.ts`
- Test: `packages/webview/test/edge-appearance.test.ts`
- Test: `packages/webview/test/to-flow.test.ts`
- Test: `packages/webview/test/layout.test.ts`

**Interfaces:**
- Consumes: `GraphSlice`, `GraphNode`, `GraphEdge`, `EdgeType` types from
  `@code-spider/core` (type-only in `src/`; the guard test also imports the
  runtime constant `CODE_PREVIEW_MAX_LINES`). Slice facts the code relies on:
  `external` and `unknown` nodes have `file: ""`, `lineCount: 0` and
  `codePreview: ""`; `module` nodes have `codePreview: ""` too; every edge's
  `from`/`to` is a node id in the same slice; `supplies` can be `""`.
- Produces `src/graph/constants.ts`: `NODE_WIDTH = 320`, `HEADER_HEIGHT = 28`,
  `LINE_HEIGHT = 16`, `CODE_PADDING_Y = 4`, `MIN_CODE_LINES = 3`,
  `MAX_CODE_LINES = 25`, `MAX_EDGE_LABEL_CHARS = 40`.
- Produces `src/graph/node-size.ts`: `codeLines(lineCount): number`,
  `hasCodeRegion(node: Pick<GraphNode, "codePreview">): boolean`,
  `codeRegionHeight(node): number`, `nodeHeight(node): number`.
  Rule (spec §7.6): `height = HEADER_HEIGHT + clamp(lineCount, 3, 25) *
  LINE_HEIGHT + 2 * CODE_PADDING_Y` for a node with a code preview; a node
  with no preview (`external`, `unknown`, `module`) is a chip and is just
  `HEADER_HEIGHT` tall. Never measured from the DOM.
- Produces `src/graph/edge-appearance.ts`: `EdgeAppearance = { className:
  string; strokeDasharray: string | undefined; strokeWidth: number }`,
  `edgeAppearance(kind: EdgeType, resolved: boolean): EdgeAppearance`,
  `DASHED = "6 4"`, `DOTTED = "1 5"`. `resolved: false` always wins and is
  dashed; `passes` is dotted; `jsx` is solid and thicker; `call` and `external`
  are solid. Class names: `edge-call`, `edge-jsx`, `edge-passes`,
  `edge-external`, plus `edge-unresolved` when unresolved.
- Produces `src/graph/to-flow.ts`:

  ```ts
  export type SpiderNodeData = { node: GraphNode; isFocus: boolean };
  export type SpiderFlowNode = Node<SpiderNodeData, "spider">;
  export type SpiderEdgeData = { fullLabel: string };
  export type SpiderFlowEdge = Edge<SpiderEdgeData>;
  export function truncateLabel(text: string, max?: number): string;
  export function toFlow(slice: GraphSlice): {
    nodes: SpiderFlowNode[];
    edges: SpiderFlowEdge[];
  };
  ```

  Nodes get `type: "spider"`, `width: NODE_WIDTH`, `height: nodeHeight(node)`
  and `position: { x: 0, y: 0 }` (the layout fills positions in). Edges get
  `source = from` (supplier), `target = to` (consumer), `type: "smoothstep"`,
  `label` = truncated `supplies` (omitted when empty), the appearance's
  `className` and `style`, and `data.fullLabel`. Edges whose endpoints are not
  in the slice are dropped.
- Produces `src/graph/layout.ts`: `buildElkGraph(nodes, edges): ElkNode`,
  `layoutPositions(nodes, edges): Promise<Positions>` with `Positions =
  Map<string, { x: number; y: number }>`. ELK layered, direction RIGHT, using
  the bundled build `elkjs/lib/elk.bundled.js` (no web worker; it also runs
  under the webview's CSP, which forbids string-to-code evaluation).

- [ ] **Step 1: Add the dependencies**

Edit `packages/webview/package.json` — replace:

```
  "dependencies": {
    "react": "^19.3.0",
```

with:

```
  "dependencies": {
    "@xyflow/react": "^12.12.0",
    "elkjs": "^0.12.0",
    "react": "^19.3.0",
```

Run: `pnpm install`
Expected: completes; the lockfile gains `@xyflow/react` and `elkjs`.

- [ ] **Step 2: Write the failing tests for sizing and edge appearance**

Create `packages/webview/test/support/slices.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphEdge, GraphNode, GraphSlice } from "@code-spider/core";

const here = dirname(fileURLToPath(import.meta.url));

/** A real slice produced by the analyser, checked in under core's tests. */
export function readGolden(name: string): GraphSlice {
  const path = join(here, "../../../core/test/__goldens__", name);
  return JSON.parse(readFileSync(path, "utf8")) as GraphSlice;
}

export function makeNode(
  overrides: Partial<GraphNode> & { id: string },
): GraphNode {
  return {
    kind: "function",
    name: overrides.id.split("#")[1] ?? overrides.id,
    file: "src/a.ts",
    range: { startLine: 1, startColumn: 1, endLine: 3, endColumn: 2 },
    inputType: "",
    returnType: "",
    isAsync: false,
    lineCount: 3,
    codePreview: "function f() {}",
    ...overrides,
  };
}

export function makeEdge(
  from: string,
  to: string,
  overrides: Partial<GraphEdge> = {},
): GraphEdge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    kind: "call",
    supplies: "",
    callSite: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 9 },
    resolved: true,
    ...overrides,
  };
}

export function makeSlice(
  focusId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphSlice {
  return { focusId, nodes, edges, truncated: false };
}
```

Create `packages/webview/test/node-size.test.ts`:

```ts
import { CODE_PREVIEW_MAX_LINES } from "@code-spider/core";
import { describe, expect, it } from "vitest";
import {
  CODE_PADDING_Y,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  MAX_CODE_LINES,
  MIN_CODE_LINES,
} from "../src/graph/constants.js";
import {
  codeLines,
  codeRegionHeight,
  hasCodeRegion,
  nodeHeight,
} from "../src/graph/node-size.js";

const withCode = (lineCount: number) => ({ lineCount, codePreview: "x" });
const chip = { lineCount: 0, codePreview: "" };

describe("constants", () => {
  it("keeps the 25-line cap in step with the analyser", () => {
    expect(MAX_CODE_LINES).toBe(CODE_PREVIEW_MAX_LINES);
  });
});

describe("codeLines", () => {
  it("clamps to between 3 and 25 lines", () => {
    expect(codeLines(1)).toBe(MIN_CODE_LINES);
    expect(codeLines(3)).toBe(3);
    expect(codeLines(10)).toBe(10);
    expect(codeLines(25)).toBe(25);
    expect(codeLines(400)).toBe(MAX_CODE_LINES);
  });
});

describe("nodeHeight", () => {
  it("is header + clamped lines x line height + vertical padding", () => {
    expect(nodeHeight(withCode(10))).toBe(
      HEADER_HEIGHT + 10 * LINE_HEIGHT + 2 * CODE_PADDING_Y,
    );
  });

  it("gives a one-line function the three-line minimum", () => {
    expect(nodeHeight(withCode(1))).toBe(
      HEADER_HEIGHT + 3 * LINE_HEIGHT + 2 * CODE_PADDING_Y,
    );
  });

  it("stops growing at 25 lines", () => {
    expect(nodeHeight(withCode(500))).toBe(nodeHeight(withCode(25)));
  });

  it("makes a node with no preview a header-only chip", () => {
    expect(hasCodeRegion(chip)).toBe(false);
    expect(codeRegionHeight(chip)).toBe(0);
    expect(nodeHeight(chip)).toBe(HEADER_HEIGHT);
  });

  it("is a pure function of the node: a taller function is a taller box", () => {
    expect(nodeHeight(withCode(20))).toBeGreaterThan(nodeHeight(withCode(5)));
  });
});
```

Create `packages/webview/test/edge-appearance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DASHED,
  DOTTED,
  edgeAppearance,
} from "../src/graph/edge-appearance.js";

describe("edgeAppearance", () => {
  it("draws calls solid", () => {
    expect(edgeAppearance("call", true)).toEqual({
      className: "edge-call",
      strokeDasharray: undefined,
      strokeWidth: 1.5,
    });
  });

  it("draws JSX edges solid but distinct", () => {
    const jsx = edgeAppearance("jsx", true);
    expect(jsx.className).toBe("edge-jsx");
    expect(jsx.strokeDasharray).toBeUndefined();
    expect(jsx.strokeWidth).toBeGreaterThan(
      edgeAppearance("call", true).strokeWidth,
    );
  });

  it("draws passes edges dotted, since dashed already means unresolved", () => {
    expect(edgeAppearance("passes", true)).toMatchObject({
      className: "edge-passes",
      strokeDasharray: DOTTED,
    });
    expect(DOTTED).not.toBe(DASHED);
  });

  it("draws external edges solid with their own class", () => {
    expect(edgeAppearance("external", true)).toMatchObject({
      className: "edge-external",
      strokeDasharray: undefined,
    });
  });

  it("draws every unresolved edge dashed, whatever its kind", () => {
    for (const kind of ["call", "jsx", "passes", "external"] as const) {
      const appearance = edgeAppearance(kind, false);
      expect(appearance.strokeDasharray).toBe(DASHED);
      expect(appearance.className).toBe(`edge-${kind} edge-unresolved`);
    }
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `pnpm --filter @code-spider/webview test node-size edge-appearance`
Expected: FAIL to import `../src/graph/constants.js` and
`../src/graph/edge-appearance.js`.

- [ ] **Step 4: Implement constants, sizing and edge appearance**

Create `packages/webview/src/graph/constants.ts`:

```ts
export const NODE_WIDTH = 320;
export const HEADER_HEIGHT = 28;
export const LINE_HEIGHT = 16;
export const CODE_PADDING_Y = 4;
export const MIN_CODE_LINES = 3;
/** Equal to CODE_PREVIEW_MAX_LINES in @code-spider/core; a test keeps them in step. */
export const MAX_CODE_LINES = 25;
export const MAX_EDGE_LABEL_CHARS = 40;
```

Create `packages/webview/src/graph/node-size.ts`:

```ts
import type { GraphNode } from "@code-spider/core";
import {
  CODE_PADDING_Y,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  MAX_CODE_LINES,
  MIN_CODE_LINES,
} from "./constants.js";

type Sized = Pick<GraphNode, "lineCount" | "codePreview">;

export function codeLines(lineCount: number): number {
  return Math.min(MAX_CODE_LINES, Math.max(MIN_CODE_LINES, lineCount));
}

/** Chips (external, unknown, module) carry no source, so they have no code region. */
export function hasCodeRegion(node: Pick<GraphNode, "codePreview">): boolean {
  return node.codePreview !== "";
}

export function codeRegionHeight(node: Sized): number {
  if (!hasCodeRegion(node)) return 0;
  return codeLines(node.lineCount) * LINE_HEIGHT + 2 * CODE_PADDING_Y;
}

/** Pure arithmetic, available before ELK runs; never measured from the DOM. */
export function nodeHeight(node: Sized): number {
  return HEADER_HEIGHT + codeRegionHeight(node);
}
```

Create `packages/webview/src/graph/edge-appearance.ts`:

```ts
import type { EdgeType } from "@code-spider/core";

export type EdgeAppearance = {
  className: string;
  strokeDasharray: string | undefined;
  strokeWidth: number;
};

export const DASHED = "6 4";
export const DOTTED = "1 5";

/**
 * Dashed means "could not be resolved" and always wins; passes edges are
 * dotted so the two never look alike. Colour comes from the class in CSS.
 */
export function edgeAppearance(
  kind: EdgeType,
  resolved: boolean,
): EdgeAppearance {
  const className = resolved ? `edge-${kind}` : `edge-${kind} edge-unresolved`;
  if (!resolved) {
    return { className, strokeDasharray: DASHED, strokeWidth: 1.5 };
  }
  switch (kind) {
    case "passes":
      return { className, strokeDasharray: DOTTED, strokeWidth: 1.5 };
    case "jsx":
      return { className, strokeDasharray: undefined, strokeWidth: 2.5 };
    case "call":
    case "external":
      return { className, strokeDasharray: undefined, strokeWidth: 1.5 };
  }
}
```

Run: `pnpm --filter @code-spider/webview test node-size edge-appearance`
Expected: 2 files, 12 tests, all pass.

- [ ] **Step 5: Write the failing tests for the slice mapping**

Create `packages/webview/test/to-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NODE_WIDTH } from "../src/graph/constants.js";
import { nodeHeight } from "../src/graph/node-size.js";
import { toFlow, truncateLabel } from "../src/graph/to-flow.js";
import { makeEdge, makeNode, makeSlice, readGolden } from "./support/slices.js";

describe("toFlow with a real call-chain slice", () => {
  const slice = readGolden("basic-handleSignup.json");
  const { nodes, edges } = toFlow(slice);

  it("maps every node with uniform width and analytic height", () => {
    expect(nodes).toHaveLength(slice.nodes.length);
    for (const flowNode of nodes) {
      expect(flowNode.type).toBe("spider");
      expect(flowNode.width).toBe(NODE_WIDTH);
      expect(flowNode.height).toBe(nodeHeight(flowNode.data.node));
      expect(flowNode.position).toEqual({ x: 0, y: 0 });
    }
    const handleSignup = nodes.find(
      (flowNode) => flowNode.id === "src/signup.ts#handleSignup",
    );
    expect(handleSignup?.height).toBe(28 + 6 * 16 + 8);
  });

  it("flags only the focus node", () => {
    const focused = nodes.filter((flowNode) => flowNode.data.isFocus);
    expect(focused.map((flowNode) => flowNode.id)).toEqual([
      "src/signup.ts#handleSignup",
    ]);
  });

  it("points edges from supplier to consumer and labels them with supplies", () => {
    expect(edges).toHaveLength(slice.edges.length);
    const edge = edges.find(
      (candidate) =>
        candidate.id ===
        "src/signup.ts#validateUser->src/signup.ts#handleSignup",
    );
    expect(edge).toMatchObject({
      source: "src/signup.ts#validateUser",
      target: "src/signup.ts#handleSignup",
      type: "smoothstep",
      label: "ValidUserData",
      className: "edge-call",
      data: { fullLabel: "ValidUserData" },
    });
  });
});

describe("toFlow with a JSX slice", () => {
  it("styles the JSX edge distinctly and labels it with the props type", () => {
    const { edges } = toFlow(readGolden("jsx-Page.json"));
    expect(edges).toHaveLength(1);
    expect(edges[0]?.className).toBe("edge-jsx");
    expect(edges[0]?.label).toBe("SignupFormProps");
    expect(edges[0]?.style?.strokeWidth).toBe(2.5);
  });
});

describe("toFlow with every node and edge kind", () => {
  const focus = makeNode({
    id: "src/a.ts#focus",
    kind: "component",
    lineCount: 12,
  });
  const external = makeNode({
    id: "external:tiny-lib#persist",
    kind: "external",
    file: "",
    lineCount: 0,
    codePreview: "",
  });
  const unknown = makeNode({
    id: "unknown:src/a.ts#focus#props.onPick()",
    kind: "unknown",
    file: "",
    lineCount: 0,
    codePreview: "",
  });
  const module = makeNode({
    id: "src/main.tsx#<module>",
    kind: "module",
    name: "main.tsx",
    lineCount: 40,
    codePreview: "",
  });
  const slice = makeSlice(
    focus.id,
    [focus, external, unknown, module],
    [
      makeEdge(external.id, focus.id, {
        kind: "external",
        supplies: "Promise<void>",
      }),
      makeEdge(unknown.id, focus.id, { resolved: false }),
      makeEdge(focus.id, module.id, { kind: "passes", supplies: "() => void" }),
      makeEdge(focus.id, "src/missing.ts#gone"),
    ],
  );
  const { nodes, edges } = toFlow(slice);

  it("sizes chips as header-only boxes and functions by their lines", () => {
    const heights = Object.fromEntries(
      nodes.map((flowNode) => [flowNode.data.node.kind, flowNode.height]),
    );
    expect(heights.external).toBe(28);
    expect(heights.unknown).toBe(28);
    expect(heights.module).toBe(28);
    expect(heights.component).toBe(28 + 12 * 16 + 8);
  });

  it("applies the passes, unresolved and external appearances", () => {
    const dash = (className: string) =>
      edges.find((edge) => edge.className === className)?.style
        ?.strokeDasharray;
    expect(edges.map((edge) => edge.className).sort()).toEqual([
      "edge-call edge-unresolved",
      "edge-external",
      "edge-passes",
    ]);
    expect(dash("edge-passes")).toBe("1 5");
    expect(dash("edge-call edge-unresolved")).toBe("6 4");
    expect(dash("edge-external")).toBeUndefined();
  });

  it("omits the label of an edge with nothing to supply", () => {
    const unresolved = edges.find((edge) => edge.source === unknown.id);
    expect(unresolved?.label).toBeUndefined();
  });

  it("drops edges whose endpoint is not in the slice", () => {
    expect(edges.some((edge) => edge.target === "src/missing.ts#gone")).toBe(
      false,
    );
    expect(edges).toHaveLength(3);
  });
});

describe("truncateLabel", () => {
  it("leaves short labels alone", () => {
    expect(truncateLabel("User")).toBe("User");
  });

  it("cuts long labels to the limit with an ellipsis and keeps the full text in data", () => {
    const long = "A".repeat(100);
    expect(truncateLabel(long)).toHaveLength(40);
    expect(truncateLabel(long).endsWith("…")).toBe(true);
    const slice = makeSlice(
      "a#a",
      [makeNode({ id: "a#a" }), makeNode({ id: "a#b" })],
      [makeEdge("a#b", "a#a", { supplies: long })],
    );
    const edge = toFlow(slice).edges[0];
    expect(edge?.label).toHaveLength(40);
    expect(edge?.data?.fullLabel).toBe(long);
  });
});
```

Create `packages/webview/test/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildElkGraph, layoutPositions } from "../src/graph/layout.js";
import { toFlow } from "../src/graph/to-flow.js";
import { makeEdge, makeNode, makeSlice, readGolden } from "./support/slices.js";

describe("buildElkGraph", () => {
  it("asks ELK for a left-to-right layered layout of the sized nodes", () => {
    const { nodes, edges } = toFlow(readGolden("basic-handleSignup.json"));
    const graph = buildElkGraph(nodes, edges);
    expect(graph.layoutOptions).toMatchObject({
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
    });
    expect(graph.children).toHaveLength(nodes.length);
    expect(graph.children?.[0]).toMatchObject({
      id: nodes[0]?.id,
      width: 320,
      height: nodes[0]?.height,
    });
    expect(graph.edges).toHaveLength(edges.length);
    expect(graph.edges?.[0]).toMatchObject({
      id: edges[0]?.id,
      sources: [edges[0]?.source],
      targets: [edges[0]?.target],
    });
  });
});

describe("layoutPositions", () => {
  it("puts suppliers to the left of their consumers along a chain", async () => {
    const slice = makeSlice(
      "a#b",
      [
        makeNode({ id: "a#a" }),
        makeNode({ id: "a#b" }),
        makeNode({ id: "a#c" }),
      ],
      [makeEdge("a#a", "a#b"), makeEdge("a#b", "a#c")],
    );
    const { nodes, edges } = toFlow(slice);
    const positions = await layoutPositions(nodes, edges);
    const x = (id: string) => positions.get(id)?.x ?? Number.NaN;
    expect(x("a#a")).toBeLessThan(x("a#b"));
    expect(x("a#b")).toBeLessThan(x("a#c"));
  });

  it("stacks several suppliers in one column without overlap", async () => {
    const suppliers = ["a#s1", "a#s2", "a#s3"].map((id) =>
      makeNode({ id, lineCount: 8 }),
    );
    const consumer = makeNode({ id: "a#c" });
    const slice = makeSlice(
      consumer.id,
      [...suppliers, consumer],
      suppliers.map((supplier) => makeEdge(supplier.id, consumer.id)),
    );
    const { nodes, edges } = toFlow(slice);
    const positions = await layoutPositions(nodes, edges);

    const column = suppliers.map((supplier) => positions.get(supplier.id));
    expect(new Set(column.map((position) => position?.x)).size).toBe(1);
    expect(positions.get(consumer.id)?.x).toBeGreaterThan(column[0]?.x ?? 0);

    const height = nodes[0]?.height ?? 0;
    const tops = column
      .map((position) => position?.y ?? 0)
      .sort((a, b) => a - b);
    expect((tops[1] ?? 0) - (tops[0] ?? 0)).toBeGreaterThanOrEqual(height);
    expect((tops[2] ?? 0) - (tops[1] ?? 0)).toBeGreaterThanOrEqual(height);
  });

  it("returns a position for every node and is deterministic", async () => {
    const { nodes, edges } = toFlow(readGolden("basic-handleSignup.json"));
    const first = await layoutPositions(nodes, edges);
    const second = await layoutPositions(nodes, edges);
    expect([...first.keys()].sort()).toEqual(nodes.map((n) => n.id).sort());
    expect([...second.entries()]).toEqual([...first.entries()]);
  });

  it("lays out a lone node and an edgeless graph", async () => {
    const slice = makeSlice("a#a", [makeNode({ id: "a#a" })], []);
    const { nodes, edges } = toFlow(slice);
    const positions = await layoutPositions(nodes, edges);
    expect(positions.get("a#a")).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `pnpm --filter @code-spider/webview test to-flow layout`
Expected: FAIL to import `../src/graph/to-flow.js` and `../src/graph/layout.js`.

- [ ] **Step 7: Implement the mapping and the layout**

Create `packages/webview/src/graph/to-flow.ts`:

```ts
import type { GraphNode, GraphSlice } from "@code-spider/core";
import type { Edge, Node } from "@xyflow/react";
import { MAX_EDGE_LABEL_CHARS, NODE_WIDTH } from "./constants.js";
import { edgeAppearance } from "./edge-appearance.js";
import { nodeHeight } from "./node-size.js";

export type SpiderNodeData = { node: GraphNode; isFocus: boolean };
export type SpiderFlowNode = Node<SpiderNodeData, "spider">;
export type SpiderEdgeData = { fullLabel: string };
export type SpiderFlowEdge = Edge<SpiderEdgeData>;

export function truncateLabel(
  text: string,
  max: number = MAX_EDGE_LABEL_CHARS,
): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function toFlow(slice: GraphSlice): {
  nodes: SpiderFlowNode[];
  edges: SpiderFlowEdge[];
} {
  const ids = new Set(slice.nodes.map((node) => node.id));

  const nodes = slice.nodes.map((node): SpiderFlowNode => ({
    id: node.id,
    type: "spider",
    position: { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: nodeHeight(node),
    data: { node, isFocus: node.id === slice.focusId },
  }));

  const edges = slice.edges
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    .map((edge): SpiderFlowEdge => {
      const appearance = edgeAppearance(edge.kind, edge.resolved);
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: "smoothstep",
        label: edge.supplies === "" ? undefined : truncateLabel(edge.supplies),
        className: appearance.className,
        style: {
          strokeDasharray: appearance.strokeDasharray,
          strokeWidth: appearance.strokeWidth,
        },
        data: { fullLabel: edge.supplies },
      };
    });

  return { nodes, edges };
}
```

Create `packages/webview/src/graph/layout.ts`:

```ts
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { SpiderFlowEdge, SpiderFlowNode } from "./to-flow.js";

export type Positions = Map<string, { x: number; y: number }>;

const elk = new ELK();

export function buildElkGraph(
  nodes: readonly SpiderFlowNode[],
  edges: readonly SpiderFlowEdge[],
): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "32",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: node.width ?? 0,
      height: node.height ?? 0,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };
}

export async function layoutPositions(
  nodes: readonly SpiderFlowNode[],
  edges: readonly SpiderFlowEdge[],
): Promise<Positions> {
  const laidOut = await elk.layout(buildElkGraph(nodes, edges));
  const positions: Positions = new Map();
  for (const child of laidOut.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return positions;
}
```

Run: `pnpm --filter @code-spider/webview test to-flow layout`
Expected: 2 files, 15 tests, all pass.

Run: `pnpm --filter @code-spider/webview typecheck`
Expected: no output, exit code 0.

- [ ] **Step 8: Prove ELK runs without string-to-code evaluation**

The webview's CSP has no `'unsafe-eval'`. Node's
`--disallow-code-generation-from-strings` flag makes `eval` and `new Function`
throw, which is what the CSP does in the webview.

Run: `pnpm --filter @code-spider/webview exec node --disallow-code-generation-from-strings --input-type=module -e "import ELK from 'elkjs/lib/elk.bundled.js'; const out = await new ELK().layout({ id: 'r', children: [{ id: 'a', width: 10, height: 10 }, { id: 'b', width: 10, height: 10 }], edges: [{ id: 'e', sources: ['a'], targets: ['b'] }] }); console.log('elk ok', out.children.length)"`
Expected: `elk ok 2`. If it throws an `EvalError`, stop and report: the CSP
would need `'unsafe-eval'` and that is a decision for the user.

- [ ] **Step 9: Full verification**

Run: `pnpm -r typecheck`
Expected: every package exits 0.

Run: `pnpm -r test`
Expected: all green: core 231, CLI 43, extension 68, webview 39.

Run: `pnpm --filter @code-spider/webview build`
Expected: succeeds. The bundle does not yet import the graph modules (Task 6
does), so its size is unchanged.

- [ ] **Step 10: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: ` M packages/webview/package.json`, ` M pnpm-lock.yaml`, and new
files under `packages/webview/src/graph/` and `packages/webview/test/`.

Run: `git diff --check -- packages/webview pnpm-lock.yaml`
Expected: no output.

Run: `git diff -- packages/webview/package.json` and `git diff --stat -- pnpm-lock.yaml`
Expected: only the two new dependencies and their lockfile entries.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/webview); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `feat(webview): add slice to flow mapping, analytic node sizing and ELK layout`

The implementer does not stage or commit; the user does.

### Task 6: Graph rendering (React Flow nodes, edges, theming)

**Files:**
- Create: `packages/webview/src/graph/NodeBox.tsx`
- Create: `packages/webview/src/graph/SpiderNode.tsx`
- Create: `packages/webview/src/graph/use-layout.ts`
- Create: `packages/webview/src/graph/GraphView.tsx`
- Create: `packages/webview/src/graph/graph.css`
- Modify: `packages/webview/src/graph/layout.ts` (add `applyPositions`)
- Modify: `packages/webview/src/App.tsx` (render the graph)
- Modify: `packages/webview/src/main.tsx` (import the stylesheets)
- Test: `packages/webview/test/node-box.test.tsx`
- Test: `packages/webview/test/apply-positions.test.ts`
- Test: `packages/webview/test/layout-browser.test.ts`

**Interfaces:**
- Consumes (Task 5): `NODE_WIDTH`, `HEADER_HEIGHT`, `LINE_HEIGHT`,
  `CODE_PADDING_Y`, `MAX_CODE_LINES`; `codeRegionHeight`, `hasCodeRegion`;
  `toFlow`, `SpiderFlowNode`, `SpiderFlowEdge`, `SpiderNodeData`;
  `layoutPositions`, `Positions`; `edgeAppearance` class names `edge-call`,
  `edge-jsx`, `edge-passes`, `edge-external`, `edge-unresolved`.
- Consumes (Task 4): `App` with `state.slice: GraphSlice | undefined`, the
  `.app`, `.content`, `.status` classes in `styles.css`.
- Produces `NodeBox` (`props: { node: GraphNode; isFocus: boolean }`), a
  presentational component: header (name left, async badge, input type right,
  each truncated with ellipsis and carrying the full text in `title`) above a
  clipped code region whose height is `codeRegionHeight(node)`. Class names:
  `node-box kind-<kind>` plus `is-focus`; `node-code` plus `is-clipped` when
  `lineCount > MAX_CODE_LINES`.
- Produces `SpiderNode` (React Flow custom node, type `"spider"`),
  `useLayout(slice): { laid: Laid | undefined; error: string | undefined }`
  with `Laid = { key: number; nodes: SpiderFlowNode[]; edges: SpiderFlowEdge[] }`,
  `GraphView({ slice }: { slice: GraphSlice })`, and
  `applyPositions(nodes, positions): SpiderFlowNode[]`.
- The graph's look comes from `graph.css`, using VS Code's `--vscode-*`
  variables only, so it follows the active theme.

- [ ] **Step 1: Write the failing tests**

Create `packages/webview/test/apply-positions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPositions } from "../src/graph/layout.js";
import { toFlow } from "../src/graph/to-flow.js";
import { makeNode, makeSlice } from "./support/slices.js";

describe("applyPositions", () => {
  const { nodes } = toFlow(
    makeSlice("a#a", [makeNode({ id: "a#a" }), makeNode({ id: "a#b" })], []),
  );

  it("moves each node to its laid-out position without changing anything else", () => {
    const placed = applyPositions(
      nodes,
      new Map([
        ["a#a", { x: 12, y: 34 }],
        ["a#b", { x: 400, y: 5 }],
      ]),
    );
    expect(placed.map((node) => node.position)).toEqual([
      { x: 12, y: 34 },
      { x: 400, y: 5 },
    ]);
    expect(placed[0]?.data).toBe(nodes[0]?.data);
    expect(placed[0]?.height).toBe(nodes[0]?.height);
  });

  it("leaves a node with no position where it was and does not mutate the input", () => {
    const placed = applyPositions(nodes, new Map());
    expect(placed.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(placed).not.toBe(nodes);
  });
});
```

Create `packages/webview/test/node-box.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NodeBox } from "../src/graph/NodeBox.js";
import { codeRegionHeight } from "../src/graph/node-size.js";
import { makeNode } from "./support/slices.js";

function render(
  overrides: Parameters<typeof makeNode>[0],
  isFocus = false,
): string {
  return renderToStaticMarkup(
    <NodeBox node={makeNode(overrides)} isFocus={isFocus} />,
  );
}

describe("NodeBox", () => {
  it("shows the name on the left and the input type on the right with titles", () => {
    const html = render({
      id: "a#validate",
      name: "validate",
      inputType: "{ email: string; name: string }",
    });
    expect(html).toContain(
      '<span class="node-name" title="validate (src/a.ts)">validate</span>',
    );
    expect(html).toContain(
      '<span class="node-input" title="{ email: string; name: string }">{ email: string; name: string }</span>',
    );
    expect(html.indexOf("node-name")).toBeLessThan(html.indexOf("node-input"));
  });

  it("shows the async badge only for async functions", () => {
    expect(render({ id: "a#f", isAsync: true })).toContain("node-async");
    expect(render({ id: "a#f", isAsync: false })).not.toContain("node-async");
  });

  it("sizes the header and the code region from the shared constants", () => {
    const node = makeNode({ id: "a#f", lineCount: 10 });
    const html = renderToStaticMarkup(<NodeBox node={node} isFocus={false} />);
    expect(html).toContain('class="node-header" style="height:28px"');
    expect(html).toContain(`height:${codeRegionHeight(node)}px`);
  });

  it("renders the code text escaped", () => {
    const html = render({ id: "a#f", codePreview: "if (a < b && c) {}" });
    expect(html).toContain("if (a &lt; b &amp;&amp; c) {}");
  });

  it("clips and fades only functions longer than 25 lines", () => {
    expect(render({ id: "a#f", lineCount: 26 })).toContain(
      "node-code is-clipped",
    );
    expect(render({ id: "a#f", lineCount: 25 })).not.toContain("is-clipped");
  });

  it("renders chips without a code region and with an empty right slot", () => {
    const html = render({
      id: "external:tiny-lib#persist",
      kind: "external",
      name: "persist",
      file: "",
      inputType: "",
      lineCount: 0,
      codePreview: "",
    });
    expect(html).not.toContain("<pre");
    expect(html).toContain('<span class="node-input"></span>');
    expect(html).toContain('title="persist"');
    expect(html).toContain("kind-external");
  });

  it("marks the kind and the focus node", () => {
    expect(render({ id: "a#F", kind: "component" })).toContain(
      "node-box kind-component",
    );
    expect(render({ id: "a#F" }, true)).toContain("is-focus");
    expect(render({ id: "a#F" }, false)).not.toContain("is-focus");
  });
});
```

Create `packages/webview/test/layout-browser.test.ts`:

```ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import { expect, it, vi } from "vitest";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const entry = `
import { layoutPositions } from "./src/graph/layout.ts";
const node = (id) => ({ id, width: 100, height: 50, position: { x: 0, y: 0 }, data: {} });
layoutPositions([node("a"), node("b")], [{ id: "e", source: "a", target: "b" }]).then(
  (positions) => { globalThis.result = JSON.stringify([...positions.entries()]); },
  (error) => { globalThis.failure = String(error); },
);
`;

it("lays out in a browser-like context that forbids string evaluation", async () => {
  const bundled = await build({
    stdin: { contents: entry, resolveDir: packageDir, loader: "ts" },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
  });

  // `document` makes ELK take its in-browser path; the webview CSP has no
  // 'unsafe-eval', so string-to-code evaluation is switched off here too.
  const sandbox: Record<string, unknown> = {
    document: {},
    setTimeout,
    clearTimeout,
    console,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
  vm.runInContext(bundled.outputFiles[0]?.text ?? "", context);

  await vi.waitFor(() =>
    expect(sandbox.result ?? sandbox.failure).toBeDefined(),
  );
  expect(sandbox.failure).toBeUndefined();
  const positions = new Map<string, { x: number; y: number }>(
    JSON.parse(String(sandbox.result)),
  );
  expect(positions.get("a")?.x).toBeLessThan(positions.get("b")?.x ?? 0);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @code-spider/webview test apply-positions node-box layout-browser`
Expected: `apply-positions` and `node-box` FAIL (`applyPositions` is not exported
from `layout.js`; `../src/graph/NodeBox.js` cannot be resolved). `layout-browser`
already passes because it only uses Task 5 code; it guards the CSP.

- [ ] **Step 3: Implement `applyPositions` and `NodeBox`**

Edit `packages/webview/src/graph/layout.ts` — replace:

```
export async function layoutPositions(
```

with:

```
export function applyPositions(
  nodes: readonly SpiderFlowNode[],
  positions: Positions,
): SpiderFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));
}

export async function layoutPositions(
```

Create `packages/webview/src/graph/NodeBox.tsx`:

```tsx
import type { GraphNode } from "@code-spider/core";
import {
  CODE_PADDING_Y,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  MAX_CODE_LINES,
} from "./constants.js";
import { codeRegionHeight, hasCodeRegion } from "./node-size.js";

export type NodeBoxProps = { node: GraphNode; isFocus: boolean };

function nameTitle(node: GraphNode): string {
  return node.file === "" ? node.name : `${node.name} (${node.file})`;
}

/**
 * Pure markup for one node. Heights come from the same constants the layout
 * uses, so the box fills exactly the space ELK reserved for it.
 */
export function NodeBox({ node, isFocus }: NodeBoxProps) {
  const classes = ["node-box", `kind-${node.kind}`];
  if (isFocus) classes.push("is-focus");
  const clipped = node.lineCount > MAX_CODE_LINES;

  return (
    <div className={classes.join(" ")}>
      <div className="node-header" style={{ height: HEADER_HEIGHT }}>
        <span className="node-name" title={nameTitle(node)}>
          {node.name}
        </span>
        {node.isAsync ? <span className="node-async">async</span> : null}
        <span className="node-input" title={node.inputType || undefined}>
          {node.inputType}
        </span>
      </div>
      {hasCodeRegion(node) ? (
        <pre
          className={clipped ? "node-code is-clipped" : "node-code"}
          style={{
            height: codeRegionHeight(node),
            lineHeight: `${LINE_HEIGHT}px`,
            padding: `${CODE_PADDING_Y}px 8px`,
          }}
        >
          {node.codePreview}
        </pre>
      ) : null}
    </div>
  );
}
```

Run: `pnpm --filter @code-spider/webview test apply-positions node-box layout-browser`
Expected: 3 files, 10 tests, all pass.

- [ ] **Step 4: Add the React Flow components and the stylesheet**

Create `packages/webview/src/graph/SpiderNode.tsx`:

```tsx
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeBox } from "./NodeBox.js";
import type { SpiderFlowNode } from "./to-flow.js";

/** Suppliers sit left of consumers, so edges leave on the right and enter on the left. */
export function SpiderNode({ data }: NodeProps<SpiderFlowNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <NodeBox node={data.node} isFocus={data.isFocus} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}
```

Create `packages/webview/src/graph/use-layout.ts`:

```ts
import type { GraphSlice } from "@code-spider/core";
import { useEffect, useState } from "react";
import { applyPositions, layoutPositions } from "./layout.js";
import { toFlow, type SpiderFlowEdge, type SpiderFlowNode } from "./to-flow.js";

export type Laid = {
  /** Changes with every layout so the canvas remounts and refits the view. */
  key: number;
  nodes: SpiderFlowNode[];
  edges: SpiderFlowEdge[];
};

type LayoutState = { laid: Laid | undefined; error: string | undefined };

export function useLayout(slice: GraphSlice): LayoutState {
  const [state, setState] = useState<LayoutState>({
    laid: undefined,
    error: undefined,
  });

  useEffect(() => {
    let cancelled = false;
    const { nodes, edges } = toFlow(slice);
    layoutPositions(nodes, edges).then(
      (positions) => {
        if (cancelled) return;
        setState((previous) => ({
          laid: {
            key: (previous.laid?.key ?? 0) + 1,
            nodes: applyPositions(nodes, positions),
            edges,
          },
          error: undefined,
        }));
      },
      (error: unknown) => {
        if (cancelled) return;
        setState({
          laid: undefined,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slice]);

  return state;
}
```

Create `packages/webview/src/graph/GraphView.tsx`:

```tsx
import type { GraphSlice } from "@code-spider/core";
import { Controls, MarkerType, ReactFlow, type NodeTypes } from "@xyflow/react";
import { SpiderNode } from "./SpiderNode.js";
import { useLayout } from "./use-layout.js";

/** Defined once: React Flow re-creates every node if this object changes. */
const nodeTypes: NodeTypes = { spider: SpiderNode };

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
};

export function GraphView({ slice }: { slice: GraphSlice }) {
  const { laid, error } = useLayout(slice);

  if (error) {
    return <p className="status">Could not lay out the graph: {error}</p>;
  }
  if (!laid) return null;

  return (
    <div className="graph-canvas">
      <ReactFlow
        key={laid.key}
        nodes={laid.nodes}
        edges={laid.edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.1}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
```

Create `packages/webview/src/graph/graph.css`:

```css
.graph-canvas {
  inset: 0;
  position: absolute;
}

.react-flow {
  --xy-background-color: var(--vscode-editor-background);
  --xy-edge-stroke: var(--vscode-editorLineNumber-foreground);
  --xy-edge-stroke-selected: var(--vscode-focusBorder);
  --xy-edge-label-background-color: var(--vscode-editor-background);
  --xy-edge-label-color: var(--vscode-descriptionForeground);
  --xy-controls-button-background-color: var(--vscode-editorWidget-background);
  --xy-controls-button-background-color-hover: var(
    --vscode-toolbar-hoverBackground
  );
  --xy-controls-button-color: var(--vscode-editor-foreground);
  --xy-controls-button-border-color: var(
    --vscode-editorWidget-border,
    var(--vscode-panel-border)
  );
  --xy-controls-box-shadow: none;
}

.react-flow__node {
  cursor: pointer;
}

.react-flow__handle {
  opacity: 0;
  pointer-events: none;
}

.react-flow__edge-text {
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
}

.react-flow__edge.edge-call .react-flow__edge-path {
  stroke: var(--vscode-editor-foreground);
  opacity: 0.6;
}

.react-flow__edge.edge-external .react-flow__edge-path {
  stroke: var(--vscode-editor-foreground);
  opacity: 0.35;
}

.react-flow__edge.edge-jsx .react-flow__edge-path {
  stroke: var(--vscode-charts-purple);
}

.react-flow__edge.edge-passes .react-flow__edge-path {
  stroke: var(--vscode-charts-blue);
  stroke-linecap: round;
}

.react-flow__edge.edge-unresolved .react-flow__edge-path {
  stroke: var(--vscode-editorWarning-foreground);
}

.node-box {
  background: var(
    --vscode-editorWidget-background,
    var(--vscode-editor-background)
  );
  border-radius: 4px;
  box-sizing: border-box;
  color: var(--vscode-editor-foreground);
  height: 100%;
  outline: 1px solid
    var(--vscode-editorWidget-border, var(--vscode-panel-border));
  outline-offset: -1px;
  overflow: hidden;
  width: 100%;
}

.node-box.is-focus {
  outline: 2px solid var(--vscode-focusBorder);
  outline-offset: -2px;
}

.node-box.kind-unknown {
  outline-color: var(--vscode-editorWarning-foreground);
  outline-style: dashed;
}

.node-box.kind-external {
  background: transparent;
}

.node-header {
  align-items: center;
  border-bottom: 1px solid
    var(--vscode-editorWidget-border, var(--vscode-panel-border));
  box-sizing: border-box;
  display: flex;
  gap: 8px;
  padding: 0 8px;
}

.node-box.kind-component .node-header {
  border-left: 3px solid var(--vscode-charts-blue);
}

.node-box.kind-external .node-header,
.node-box.kind-unknown .node-header,
.node-box.kind-module .node-header {
  border-bottom: none;
}

.node-name {
  flex: 1 1 auto;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-box.kind-module .node-name {
  font-style: italic;
}

.node-box.kind-unknown .node-name::before {
  content: "? ";
}

.node-async {
  background: var(--vscode-badge-background);
  border-radius: 3px;
  color: var(--vscode-badge-foreground);
  flex: none;
  font-size: 10px;
  padding: 0 4px;
}

.node-input {
  color: var(--vscode-descriptionForeground);
  flex: 0 1 45%;
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  min-width: 0;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-code {
  box-sizing: border-box;
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
  margin: 0;
  overflow: hidden;
  position: relative;
  tab-size: 2;
  white-space: pre;
}

.node-code.is-clipped::after {
  background: linear-gradient(
    to bottom,
    transparent,
    var(--vscode-editorWidget-background, var(--vscode-editor-background))
  );
  bottom: 0;
  content: "";
  height: 40px;
  left: 0;
  pointer-events: none;
  position: absolute;
  right: 0;
}
```

- [ ] **Step 5: Render the graph from the app**

Replace `packages/webview/src/App.tsx` with:

```tsx
import { useEffect, useReducer } from "react";
import { initialState, reduceMessage } from "./app-state.js";
import { GraphView } from "./graph/GraphView.js";
import { isExtensionMessage } from "./messages.js";
import { useDelayedFlag } from "./use-delayed-flag.js";
import { postToExtension } from "./vscode-api.js";

/** Work shorter than this never shows a spinner (perf note). */
export const SPINNER_DELAY_MS = 500;

export function App() {
  const [state, dispatch] = useReducer(reduceMessage, initialState);
  const spinner = useDelayedFlag(state.busy, SPINNER_DELAY_MS);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isExtensionMessage(event.data)) dispatch(event.data);
    };
    window.addEventListener("message", onMessage);
    postToExtension({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="app">
      {state.indexing ? (
        <div className="banner" role="status">
          Indexing the project so the first graph appears quickly...
        </div>
      ) : null}
      {state.error ? (
        <div className="banner banner-error" role="alert">
          {state.error}
        </div>
      ) : null}
      {spinner ? (
        <div className="spinner" role="status" aria-label="Analysing" />
      ) : null}
      <section className="content">
        {state.slice ? (
          <GraphView slice={state.slice} />
        ) : (
          <p className="status">
            Place the cursor in a function and run Code Spider: Show Graph.
          </p>
        )}
      </section>
    </main>
  );
}
```

Replace `packages/webview/src/main.tsx` with:

```tsx
import "@xyflow/react/dist/style.css";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./graph/graph.css";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(<App />);
```

The React Flow stylesheet is imported first so `graph.css` and `styles.css`
override its variables.

Run: `pnpm --filter @code-spider/webview typecheck`
Expected: no output, exit code 0.

Run: `pnpm --filter @code-spider/webview build`
Expected: esbuild prints `dist/index.js` (about 1.8 MB, with esbuild's
large-file marker: React, React Flow and ELK are bundled) and `dist/index.css`,
with no warning messages or errors.

- [ ] **Step 6: Check the bundle**

Run: `grep -c "react-flow__node" packages/webview/dist/index.css`
Expected: `1` or more.

Run: `grep -c "node-box" packages/webview/dist/index.css`
Expected: `1` or more.

Run: `grep -c "ts-morph" packages/webview/dist/index.js`
Expected: `0` (`grep -c` exits 1 when the count is 0; that is the expected result).

Run: `grep -c "vscode-" packages/webview/dist/index.css`
Expected: `1` or more (theme variables, no hard-coded palette).

Run: `grep -o "new Function([^)]\{0,40\})" packages/webview/dist/index.js | head -3`
Expected: no output. If something prints, stop and report it: it would need
`'unsafe-eval'` in the webview CSP, which is a decision for the user.

- [ ] **Step 7: Full verification**

Run: `pnpm -r typecheck`
Expected: every package exits 0.

Run: `pnpm -r test`
Expected: all green: core 231, CLI 43, extension 68, webview 49.

Run: `pnpm build`
Expected: webview, then extension, with no warning messages.

- [ ] **Step 8: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: ` M packages/webview/src/App.tsx`, ` M packages/webview/src/graph/layout.ts`,
` M packages/webview/src/main.tsx`, and new `NodeBox.tsx`, `SpiderNode.tsx`,
`use-layout.ts`, `GraphView.tsx`, `graph.css` plus the three new tests.

Run: `git diff --check -- packages/webview`
Expected: no output.

Run: `git diff -- packages/webview/src/App.tsx packages/webview/src/graph/layout.ts packages/webview/src/main.tsx`
Expected: only the changes described in Steps 3 and 5.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/webview); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `feat(webview): render the graph slice with React Flow and ELK`

The implementer does not stage or commit; the user does.

### Task 7: Click-to-jump (node to declaration, edge to call site)

**Files:**
- Create: `packages/webview/src/graph/jump.ts`
- Create: `packages/extension/src/ranges.ts`
- Create: `packages/extension/src/navigation.ts`
- Create: `packages/extension/src/vscode/editor.ts`
- Modify: `packages/webview/src/graph/GraphView.tsx`
- Modify: `packages/webview/src/App.tsx`
- Modify: `packages/extension/src/panel/graph-panel.ts`
- Modify: `packages/extension/src/extension.ts`
- Test: `packages/webview/test/jump.test.ts`
- Test: `packages/extension/test/support/fixtures.ts` (replace, adds `readGolden`)
- Test: `packages/extension/test/ranges.test.ts`
- Test: `packages/extension/test/navigation.test.ts`

**Interfaces:**
- Consumes (Task 2): `WebviewToExtension` (`openInEditor`, `openCallSite`),
  `postToExtension`, `GraphPanel.receive`.
- Consumes (Task 4): `GraphSession.currentGraph(): CurrentGraph | undefined`
  where `CurrentGraph = { slice: GraphSlice; repoRoot: string }`;
  `notifier`; `ExtensionApi`.
- Consumes (Task 6): `GraphView`, `SpiderFlowNode` (`data.node: GraphNode`).
- Core facts relied on: `Range` lines and columns are both **one-based**
  (`startLine: 3, startColumn: 1` is the first character of line 3) and the end
  column is exclusive, as ts-morph's `getLineAndColumnAtPos` returns them. A
  node's `range` is its declaration. An edge's `callSite` lies in the body of
  the edge's `to` node (the consumer/caller), so its file is `to`'s `file`.
  `external` and `unknown` nodes have `file: ""` and cannot be opened.
- Produces in the webview: `nodeClickMessage(node: GraphNode):
  WebviewToExtension | undefined` (undefined when `node.file === ""`) and
  `edgeClickMessage(edgeId: string): WebviewToExtension`;
  `GraphView({ slice, onJump })` where `onJump: (message: WebviewToExtension)
  => void`.
- Produces in the extension: `ZeroBasedRange = { startLine; startCharacter;
  endLine; endCharacter }` and `toZeroBasedRange(range: Range):
  ZeroBasedRange` (`ranges.ts`); `JumpTarget = { file: string; range:
  ZeroBasedRange }`, `EditorPort { reveal(target: JumpTarget): Promise<void> }`,
  `nodeJumpTarget(graph, nodeId)`, `callSiteJumpTarget(graph, edgeId)` (both
  return `JumpTarget | undefined`), and `class JumpHandler` with `constructor(graph:
  () => CurrentGraph | undefined, editor: EditorPort)` and `handle(message:
  WebviewToExtension): Promise<void>` (`navigation.ts`); `class EditorRevealer
  implements EditorPort, vscode.Disposable` (`vscode/editor.ts`).
- Produces: `GraphPanel` constructor gains a second argument
  `onMessage: (message: WebviewToExtension) => void`, called for every valid
  message except `ready`.
- Produces: `ExtensionApi.handleWebviewMessage(message: WebviewToExtension):
  Promise<void>`, the same entry point a webview click reaches; the smoke tests
  (Task 9) drive click-to-jump through it.
- `focus`, `expand` and `refresh` messages are accepted by the protocol but
  ignored (M3).

- [ ] **Step 1: Write the failing webview test**

Create `packages/webview/test/jump.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { edgeClickMessage, nodeClickMessage } from "../src/graph/jump.js";
import { makeNode } from "./support/slices.js";

describe("nodeClickMessage", () => {
  it("asks the extension to open a repo function at its declaration", () => {
    const node = makeNode({ id: "src/a.ts#f", file: "src/a.ts" });
    expect(nodeClickMessage(node)).toEqual({
      type: "openInEditor",
      nodeId: "src/a.ts#f",
    });
  });

  it("opens module and component nodes too", () => {
    expect(
      nodeClickMessage(makeNode({ id: "src/m.tsx#<module>", kind: "module" })),
    ).toEqual({ type: "openInEditor", nodeId: "src/m.tsx#<module>" });
    expect(
      nodeClickMessage(makeNode({ id: "src/c.tsx#C", kind: "component" })),
    ).toMatchObject({ type: "openInEditor" });
  });

  it("does nothing for external and unknown nodes, which have no file", () => {
    const external = makeNode({
      id: "external:lib#x",
      kind: "external",
      file: "",
    });
    const unknown = makeNode({
      id: "unknown:a#f#x()",
      kind: "unknown",
      file: "",
    });
    expect(nodeClickMessage(external)).toBeUndefined();
    expect(nodeClickMessage(unknown)).toBeUndefined();
  });
});

describe("edgeClickMessage", () => {
  it("asks the extension to open the call site of the edge", () => {
    expect(edgeClickMessage("a#f->a#g")).toEqual({
      type: "openCallSite",
      edgeId: "a#f->a#g",
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @code-spider/webview test jump`
Expected: FAIL to import `../src/graph/jump.js`.

- [ ] **Step 3: Implement the webview side**

Create `packages/webview/src/graph/jump.ts`:

```ts
import type { GraphNode } from "@code-spider/core";
import type { WebviewToExtension } from "../protocol.js";

/** External and unknown nodes have no source file to open. */
export function nodeClickMessage(
  node: GraphNode,
): WebviewToExtension | undefined {
  if (node.file === "") return undefined;
  return { type: "openInEditor", nodeId: node.id };
}

export function edgeClickMessage(edgeId: string): WebviewToExtension {
  return { type: "openCallSite", edgeId };
}
```

Replace `packages/webview/src/graph/GraphView.tsx` with:

```tsx
import type { GraphSlice } from "@code-spider/core";
import { Controls, MarkerType, ReactFlow, type NodeTypes } from "@xyflow/react";
import type { WebviewToExtension } from "../protocol.js";
import { edgeClickMessage, nodeClickMessage } from "./jump.js";
import { SpiderNode } from "./SpiderNode.js";
import { useLayout } from "./use-layout.js";

/** Defined once: React Flow re-creates every node if this object changes. */
const nodeTypes: NodeTypes = { spider: SpiderNode };

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
};

export type GraphViewProps = {
  slice: GraphSlice;
  onJump: (message: WebviewToExtension) => void;
};

export function GraphView({ slice, onJump }: GraphViewProps) {
  const { laid, error } = useLayout(slice);

  if (error) {
    return <p className="status">Could not lay out the graph: {error}</p>;
  }
  if (!laid) return null;

  return (
    <div className="graph-canvas">
      <ReactFlow
        key={laid.key}
        nodes={laid.nodes}
        edges={laid.edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.1}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_event, node) => {
          const message = nodeClickMessage(node.data.node);
          if (message) onJump(message);
        }}
        onEdgeClick={(_event, edge) => onJump(edgeClickMessage(edge.id))}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
```

Edit `packages/webview/src/App.tsx` — replace:

```
          <GraphView slice={state.slice} />
```

with:

```
          <GraphView slice={state.slice} onJump={postToExtension} />
```

Run: `pnpm --filter @code-spider/webview test jump`
Expected: 1 file, 4 tests, pass.

Run: `pnpm --filter @code-spider/webview typecheck`
Expected: no output, exit code 0.

- [ ] **Step 4: Write the failing extension tests**

Replace `packages/extension/test/support/fixtures.ts` with:

```ts
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphSlice } from "@code-spider/core";

const here = dirname(fileURLToPath(import.meta.url));

export const testCodeRoot = resolve(here, "../../../../test-code");

/** Absolute path to a file inside a test-code project. */
export function fixturePath(name: string, rel = ""): string {
  return join(testCodeRoot, name, rel);
}

/** Zero-based offset of the first `needle` in `file`, plus `delta`. */
export function offsetOf(file: string, needle: string, delta = 0): number {
  const index = readFileSync(file, "utf8").indexOf(needle);
  if (index < 0) throw new Error(`"${needle}" not found in ${file}`);
  return index + delta;
}

/** A real slice produced by the analyser, checked in under core's tests. */
export function readGolden(name: string): GraphSlice {
  const path = resolve(here, "../../../core/test/__goldens__", name);
  return JSON.parse(readFileSync(path, "utf8")) as GraphSlice;
}
```

Create `packages/extension/test/ranges.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toZeroBasedRange } from "../src/ranges.js";

describe("toZeroBasedRange", () => {
  it("shifts one-based lines and columns to zero-based positions", () => {
    expect(
      toZeroBasedRange({
        startLine: 3,
        startColumn: 1,
        endLine: 6,
        endColumn: 2,
      }),
    ).toEqual({
      startLine: 2,
      startCharacter: 0,
      endLine: 5,
      endCharacter: 1,
    });
  });

  it("keeps the exclusive end column exclusive", () => {
    const range = toZeroBasedRange({
      startLine: 18,
      startColumn: 22,
      endLine: 18,
      endColumn: 39,
    });
    expect(range.endCharacter - range.startCharacter).toBe(17);
  });

  it("never goes below zero for the empty range of an external node", () => {
    expect(
      toZeroBasedRange({
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
      }),
    ).toEqual({ startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0 });
  });
});
```

Create `packages/extension/test/navigation.test.ts`:

```ts
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  callSiteJumpTarget,
  JumpHandler,
  nodeJumpTarget,
  type EditorPort,
} from "../src/navigation.js";
import type { CurrentGraph } from "../src/session.js";
import { fixturePath, readGolden } from "./support/fixtures.js";

const repoRoot = fixturePath("basic");
const graph: CurrentGraph = {
  slice: readGolden("basic-handleSignup.json"),
  repoRoot,
};

describe("nodeJumpTarget", () => {
  it("resolves a node to its declaration in the repo", () => {
    expect(nodeJumpTarget(graph, "src/signup.ts#validateUser")).toEqual({
      file: join(repoRoot, "src/signup.ts"),
      range: { startLine: 2, startCharacter: 0, endLine: 5, endCharacter: 1 },
    });
  });

  it("returns undefined for an id that is not in the current slice", () => {
    expect(nodeJumpTarget(graph, "src/signup.ts#nope")).toBeUndefined();
  });

  it("returns undefined for nodes without a file", () => {
    const withExternal: CurrentGraph = {
      repoRoot,
      slice: {
        ...graph.slice,
        nodes: [
          ...graph.slice.nodes,
          {
            ...graph.slice.nodes[0]!,
            id: "external:tiny-lib#persist",
            kind: "external",
            file: "",
          },
        ],
      },
    };
    expect(
      nodeJumpTarget(withExternal, "external:tiny-lib#persist"),
    ).toBeUndefined();
  });
});

describe("callSiteJumpTarget", () => {
  it("opens the call site in the caller's file, not the callee's", () => {
    const edgeId = "src/signup.ts#createUser->src/signup.ts#handleSignup";
    expect(callSiteJumpTarget(graph, edgeId)).toEqual({
      file: join(repoRoot, "src/signup.ts"),
      range: {
        startLine: 17,
        startCharacter: 21,
        endLine: 17,
        endCharacter: 38,
      },
    });
  });

  it("uses the caller's file when the caller is in another file", () => {
    const target = callSiteJumpTarget(
      graph,
      "src/signup.ts#handleSignup->src/app.ts#main",
    );
    expect(target?.file).toBe(join(repoRoot, "src/app.ts"));
  });

  it("returns undefined for an unknown edge id", () => {
    expect(callSiteJumpTarget(graph, "nope")).toBeUndefined();
  });
});

describe("JumpHandler", () => {
  function setup(current: CurrentGraph | null = graph) {
    const editor: EditorPort = { reveal: vi.fn(async () => undefined) };
    return {
      editor,
      jumps: new JumpHandler(() => current ?? undefined, editor),
    };
  }

  it("reveals the declaration for openInEditor", async () => {
    const { editor, jumps } = setup();
    await jumps.handle({
      type: "openInEditor",
      nodeId: "src/signup.ts#validateUser",
    });
    expect(editor.reveal).toHaveBeenCalledWith(
      nodeJumpTarget(graph, "src/signup.ts#validateUser"),
    );
  });

  it("reveals the call site for openCallSite", async () => {
    const { editor, jumps } = setup();
    const edgeId = "src/signup.ts#createUser->src/signup.ts#handleSignup";
    await jumps.handle({ type: "openCallSite", edgeId });
    expect(editor.reveal).toHaveBeenCalledWith(
      callSiteJumpTarget(graph, edgeId),
    );
  });

  it("ignores ids it cannot resolve and messages with nothing to open", async () => {
    const { editor, jumps } = setup();
    await jumps.handle({ type: "openInEditor", nodeId: "src/x.ts#y" });
    await jumps.handle({ type: "openCallSite", edgeId: "nope" });
    await jumps.handle({ type: "focus", nodeId: "src/signup.ts#validateUser" });
    await jumps.handle({
      type: "expand",
      nodeId: "src/signup.ts#validateUser",
    });
    await jumps.handle({ type: "refresh" });
    await jumps.handle({ type: "ready" });
    expect(editor.reveal).not.toHaveBeenCalled();
  });

  it("does nothing before any graph has been shown", async () => {
    const { editor, jumps } = setup(null);
    await jumps.handle({
      type: "openInEditor",
      nodeId: "src/signup.ts#validateUser",
    });
    expect(editor.reveal).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run them and watch them fail**

Run: `pnpm --filter code-spider-vscode test ranges navigation`
Expected: FAIL to import `../src/ranges.js` and `../src/navigation.js`.

- [ ] **Step 6: Implement ranges, navigation and the editor glue**

Create `packages/extension/src/ranges.ts`:

```ts
import type { Range } from "@code-spider/core";

export type ZeroBasedRange = {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
};

/**
 * The analyser reports one-based lines and columns (ts-morph's
 * `getLineAndColumnAtPos`); VS Code positions are zero-based. The end stays
 * exclusive in both.
 */
export function toZeroBasedRange(range: Range): ZeroBasedRange {
  return {
    startLine: Math.max(0, range.startLine - 1),
    startCharacter: Math.max(0, range.startColumn - 1),
    endLine: Math.max(0, range.endLine - 1),
    endCharacter: Math.max(0, range.endColumn - 1),
  };
}
```

Create `packages/extension/src/navigation.ts`:

```ts
import { join } from "node:path";
import type { NodeId } from "@code-spider/core";
import type { WebviewToExtension } from "@code-spider/webview/protocol";
import { toZeroBasedRange, type ZeroBasedRange } from "./ranges.js";
import type { CurrentGraph } from "./session.js";

export type JumpTarget = { file: string; range: ZeroBasedRange };

export interface EditorPort {
  reveal(target: JumpTarget): Promise<void>;
}

/** A node opens at its declaration; external and unknown nodes have no file. */
export function nodeJumpTarget(
  graph: CurrentGraph,
  nodeId: NodeId,
): JumpTarget | undefined {
  const node = graph.slice.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.file === "") return undefined;
  return {
    file: join(graph.repoRoot, node.file),
    range: toZeroBasedRange(node.range),
  };
}

/** An edge opens at its call site, which lies in the consumer (`to`) node's file. */
export function callSiteJumpTarget(
  graph: CurrentGraph,
  edgeId: string,
): JumpTarget | undefined {
  const edge = graph.slice.edges.find((candidate) => candidate.id === edgeId);
  const caller = edge
    ? graph.slice.nodes.find((candidate) => candidate.id === edge.to)
    : undefined;
  if (!edge || !caller || caller.file === "") return undefined;
  return {
    file: join(graph.repoRoot, caller.file),
    range: toZeroBasedRange(edge.callSite),
  };
}

export class JumpHandler {
  constructor(
    private readonly graph: () => CurrentGraph | undefined,
    private readonly editor: EditorPort,
  ) {}

  /** `ready` belongs to the panel; `focus`, `expand` and `refresh` arrive in M3. */
  async handle(message: WebviewToExtension): Promise<void> {
    const graph = this.graph();
    if (!graph) return;
    const target =
      message.type === "openInEditor"
        ? nodeJumpTarget(graph, message.nodeId)
        : message.type === "openCallSite"
          ? callSiteJumpTarget(graph, message.edgeId)
          : undefined;
    if (target) await this.editor.reveal(target);
  }
}
```

Create `packages/extension/src/vscode/editor.ts`:

```ts
import * as vscode from "vscode";
import type { EditorPort, JumpTarget } from "../navigation.js";

/**
 * Opens files in the column of the last text editor the user used. Clicking
 * inside the webview makes the panel's group active, and opening there would
 * bury the code under the graph.
 */
export class EditorRevealer implements EditorPort, vscode.Disposable {
  private column: vscode.ViewColumn =
    vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
  private readonly subscription = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor?.viewColumn) this.column = editor.viewColumn;
    },
  );

  async reveal(target: JumpTarget): Promise<void> {
    const { range } = target;
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(target.file),
    );
    await vscode.window.showTextDocument(document, {
      viewColumn: this.column,
      selection: new vscode.Range(
        range.startLine,
        range.startCharacter,
        range.endLine,
        range.endCharacter,
      ),
    });
  }

  dispose(): void {
    this.subscription.dispose();
  }
}
```

Run: `pnpm --filter code-spider-vscode test ranges navigation`
Expected: 2 files, 13 tests, all pass.

- [ ] **Step 7: Route webview messages to the jump handler**

Edit `packages/extension/src/panel/graph-panel.ts` — replace:

```
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
```

with:

```
import type {
  ExtensionToWebview,
  WebviewToExtension,
} from "@code-spider/webview/protocol";
```

Edit `packages/extension/src/panel/graph-panel.ts` — replace:

```
  constructor(private readonly extensionUri: vscode.Uri) {}
```

with:

```
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (message: WebviewToExtension) => void,
  ) {}
```

Edit `packages/extension/src/panel/graph-panel.ts` — replace:

```
    const message = parseWebviewMessage(raw);
    if (message?.type === "ready") this.gate.markReady();
```

with:

```
    const message = parseWebviewMessage(raw);
    if (!message) return;
    if (message.type === "ready") this.gate.markReady();
    else this.onMessage(message);
```

Edit `packages/extension/src/extension.ts` — replace:

```
import { GraphPanel } from "./panel/graph-panel.js";
```

with:

```
import { JumpHandler } from "./navigation.js";
import { GraphPanel } from "./panel/graph-panel.js";
```

Edit `packages/extension/src/extension.ts` — replace:

```
import { resolveFocusRequest } from "./vscode/focus-request.js";
```

with:

```
import { EditorRevealer } from "./vscode/editor.js";
import { resolveFocusRequest } from "./vscode/focus-request.js";
```

Edit `packages/extension/src/extension.ts` — replace:

```
import * as vscode from "vscode";
```

with:

```
import type { WebviewToExtension } from "@code-spider/webview/protocol";
import * as vscode from "vscode";
```

Edit `packages/extension/src/extension.ts` — replace:

```
export type ExtensionApi = {
  currentGraph(): CurrentGraph | undefined;
};
```

with:

```
export type ExtensionApi = {
  currentGraph(): CurrentGraph | undefined;
  /** The entry point a webview click reaches; tests drive click-to-jump here. */
  handleWebviewMessage(message: WebviewToExtension): Promise<void>;
};
```

Edit `packages/extension/src/extension.ts` — replace:

```
  const panel = new GraphPanel(context.extensionUri);
```

with:

```
  const revealer = new EditorRevealer();
  const panel = new GraphPanel(context.extensionUri, (message) => {
    jumps.handle(message).catch((error: unknown) => {
      notifier.error(
        `Could not open that location: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  });
```

Edit `packages/extension/src/extension.ts` — replace:

```
    maxHeapMb: getMaxHeapMb,
  });
```

with:

```
    maxHeapMb: getMaxHeapMb,
  });
  const jumps = new JumpHandler(() => session.currentGraph(), revealer);
```

Edit `packages/extension/src/extension.ts` — replace:

```
    { dispose: () => worker.dispose() },
    panel,
```

with:

```
    { dispose: () => worker.dispose() },
    revealer,
    panel,
```

Edit `packages/extension/src/extension.ts` — replace:

```
  return { currentGraph: () => session.currentGraph() };
```

with:

```
  return {
    currentGraph: () => session.currentGraph(),
    handleWebviewMessage: (message) => jumps.handle(message),
  };
```

Run: `pnpm --filter code-spider-vscode typecheck`
Expected: no output, exit code 0.

Run: `pnpm --filter code-spider-vscode build`
Expected: both bundles build.

- [ ] **Step 8: Full verification**

Run: `pnpm -r typecheck`
Expected: every package exits 0.

Run: `pnpm -r test`
Expected: all green: core 231, CLI 43, extension 81, webview 53.

Run: `pnpm build`
Expected: webview, then extension, with no warning messages.

- [ ] **Step 9: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: modified `packages/webview/src/App.tsx`,
`packages/webview/src/graph/GraphView.tsx`,
`packages/extension/src/extension.ts`,
`packages/extension/src/panel/graph-panel.ts`,
`packages/extension/test/support/fixtures.ts`; new
`packages/webview/src/graph/jump.ts`, `packages/extension/src/ranges.ts`,
`packages/extension/src/navigation.ts`, `packages/extension/src/vscode/editor.ts`
and the three new tests.

Run: `git diff --check -- packages/extension packages/webview`
Expected: no output.

Run: `git diff -- packages/extension packages/webview`
Expected: only the changes described in this task.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/extension packages/webview); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `feat(extension): jump to a node's declaration or an edge's call site on click`

The implementer does not stage or commit; the user does.

### Task 8: Gestures (Shift+Alt+Q, CodeLens, context menu)

**Files:**
- Create: `packages/extension/src/declarations.ts`
- Create: `packages/extension/src/vscode/codelens.ts`
- Create: `packages/extension/vscode-version.json`
- Create: `packages/extension/scripts/vscode.mjs`
- Create: `packages/extension/scripts/download-vscode.mjs`
- Create: `packages/extension/scripts/check-default-keybinding.mjs`
- Modify: `packages/extension/src/ids.ts`
- Modify: `packages/extension/src/extension.ts`
- Modify: `packages/extension/package.json` (command, keybinding, menus, CodeLens setting, script, dev dependency)
- Modify: `pnpm-lock.yaml` (written by `pnpm install`)
- Test: `packages/extension/test/support/manifest.ts` (replace)
- Test: `packages/extension/test/manifest.test.ts` (replace)
- Test: `packages/extension/test/declarations.test.ts`
- Test: `packages/extension/test/declarations-analyser.test.ts`

**Interfaces:**
- Consumes (Task 4): `ANALYSABLE_LANGUAGE_IDS`, `resolveFocusRequest(uri?,
  position?)`, which already accepts what each gesture passes: nothing for the
  keybinding and palette, the document URI for the context menu, and the
  document URI plus a `vscode.Position` for a CodeLens. The command handler
  in `extension.ts` (`COMMAND_SHOW_GRAPH`).
- Consumes (core): `analyzeFocus`, `loadProject` (used by the position
  cross-check test). Facts relied on: focusing needs a position **inside** the
  callable. The name of `const Foo = () => ...` is not inside the arrow, so a
  lens for that must point at the arrow itself; a function or class
  declaration can point at its own start.
- Produces in `src/ids.ts`: `COMMAND_SHOW_IN_CODE_SPIDER =
  "codeSpider.showInCodeSpider"`, `SETTING_CODELENS_ENABLED =
  "codeSpider.codeLens.enabled"`, `CODELENS_TITLE = "⧉ Graph"` (added to the
  existing constants).
- Produces `findCallableDeclarations(text: string, fileName: string):
  CallableDeclaration[]` in `src/declarations.ts`, where
  `CallableDeclaration = { name: string; lensLine: number; line: number;
  character: number }` (`lensLine` is where the lens is drawn; `line`/`character`
  is the focus position; all zero-based). It lists function declarations with a
  body, arrow and function-expression consts (also behind `as`, `satisfies`,
  parentheses and `memo`/`forwardRef`/`useCallback`), classes, class methods
  and arrow-function class properties, at the top level of the file only.
- Produces `GraphCodeLensProvider` (`refresh(): void`, `dispose()`) and
  `CODELENS_SELECTOR` in `src/vscode/codelens.ts`. TypeScript (about 9 MB
  bundled) is loaded with a dynamic `import()` the first time a lens is
  requested, so it is not initialised at activation. (Activation still pays
  about 120 ms once per window to parse the larger `extension.cjs`; moving
  TypeScript into its own lazily required bundle is an M4 option.)
- Produces the manifest contributions: keybinding `shift+alt+q` for
  `codeSpider.showGraph`; a second command `codeSpider.showInCodeSpider`
  titled `Show in Code Spider`, in the editor context menu only; the setting
  `codeSpider.codeLens.enabled` (default `true`). Everything is limited to
  TS, TSX, JS and JSX editors.
- Produces `vscode-version.json` (`{ "version": "1.141.0" }`, the one place the
  tested VS Code version is pinned), `scripts/vscode.mjs` (`VSCODE_VERSION`,
  `downloadVSCode()` into `.vscode-test/`), and the scripts `download:vscode`
  and `check:keybinding`. `check:keybinding` fails if Shift+Alt+Q is a built-in
  VS Code default (spec §8.1).

- [ ] **Step 1: Write the failing tests**

Replace `packages/extension/src/ids.ts` with:

```ts
export const COMMAND_SHOW_GRAPH = "codeSpider.showGraph";
export const COMMAND_SHOW_IN_CODE_SPIDER = "codeSpider.showInCodeSpider";
export const PANEL_VIEW_TYPE = "codeSpider.graph";
export const PANEL_TITLE = "Code Spider";
export const SETTING_MAX_HEAP_MB = "codeSpider.worker.maxHeapMb";
export const SETTING_CODELENS_ENABLED = "codeSpider.codeLens.enabled";
export const CODELENS_TITLE = "⧉ Graph";
```

Replace `packages/extension/test/support/manifest.ts` with:

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type MenuEntry = { command: string; when?: string; group?: string };

export type Manifest = {
  engines: { vscode: string };
  main: string;
  activationEvents: string[];
  contributes: {
    commands: { command: string; title: string; category?: string }[];
    keybindings?: { command: string; key: string; when?: string }[];
    menus?: Record<string, MenuEntry[]>;
    configuration?: {
      properties: Record<
        string,
        { type: string; default: unknown; minimum?: number }
      >;
    };
  };
};

const here = dirname(fileURLToPath(import.meta.url));

export function readManifest(): Manifest {
  const path = join(here, "../../package.json");
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}
```

Replace `packages/extension/test/manifest.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { ANALYSABLE_LANGUAGE_IDS } from "../src/changes.js";
import {
  CODELENS_TITLE,
  COMMAND_SHOW_GRAPH,
  COMMAND_SHOW_IN_CODE_SPIDER,
  SETTING_CODELENS_ENABLED,
  SETTING_MAX_HEAP_MB,
} from "../src/ids.js";
import {
  DEFAULT_MAX_HEAP_MB,
  MIN_MAX_HEAP_MB,
} from "../src/settings-values.js";
import { readManifest } from "./support/manifest.js";

const languageClause = ANALYSABLE_LANGUAGE_IDS.map(
  (id) => `editorLangId == ${id}`,
).join(" || ");

describe("extension manifest", () => {
  const { contributes, activationEvents, main } = readManifest();

  it("contributes Show Graph under the Code Spider category", () => {
    const command = contributes.commands.find(
      (entry) => entry.command === COMMAND_SHOW_GRAPH,
    );
    expect(command).toMatchObject({
      title: "Show Graph",
      category: "Code Spider",
    });
  });

  it("contributes the context-menu command with the spec's title", () => {
    const command = contributes.commands.find(
      (entry) => entry.command === COMMAND_SHOW_IN_CODE_SPIDER,
    );
    expect(command?.title).toBe("Show in Code Spider");
  });

  it("points main at the CommonJS bundle", () => {
    expect(main).toBe("./dist/extension.cjs");
  });

  it("activates when a TypeScript or JavaScript file opens", () => {
    const expected = ANALYSABLE_LANGUAGE_IDS.map((id) => `onLanguage:${id}`);
    expect([...activationEvents].sort()).toEqual([...expected].sort());
  });

  it("binds Shift+Alt+Q in TS/JS editors only", () => {
    expect(contributes.keybindings).toEqual([
      {
        command: COMMAND_SHOW_GRAPH,
        key: "shift+alt+q",
        when: `editorTextFocus && (${languageClause})`,
      },
    ]);
  });

  it("adds Show in Code Spider to the editor context menu for TS/JS only", () => {
    expect(contributes.menus?.["editor/context"]).toEqual([
      {
        command: COMMAND_SHOW_IN_CODE_SPIDER,
        when: languageClause,
        group: "navigation",
      },
    ]);
  });

  it("keeps the menu-only command and non-TS/JS editors out of the palette", () => {
    const palette = contributes.menus?.commandPalette ?? [];
    expect(palette).toContainEqual({
      command: COMMAND_SHOW_IN_CODE_SPIDER,
      when: "false",
    });
    expect(palette).toContainEqual({
      command: COMMAND_SHOW_GRAPH,
      when: languageClause,
    });
  });

  it("declares the worker heap setting with the shared default and minimum", () => {
    const setting = contributes.configuration?.properties[SETTING_MAX_HEAP_MB];
    expect(setting).toMatchObject({
      type: "number",
      default: DEFAULT_MAX_HEAP_MB,
      minimum: MIN_MAX_HEAP_MB,
    });
  });

  it("makes the CodeLens toggleable and on by default", () => {
    const setting =
      contributes.configuration?.properties[SETTING_CODELENS_ENABLED];
    expect(setting).toMatchObject({ type: "boolean", default: true });
    expect(CODELENS_TITLE).toBe("⧉ Graph");
  });
});
```

Create `packages/extension/test/declarations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findCallableDeclarations } from "../src/declarations.js";

const find = (lines: string[], fileName = "mod.ts") =>
  findCallableDeclarations(lines.join("\n"), fileName);

describe("findCallableDeclarations", () => {
  it("lists function declarations with bodies, once per implementation", () => {
    expect(
      find([
        "export function plain(a: number): number {",
        "  return a;",
        "}",
        "export async function later(): Promise<void> {}",
        "declare function ambient(): void;",
        "function overload(a: string): void;",
        "function overload(a: number): void;",
        "function overload(a: unknown): void {}",
      ]),
    ).toEqual([
      { name: "plain", lensLine: 0, line: 0, character: 0 },
      { name: "later", lensLine: 3, line: 3, character: 0 },
      { name: "overload", lensLine: 7, line: 7, character: 0 },
    ]);
  });

  it("lists anonymous default exports as default", () => {
    expect(find(["export default function () {}"])).toEqual([
      { name: "default", lensLine: 0, line: 0, character: 0 },
    ]);
    expect(find(["export default () => 1;"])).toEqual([
      { name: "default", lensLine: 0, line: 0, character: 15 },
    ]);
  });

  it("lists arrow and function-expression consts, focusing inside the function", () => {
    expect(
      find([
        "export const arrow = (a: number) => a;",
        "const expr = function () {};",
        "const notAFunction = 3;",
        "const { destructured } = { destructured: () => 1 };",
      ]),
    ).toEqual([
      { name: "arrow", lensLine: 0, line: 0, character: 21 },
      { name: "expr", lensLine: 1, line: 1, character: 13 },
    ]);
  });

  it("looks through as, satisfies, parentheses and known wrappers", () => {
    const names = find([
      "const a = (() => 1) as () => number;",
      "const b = (() => 1) satisfies () => number;",
      "const c = memo(() => null);",
      "const d = React.forwardRef(function Inner() { return null; });",
      "const e = useCallback(async () => {}, []);",
      "const f = memo(forwardRef(() => null));",
      "const g = someOtherCall(() => 1);",
    ]).map((declaration) => declaration.name);
    expect(names).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("lists classes and their named methods and arrow properties", () => {
    expect(
      find([
        "export class Store {",
        "  count = 0;",
        "  bump = () => this.count + 1;",
        "  constructor() {}",
        "  save(): number {",
        "    return this.count;",
        "  }",
        "  #hidden() {}",
        "  static make(): Store {",
        "    return new Store();",
        "  }",
        "}",
      ]),
    ).toEqual([
      { name: "Store", lensLine: 0, line: 0, character: 0 },
      { name: "bump", lensLine: 2, line: 2, character: 9 },
      { name: "save", lensLine: 4, line: 4, character: 2 },
      { name: "make", lensLine: 8, line: 8, character: 2 },
    ]);
  });

  it("lists an anonymous default class as default", () => {
    expect(find(["export default class {}"])).toEqual([
      { name: "default", lensLine: 0, line: 0, character: 0 },
    ]);
  });

  it("skips functions nested inside other functions", () => {
    const names = find([
      "export function outer() {",
      "  const inner = () => 1;",
      "  function deeper() {}",
      "  return inner;",
      "}",
    ]).map((declaration) => declaration.name);
    expect(names).toEqual(["outer"]);
  });

  it("parses JSX in TSX and JSX files", () => {
    const source = ["export const Page = () => <div>hi</div>;"];
    expect(find(source, "page.tsx").map((d) => d.name)).toEqual(["Page"]);
    expect(find(source, "page.jsx").map((d) => d.name)).toEqual(["Page"]);
  });

  it("puts the lens on the declaration line, not on a leading comment", () => {
    expect(
      find(["/** Docs. */", "", "export function documented() {}"]),
    ).toEqual([{ name: "documented", lensLine: 2, line: 2, character: 0 }]);
  });

  it("returns nothing for an empty file", () => {
    expect(find([""])).toEqual([]);
  });
});
```

Create `packages/extension/test/declarations-analyser.test.ts`:

```ts
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeFocus, loadProject } from "@code-spider/core";
import { afterAll, describe, expect, it } from "vitest";
import { findCallableDeclarations } from "../src/declarations.js";
import { positionToOffset } from "../src/positions.js";
import { fixturePath } from "./support/fixtures.js";

/** `src/a.ts#Store.save~1` ends with the declaration named `save`. */
function idEndsWith(focusId: string, name: string): boolean {
  return new RegExp(`#(?:[\\w$]+\\.)*${name}(?:~\\d+)?$`).test(focusId);
}

/** Focus every lens position with the real analyser and return the ids. */
function focusAll(projectRoot: string, relativeFile: string) {
  const file = join(projectRoot, relativeFile);
  const text = readFileSync(file, "utf8");
  const project = loadProject(join(projectRoot, "tsconfig.json"));
  const declarations = findCallableDeclarations(text, file);
  expect(declarations.length).toBeGreaterThan(0);

  return declarations.map((declaration) => {
    const offset = positionToOffset(
      text,
      declaration.line,
      declaration.character,
    );
    const slice = analyzeFocus(project, {
      file,
      offset,
      repoRoot: projectRoot,
    });
    return { name: declaration.name, focusId: slice.focusId };
  });
}

describe("CodeLens positions against the analyser", () => {
  it("focus the declaration they sit above in the basic fixture", () => {
    for (const { name, focusId } of focusAll(
      fixturePath("basic"),
      "src/signup.ts",
    )) {
      expect(idEndsWith(focusId, name), `${name} -> ${focusId}`).toBe(true);
    }
  });

  it("focus the components in the jsx fixture", () => {
    const results = focusAll(fixturePath("jsx"), "src/components.tsx");
    expect(results.map((result) => result.name)).toEqual([
      "SignupForm",
      "Page",
    ]);
    for (const { name, focusId } of results) {
      expect(idEndsWith(focusId, name), `${name} -> ${focusId}`).toBe(true);
    }
  });

  describe("every declaration shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-spider-lens-"));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("focuses what the lens names", () => {
      mkdirSync(join(dir, "src"));
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            strict: true,
            types: [],
          },
          include: ["src"],
        }),
      );
      writeFileSync(
        join(dir, "src/mod.ts"),
        [
          "export function plain(): number { return 1 }",
          "export const arrow = (): number => 2",
          "export const expr = function (): number { return 3 }",
          "function useCallback<T>(fn: T): T { return fn }",
          "export const wrapped = useCallback((): number => 4)",
          "export const cast = ((): number => 5) as () => number",
          "export class Store {",
          "  count = 0",
          "  bump = (): number => this.count + 1",
          "  save(): number { return this.count }",
          "  static make(): Store { return new Store() }",
          "}",
          "export default function (): number { return 6 }",
          "",
        ].join("\n"),
      );

      const results = focusAll(dir, "src/mod.ts");
      expect(results.map((result) => result.name)).toEqual([
        "plain",
        "arrow",
        "expr",
        "useCallback",
        "wrapped",
        "cast",
        "Store",
        "bump",
        "save",
        "make",
        "default",
      ]);
      for (const { name, focusId } of results) {
        expect(idEndsWith(focusId, name), `${name} -> ${focusId}`).toBe(true);
      }
    });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter code-spider-vscode test declarations manifest`
Expected: `declarations` and `declarations-analyser` FAIL to import
`../src/declarations.js`; `manifest` FAILS on the keybinding, context-menu,
palette, command and CodeLens-setting tests (the manifest does not have them yet).

- [ ] **Step 3: Implement the declaration finder**

Create `packages/extension/src/declarations.ts`:

```ts
import ts from "typescript";

export type CallableDeclaration = {
  /** The short name the graph shows; `default` for an anonymous default export. */
  name: string;
  /** Zero-based line the lens is drawn above. */
  lensLine: number;
  /** Zero-based position inside the callable, where the analyser focuses. */
  line: number;
  character: number;
};

type FunctionLike = ts.ArrowFunction | ts.FunctionExpression;

/** Wrappers the analyser already follows (`const X = memo(() => ...)`). */
const WRAPPER_CALLEES = new Set(["memo", "forwardRef", "useCallback"]);

/**
 * Top-level functions, components, classes and class methods in a file. It
 * uses the syntax-only parser: no type checker, no project, so it is fast
 * enough to run on every CodeLens request. Functions nested inside other
 * functions are not listed; the keybinding still reaches them.
 */
export function findCallableDeclarations(
  text: string,
  fileName: string,
): CallableDeclaration[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    false,
  );
  const found: CallableDeclaration[] = [];

  const add = (name: string, unit: ts.Node, callable: ts.Node) => {
    const lens = positionOf(sourceFile, unit);
    const focus = positionOf(sourceFile, callable);
    found.push({
      name,
      lensLine: lens.line,
      line: focus.line,
      character: focus.character,
    });
  };

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      const name = declaredName(statement);
      if (statement.body && name) add(name, statement, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const callable = declaration.initializer
          ? functionLike(declaration.initializer)
          : undefined;
        if (callable && ts.isIdentifier(declaration.name)) {
          add(declaration.name.text, statement, callable);
        }
      }
    } else if (ts.isExportAssignment(statement)) {
      const callable = functionLike(statement.expression);
      if (callable) add("default", statement, callable);
    } else if (ts.isClassDeclaration(statement)) {
      const name = declaredName(statement);
      if (name) add(name, statement, statement);
      for (const member of statement.members) addMember(member, add);
    }
  }
  return found;
}

function addMember(
  member: ts.ClassElement,
  add: (name: string, unit: ts.Node, callable: ts.Node) => void,
): void {
  if (!member.name || !ts.isIdentifier(member.name)) return;
  if (ts.isMethodDeclaration(member) && member.body) {
    add(member.name.text, member, member);
  } else if (ts.isPropertyDeclaration(member) && member.initializer) {
    const callable = functionLike(member.initializer);
    if (callable) add(member.name.text, member, callable);
  }
}

function positionOf(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): ts.LineAndCharacter {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
}

function declaredName(
  node: ts.FunctionDeclaration | ts.ClassDeclaration,
): string | undefined {
  if (node.name) return node.name.text;
  const isDefault = ts
    .getModifiers(node)
    ?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
  return isDefault ? "default" : undefined;
}

/** The function an initialiser holds, looking through `as`, parentheses and known wrappers. */
function functionLike(expression: ts.Expression): FunctionLike | undefined {
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return expression;
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return functionLike(expression.expression);
  }
  if (ts.isCallExpression(expression) && isWrapper(expression.expression)) {
    const first = expression.arguments[0];
    return first ? functionLike(first) : undefined;
  }
  return undefined;
}

function isWrapper(callee: ts.Expression): boolean {
  if (ts.isIdentifier(callee)) return WRAPPER_CALLEES.has(callee.text);
  if (ts.isPropertyAccessExpression(callee)) {
    return WRAPPER_CALLEES.has(callee.name.text);
  }
  return false;
}
```

Run: `pnpm --filter code-spider-vscode test declarations`
Expected: 2 files, 13 tests, all pass. If a `declarations-analyser` case fails,
the lens position disagrees with the analyser: report the failing name and
the `focusId` it printed instead of changing the expectations.

- [ ] **Step 4: Add the manifest contributions**

Edit `packages/extension/package.json` — replace:

```
Changing it restarts the worker."
        }
      }
    },
```

with:

```
Changing it restarts the worker."
        },
        "codeSpider.codeLens.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Show a ⧉ Graph CodeLens above function, component and class declarations."
        }
      }
    },
```

Edit `packages/extension/package.json` — replace:

```
        "category": "Code Spider"
      }
    ]
  },
```

with:

```
        "category": "Code Spider"
      },
      {
        "command": "codeSpider.showInCodeSpider",
        "title": "Show in Code Spider"
      }
    ],
    "keybindings": [
      {
        "command": "codeSpider.showGraph",
        "key": "shift+alt+q",
        "when": "editorTextFocus && (editorLangId == typescript || editorLangId == typescriptreact || editorLangId == javascript || editorLangId == javascriptreact)"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "command": "codeSpider.showInCodeSpider",
          "when": "editorLangId == typescript || editorLangId == typescriptreact || editorLangId == javascript || editorLangId == javascriptreact",
          "group": "navigation"
        }
      ],
      "commandPalette": [
        {
          "command": "codeSpider.showInCodeSpider",
          "when": "false"
        },
        {
          "command": "codeSpider.showGraph",
          "when": "editorLangId == typescript || editorLangId == typescriptreact || editorLangId == javascript || editorLangId == javascriptreact"
        }
      ]
    }
  },
```

Edit `packages/extension/package.json` — replace:

```
    "typecheck": "tsc --noEmit"
  },
```

with:

```
    "typecheck": "tsc --noEmit",
    "download:vscode": "node scripts/download-vscode.mjs",
    "check:keybinding": "node scripts/check-default-keybinding.mjs"
  },
```

Edit `packages/extension/package.json` — replace:

```
    "@types/vscode": "^1.140.0",
```

with:

```
    "@types/vscode": "^1.140.0",
    "@vscode/test-electron": "^3.1.0",
```

Run: `pnpm install`
Expected: completes; the lockfile gains `@vscode/test-electron`.

Run: `pnpm --filter code-spider-vscode test manifest`
Expected: 1 file, 9 tests, all pass.

- [ ] **Step 5: Add the CodeLens provider and register the gestures**

Create `packages/extension/src/vscode/codelens.ts`:

```ts
import * as vscode from "vscode";
import { ANALYSABLE_LANGUAGE_IDS } from "../changes.js";
import {
  CODELENS_TITLE,
  COMMAND_SHOW_GRAPH,
  SETTING_CODELENS_ENABLED,
} from "../ids.js";

export const CODELENS_SELECTOR: vscode.DocumentSelector =
  ANALYSABLE_LANGUAGE_IDS.map((language) => ({ scheme: "file", language }));

export class GraphCodeLensProvider
  implements vscode.CodeLensProvider, vscode.Disposable
{
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  refresh(): void {
    this.changed.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    const enabled = vscode.workspace
      .getConfiguration()
      .get<boolean>(SETTING_CODELENS_ENABLED, true);
    if (!enabled) return [];

    // TypeScript is large; load it when the first lens is requested, not at activation.
    const { findCallableDeclarations } = await import("../declarations.js");
    return findCallableDeclarations(document.getText(), document.fileName).map(
      (declaration) =>
        new vscode.CodeLens(
          new vscode.Range(declaration.lensLine, 0, declaration.lensLine, 0),
          {
            title: CODELENS_TITLE,
            tooltip: `Show ${declaration.name} in Code Spider`,
            command: COMMAND_SHOW_GRAPH,
            arguments: [
              document.uri,
              new vscode.Position(declaration.line, declaration.character),
            ],
          },
        ),
    );
  }

  dispose(): void {
    this.changed.dispose();
  }
}
```

Edit `packages/extension/src/extension.ts` — replace:

```
import { COMMAND_SHOW_GRAPH, SETTING_MAX_HEAP_MB } from "./ids.js";
```

with:

```
import {
  COMMAND_SHOW_GRAPH,
  COMMAND_SHOW_IN_CODE_SPIDER,
  SETTING_CODELENS_ENABLED,
  SETTING_MAX_HEAP_MB,
} from "./ids.js";
```

Edit `packages/extension/src/extension.ts` — replace:

```
import { EditorRevealer } from "./vscode/editor.js";
```

with:

```
import { CODELENS_SELECTOR, GraphCodeLensProvider } from "./vscode/codelens.js";
import { EditorRevealer } from "./vscode/editor.js";
```

Edit `packages/extension/src/extension.ts` — replace:

```
  const jumps = new JumpHandler(() => session.currentGraph(), revealer);

  context.subscriptions.push(
```

with:

```
  const jumps = new JumpHandler(() => session.currentGraph(), revealer);
  const codeLens = new GraphCodeLensProvider();
  const showGraph = async (uri?: vscode.Uri, position?: vscode.Position) => {
    const request = await resolveFocusRequest(uri, position);
    if (request) await session.showGraph(request);
  };

  context.subscriptions.push(
```

Edit `packages/extension/src/extension.ts` — replace:

```
    vscode.commands.registerCommand(
      COMMAND_SHOW_GRAPH,
      async (uri?: vscode.Uri, position?: vscode.Position) => {
        const request = await resolveFocusRequest(uri, position);
        if (request) await session.showGraph(request);
      },
    ),
```

with:

```
    vscode.commands.registerCommand(COMMAND_SHOW_GRAPH, showGraph),
    vscode.commands.registerCommand(COMMAND_SHOW_IN_CODE_SPIDER, showGraph),
    codeLens,
    vscode.languages.registerCodeLensProvider(CODELENS_SELECTOR, codeLens),
```

Edit `packages/extension/src/extension.ts` — replace:

```
      if (event.affectsConfiguration(SETTING_MAX_HEAP_MB)) worker.recycle();
```

with:

```
      if (event.affectsConfiguration(SETTING_MAX_HEAP_MB)) worker.recycle();
      if (event.affectsConfiguration(SETTING_CODELENS_ENABLED)) {
        codeLens.refresh();
      }
```

Run: `pnpm --filter code-spider-vscode typecheck`
Expected: no output, exit code 0.

Run: `pnpm --filter code-spider-vscode build`
Expected: `dist/extension.cjs` is now several MB (TypeScript is bundled), `worker.cjs` unchanged.

Run: `grep -c "init_declarations" packages/extension/dist/extension.cjs`
Expected: `2` or more: the declarations module is wrapped in a lazy initialiser
that only the dynamic `import()` calls, so TypeScript does not run at activation.

- [ ] **Step 6: Verify Shift+Alt+Q is unbound in VS Code's defaults (spec §8.1)**

The spec asks to check the shortcut before shipping. VS Code's default
keybindings are compiled into `workbench.desktop.main.js` as key codes, where a
chord is `Shift (1024) + Alt (512) + the key's code`, and `Q` is 47, so
Shift+Alt+Q is `1583`. This step downloads the pinned VS Code build (about 350
MB, once; Task 9 reuses it) and searches for that code. The check needs no
display and no Electron libraries.

Create `packages/extension/vscode-version.json`:

```json
{ "version": "1.141.0" }
```

Create `packages/extension/scripts/vscode.mjs`:

```js
import { readFileSync } from "node:fs";
import { downloadAndUnzipVSCode } from "@vscode/test-electron";

const pinned = JSON.parse(
  readFileSync(new URL("../vscode-version.json", import.meta.url), "utf8"),
);

/** The VS Code build the keybinding check and the smoke tests run against. */
export const VSCODE_VERSION = pinned.version;

/** Downloads the pinned build into .vscode-test once; returns its executable. */
export function downloadVSCode() {
  return downloadAndUnzipVSCode({
    version: VSCODE_VERSION,
    cachePath: ".vscode-test",
  });
}
```

Create `packages/extension/scripts/download-vscode.mjs`:

```js
import { downloadVSCode } from "./vscode.mjs";

console.log(await downloadVSCode());
```

Create `packages/extension/scripts/check-default-keybinding.mjs`:

```js
// Fails if Shift+Alt+Q is bound by default in the downloaded VS Code build.
// A chord is Shift (1024) + Alt (512) + the key code; KeyQ is 47, KeyF is 36.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SHIFT_ALT = 1024 + 512;
const SHIFT_ALT_Q = SHIFT_ALT + 47;
const SHIFT_ALT_F = SHIFT_ALT + 36;

const cache = ".vscode-test";
const install = readdirSync(cache).find((name) =>
  name.startsWith("vscode-linux-x64-"),
);
if (!install) {
  throw new Error(`No VS Code under ${cache}: run pnpm download:vscode first`);
}
const app = join(cache, install, "resources/app");
const bundle = readFileSync(
  join(app, "out/vs/workbench/workbench.desktop.main.js"),
  "utf8",
);

/** Occurrences of a key code used as a keybinding's primary or secondary key. */
function bindingsFor(code) {
  const pattern = new RegExp(`(?<![\\d.])${code}(?![\\d.])`, "g");
  const hits = [];
  for (const match of bundle.matchAll(pattern)) {
    const before = bundle.slice(Math.max(0, match.index - 40), match.index);
    if (/(primary|secondary)\W{0,4}$/.test(before)) hits.push(before + code);
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
```

Run: `pnpm --filter code-spider-vscode download:vscode`
Expected: downloads once (about a minute) and prints the path of the `code`
binary under `packages/extension/.vscode-test/vscode-linux-x64-1.141.0/`. The
directory is gitignored. If the download fails (offline), stop and report it.

Run: `pnpm --filter code-spider-vscode check:keybinding`
Expected: `Shift+Alt+Q is unbound by default in vscode-linux-x64-1.141.0`. If the
sanity check or the conflict check fails, stop and report the output: a
conflict means the user must pick a different default key.

- [ ] **Step 7: Full verification**

Run: `pnpm -r typecheck`
Expected: every package exits 0.

Run: `pnpm -r test`
Expected: all green: core 231, CLI 43, webview 53, extension 99.

Run: `pnpm build`
Expected: webview, then extension, with no warning messages.

- [ ] **Step 8: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: modified `packages/extension/package.json`,
`packages/extension/src/extension.ts`, `packages/extension/src/ids.ts`,
`packages/extension/test/manifest.test.ts`,
`packages/extension/test/support/manifest.ts`, `pnpm-lock.yaml`; new
`packages/extension/src/declarations.ts`,
`packages/extension/src/vscode/codelens.ts`,
`packages/extension/vscode-version.json`, the three files under
`packages/extension/scripts/` and the two new tests.
(`.vscode-test/` is gitignored and must not appear.)

Run: `git diff --check -- packages/extension pnpm-lock.yaml`
Expected: no output.

Run: `git diff -- packages/extension` and `git diff --stat -- pnpm-lock.yaml`
Expected: only the changes described in this task.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/extension); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `feat(extension): add Shift+Alt+Q, CodeLens and context-menu gestures`

The implementer does not stage or commit; the user does.

### Task 9: Smoke tests in a real VS Code, and the manual check list

**Files:**
- Create: `packages/extension/scripts/check-electron-libs.mjs`
- Create: `packages/extension/smoke/run.ts`
- Create: `packages/extension/smoke/suite/index.ts`
- Create: `packages/extension/smoke/suite/extension.smoke.ts`
- Create: `packages/extension/build-smoke.mjs`
- Modify: `packages/extension/package.json` (scripts `check:electron` and `test:smoke`; dev dependencies `mocha`, `@types/mocha`)
- Modify: `packages/extension/tsconfig.json` (mocha types, `smoke/` included, JSON imports)
- Modify: `pnpm-lock.yaml` (written by `pnpm install`)

**Interfaces:**
- Consumes (Task 8): `vscode-version.json`, `scripts/vscode.mjs`
  (`VSCODE_VERSION`, `downloadVSCode()`), the `.vscode-test/` cache.
- Consumes (Tasks 4 and 7): `ExtensionApi` from `src/extension.ts`:
  `currentGraph(): CurrentGraph | undefined` and
  `handleWebviewMessage(message: WebviewToExtension): Promise<void>`. The
  commands `codeSpider.showGraph` (accepts `(uri, position)`) and
  `codeSpider.showInCodeSpider`; the extension id is
  `code-spider.code-spider-vscode` (`publisher.name` in `package.json`).
- Produces: `pnpm --filter code-spider-vscode check:electron` (exit 0 when the
  pinned VS Code can start here, exit 2 with the exact `sudo apt install ...`
  command when it cannot) and `pnpm --filter code-spider-vscode test:smoke`
  (builds everything, launches VS Code with the extension and
  `test-code/basic` open, runs four mocha cases). The smoke tests are **not**
  part of `pnpm -r test`.
- The four cases (spec §9): the commands register; the panel opens beside the
  editor and analyses the function; clicking a node lands on the declaration;
  clicking an edge lands on the exact call site. Clicks are driven through
  `ExtensionApi.handleWebviewMessage`, the same entry point a webview click
  reaches, not through pixels. The webview's contents cannot be inspected from
  the extension host, so what the graph looks like is covered by the manual
  check list at the end of this task.

**Environment facts this task depends on (checked when the plan was written):**
- The machine is WSL2 with WSLg (`DISPLAY=:0`); there is no `xvfb-run`.
- The downloaded Electron needs `libnss3` and `libasound2`, which were not
  installed, and the implementer cannot use `sudo`.
- The shell that agents run in inherits `ELECTRON_RUN_AS_NODE` and many
  `VSCODE_*` variables from the editor. Left in place they make the downloaded
  Electron behave as plain Node (it fails with `Cannot find module
  '.../test-code/basic'`) and can attach it to the outer VS Code, so the smoke
  runner removes them from its own environment before launching.

- [ ] **Step 1: Prerequisite check (stop here if it fails)**

Create `packages/extension/scripts/check-electron-libs.mjs`:

```js
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
    console.error(
      "(On Ubuntu 24.04 the sound library package is libasound2t64.)",
    );
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
```

Edit `packages/extension/package.json` — replace:

```
    "check:keybinding": "node scripts/check-default-keybinding.mjs"
  },
```

with:

```
    "check:keybinding": "node scripts/check-default-keybinding.mjs",
    "check:electron": "node scripts/check-electron-libs.mjs",
    "test:smoke": "pnpm --workspace-root build && node build-smoke.mjs && node dist/smoke/run.cjs"
  },
```

Run: `pnpm --filter code-spider-vscode check:electron`
Expected on a ready machine: `VS Code 1.141.0 can start here.` and exit 0.

**If it exits 2, STOP.** Do not work around it: do not set `LD_LIBRARY_PATH`,
unpack packages by hand, or skip the smoke run. Report the script's output
verbatim to the coordinator, including its `sudo apt install -y ...` line (on
this machine the expected line is `sudo apt install -y libnss3 libasound2`),
and say that the rest of this task resumes at Step 2 once the user has run it.
The user installs the packages; the implementer cannot.

- [ ] **Step 2: Add the test dependencies and configuration**

Edit `packages/extension/package.json` — replace:

```
    "@types/node": "^26.5.0",
```

with:

```
    "@types/mocha": "^10.0.10",
    "@types/node": "^26.5.0",
```

Edit `packages/extension/package.json` — replace:

```
    "esbuild": "^0.28.2",
    "typescript"
```

with:

```
    "esbuild": "^0.28.2",
    "mocha": "^12.0.3",
    "typescript"
```

Replace `packages/extension/tsconfig.json` with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["node", "mocha"]
  },
  "include": ["src", "test", "smoke", "vitest.config.ts"]
}
```

Run: `pnpm install`
Expected: completes; the lockfile gains `mocha` and `@types/mocha`.

- [ ] **Step 3: Write the smoke runner and the suite**

Create `packages/extension/smoke/run.ts`:

```ts
import { join, resolve } from "node:path";
import { runTests } from "@vscode/test-electron";
import pinned from "../vscode-version.json";

/**
 * Started from VS Code's terminal (or an agent running inside VS Code), the
 * environment makes Electron behave as plain Node and attach to the outer
 * VS Code. The test instance must not inherit any of that.
 */
function scrubEditorEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    if (key === "ELECTRON_RUN_AS_NODE" || key.startsWith("VSCODE_")) {
      delete process.env[key];
    }
  }
}

async function main(): Promise<void> {
  scrubEditorEnvironment();
  const packageDir = resolve(__dirname, "../..");
  const workspace = resolve(packageDir, "../../test-code/basic");
  await runTests({
    version: pinned.version,
    extensionDevelopmentPath: packageDir,
    extensionTestsPath: join(packageDir, "dist/smoke/suite/index.cjs"),
    launchArgs: [
      workspace,
      "--disable-extensions",
      "--disable-workspace-trust",
    ],
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

Create `packages/extension/smoke/suite/index.ts`:

```ts
import { join } from "node:path";
import Mocha from "mocha";

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "bdd", color: true, timeout: 120_000 });
  mocha.addFile(join(__dirname, "extension.smoke.cjs"));
  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) reject(new Error(`${failures} smoke test(s) failed`));
      else resolve();
    });
  });
}
```

Create `packages/extension/smoke/suite/extension.smoke.ts`:

```ts
import assert from "node:assert/strict";
import * as vscode from "vscode";
import type { ExtensionApi } from "../../src/extension.js";

const EXTENSION_ID = "code-spider.code-spider-vscode";

async function activateExtension(): Promise<ExtensionApi> {
  const extension = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(extension, `extension ${EXTENSION_ID} is not installed`);
  return extension.isActive ? extension.exports : extension.activate();
}

async function openFile(relativePath: string): Promise<vscode.TextEditor> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "no workspace folder is open");
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(folder.uri, relativePath),
  );
  return vscode.window.showTextDocument(document, vscode.ViewColumn.One);
}

function activeEditor(): vscode.TextEditor {
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, "no text editor is active");
  return editor;
}

function graphPanelTab(): vscode.Tab | undefined {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview &&
        tab.input.viewType.endsWith("codeSpider.graph"),
    );
}

describe("Code Spider", () => {
  let api: ExtensionApi;

  before(async () => {
    api = await activateExtension();
  });

  it("registers the Show Graph commands", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("codeSpider.showGraph"));
    assert.ok(commands.includes("codeSpider.showInCodeSpider"));
  });

  it("opens the graph panel beside the editor and analyses the function", async () => {
    const editor = await openFile("src/signup.ts");
    const inside = editor.document.positionAt(
      editor.document.getText().indexOf("validateUser(input)") + 3,
    );

    await vscode.commands.executeCommand(
      "codeSpider.showGraph",
      editor.document.uri,
      inside,
    );

    assert.equal(
      api.currentGraph()?.slice.focusId,
      "src/signup.ts#handleSignup",
    );
    const tab = graphPanelTab();
    assert.ok(tab, "the Code Spider panel did not open");
    assert.notEqual(tab.group.viewColumn, vscode.ViewColumn.One);
  });

  it("jumps to the declaration when a node is clicked", async () => {
    await api.handleWebviewMessage({
      type: "openInEditor",
      nodeId: "src/signup.ts#validateUser",
    });

    const editor = activeEditor();
    assert.ok(editor.document.uri.path.endsWith("src/signup.ts"));
    assert.equal(editor.selection.start.line, 2);
    assert.ok(
      editor.document
        .getText(editor.selection)
        .startsWith("export function validateUser"),
    );
  });

  it("jumps to the exact call site when an edge is clicked", async () => {
    await api.handleWebviewMessage({
      type: "openCallSite",
      edgeId: "src/signup.ts#handleSignup->src/app.ts#main",
    });

    const editor = activeEditor();
    assert.ok(editor.document.uri.path.endsWith("src/app.ts"));
    assert.equal(editor.selection.start.line, 4);
    assert.equal(
      editor.document.getText(editor.selection),
      "handleSignup(input)",
    );
  });
});
```

Create `packages/extension/build-smoke.mjs`:

```js
import { build } from "esbuild";

await build({
  entryPoints: {
    run: "smoke/run.ts",
    "suite/index": "smoke/suite/index.ts",
    "suite/extension.smoke": "smoke/suite/extension.smoke.ts",
  },
  outdir: "dist/smoke",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode", "mocha", "@vscode/test-electron"],
  sourcemap: true,
  logLevel: "info",
});
```

Run: `pnpm --filter code-spider-vscode typecheck`
Expected: no output, exit code 0.

Run: `pnpm -r test`
Expected: all green and the smoke suite does not run: core 231, CLI 43,
webview 53, extension 99. (`vitest` only includes `test/**/*.test.ts`.)

- [ ] **Step 4: Run the smoke tests**

Run: `pnpm --filter code-spider-vscode test:smoke`
Expected: the workspace build runs, then a VS Code window opens briefly (VS Code
prints a lot of its own log noise), and mocha reports:

```
  Code Spider
    ✔ registers the Show Graph commands
    ✔ opens the graph panel beside the editor and analyses the function
    ✔ jumps to the declaration when a node is clicked
    ✔ jumps to the exact call site when an edge is clicked

  4 passing
```

and the command exits 0. The first run can take a minute while the analysis
worker loads the fixture project.

If VS Code fails to start (a missing library, no display, a crash before
mocha prints anything), STOP and report the exact output; do not add flags or
environment variables to work around it. If a test fails, the failure message
names the assertion: report it with the output instead of editing the
expected values.

- [ ] **Step 5: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: modified `packages/extension/package.json`,
`packages/extension/tsconfig.json`, `pnpm-lock.yaml`; new
`packages/extension/build-smoke.mjs`,
`packages/extension/scripts/check-electron-libs.mjs` and
`packages/extension/smoke/`. (`dist/` and `.vscode-test/` are gitignored.)

Run: `git diff --check -- packages/extension pnpm-lock.yaml`
Expected: no output.

Run: `git diff -- packages/extension` and `git diff --stat -- pnpm-lock.yaml`
Expected: only the script, dependency and tsconfig changes from Steps 1 and 2.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/extension); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `test(extension): add VS Code smoke tests for commands, panel and click-to-jump`

The implementer does not stage or commit; the user does.

### Manual check list for the user

The coordinator hands this to the user after Task 9's commit. It covers what the
automated tests cannot see: how the graph looks and behaves inside the webview.

1. Open the repo in VS Code, select "Run Code Spider" in Run and Debug and
   press F5. The launch task builds everything first, then an Extension
   Development Host opens on `test-code/basic`.
2. Open `src/signup.ts`. The status bar briefly shows "Code Spider: indexing",
   and a `⧉ Graph` CodeLens sits above each function.
3. Put the cursor inside `handleSignup` and press `Shift+Alt+Q`. A "Code Spider"
   panel opens beside the editor and shows `handleSignup` with a heavier outline.
   `validateUser`, `createUser` and `sendWelcome` sit to its left with edge
   labels `ValidUserData`, `User` and `void`; `main` and `retry` sit to its
   right. Each node shows a header (name left, parameter type right, an `async`
   badge where it applies) above its source.
4. Click the `validateUser` node: the editor jumps to line 3 with the
   declaration selected. Click the edge labelled `ValidUserData`: the editor
   jumps to the `validateUser(input)` call on line 17.
5. Right-click inside a function and choose "Show in Code Spider". Click a
   `⧉ Graph` lens above another function. Both refocus the same panel.
6. Type a character in a function without saving and press `Shift+Alt+Q`: a
   warning asks you to save first and the panel does not change.
7. Open `test-code/externals/src/uses.ts` (File > Open File) and focus
   `usesExternals`: `persist` from `tiny-lib` appears as a one-line chip with an
   empty right slot. Open `test-code/jsx/src/components.tsx` and focus `Page`:
   the `SignupForm` edge is purple and labelled `SignupFormProps`.
8. Switch between a dark and a light colour theme: the graph follows the theme.
9. In Settings, turn off `codeSpider.codeLens.enabled`: the lenses disappear.
10. Confirm `Shift+Alt+Q` is free in your own keybindings: open
    Keyboard Shortcuts (Ctrl+K Ctrl+S), search `shift+alt+q`, and check that
    only "Code Spider: Show Graph" is listed. (The default bindings were
    checked by `check:keybinding`; your own bindings and other extensions can
    still collide.)
11. Close the panel and run `Code Spider: Show Graph` from the command palette
    with the cursor in a function: the panel reopens beside the editor and
    shows that function's graph.
