# Code Spider — M3a Walking the Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to
> validate this plan and hand it to `subagent-driven-development` for
> task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user walk the graph from inside it. Expand and collapse a
neighbour in place (double-click), step Back, drag nodes (a dragged node is
pinned), Tidy, and spread the columns with a slider, with no overlap ever and one
readable type label per supplier. This is the first half of spec §10 M3. (Re-centring
stays with a click plus `Shift+Alt+Q`; see Plan decision 11.)

**Architecture:** The webview owns the view state (centre, merged slices,
expanded nodes, positions, pins, Back history, column gap) as plain data with
pure functions over it, persisted with the webview `setState`/`getState`. React
Flow stays mounted and takes its nodes from the current `GraphState`. New nodes
from an expansion are placed by our own column placement (never moving existing
nodes) instead of ELK. The extension analyses on request: one `sliceForNode`
worker request serves both re-centre and expansion, and a per-project jump table
remembers every node and edge sent to the panel so clicks on expanded or
restored nodes still jump. The protocol is defined once in
`packages/webview/src/protocol.ts` and imported type-only by the extension.

**Tech Stack:** TypeScript 5.6+ (strict, `noUncheckedIndexedAccess`), pnpm
workspaces, esbuild ^0.28 (CommonJS for extension and worker, IIFE for the
webview), React 19.3, `@xyflow/react` 12.12, `elkjs` 0.12 (`elk.bundled.js`),
Vitest 2, mocha 12 with `@vscode/test-electron` 3.1 (VS Code 1.141.0) for the
smoke tests. No new dependencies.

**Spec:** docs/superpowers/specs/2026-10-10-code-spider-m3a-design.md

## Status

All nine tasks are implemented, reviewed and committed, and an integration review
found the milestone ready (core 231, CLI 43, webview 290, extension 139, smoke 6).
Task 6 follows Plan decision 11 and Plan decision 12 lists the integration fixes.
Tasks 1 to 5 are written in full detail and Tasks 6 to 9 at plan level; the
`Create`/`Replace`/`Edit` block syntax applies to Tasks 1 to 5 only, and the counts
quoted inside them were true when each was written. Where the repository differs
from the code shown in Tasks 1 to 5, the repository is the source of truth, because
review fixes changed it after each task.

## Global Constraints

Every task's requirements include these.

**Scope (the spec; do not reopen).** M3a only. Out of scope, so do not build
them: the refresh button, the file watcher, zoom level of detail, sharing
line:col to offset through core, mixed-EOL offset drift (all M3b); truncation
"+N more", polish and the `.vsix` (M4); worker cancellation, merging slices from
different tsconfigs, forward history and staleness handling (not built at all).

**Repository rules (from the owner's instructions).**
- File size: aim for 300 lines or fewer; never more than 500. Split by
  responsibility.
- Minimal comments: comment only logic that is hard to follow, and prefer
  refactoring it into simpler code.
- Never stage, commit or push. Implementers do not commit; the owner commits one
  task at a time. Every task ends with a delta inspection and a proposed commit
  message. After a task is reviewed and approved, STOP.
- Never add a `Co-Authored-By` line or any other attribution trailer to commit
  messages or pull request descriptions.
- Commit messages are lowercase, imperative and short, like the repo's history:
  `add Shift+Alt+Q, CodeLens and context-menu gestures`, `drop codelens and
  other milestone fixes`.
- Style: Prettier defaults (double quotes, semicolons, trailing commas), two-space
  indent, matched by hand (Prettier is not installed and must not be added). The
  repository was formatted with a recent Prettier: a long template literal with
  `${...}` stays on one line.
- `packages/core` never imports `vscode`, and this plan changes core only by
  adding the `./types` export in Task 1. Theme only through `--vscode-*`
  variables. Node sizes stay analytic (never measured from the DOM). No
  `unsafe-eval`: ELK stays `elk.bundled.js`.
- The existing packages are `"type": "module"` with `.js` import specifiers and
  `moduleResolution: Bundler`. The extension and worker bundles are CommonJS
  (`.cjs`); the webview bundle is an IIFE.
- Code must pass the repo's strict TypeScript settings. Do not weaken
  `tsconfig.base.json`.

**Commands.**
- Typecheck everything: `pnpm -r typecheck` (the webview runs `tsc` twice from
  Task 1: `tsconfig.json` for `src` with `types: []`, then `tsconfig.test.json`;
  the extension also type-checks `smoke/`).
- Test everything: `pnpm -r test`. One package:
  `pnpm --filter @code-spider/webview test <name>` or
  `pnpm --filter code-spider-vscode test <name>` (names after the script, with
  no `--`).
- Build: `pnpm build` (runs every package's `build`).
- Smoke: `pnpm --filter code-spider-vscode check:electron` first (exit 0 means
  the pinned VS Code can start here; exit 2 prints the exact `sudo apt install`
  line, and the implementer stops and reports it), then
  `pnpm --filter code-spider-vscode test:smoke`. The smoke tests are not part of
  `pnpm -r test`.
- Every task leaves `pnpm -r typecheck` and `pnpm -r test` green, plus
  `pnpm build` where it touches a bundle. Baseline before Task 1: core 231, CLI
  43, extension 91, webview 53, smoke 4 passing.

**Version pins already in use** (do not change): `react` and `react-dom`
^19.3.0, `@xyflow/react` ^12.12.0, `elkjs` ^0.12.0, `esbuild` ^0.28.2,
`@types/vscode` and `engines.vscode` ^1.140.0 with VS Code 1.141.0 for the smoke
tests (`packages/extension/vscode-version.json`), `@vscode/test-electron`
^3.1.0, `mocha` ^12.0.3, `typescript` ^5.6.0, `vitest` ^2.1.0, `@types/node`
^26.5.0. This plan adds no dependency and no lockfile change.

**The protocol** is defined once in `packages/webview/src/protocol.ts` and the
extension imports it type-only (`import type ... from
"@code-spider/webview/protocol"`). The single deliberate exception is the pure
value module `packages/webview/src/column-gap.ts`, exported as
`@code-spider/webview/column-gap` and imported at runtime by the extension in
Task 7. From Task 1 the webview's `src/` reaches core only through
`import type ... from "@code-spider/core/types"`.

**How to run things.**
- A shell command starts in an unknown directory: begin every Bash command with
  `cd /home/motodox/code/AlekP141/code-spider && `. The paths in this plan are
  relative to that directory; file tools need the absolute path (prepend it).
- Block syntax: `Create` writes a new file with exactly the code shown;
  `Replace ... with` overwrites a file with exactly the code shown; `Edit ...
  replace: ... with:` replaces the old text (which occurs exactly once) with the
  new text; `Edit ... replace lines A-B` replaces exactly those lines; `Delete`
  removes the file. Do not "improve" the code while copying it. If something
  fails to compile or a test fails, report it.
- `git status` may show the untracked M3a spec. It is not part of any task;
  leave it alone.
- Delta inspection: `git diff` and `git diff --check` do not show untracked
  files, so each task's last step also runs
  `for f in $(git ls-files --others --exclude-standard -- <paths>); do git diff --no-index --check -- /dev/null "$f"; done`.
  An exit status of 1 from `git diff --no-index` only means the file differs
  from `/dev/null`; whitespace warnings are what matter.

**Environment facts** (from M2). Ubuntu 22.04 on WSL2 with WSLg (`DISPLAY=:0`),
Node 23.9, pnpm 11.24. The shell agents run in inherits `ELECTRON_RUN_AS_NODE`
and `VSCODE_*` variables from the editor; the smoke runner already removes them.

## Agent Execution Contract

- Each task uses exactly one isolated `workflow-implementer` (Haiku, `high`)
  implementer and exactly one independent read-only `workflow-reviewer` (Sonnet,
  `high`) reviewer.
- Reuse both task agents with `SendMessage` for every fix and re-review.
- After two failed fix rounds on the same substantive issue, stop and ask
  whether to replace that task's implementer with a Sonnet `workflow-author`;
  keep the same reviewer. Never replace an unresumable task agent silently.
- This is a multi-task plan, so it uses one fresh `workflow-reviewer` (Sonnet,
  `high`) integration reviewer, reused for all integration rechecks.
- After each task is reviewed and approved, STOP so the user can commit before
  the next task starts. Task 6 also waits for the owner's manual check 5 (see
  that task).

## Plan decisions

Where the spec's outline and the code as it exists disagree, the plan follows the
reading most consistent with the spec's intent:

1. **`applyExpansion` and `acceptExpansion` are built in Task 4, not Task 3.**
   They place the new nodes, so they need `placeExpansion`, which the outline
   puts in Task 4. They live in a new `view/expansion.ts`; Task 3 keeps
   `mergeExpansion` and the rest of the model.
2. **`column-gap.ts` (the webview module and its `./column-gap` export) is built
   in Task 3.** The view state's default `columnGap` and Task 5's layout need
   `COLUMN_GAP.default`. Task 7 keeps the extension store, the slider, `settings`
   and `setColumnGap`.
3. **The dispatcher ignores `setColumnGap` until Task 7.** The protocol and the
   parser accept it from Task 2; Task 7 gives the dispatcher its store.
4. **`acceptExpansion` returns `{ view, added }`**, not just the view: the added
   ids drive the fade-in and the pan to reveal (Task 6). A rejected answer
   returns the very same `view` object and no ids.
5. **The "not mid-drag" rule for `setState` is met by construction.** Live drag
   positions stay in the canvas until the drag ends and only then enter the view
   state, so the debounced save can never capture a half-finished drag; there is
   no separate dragging flag.
6. **The history skip is judged against the new centre.** A previous graph is
   dropped from the history only if it has the same `project` and `focusId` as
   the graph replacing it, no expansions and no pins (re-centring on the same
   node would rebuild it).
7. **`JumpHandler` is rebuilt around a `JumpLookup`** (`nodeTarget`,
   `callSiteTarget`); `nodeJumpTarget` and `callSiteJumpTarget` now take a repo
   root and the node or edge, because the table holds maps, not one slice.
8. **`session.test.ts` is split** (shared setup in `test/support/session-setup.ts`,
   the new tests in `session-nodes.test.ts`) to keep every file under 500 lines.
9. **Spec section 2 lists changes to the main spec** (§4.3, §7.5 and the label
   text). Task 9 applies them to `docs/superpowers/specs/2026-08-22-code-spider-design.md`
   and marks the M3a items in its §10 M3 list; the M3a spec does not mention
   §10 explicitly, so this follows the brief.
10. **Smoke case 2 starts from a cleared jump table.** The spec's second smoke
    case expects `createUser` to be known only through the expansion, but the
    table keeps every slice sent since the panel opened and the earlier cases
    already sent `createUser`. Task 9 closes the panel (which clears the table)
    and reopens it on `validateUser` first.
11. **Double-click toggles; no re-centre inside the graph (owner, during Task 6).**
    After trying Task 6 as first built, the owner decided: (a) a double-click on a
    function or component box other than the centre expands it when collapsed and
    collapses it when expanded, does nothing on a loading box, the centre or an
    `external`, `unknown` or `module` box, and ignores expanding while `busy`
    (collapsing works); (b) there are no `[+]` or `[−]` buttons, while the spinner,
    the failure strip and the pin icon stay; (c) the webview no longer re-centres: a
    double-click never posts `focus` and there is no `[◎]` button or fallback, so the
    user clicks a box and presses `Shift+Alt+Q` in the editor. The protocol's `focus`
    and the extension's `focusNode` stay as Task 2 built them. Tasks 6 and 9 follow it;
    Tasks 1 to 5 are unchanged and mention buttons and double-click only as work for
    later tasks.
12. **Integration fixes after Task 9.**
    - The webview counts itself as working while `busy` or while a centre waits for
      its layout (`isWorking`); that disables Back and double-click expand and keeps
      the spinner showing.
    - A worker crash shows one notification, not one per in-flight request.
    - `GraphState` has an optional `columnGap`, the gap its positions were laid out
      with, set on a centre commit and on Tidy; the labels use it, so a graph
      restored by Back keeps labels that fit its layout.
    - `packages/webview/test/tsconfig.json` extends `../tsconfig.test.json`, so
      editors type-check test files with the strict settings.
    - An expansion is placed with the graph's own `columnGap` (falling back to the
      view's gap), so new columns line up with that graph, including one restored
      by Back.
    - Parked for the owner: no automated test loads the real webview and drives it.
      That needs a DOM or Electron harness, to be decided at the start of M3b.
13. **The Spacing slider also sets the vertical gap (owner, after the milestone).**
    There is one slider and one stored value. The vertical gap between boxes is
    derived from it: `rowGap(columnGap) = Math.max(16, Math.round(columnGap / 6))`
    in `packages/webview/src/column-gap.ts`, so 192 gives 32 px (the earlier look),
    32 gives 16 px and 480 gives 80 px. It is used for ELK's `elk.spacing.nodeNode`
    (a new centre and Tidy), for the spacing and clearance of an expansion's new
    boxes, and for Tidy's displacement around pinned boxes. The fixed `NODE_MARGIN`
    of 32 is gone; where Tasks 4, 5 and 7 mention `NODE_MARGIN` or a fixed `"32"`,
    this entry wins.

---

### Task 1: Types-only core entry

The webview type-checks `src/` with `types: []` (no Node types) so that nothing
in the browser bundle can quietly reach for `node:` modules. Today that fails
because `src/` imports types through `@code-spider/core`'s index, which drags in
`ts-morph` and the `node:` imports behind it. A types-only entry fixes that. No
behaviour changes in this task.

**Files:**
- Modify: `packages/core/package.json` (exports `./types`)
- Modify: `packages/webview/package.json` (`typecheck` runs both configs)
- Modify: `packages/webview/tsconfig.json` (`src` only, `types: []`)
- Create: `packages/webview/tsconfig.test.json` (src, test and `vitest.config.ts`, `types: ["node"]`)
- Modify: `packages/webview/src/app-state.ts` (line 1)
- Modify: `packages/webview/src/protocol.ts` (line 1)
- Modify: `packages/webview/src/graph/edge-appearance.ts` (line 1)
- Modify: `packages/webview/src/graph/GraphView.tsx` (line 1)
- Modify: `packages/webview/src/graph/jump.ts` (line 1)
- Modify: `packages/webview/src/graph/node-size.ts` (line 1)
- Modify: `packages/webview/src/graph/NodeBox.tsx` (line 1)
- Modify: `packages/webview/src/graph/to-flow.ts` (line 1)
- Modify: `packages/webview/src/graph/use-layout.ts` (line 1)
- Test: `packages/webview/test/core-types-entry.test.ts`

**Interfaces:**
- Consumes: `packages/core/src/types.ts`, which exports `NodeId`, `Range`,
  `NodeKind`, `GraphNode`, `EdgeType`, `GraphEdge` and `GraphSlice` and imports
  nothing.
- Produces:
  - `@code-spider/core/types`, resolving to `packages/core/src/types.ts`. From
    this task on, every import in `packages/webview/src/` that reaches core uses
    it, always as `import type`.
  - `pnpm --filter @code-spider/webview typecheck` runs two configs: the
    default `tsconfig.json` (`src` only, no ambient types, so `node:` modules do
    not resolve) and `tsconfig.test.json` (adds `test` and `vitest.config.ts`
    with Node types).
  - Test code in `packages/webview/test/` keeps importing `@code-spider/core`
    when it needs a runtime value (`node-size.test.ts` reads
    `CODE_PREVIEW_MAX_LINES`); only `src/` is restricted.
- Webview tests after this task: 55 (53 plus 2).

- [ ] **Step 1: Write the failing guard test**

Create `packages/webview/test/core-types-entry.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(packageDir, "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const imports = sourceFiles(srcDir).flatMap((file) =>
  [
    ...readFileSync(file, "utf8").matchAll(
      /^import\b[^;]*?\bfrom\s+"([^"]+)";/gm,
    ),
  ].map(([statement, specifier]) => ({
    file: relative(packageDir, file),
    statement: statement ?? "",
    specifier: specifier ?? "",
  })),
);

describe("webview imports from core", () => {
  it("never reaches the core index, which pulls in ts-morph and node modules", () => {
    const offenders = imports
      .filter((entry) => entry.specifier === "@code-spider/core")
      .map((entry) => entry.file);
    expect(offenders).toEqual([]);
  });

  it("imports from the types entry as types only", () => {
    const offenders = imports
      .filter((entry) => entry.specifier === "@code-spider/core/types")
      .filter((entry) => !entry.statement.startsWith("import type "))
      .map((entry) => entry.file);
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @code-spider/webview test core-types-entry`
Expected: FAIL. The first test reports the nine `src/` files that import
`@code-spider/core` (`src/app-state.ts`, `src/protocol.ts` and seven under
`src/graph/`); the second test passes because nothing uses the types entry yet.

- [ ] **Step 3: Add the types entry to core and switch the nine imports**

Edit `packages/core/package.json` — replace:

```
  "exports": {
    ".": "./src/index.ts"
  },
```

with:

```
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts"
  },
```

Each of the following nine edits replaces the same single line in a different
file (the line occurs once in each).

Edit `packages/webview/src/app-state.ts` — replace:

```
import type { GraphSlice } from "@code-spider/core";
```

with:

```
import type { GraphSlice } from "@code-spider/core/types";
```

Edit `packages/webview/src/protocol.ts` — replace:

```
import type { GraphSlice, NodeId } from "@code-spider/core";
```

with:

```
import type { GraphSlice, NodeId } from "@code-spider/core/types";
```

Edit `packages/webview/src/graph/edge-appearance.ts` — replace:

```
import type { EdgeType } from "@code-spider/core";
```

with:

```
import type { EdgeType } from "@code-spider/core/types";
```

Edit `packages/webview/src/graph/GraphView.tsx` — replace:

```
import type { GraphSlice } from "@code-spider/core";
```

with:

```
import type { GraphSlice } from "@code-spider/core/types";
```

Edit `packages/webview/src/graph/jump.ts` — replace:

```
import type { GraphNode } from "@code-spider/core";
```

with:

```
import type { GraphNode } from "@code-spider/core/types";
```

Edit `packages/webview/src/graph/node-size.ts` — replace:

```
import type { GraphNode } from "@code-spider/core";
```

with:

```
import type { GraphNode } from "@code-spider/core/types";
```

Edit `packages/webview/src/graph/NodeBox.tsx` — replace:

```
import type { GraphNode } from "@code-spider/core";
```

with:

```
import type { GraphNode } from "@code-spider/core/types";
```

Edit `packages/webview/src/graph/to-flow.ts` — replace:

```
import type { GraphNode, GraphSlice } from "@code-spider/core";
```

with:

```
import type { GraphNode, GraphSlice } from "@code-spider/core/types";
```

Edit `packages/webview/src/graph/use-layout.ts` — replace:

```
import type { GraphSlice } from "@code-spider/core";
```

with:

```
import type { GraphSlice } from "@code-spider/core/types";
```

- [ ] **Step 4: Split the webview typecheck into a source config and a test config**

Replace `packages/webview/tsconfig.json` with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": []
  },
  "include": ["src"]
}
```

Create `packages/webview/tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

Edit `packages/webview/package.json` — replace:

```
    "typecheck": "tsc --noEmit"
```

with:

```
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.test.json"
```

- [ ] **Step 5: Run the guard test, the typecheck and the whole suite**

Run: `pnpm --filter @code-spider/webview test core-types-entry`
Expected: PASS, 2 tests.

Run: `pnpm -r typecheck`
Expected: no errors in any package. The webview step runs `tsc` twice. If the
first run reports `Cannot find module 'node:path'`, an import still reaches
core's index: find it with `grep -rn 'from "@code-spider/core"' packages/webview/src`.

Run: `pnpm -r test`
Expected: all green. Counts: core 231, CLI 43, extension 91, webview 55. (Read
each package's own `Tests` line; `pnpm -r test` prints them one after another.)

Run: `pnpm build`
Expected: completes with no errors. The webview bundle is unchanged because the
swapped imports are type-only.

- [ ] **Step 6: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: modified `packages/core/package.json`, `packages/webview/package.json`,
`packages/webview/tsconfig.json` and the nine `packages/webview/src` files; new
`packages/webview/tsconfig.test.json` and
`packages/webview/test/core-types-entry.test.ts`. (The M3a spec is untracked and
is not part of any task; leave it alone.)

Run: `git diff --check -- packages/core packages/webview`
Expected: no output.

Run: `git diff -- packages/core packages/webview`
Expected: only the changes from Steps 3 and 4.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/webview); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `add a types-only core entry and type-check the webview without node types`

The implementer does not stage or commit; the user does.

### Task 2: Protocol, worker slices and extension plumbing

This task changes the message protocol and everything on the extension side that
speaks it: the worker learns to slice around any node of a known project, the
session can re-centre and expand on request, and click-to-jump resolves ids
through a table that remembers every slice sent to the panel. The webview gets
only the smallest change that keeps M2 working: it takes `centre` slices,
ignores `expansion` ones and sends `project` with every jump. Later tasks build
the real webview state on top.

**Files:**
- Modify: `packages/webview/src/protocol.ts` (replace: new message shapes)
- Modify: `packages/webview/src/messages.ts` (replace: validate the new shapes)
- Modify: `packages/webview/src/app-state.ts` (replace: `centre` instead of `slice`, ignore expansions)
- Modify: `packages/webview/src/App.tsx` (lines 40-42: pass the project)
- Modify: `packages/webview/src/graph/GraphView.tsx` (lines 15-45: take and send the project)
- Modify: `packages/webview/src/graph/jump.ts` (replace: jump messages carry the project)
- Modify: `packages/extension/src/worker/protocol.ts` (replace)
- Modify: `packages/extension/src/worker/project-cache.ts` (lines 32-40: `openTsconfig`)
- Modify: `packages/extension/src/worker/handler.ts` (replace)
- Modify: `packages/extension/src/worker/worker-client.ts` (lines 1-60 and 75-77: `sliceForNode`)
- Modify: `packages/extension/src/ports.ts` (replace)
- Modify: `packages/extension/src/navigation.ts` (replace: table-backed `JumpHandler`)
- Create: `packages/extension/src/jump-table.ts`
- Modify: `packages/extension/src/session.ts` (replace: `focusNode`, `expand`, table)
- Create: `packages/extension/src/dispatch.ts`
- Modify: `packages/extension/src/panel/message-gate.ts` (replace: content and ephemeral rules)
- Modify: `packages/extension/src/panel/messages.ts` (replace: validate the new shapes)
- Modify: `packages/extension/src/panel/graph-panel.ts` (lines 17-20 and 55-58: `onClosed`)
- Modify: `packages/extension/src/extension.ts` (lines 1-90: wire table, dispatcher, `onClosed`)
- Modify: `packages/extension/smoke/suite/extension.smoke.ts` (lines 72-105: send `project`)
- Test (webview): `packages/webview/test/messages.test.ts`, `packages/webview/test/app-state.test.ts`, `packages/webview/test/jump.test.ts` (replace all three)
- Test (extension): `packages/extension/test/jump-table.test.ts` (create), `dispatch.test.ts` (create), `navigation.test.ts`, `message-gate.test.ts`, `webview-messages.test.ts` (replace), `session.test.ts`, `worker-handler.test.ts`, `worker-client.test.ts`, `worker-integration.test.ts` (modify)

**Interfaces:**
- Consumes: `expandNode(project: Project, nodeId: NodeId, repoRoot: string):
  GraphSlice` from `@code-spider/core`, which throws `Node not found: <id>` for
  an id the project cannot resolve and `Node is not expandable: <id>` for
  `external:`, `unknown:` and `#<module>` ids. Consumes everything Task 1
  produced.
- Produces (`packages/webview/src/protocol.ts`, the one definition; the extension
  imports it type-only):

  ```ts
  export type SliceMode =
    | { kind: "centre" }
    | { kind: "expansion"; nodeId: NodeId; generation: number };

  export type ExtensionToWebview =
    | { type: "slice"; slice: GraphSlice; project: string; mode: SliceMode }
    | { type: "expandFailed"; nodeId: NodeId; generation: number; message: string }
    | { type: "analysisError"; message: string }
    | { type: "busy"; busy: boolean }
    | { type: "indexing"; indexing: boolean }
    | { type: "settings"; columnGap: number };

  export type WebviewToExtension =
    | { type: "ready" }
    | { type: "openInEditor"; project: string; nodeId: NodeId }
    | { type: "openCallSite"; project: string; edgeId: string }
    | { type: "focus"; project: string; nodeId: NodeId }
    | { type: "expand"; project: string; nodeId: NodeId; generation: number }
    | { type: "setColumnGap"; value: number }
    | { type: "refresh" };
  ```

  `project` is the absolute path of the tsconfig that produced a slice. The
  webview copies it from the slice and sends it on every message that names a
  node or an edge.
- Produces (worker, `packages/extension/src/worker/protocol.ts`):
  `FocusResult = { slice: GraphSlice; repoRoot: string; tsconfig: string }`,
  `ExpandResult = FocusResult`, `SliceForNodeRequest = { kind: "sliceForNode";
  tsconfig: string; nodeId: NodeId; changedFiles: string[] }`, the
  `WorkerRequestBody` union of the three request bodies (`WorkerRequest` is that
  plus `id`), and a `{ id: number; kind: "sliced"; result: ExpandResult }`
  response.
- Produces: `ProjectCache.openTsconfig(tsconfig: string): ProjectEntry` (reuses
  the warm project, reloads it when evicted, applies pending changed files, never
  calls `findTsconfig`); `WorkerClient.sliceForNode(tsconfig: string, nodeId:
  NodeId, changedFiles: string[]): Promise<ExpandResult>`;
  `AnalysisPort.sliceForNode` with the same signature.
- Produces: `JumpTable` in `src/jump-table.ts` with `add(project: string,
  result: FocusResult): void`, `has(project: string): boolean`,
  `nodeTarget(project: string, nodeId: NodeId): JumpTarget | undefined`,
  `callSiteTarget(project: string, edgeId: string): JumpTarget | undefined` and
  `clear(): void`. `JumpRegistry` (`add`, `has`) and `JumpLookup` (`nodeTarget`,
  `callSiteTarget`) are the interfaces the session and `JumpHandler` depend on.
- Produces: `GraphSession.focusNode(request: NodeRequest): Promise<void>` and
  `GraphSession.expand(request: ExpandRequest): Promise<void>` with `NodeRequest
  = { project: string; nodeId: NodeId }` and `ExpandRequest = NodeRequest &
  { generation: number }`. `SessionDeps` gains `jumps: JumpRegistry`.
- Produces: `createDispatcher({ jumps, session }): (message:
  WebviewToExtension) => Promise<void>` in `src/dispatch.ts`. `setColumnGap` is
  accepted by the protocol and the parser but the dispatcher ignores it until
  Task 7 gives it a store.
- Produces: `GraphPanel` takes a third constructor argument `onClosed: () =>
  void`, run when the panel is disposed.
- Produces: `MessageGate` rules. A `centre` slice and `analysisError` are
  *content*: kept only while the webview is not ready, delivered once on the
  first `ready`, then forgotten. An `expansion` slice and `expandFailed` are
  *ephemeral*: sent when ready, dropped otherwise. `settings`, `indexing` and
  `busy` replay on every `ready`, in the order settings, indexing, busy,
  content.
- Tests after this task: core 231, CLI 43, webview 58, extension 127, smoke 4
  (the four cases now send `project`; they run in Task 9).

- [ ] **Step 1: Webview protocol, validation and the minimal reducer change**

Write the webview side first. Its tests describe the new protocol.

Replace `packages/webview/test/messages.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { isExtensionMessage } from "../src/messages.js";

const slice = { focusId: "a#b", nodes: [], edges: [], truncated: false };
const project = "/repo/tsconfig.json";

describe("isExtensionMessage", () => {
  it("accepts each extension-to-webview message", () => {
    const centre = { type: "slice", slice, project, mode: { kind: "centre" } };
    const expansion = {
      type: "slice",
      slice,
      project,
      mode: { kind: "expansion", nodeId: "a#b", generation: 3 },
    };
    expect(isExtensionMessage(centre)).toBe(true);
    expect(isExtensionMessage(expansion)).toBe(true);
    expect(
      isExtensionMessage({
        type: "expandFailed",
        nodeId: "a#b",
        generation: 3,
        message: "x",
      }),
    ).toBe(true);
    expect(isExtensionMessage({ type: "analysisError", message: "x" })).toBe(
      true,
    );
    expect(isExtensionMessage({ type: "busy", busy: true })).toBe(true);
    expect(isExtensionMessage({ type: "indexing", indexing: false })).toBe(
      true,
    );
    expect(isExtensionMessage({ type: "settings", columnGap: 192 })).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(isExtensionMessage(undefined)).toBe(false);
    expect(isExtensionMessage("busy")).toBe(false);
    expect(isExtensionMessage({ type: "busy", busy: "yes" })).toBe(false);
    expect(isExtensionMessage({ type: "analysisError" })).toBe(false);
    expect(isExtensionMessage({ type: "settings", columnGap: "wide" })).toBe(
      false,
    );
    expect(isExtensionMessage({ type: "expandFailed", nodeId: "a#b" })).toBe(
      false,
    );
    expect(isExtensionMessage({ type: "unknown" })).toBe(false);
  });

  it("rejects a slice without a project or with a malformed mode", () => {
    const mode = { kind: "centre" };
    expect(isExtensionMessage({ type: "slice", mode })).toBe(false);
    expect(
      isExtensionMessage({ type: "slice", slice: null, project, mode }),
    ).toBe(false);
    expect(isExtensionMessage({ type: "slice", slice, mode })).toBe(false);
    expect(isExtensionMessage({ type: "slice", slice, project })).toBe(false);
    expect(
      isExtensionMessage({
        type: "slice",
        slice,
        project,
        mode: { kind: "x" },
      }),
    ).toBe(false);
    expect(
      isExtensionMessage({
        type: "slice",
        slice,
        project,
        mode: { kind: "expansion", nodeId: "a#b" },
      }),
    ).toBe(false);
  });
});
```

Replace `packages/webview/test/app-state.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { initialState, reduceMessage } from "../src/app-state.js";

const slice = { focusId: "a#b", nodes: [], edges: [], truncated: false };
const project = "/repo/tsconfig.json";
const centre = {
  type: "slice",
  slice,
  project,
  mode: { kind: "centre" },
} as const;

describe("reduceMessage", () => {
  it("starts empty", () => {
    expect(initialState).toEqual({
      centre: undefined,
      error: undefined,
      busy: false,
      indexing: false,
    });
  });

  it("stores a centre slice with its project and clears an earlier error", () => {
    const failed = reduceMessage(initialState, {
      type: "analysisError",
      message: "boom",
    });
    const next = reduceMessage(failed, centre);
    expect(next.centre).toEqual({ slice, project });
    expect(next.error).toBeUndefined();
  });

  it("ignores an expansion slice, which only a later task merges", () => {
    const withCentre = reduceMessage(initialState, centre);
    const next = reduceMessage(withCentre, {
      type: "slice",
      slice: { ...slice, focusId: "a#other" },
      project,
      mode: { kind: "expansion", nodeId: "a#other", generation: 1 },
    });
    expect(next).toBe(withCentre);
  });

  it("keeps the previous graph when an error arrives", () => {
    const withCentre = reduceMessage(initialState, centre);
    const next = reduceMessage(withCentre, {
      type: "analysisError",
      message: "boom",
    });
    expect(next.centre).toEqual({ slice, project });
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

  it("leaves the state alone for expandFailed and settings", () => {
    expect(
      reduceMessage(initialState, {
        type: "expandFailed",
        nodeId: "a#b",
        generation: 1,
        message: "gone",
      }),
    ).toBe(initialState);
    expect(
      reduceMessage(initialState, { type: "settings", columnGap: 192 }),
    ).toBe(initialState);
  });
});
```

Replace `packages/webview/test/jump.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { edgeClickMessage, nodeClickMessage } from "../src/graph/jump.js";
import { makeNode } from "./support/slices.js";

const project = "/repo/tsconfig.json";

describe("nodeClickMessage", () => {
  it("asks the extension to open a repo function at its declaration", () => {
    const node = makeNode({ id: "src/a.ts#f", file: "src/a.ts" });
    expect(nodeClickMessage(node, project)).toEqual({
      type: "openInEditor",
      project,
      nodeId: "src/a.ts#f",
    });
  });

  it("opens module and component nodes too", () => {
    expect(
      nodeClickMessage(
        makeNode({ id: "src/m.tsx#<module>", kind: "module" }),
        project,
      ),
    ).toEqual({ type: "openInEditor", project, nodeId: "src/m.tsx#<module>" });
    expect(
      nodeClickMessage(
        makeNode({ id: "src/c.tsx#C", kind: "component" }),
        project,
      ),
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
    expect(nodeClickMessage(external, project)).toBeUndefined();
    expect(nodeClickMessage(unknown, project)).toBeUndefined();
  });
});

describe("edgeClickMessage", () => {
  it("asks the extension to open the call site of the edge", () => {
    expect(edgeClickMessage("a#f->a#g", project)).toEqual({
      type: "openCallSite",
      project,
      edgeId: "a#f->a#g",
    });
  });
});
```

Run the three files and watch them fail:

Run: `pnpm --filter @code-spider/webview test messages app-state jump`
Expected: FAIL. `messages.test.ts` rejects the new slice shape, `app-state.test.ts`
reports `centre` missing from the state, and `jump.test.ts` expects messages
carrying `project`. (Type errors do not stop vitest; the assertions fail.)

Now the implementation. Replace `packages/webview/src/protocol.ts`:

Replace `packages/webview/src/protocol.ts` with:

```ts
import type { GraphSlice, NodeId } from "@code-spider/core/types";

export type SliceMode =
  | { kind: "centre" }
  | { kind: "expansion"; nodeId: NodeId; generation: number };

export type ExtensionToWebview =
  | { type: "slice"; slice: GraphSlice; project: string; mode: SliceMode }
  | {
      type: "expandFailed";
      nodeId: NodeId;
      generation: number;
      message: string;
    }
  | { type: "analysisError"; message: string }
  | { type: "busy"; busy: boolean }
  | { type: "indexing"; indexing: boolean }
  | { type: "settings"; columnGap: number };

/** `refresh` is in the spec's protocol; M3b handles it. */
export type WebviewToExtension =
  | { type: "ready" }
  | { type: "openInEditor"; project: string; nodeId: NodeId }
  | { type: "openCallSite"; project: string; edgeId: string }
  | { type: "focus"; project: string; nodeId: NodeId }
  | { type: "expand"; project: string; nodeId: NodeId; generation: number }
  | { type: "setColumnGap"; value: number }
  | { type: "refresh" };
```

Replace `packages/webview/src/messages.ts` with:

```ts
import type { ExtensionToWebview, SliceMode } from "./protocol.js";

function isMode(value: unknown): value is SliceMode {
  if (typeof value !== "object" || value === null) return false;
  const mode = value as Record<string, unknown>;
  if (mode.kind === "centre") return true;
  return (
    mode.kind === "expansion" &&
    typeof mode.nodeId === "string" &&
    typeof mode.generation === "number"
  );
}

export function isExtensionMessage(
  value: unknown,
): value is ExtensionToWebview {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case "slice":
      return (
        typeof message.slice === "object" &&
        message.slice !== null &&
        typeof message.project === "string" &&
        isMode(message.mode)
      );
    case "expandFailed":
      return (
        typeof message.nodeId === "string" &&
        typeof message.generation === "number" &&
        typeof message.message === "string"
      );
    case "analysisError":
      return typeof message.message === "string";
    case "busy":
      return typeof message.busy === "boolean";
    case "indexing":
      return typeof message.indexing === "boolean";
    case "settings":
      return (
        typeof message.columnGap === "number" &&
        Number.isFinite(message.columnGap)
      );
    default:
      return false;
  }
}
```

Replace `packages/webview/src/app-state.ts` with:

```ts
import type { GraphSlice } from "@code-spider/core/types";
import type { ExtensionToWebview } from "./protocol.js";

export type AppState = {
  centre: { slice: GraphSlice; project: string } | undefined;
  error: string | undefined;
  busy: boolean;
  indexing: boolean;
};

export const initialState: AppState = {
  centre: undefined,
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
      if (message.mode.kind !== "centre") return state;
      return {
        ...state,
        centre: { slice: message.slice, project: message.project },
        error: undefined,
      };
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
    case "expandFailed":
    case "settings":
      return state;
  }
}
```

Replace `packages/webview/src/graph/jump.ts` with:

```ts
import type { GraphNode } from "@code-spider/core/types";
import type { WebviewToExtension } from "../protocol.js";

/** External and unknown nodes have no source file to open. */
export function nodeClickMessage(
  node: GraphNode,
  project: string,
): WebviewToExtension | undefined {
  if (node.file === "") return undefined;
  return { type: "openInEditor", project, nodeId: node.id };
}

export function edgeClickMessage(
  edgeId: string,
  project: string,
): WebviewToExtension {
  return { type: "openCallSite", project, edgeId };
}
```

Edit `packages/webview/src/App.tsx` — replace:

```
        {state.slice ? (
          <GraphView slice={state.slice} onJump={postToExtension} />
        ) : (
```

with:

```
        {state.centre ? (
          <GraphView
            slice={state.centre.slice}
            project={state.centre.project}
            onJump={postToExtension}
          />
        ) : (
```

Edit `packages/webview/src/graph/GraphView.tsx` — replace:

```
export type GraphViewProps = {
  slice: GraphSlice;
  onJump: (message: WebviewToExtension) => void;
};

export function GraphView({ slice, onJump }: GraphViewProps) {
```

with:

```
export type GraphViewProps = {
  slice: GraphSlice;
  project: string;
  onJump: (message: WebviewToExtension) => void;
};

export function GraphView({ slice, project, onJump }: GraphViewProps) {
```

Edit `packages/webview/src/graph/GraphView.tsx` — replace:

```
          const message = nodeClickMessage(node.data.node);
          if (message) onJump(message);
        }}
        onEdgeClick={(_event, edge) => onJump(edgeClickMessage(edge.id))}
```

with:

```
          const message = nodeClickMessage(node.data.node, project);
          if (message) onJump(message);
        }}
        onEdgeClick={(_event, edge) =>
          onJump(edgeClickMessage(edge.id, project))
        }
```

Run: `pnpm --filter @code-spider/webview test`
Expected: PASS, 58 tests.

Run: `pnpm --filter @code-spider/webview typecheck`
Expected: no output, exit code 0.

- [ ] **Step 2: Worker protocol, project cache, handler and client**

From here until Step 6 the extension package does not typecheck (the protocol
has changed under it); run only its vitest suite until Step 6 says otherwise.

Write the tests first. They extend the existing worker test files.

Edit `packages/extension/test/worker-handler.test.ts` — replace:

```
    expect(response.result.repoRoot).toBe(fixturePath("basic"));
  });
```

with:

```
    expect(response.result.repoRoot).toBe(fixturePath("basic"));
    expect(response.result.tsconfig).toBe(basicTsconfig);
  });
```

Edit `packages/extension/test/worker-handler.test.ts` — replace:

```
const insideHandleSignup = offsetOf(signup, "validateUser(input)", 3);
```

with:

```
const insideHandleSignup = offsetOf(signup, "validateUser(input)", 3);
const basicTsconfig = fixturePath("basic", "tsconfig.json");
```

Edit `packages/extension/test/worker-handler.test.ts` — replace:

```
describe("ProjectCache", () => {
```

with:

```
describe("createWorkerHandler sliceForNode", () => {
  it("slices around a node of the given project without being told a file", () => {
    const handle = createWorkerHandler();
    const response = handle({
      id: 4,
      kind: "sliceForNode",
      tsconfig: basicTsconfig,
      nodeId: "src/signup.ts#validateUser",
      changedFiles: [],
    });
    expect(response.id).toBe(4);
    if (response.kind !== "sliced") throw new Error(response.kind);
    expect(response.result.slice.focusId).toBe("src/signup.ts#validateUser");
    expect(response.result.tsconfig).toBe(basicTsconfig);
    expect(response.result.repoRoot).toBe(fixturePath("basic"));
    expect(response.result.slice.nodes.map((node) => node.id)).toContain(
      "src/signup.ts#handleSignup",
    );
  });

  it("reports a node the project cannot find as a failure", () => {
    const response = createWorkerHandler()({
      id: 5,
      kind: "sliceForNode",
      tsconfig: basicTsconfig,
      nodeId: "src/signup.ts#renamedAway",
      changedFiles: [],
    });
    expect(response.kind).toBe("failed");
    if (response.kind === "failed") {
      expect(response.message).toContain("Node not found");
    }
  });

  it("reports a node that cannot be expanded as a failure", () => {
    const response = createWorkerHandler()({
      id: 6,
      kind: "sliceForNode",
      tsconfig: basicTsconfig,
      nodeId: "external:tiny-lib#persist",
      changedFiles: [],
    });
    expect(response.kind).toBe("failed");
    if (response.kind === "failed") {
      expect(response.message).toContain("not expandable");
    }
  });
});

describe("ProjectCache", () => {
```

Edit `packages/extension/test/worker-handler.test.ts` — replace:

```
    expect(cache.open(jsxFile)).not.toBe(jsx);
  });
});
```

with:

```
    expect(cache.open(jsxFile)).not.toBe(jsx);
  });

  it("opens a project by tsconfig and shares it with open()", () => {
    const cache = new ProjectCache();
    const entry = cache.open(signup);
    expect(entry.tsconfig).toBe(basicTsconfig);
    expect(cache.openTsconfig(basicTsconfig)).toBe(entry);
  });

  it("reloads a project by tsconfig after it was evicted", () => {
    const cache = new ProjectCache();
    const basic = cache.open(signup);
    cache.open(fixturePath("jsx", "src/components.tsx"));
    cache.open(fixturePath("hub", "src/callers.ts"));
    cache.open(fixturePath("barrel", "src/consumer.ts"));
    const reloaded = cache.openTsconfig(basicTsconfig);
    expect(reloaded).not.toBe(basic);
    expect(reloaded.tsconfig).toBe(basicTsconfig);
    expect(reloaded.project.getSourceFile(signup)).toBeDefined();
  });
});
```

Edit `packages/extension/test/worker-handler.test.ts` — replace:

```
    expect(idsOf(response)).toContain("src/created.ts#created");
  });
});
```

with:

```
    expect(idsOf(response)).toContain("src/created.ts#created");
  });

  it("applies saved files when a project is opened by tsconfig", () => {
    const cache = new ProjectCache();
    const file = join(dir, "src/types.ts");
    const entry = cache.open(file);
    writeFileSync(
      file,
      `${readFileSync(file, "utf8")}export type Added = number\n`,
    );
    cache.noteChanged([file]);
    expect(cache.openTsconfig(entry.tsconfig)).toBe(entry);
    expect(entry.project.getSourceFile(file)?.getFullText()).toContain("Added");
  });
});
```

Edit `packages/extension/test/worker-client.test.ts` — replace:

```
const result = {
  slice: { focusId: "a.ts#f", nodes: [], edges: [], truncated: false },
  repoRoot: "/repo",
};
```

with:

```
const result = {
  slice: { focusId: "a.ts#f", nodes: [], edges: [], truncated: false },
  repoRoot: "/repo",
  tsconfig: "/repo/tsconfig.json",
};
```

Edit `packages/extension/test/worker-client.test.ts` — replace:

```
  it("matches out-of-order replies by id", async () => {
```

with:

```
  it("posts sliceForNode requests and resolves with the result", async () => {
    const { workers, client } = setup();
    const pending = client.sliceForNode("/repo/tsconfig.json", "a.ts#f", [
      "/b.ts",
    ]);
    expect(workers[0]?.posted).toEqual([
      {
        id: 1,
        kind: "sliceForNode",
        tsconfig: "/repo/tsconfig.json",
        nodeId: "a.ts#f",
        changedFiles: ["/b.ts"],
      },
    ]);
    workers[0]?.reply({ id: 1, kind: "sliced", result });
    await expect(pending).resolves.toEqual(result);
  });

  it("rejects sliceForNode with the worker's message and on a mismatched reply", async () => {
    const { workers, client } = setup();
    const missing = client.sliceForNode("/repo/tsconfig.json", "a.ts#gone", []);
    workers[0]?.reply({
      id: 1,
      kind: "failed",
      message: "Node not found: a.ts#gone",
    });
    await expect(missing).rejects.toThrow("Node not found");

    const mismatched = client.sliceForNode("/repo/tsconfig.json", "a.ts#f", []);
    workers[0]?.reply({ id: 2, kind: "focused", result });
    await expect(mismatched).rejects.toThrow("Unexpected worker response");
  });

  it("matches out-of-order replies by id", async () => {
```

Edit `packages/extension/test/worker-integration.test.ts` — replace:

```
  it("survives a real out-of-memory worker and starts a fresh one", async () => {
```

with:

```
  it("slices around a node of a known tsconfig in a real worker thread", async () => {
    const client = new WorkerClient(() =>
      spawnAnalysisWorker(workerPath, 2048),
    );
    try {
      const tsconfig = fixturePath("basic", "tsconfig.json");
      const answer = await client.sliceForNode(
        tsconfig,
        "src/signup.ts#validateUser",
        [],
      );
      expect(answer.slice.focusId).toBe("src/signup.ts#validateUser");
      expect(answer.repoRoot).toBe(fixturePath("basic"));
      expect(answer.tsconfig).toBe(tsconfig);
    } finally {
      client.dispose();
    }
  });

  it("survives a real out-of-memory worker and starts a fresh one", async () => {
```

Run: `pnpm --filter code-spider-vscode test worker-handler worker-client`
Expected: FAIL. The new handler tests report `failed` or an unexpected kind for
`sliceForNode`, `cache.openTsconfig is not a function`, and
`client.sliceForNode is not a function`. (`worker-integration` runs after Step 2's
implementation, because it needs the rebuilt worker bundle.)

Implement. Replace `packages/extension/src/worker/protocol.ts`:

Replace `packages/extension/src/worker/protocol.ts` with:

```ts
import type { GraphSlice, NodeId } from "@code-spider/core";

export type FocusResult = {
  slice: GraphSlice;
  repoRoot: string;
  tsconfig: string;
};
export type ExpandResult = FocusResult;

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

export type SliceForNodeRequest = {
  kind: "sliceForNode";
  tsconfig: string;
  nodeId: NodeId;
  changedFiles: string[];
};

export type WorkerRequestBody =
  | WarmRequest
  | FocusRequestBody
  | SliceForNodeRequest;

export type WorkerRequest = WorkerRequestBody & { id: number };

export type WorkerResponse =
  | { id: number; kind: "warmed" }
  | { id: number; kind: "focused"; result: FocusResult }
  | { id: number; kind: "sliced"; result: ExpandResult }
  | { id: number; kind: "failed"; message: string };
```

Edit `packages/extension/src/worker/project-cache.ts`:

Edit `packages/extension/src/worker/project-cache.ts` — replace:

```
  open(file: string): ProjectEntry {
    const tsconfig = this.tsconfigFor(file);
    const entry = this.touch(tsconfig) ?? this.load(tsconfig);
    this.refreshChanged(entry);
    if (!entry.project.getSourceFile(file)) {
      entry.project.addSourceFileAtPathIfExists(file);
    }
    return entry;
  }
```

with:

```
  open(file: string): ProjectEntry {
    const entry = this.openTsconfig(this.tsconfigFor(file));
    if (!entry.project.getSourceFile(file)) {
      entry.project.addSourceFileAtPathIfExists(file);
    }
    return entry;
  }

  /** Reuses the warm project, or reloads it if it was evicted. */
  openTsconfig(tsconfig: string): ProjectEntry {
    const entry = this.touch(tsconfig) ?? this.load(tsconfig);
    this.refreshChanged(entry);
    return entry;
  }
```

Replace `packages/extension/src/worker/handler.ts` with:

```ts
import { analyzeFocus, expandNode } from "@code-spider/core";
import { ProjectCache } from "./project-cache.js";
import type { WorkerRequest, WorkerResponse } from "./protocol.js";

export type WorkerHandler = (request: WorkerRequest) => WorkerResponse;

export function createWorkerHandler(
  cache: ProjectCache = new ProjectCache(),
): WorkerHandler {
  return (request) => {
    try {
      cache.noteChanged(request.changedFiles);
      switch (request.kind) {
        case "warm":
          cache.warm(cache.open(request.file));
          return { id: request.id, kind: "warmed" };
        case "focus": {
          const entry = cache.open(request.file);
          const slice = analyzeFocus(entry.project, {
            file: request.file,
            offset: request.offset,
            repoRoot: entry.repoRoot,
          });
          return {
            id: request.id,
            kind: "focused",
            result: {
              slice,
              repoRoot: entry.repoRoot,
              tsconfig: entry.tsconfig,
            },
          };
        }
        case "sliceForNode": {
          const entry = cache.openTsconfig(request.tsconfig);
          const slice = expandNode(
            entry.project,
            request.nodeId,
            entry.repoRoot,
          );
          return {
            id: request.id,
            kind: "sliced",
            result: {
              slice,
              repoRoot: entry.repoRoot,
              tsconfig: entry.tsconfig,
            },
          };
        }
      }
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

Edit `packages/extension/src/worker/worker-client.ts`:

Edit `packages/extension/src/worker/worker-client.ts` — replace:

```
import type {
  FocusRequestBody,
  FocusResult,
  WarmRequest,
  WorkerRequest,
  WorkerResponse,
} from "./protocol.js";
```

with:

```
import type { NodeId } from "@code-spider/core";
import type {
  ExpandResult,
  FocusResult,
  WorkerRequest,
  WorkerRequestBody,
  WorkerResponse,
} from "./protocol.js";
```

Edit `packages/extension/src/worker/worker-client.ts` — replace:

```
    return response.result;
  }

  /** Drops the current worker; the next request starts a fresh one. */
```

with:

```
    return response.result;
  }

  async sliceForNode(
    tsconfig: string,
    nodeId: NodeId,
    changedFiles: string[],
  ): Promise<ExpandResult> {
    const response = await this.request({
      kind: "sliceForNode",
      tsconfig,
      nodeId,
      changedFiles,
    });
    if (response.kind !== "sliced") {
      throw new Error(`Unexpected worker response: ${response.kind}`);
    }
    return response.result;
  }

  /** Drops the current worker; the next request starts a fresh one. */
```

Edit `packages/extension/src/worker/worker-client.ts` — replace:

```
  private request(
    body: WarmRequest | FocusRequestBody,
  ): Promise<WorkerResponse> {
```

with:

```
  private request(body: WorkerRequestBody): Promise<WorkerResponse> {
```

Run: `pnpm --filter code-spider-vscode test worker-handler worker-client worker-integration`
Expected: PASS. `worker-handler` 15 tests, `worker-client` 12, `worker-integration`
3 (it rebuilds the worker bundle first, so it takes a few seconds).

- [ ] **Step 3: The jump table, and click-to-jump through it**

Clicks on nodes that an expansion brought in, or that Back restored, must still
jump. The extension therefore remembers every node and edge it has ever sent to
the panel, per project, and resolves ids against that instead of against the
latest centre slice.

Write the tests first.

Create `packages/extension/test/jump-table.test.ts`:

```ts
import { join } from "node:path";
import type { GraphNode, GraphSlice } from "@code-spider/core";
import { describe, expect, it } from "vitest";
import { JumpTable } from "../src/jump-table.js";
import { fixturePath, readGolden } from "./support/fixtures.js";

const basic = fixturePath("basic");
const project = join(basic, "tsconfig.json");
const golden = readGolden("basic-handleSignup.json");

function sent(slice: GraphSlice, repoRoot = basic) {
  return { slice, repoRoot, tsconfig: project };
}

function nodeOf(id: string): GraphNode {
  const node = golden.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`golden has no ${id}`);
  return node;
}

describe("JumpTable", () => {
  it("resolves a node to its declaration in the repo", () => {
    const table = new JumpTable();
    table.add(project, sent(golden));
    expect(table.nodeTarget(project, "src/signup.ts#validateUser")).toEqual({
      file: join(basic, "src/signup.ts"),
      range: { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 0 },
    });
  });

  it("resolves an edge to its call site in the consumer's file", () => {
    const table = new JumpTable();
    table.add(project, sent(golden));
    expect(
      table.callSiteTarget(
        project,
        "src/signup.ts#createUser->src/signup.ts#handleSignup",
      ),
    ).toEqual({
      file: join(basic, "src/signup.ts"),
      range: {
        startLine: 17,
        startCharacter: 21,
        endLine: 17,
        endCharacter: 38,
      },
    });
    expect(
      table.callSiteTarget(
        project,
        "src/signup.ts#handleSignup->src/app.ts#main",
      )?.file,
    ).toBe(join(basic, "src/app.ts"));
  });

  it("keeps earlier slices and lets later slices overwrite them", () => {
    const table = new JumpTable();
    table.add(project, sent(golden));
    const moved: GraphNode = {
      ...nodeOf("src/signup.ts#createUser"),
      range: { startLine: 21, startColumn: 3, endLine: 23, endColumn: 2 },
    };
    const added: GraphNode = {
      ...nodeOf("src/signup.ts#createUser"),
      id: "src/extra.ts#extra",
      file: "src/extra.ts",
    };
    table.add(
      project,
      sent({
        focusId: "src/signup.ts#validateUser",
        nodes: [moved, added],
        edges: [],
        truncated: false,
      }),
    );

    expect(table.nodeTarget(project, "src/signup.ts#createUser")).toMatchObject(
      { range: { startLine: 20, startCharacter: 2 } },
    );
    expect(table.nodeTarget(project, "src/extra.ts#extra")?.file).toBe(
      join(basic, "src/extra.ts"),
    );
    expect(
      table.nodeTarget(project, "src/signup.ts#validateUser"),
    ).toBeDefined();
  });

  it("keeps projects apart even when they share a node id", () => {
    const table = new JumpTable();
    const other = "/other/tsconfig.json";
    table.add(project, sent(golden));
    table.add(other, { slice: golden, repoRoot: "/other", tsconfig: other });
    expect(table.nodeTarget(project, "src/app.ts#main")?.file).toBe(
      join(basic, "src/app.ts"),
    );
    expect(table.nodeTarget(other, "src/app.ts#main")?.file).toBe(
      "/other/src/app.ts",
    );
    expect(table.has(other)).toBe(true);
  });

  it("returns undefined for unknown projects, nodes and edges, and for nodes without a file", () => {
    const table = new JumpTable();
    const external: GraphNode = {
      ...nodeOf("src/app.ts#main"),
      id: "external:tiny-lib#persist",
      kind: "external",
      file: "",
    };
    table.add(project, sent({ ...golden, nodes: [...golden.nodes, external] }));
    expect(table.nodeTarget("/nope/tsconfig.json", "src/app.ts#main")).toBe(
      undefined,
    );
    expect(table.nodeTarget(project, "src/signup.ts#nope")).toBeUndefined();
    expect(
      table.nodeTarget(project, "external:tiny-lib#persist"),
    ).toBeUndefined();
    expect(table.callSiteTarget(project, "nope")).toBeUndefined();
    expect(table.has("/nope/tsconfig.json")).toBe(false);
  });

  it("forgets everything on clear", () => {
    const table = new JumpTable();
    table.add(project, sent(golden));
    table.clear();
    expect(table.has(project)).toBe(false);
    expect(table.nodeTarget(project, "src/app.ts#main")).toBeUndefined();
  });
});
```

Replace `packages/extension/test/navigation.test.ts` with:

```ts
import { join } from "node:path";
import type { GraphEdge, GraphNode } from "@code-spider/core";
import { describe, expect, it, vi } from "vitest";
import {
  callSiteJumpTarget,
  JumpHandler,
  nodeJumpTarget,
  type EditorPort,
  type JumpLookup,
  type JumpTarget,
} from "../src/navigation.js";
import { fixturePath, readGolden } from "./support/fixtures.js";

const repoRoot = fixturePath("basic");
const golden = readGolden("basic-handleSignup.json");

function nodeOf(id: string): GraphNode {
  const node = golden.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`golden has no ${id}`);
  return node;
}

function edgeOf(id: string): GraphEdge {
  const edge = golden.edges.find((candidate) => candidate.id === id);
  if (!edge) throw new Error(`golden has no ${id}`);
  return edge;
}

describe("nodeJumpTarget", () => {
  it("resolves a node to its declaration in the repo", () => {
    expect(
      nodeJumpTarget(repoRoot, nodeOf("src/signup.ts#validateUser")),
    ).toEqual({
      file: join(repoRoot, "src/signup.ts"),
      range: { startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 0 },
    });
  });

  it("returns undefined when there is no node", () => {
    expect(nodeJumpTarget(repoRoot, undefined)).toBeUndefined();
  });

  it("returns undefined for nodes without a file", () => {
    const external: GraphNode = {
      ...nodeOf("src/app.ts#main"),
      id: "external:tiny-lib#persist",
      kind: "external",
      file: "",
    };
    expect(nodeJumpTarget(repoRoot, external)).toBeUndefined();
  });
});

describe("callSiteJumpTarget", () => {
  it("opens the call site in the caller's file, not the callee's", () => {
    const edge = edgeOf("src/signup.ts#createUser->src/signup.ts#handleSignup");
    expect(
      callSiteJumpTarget(repoRoot, edge, nodeOf("src/signup.ts#handleSignup")),
    ).toEqual({
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
    const edge = edgeOf("src/signup.ts#handleSignup->src/app.ts#main");
    const target = callSiteJumpTarget(
      repoRoot,
      edge,
      nodeOf("src/app.ts#main"),
    );
    expect(target?.file).toBe(join(repoRoot, "src/app.ts"));
  });

  it("returns undefined without an edge or a caller that has a file", () => {
    const edge = edgeOf("src/signup.ts#handleSignup->src/app.ts#main");
    expect(callSiteJumpTarget(repoRoot, undefined, undefined)).toBeUndefined();
    expect(callSiteJumpTarget(repoRoot, edge, undefined)).toBeUndefined();
    expect(
      callSiteJumpTarget(repoRoot, edge, {
        ...nodeOf("src/app.ts#main"),
        file: "",
      }),
    ).toBeUndefined();
  });
});

describe("JumpHandler", () => {
  const nodeTarget: JumpTarget = {
    file: "/repo/a.ts",
    range: { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0 },
  };
  const callTarget: JumpTarget = {
    file: "/repo/b.ts",
    range: { startLine: 4, startCharacter: 2, endLine: 4, endCharacter: 9 },
  };

  function setup(found = true) {
    const editor: EditorPort = { reveal: vi.fn(async () => undefined) };
    const lookup: JumpLookup = {
      nodeTarget: vi.fn(() => (found ? nodeTarget : undefined)),
      callSiteTarget: vi.fn(() => (found ? callTarget : undefined)),
    };
    return { editor, lookup, jumps: new JumpHandler(lookup, editor) };
  }

  it("reveals the declaration of the node in the named project", async () => {
    const { editor, lookup, jumps } = setup();
    await jumps.handle({
      type: "openInEditor",
      project: "/p/tsconfig.json",
      nodeId: "src/a.ts#f",
    });
    expect(lookup.nodeTarget).toHaveBeenCalledWith(
      "/p/tsconfig.json",
      "src/a.ts#f",
    );
    expect(editor.reveal).toHaveBeenCalledWith(nodeTarget);
  });

  it("reveals the call site of the edge in the named project", async () => {
    const { editor, lookup, jumps } = setup();
    await jumps.handle({
      type: "openCallSite",
      project: "/p/tsconfig.json",
      edgeId: "a->b",
    });
    expect(lookup.callSiteTarget).toHaveBeenCalledWith(
      "/p/tsconfig.json",
      "a->b",
    );
    expect(editor.reveal).toHaveBeenCalledWith(callTarget);
  });

  it("reveals nothing when the table cannot resolve the id", async () => {
    const { editor, jumps } = setup(false);
    await jumps.handle({
      type: "openInEditor",
      project: "/p/tsconfig.json",
      nodeId: "src/x.ts#y",
    });
    await jumps.handle({
      type: "openCallSite",
      project: "/p/tsconfig.json",
      edgeId: "nope",
    });
    expect(editor.reveal).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter code-spider-vscode test jump-table navigation`
Expected: FAIL. `jump-table.test.ts` cannot import `../src/jump-table.js`, and
`navigation.test.ts` finds `nodeJumpTarget` and `JumpHandler` with the old
signatures.

Implement. Replace `packages/extension/src/ports.ts`:

Replace `packages/extension/src/ports.ts` with:

```ts
import type { NodeId } from "@code-spider/core";
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import type { ExpandResult, FocusResult } from "./worker/protocol.js";

export interface AnalysisPort {
  warm(file: string, changedFiles: string[]): Promise<void>;
  focus(
    file: string,
    offset: number,
    changedFiles: string[],
  ): Promise<FocusResult>;
  sliceForNode(
    tsconfig: string,
    nodeId: NodeId,
    changedFiles: string[],
  ): Promise<ExpandResult>;
}

export interface PanelPort {
  show(): void;
  post(message: ExtensionToWebview): void;
}

/** Remembers what was sent to the panel so later clicks can be resolved. */
export interface JumpRegistry {
  add(project: string, result: FocusResult): void;
  has(project: string): boolean;
}

export interface Notifier {
  warn(message: string): void;
  error(message: string): void;
}

export interface IndexingIndicator {
  set(active: boolean): void;
}
```

Replace `packages/extension/src/navigation.ts` with:

```ts
import { join } from "node:path";
import type { GraphEdge, GraphNode, NodeId } from "@code-spider/core";
import type { WebviewToExtension } from "@code-spider/webview/protocol";
import { toZeroBasedRange, type ZeroBasedRange } from "./ranges.js";

export type JumpTarget = { file: string; range: ZeroBasedRange };

export interface EditorPort {
  reveal(target: JumpTarget): Promise<void>;
}

export interface JumpLookup {
  nodeTarget(project: string, nodeId: NodeId): JumpTarget | undefined;
  callSiteTarget(project: string, edgeId: string): JumpTarget | undefined;
}

export type JumpMessage = Extract<
  WebviewToExtension,
  { type: "openInEditor" | "openCallSite" }
>;

/** A node opens with the cursor at its declaration; external and unknown nodes have no file. */
export function nodeJumpTarget(
  repoRoot: string,
  node: GraphNode | undefined,
): JumpTarget | undefined {
  if (!node || node.file === "") return undefined;
  const { startLine, startCharacter } = toZeroBasedRange(node.range);
  return {
    file: join(repoRoot, node.file),
    range: {
      startLine,
      startCharacter,
      endLine: startLine,
      endCharacter: startCharacter,
    },
  };
}

/** An edge opens at its call site, which lies in the consumer (`to`) node's file. */
export function callSiteJumpTarget(
  repoRoot: string,
  edge: GraphEdge | undefined,
  caller: GraphNode | undefined,
): JumpTarget | undefined {
  if (!edge || !caller || caller.file === "") return undefined;
  return {
    file: join(repoRoot, caller.file),
    range: toZeroBasedRange(edge.callSite),
  };
}

export class JumpHandler {
  constructor(
    private readonly lookup: JumpLookup,
    private readonly editor: EditorPort,
  ) {}

  async handle(message: JumpMessage): Promise<void> {
    const target =
      message.type === "openInEditor"
        ? this.lookup.nodeTarget(message.project, message.nodeId)
        : this.lookup.callSiteTarget(message.project, message.edgeId);
    if (target) await this.editor.reveal(target);
  }
}
```

Create `packages/extension/src/jump-table.ts`:

```ts
import type { GraphEdge, GraphNode, NodeId } from "@code-spider/core";
import {
  callSiteJumpTarget,
  nodeJumpTarget,
  type JumpLookup,
  type JumpTarget,
} from "./navigation.js";
import type { JumpRegistry } from "./ports.js";
import type { FocusResult } from "./worker/protocol.js";

type ProjectJumps = {
  repoRoot: string;
  nodes: Map<NodeId, GraphNode>;
  edges: Map<string, GraphEdge>;
};

/**
 * Every node and edge sent to the panel since it opened, per project, later
 * slices overwriting earlier ones. Node ids are relative to a project root, so
 * the project keeps two projects' ids apart.
 */
export class JumpTable implements JumpRegistry, JumpLookup {
  private readonly projects = new Map<string, ProjectJumps>();

  add(project: string, result: FocusResult): void {
    const known = this.projects.get(project) ?? {
      repoRoot: result.repoRoot,
      nodes: new Map(),
      edges: new Map(),
    };
    for (const node of result.slice.nodes) known.nodes.set(node.id, node);
    for (const edge of result.slice.edges) known.edges.set(edge.id, edge);
    this.projects.set(project, known);
  }

  has(project: string): boolean {
    return this.projects.has(project);
  }

  nodeTarget(project: string, nodeId: NodeId): JumpTarget | undefined {
    const known = this.projects.get(project);
    if (!known) return undefined;
    return nodeJumpTarget(known.repoRoot, known.nodes.get(nodeId));
  }

  callSiteTarget(project: string, edgeId: string): JumpTarget | undefined {
    const known = this.projects.get(project);
    const edge = known?.edges.get(edgeId);
    if (!known || !edge) return undefined;
    return callSiteJumpTarget(known.repoRoot, edge, known.nodes.get(edge.to));
  }

  clear(): void {
    this.projects.clear();
  }
}
```

Run: `pnpm --filter code-spider-vscode test jump-table navigation`
Expected: PASS, 15 tests (`jump-table` 6, `navigation` 9).

- [ ] **Step 4: Session: re-centre by node and expand**

`GraphSession` gains `focusNode` (re-centre; shares `showGraph`'s newest-wins
token and `busy` bracket) and `expand` (no `busy`, no token, may overlap other
expansions). Both refuse a project the jump table has never seen, so the webview
cannot name an arbitrary tsconfig.

The existing session tests build their fixtures inline. Move that setup into a
shared support module first, because the new tests are in a second file (a
single file would pass 500 lines).

Create `packages/extension/test/support/session-setup.ts`:

```ts
import type { GraphNode } from "@code-spider/core";
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import { vi } from "vitest";
import { ChangeTracker } from "../../src/changes.js";
import { JumpTable } from "../../src/jump-table.js";
import type { AnalysisPort, PanelPort } from "../../src/ports.js";
import { GraphSession } from "../../src/session.js";
import type { FocusResult } from "../../src/worker/protocol.js";

export const PROJECT = "/repo/tsconfig.json";

function fakeNode(id: string): GraphNode {
  const [file = "", name = ""] = id.split("#");
  return {
    id,
    kind: "function",
    name,
    file,
    range: { startLine: 3, startColumn: 1, endLine: 5, endColumn: 2 },
    inputType: "",
    returnType: "",
    isAsync: false,
    lineCount: 3,
    codePreview: "x",
  };
}

export function resultFor(
  focusId: string,
  otherIds: string[] = [],
): FocusResult {
  return {
    slice: {
      focusId,
      nodes: [focusId, ...otherIds].map(fakeNode),
      edges: [],
      truncated: false,
    },
    repoRoot: "/repo",
    tsconfig: PROJECT,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function setup(overrides: Partial<AnalysisPort> = {}) {
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
    sliceForNode: vi.fn(async (_tsconfig: string, nodeId: string) =>
      resultFor(nodeId),
    ),
    ...overrides,
  };
  const notifier = { warn: vi.fn(), error: vi.fn() };
  const indexing = { set: vi.fn() };
  const changes = new ChangeTracker();
  const jumps = new JumpTable();
  const session = new GraphSession({
    worker,
    panel,
    notifier,
    indexing,
    changes,
    maxHeapMb: () => 4096,
    jumps,
  });
  const types = () => posted.map((message) => message.type);
  return {
    session,
    panel,
    worker,
    notifier,
    indexing,
    changes,
    jumps,
    posted,
    types,
  };
}
```

Edit `packages/extension/test/session.test.ts` — replace lines 1-62:

```
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
```

with:

```
import { describe, expect, it } from "vitest";
import type { FocusRequest } from "../src/session.js";
import type { FocusResult } from "../src/worker/protocol.js";
import { WorkerCrashedError } from "../src/worker/worker-client.js";
import {
  deferred,
  PROJECT,
  resultFor,
  setup,
} from "./support/session-setup.js";

const request: FocusRequest = {
  file: "/repo/src/a.ts",
  text: "line0\nline1\nline2\n",
  line: 1,
  character: 2,
  isDirty: false,
};
const REQUEST_OFFSET = 8;
```

Edit `packages/extension/test/session.test.ts` — replace:

```
    const { session, panel, worker, posted, types } = setup();
    await session.showGraph(request);
    expect(panel.shown).toBe(1);
```

with:

```
    const { session, panel, worker, jumps, posted, types } = setup();
    await session.showGraph(request);
    expect(panel.shown).toBe(1);
```

Edit `packages/extension/test/session.test.ts` — replace:

```
    expect(posted[2]).toEqual({ type: "busy", busy: false });
    expect(session.currentGraph()).toEqual(resultFor("src/a.ts#f"));
```

with:

```
    expect(posted[1]).toEqual({
      type: "slice",
      slice: resultFor("src/a.ts#f").slice,
      project: PROJECT,
      mode: { kind: "centre" },
    });
    expect(posted[2]).toEqual({ type: "busy", busy: false });
    expect(session.currentGraph()).toEqual(resultFor("src/a.ts#f"));
    expect(jumps.nodeTarget(PROJECT, "src/a.ts#f")).toBeDefined();
```

Now the new tests, in their own file:

Create `packages/extension/test/session-nodes.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { FocusRequest } from "../src/session.js";
import type { FocusResult } from "../src/worker/protocol.js";
import { WorkerCrashedError } from "../src/worker/worker-client.js";
import {
  deferred,
  PROJECT,
  resultFor,
  setup,
} from "./support/session-setup.js";

const NODE = "src/a.ts#g";
const OTHER = "src/a.ts#h";
const request: FocusRequest = {
  file: "/repo/src/a.ts",
  text: "line0\nline1\nline2\n",
  line: 1,
  character: 2,
  isDirty: false,
};

describe("GraphSession.focusNode", () => {
  it("refuses a project it has never sent to the panel", async () => {
    const { session, worker, posted } = setup();
    await session.focusNode({ project: PROJECT, nodeId: NODE });
    expect(posted).toEqual([
      { type: "analysisError", message: "Unknown project" },
    ]);
    expect(worker.sliceForNode).not.toHaveBeenCalled();
  });

  it("re-centres: brackets busy, slices around the node and posts a centre slice", async () => {
    const { session, worker, jumps, changes, posted, types } = setup();
    jumps.add(PROJECT, resultFor("src/a.ts#f"));
    changes.markSaved("typescript", "/repo/src/b.ts");

    await session.focusNode({ project: PROJECT, nodeId: NODE });

    expect(worker.sliceForNode).toHaveBeenCalledWith(PROJECT, NODE, [
      "/repo/src/b.ts",
    ]);
    expect(types()).toEqual(["busy", "slice", "busy"]);
    expect(posted[1]).toEqual({
      type: "slice",
      slice: resultFor(NODE).slice,
      project: PROJECT,
      mode: { kind: "centre" },
    });
    expect(session.currentGraph()?.slice.focusId).toBe(NODE);
  });

  it("lets the newest centre request win across showGraph and focusNode", async () => {
    const slow = deferred<FocusResult>();
    const { session, jumps, posted } = setup({ focus: () => slow.promise });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const first = session.showGraph(request);
    await session.focusNode({ project: PROJECT, nodeId: NODE });
    slow.resolve(resultFor("src/a.ts#slow"));
    await first;

    expect(posted.filter((message) => message.type === "slice")).toHaveLength(
      1,
    );
    expect(session.currentGraph()?.slice.focusId).toBe(NODE);
    expect(
      posted.filter((message) => message.type === "busy" && !message.busy),
    ).toHaveLength(1);
  });

  it("shows a failure in the panel only and keeps the earlier graph", async () => {
    const { session, jumps, notifier, posted } = setup({
      sliceForNode: async () => {
        throw new Error("Node not found: src/a.ts#g");
      },
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    await session.focusNode({ project: PROJECT, nodeId: NODE });

    expect(posted).toContainEqual({
      type: "analysisError",
      message: "Node not found: src/a.ts#g",
    });
    expect(posted.at(-1)).toEqual({ type: "busy", busy: false });
    expect(notifier.error).not.toHaveBeenCalled();
    expect(session.currentGraph()).toBeUndefined();
  });

  it("also raises a notification when the worker crashed", async () => {
    const { session, jumps, notifier, posted } = setup({
      sliceForNode: async () => {
        throw new WorkerCrashedError(
          "The analysis worker stopped: exited with code 3",
          false,
        );
      },
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    await session.focusNode({ project: PROJECT, nodeId: NODE });

    const error = posted.find((message) => message.type === "analysisError");
    const text = error?.type === "analysisError" ? error.message : "";
    expect(text).toContain("fresh worker");
    expect(notifier.error).toHaveBeenCalledWith(text);
  });
});

describe("GraphSession.expand", () => {
  const expand = { project: PROJECT, nodeId: NODE, generation: 7 };

  it("refuses a project it has never sent to the panel", async () => {
    const { session, worker, posted } = setup();
    await session.expand(expand);
    expect(posted).toEqual([
      {
        type: "expandFailed",
        nodeId: NODE,
        generation: 7,
        message: "Unknown project",
      },
    ]);
    expect(worker.sliceForNode).not.toHaveBeenCalled();
  });

  it("posts an expansion slice that echoes the generation, without busy", async () => {
    const { session, jumps, worker, posted } = setup({
      sliceForNode: vi.fn(async () => resultFor(NODE, [OTHER])),
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    await session.expand(expand);

    expect(posted).toEqual([
      {
        type: "slice",
        slice: resultFor(NODE, [OTHER]).slice,
        project: PROJECT,
        mode: { kind: "expansion", nodeId: NODE, generation: 7 },
      },
    ]);
    expect(jumps.nodeTarget(PROJECT, OTHER)).toBeDefined();
    expect(worker.sliceForNode).toHaveBeenCalledWith(PROJECT, NODE, []);
    expect(session.currentGraph()).toBeUndefined();
  });

  it("may overlap other expansions and answers each in its own time", async () => {
    const first = deferred<FocusResult>();
    const second = deferred<FocusResult>();
    const pending = [first, second];
    const { session, jumps, posted } = setup({
      sliceForNode: () => {
        const next = pending.shift();
        if (!next) throw new Error("unexpected request");
        return next.promise;
      },
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const one = session.expand(expand);
    const two = session.expand({ ...expand, nodeId: OTHER, generation: 8 });
    second.resolve(resultFor(OTHER));
    await two;
    first.resolve(resultFor(NODE));
    await one;

    expect(
      posted.map((message) =>
        message.type === "slice" ? message.mode : message.type,
      ),
    ).toEqual([
      { kind: "expansion", nodeId: OTHER, generation: 8 },
      { kind: "expansion", nodeId: NODE, generation: 7 },
    ]);
  });

  it("does not supersede a centre request in flight", async () => {
    const slow = deferred<FocusResult>();
    const { session, jumps, posted } = setup({ focus: () => slow.promise });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const centre = session.showGraph(request);
    await session.expand(expand);
    slow.resolve(resultFor("src/a.ts#centre"));
    await centre;

    expect(session.currentGraph()?.slice.focusId).toBe("src/a.ts#centre");
    expect(
      posted
        .filter((message) => message.type === "slice")
        .map((message) => message.mode.kind),
    ).toEqual(["expansion", "centre"]);
  });

  it("reports a failure as expandFailed and leaves notifications alone", async () => {
    const { session, jumps, notifier, posted } = setup({
      sliceForNode: async () => {
        throw new Error("Node not found: src/a.ts#g");
      },
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    await session.expand(expand);

    expect(posted).toEqual([
      {
        type: "expandFailed",
        nodeId: NODE,
        generation: 7,
        message: "Node not found: src/a.ts#g",
      },
    ]);
    expect(notifier.error).not.toHaveBeenCalled();
  });

  it("also raises a notification when the worker crashed", async () => {
    const { session, jumps, notifier, posted } = setup({
      sliceForNode: async () => {
        throw new WorkerCrashedError(
          "The analysis worker ran out of memory.",
          true,
        );
      },
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    await session.expand(expand);

    const failed = posted.find((message) => message.type === "expandFailed");
    const text = failed?.type === "expandFailed" ? failed.message : "";
    expect(text).toContain("ran out of memory");
    expect(notifier.error).toHaveBeenCalledWith(text);
  });

  it("posts nothing when the panel closed while the answer was on its way", async () => {
    const slow = deferred<FocusResult>();
    const { session, jumps, posted } = setup({
      sliceForNode: () => slow.promise,
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const pending = session.expand(expand);
    jumps.clear();
    slow.resolve(resultFor(NODE, [OTHER]));
    await pending;

    expect(posted).toEqual([]);
    expect(jumps.has(PROJECT)).toBe(false);
  });

  it("posts nothing, and no notification, when it fails after the panel closed", async () => {
    const slow = deferred<FocusResult>();
    const { session, jumps, notifier, posted } = setup({
      sliceForNode: () => slow.promise,
    });
    jumps.add(PROJECT, resultFor("src/a.ts#f"));

    const pending = session.expand(expand);
    jumps.clear();
    slow.reject(new WorkerCrashedError("The analysis worker stopped", false));
    await pending;

    expect(posted).toEqual([]);
    expect(notifier.error).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter code-spider-vscode test session`
Expected: FAIL. `session.focusNode is not a function`, `session.expand is not a
function`, and the changed `showGraph` assertions (`mode` and `project` are
missing from the posted slice).

Implement. Replace `packages/extension/src/session.ts`:

Replace `packages/extension/src/session.ts` with:

```ts
import { basename } from "node:path";
import type { NodeId } from "@code-spider/core";
import type { ChangeTracker } from "./changes.js";
import { positionToOffset } from "./positions.js";
import type {
  AnalysisPort,
  IndexingIndicator,
  JumpRegistry,
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

/** A node of a project the panel already shows, named by the webview. */
export type NodeRequest = { project: string; nodeId: NodeId };
export type ExpandRequest = NodeRequest & { generation: number };

/** What the latest centre request returned. */
export type CurrentGraph = FocusResult;

export type SessionDeps = {
  worker: AnalysisPort;
  panel: PanelPort;
  notifier: Notifier;
  indexing: IndexingIndicator;
  changes: ChangeTracker;
  maxHeapMb: () => number;
  jumps: JumpRegistry;
};

const UNKNOWN_PROJECT = "Unknown project";

export class GraphSession {
  private graph: CurrentGraph | undefined;
  private latest = 0;
  private outstanding = 0;
  private warming = 0;

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
    await this.replaceGraph(() => {
      const offset = positionToOffset(
        request.text,
        request.line,
        request.character,
      );
      const changedFiles = [...new Set([...changes.drain(), request.file])];
      return worker.focus(request.file, offset, changedFiles);
    });
  }

  /** Re-centres on a node of a project the panel already shows. */
  async focusNode(request: NodeRequest): Promise<void> {
    const { worker, panel, changes, jumps } = this.deps;
    if (!jumps.has(request.project)) {
      panel.post({ type: "analysisError", message: UNKNOWN_PROJECT });
      return;
    }
    await this.replaceGraph(() =>
      worker.sliceForNode(request.project, request.nodeId, changes.drain()),
    );
  }

  /** Takes no token and no busy state: expansions may overlap each other. */
  async expand(request: ExpandRequest): Promise<void> {
    const { worker, panel, notifier, changes, jumps } = this.deps;
    const { project, nodeId, generation } = request;
    if (!jumps.has(project)) {
      panel.post({
        type: "expandFailed",
        nodeId,
        generation,
        message: UNKNOWN_PROJECT,
      });
      return;
    }
    try {
      const result = await worker.sliceForNode(
        project,
        nodeId,
        changes.drain(),
      );
      if (!jumps.has(project)) return;
      jumps.add(result.tsconfig, result);
      panel.post({
        type: "slice",
        slice: result.slice,
        project: result.tsconfig,
        mode: { kind: "expansion", nodeId, generation },
      });
    } catch (error) {
      if (!jumps.has(project)) return;
      const message = this.describeFailure(error);
      panel.post({ type: "expandFailed", nodeId, generation, message });
      if (error instanceof WorkerCrashedError) notifier.error(message);
    }
  }

  /** Loads and warms the project so the first focus is fast (perf note). */
  async warm(file: string): Promise<void> {
    const { worker, notifier, changes } = this.deps;
    this.warming += 1;
    this.setIndexing(true);
    try {
      await worker.warm(file, changes.drain());
    } catch (error) {
      if (error instanceof WorkerCrashedError) {
        notifier.error(this.describeFailure(error));
      }
    } finally {
      this.warming -= 1;
      if (this.warming === 0) this.setIndexing(false);
    }
  }

  /** The newest centre request wins; older answers are dropped. */
  private async replaceGraph(
    analyse: () => Promise<FocusResult>,
  ): Promise<void> {
    const { panel, notifier, jumps } = this.deps;
    const token = ++this.latest;
    this.outstanding += 1;
    panel.post({ type: "busy", busy: true });
    try {
      const result = await analyse();
      if (token !== this.latest) return;
      this.graph = result;
      jumps.add(result.tsconfig, result);
      panel.post({
        type: "slice",
        slice: result.slice,
        project: result.tsconfig,
        mode: { kind: "centre" },
      });
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
Expected: PASS, 27 tests (`session` 14, `session-nodes` 13).

- [ ] **Step 5: Dispatcher, message gate, message validation and panel wiring**

The dispatcher routes each webview message to its handler. The gate learns the
content/ephemeral rules, and `parseWebviewMessage` learns the new shapes.

Write the tests first.

Create `packages/extension/test/dispatch.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createDispatcher } from "../src/dispatch.js";

function setup() {
  const jumps = { handle: vi.fn(async () => undefined) };
  const session = {
    focusNode: vi.fn(async () => undefined),
    expand: vi.fn(async () => undefined),
  };
  return { jumps, session, dispatch: createDispatcher({ jumps, session }) };
}

describe("createDispatcher", () => {
  it("routes jump messages to the jump handler", async () => {
    const { jumps, session, dispatch } = setup();
    const open = {
      type: "openInEditor",
      project: "/p/tsconfig.json",
      nodeId: "a.ts#f",
    } as const;
    const site = {
      type: "openCallSite",
      project: "/p/tsconfig.json",
      edgeId: "a->b",
    } as const;
    await dispatch(open);
    await dispatch(site);
    expect(jumps.handle.mock.calls).toEqual([[open], [site]]);
    expect(session.focusNode).not.toHaveBeenCalled();
    expect(session.expand).not.toHaveBeenCalled();
  });

  it("routes focus to focusNode with the project and node", async () => {
    const { jumps, session, dispatch } = setup();
    await dispatch({
      type: "focus",
      project: "/p/tsconfig.json",
      nodeId: "a.ts#f",
    });
    expect(session.focusNode).toHaveBeenCalledWith({
      project: "/p/tsconfig.json",
      nodeId: "a.ts#f",
    });
    expect(jumps.handle).not.toHaveBeenCalled();
  });

  it("routes expand to expand with the generation", async () => {
    const { session, dispatch } = setup();
    await dispatch({
      type: "expand",
      project: "/p/tsconfig.json",
      nodeId: "a.ts#f",
      generation: 4,
    });
    expect(session.expand).toHaveBeenCalledWith({
      project: "/p/tsconfig.json",
      nodeId: "a.ts#f",
      generation: 4,
    });
  });

  it("ignores ready, refresh and setColumnGap", async () => {
    const { jumps, session, dispatch } = setup();
    await dispatch({ type: "ready" });
    await dispatch({ type: "refresh" });
    await dispatch({ type: "setColumnGap", value: 128 });
    expect(jumps.handle).not.toHaveBeenCalled();
    expect(session.focusNode).not.toHaveBeenCalled();
    expect(session.expand).not.toHaveBeenCalled();
  });
});
```

Replace `packages/extension/test/message-gate.test.ts` with:

```ts
import type {
  ExtensionToWebview,
  SliceMode,
} from "@code-spider/webview/protocol";
import { describe, expect, it } from "vitest";
import { MessageGate } from "../src/panel/message-gate.js";

const slice = (
  focusId: string,
  mode: SliceMode = { kind: "centre" },
): ExtensionToWebview => ({
  type: "slice",
  slice: { focusId, nodes: [], edges: [], truncated: false },
  project: "/repo/tsconfig.json",
  mode,
});

const expansion = (nodeId: string): ExtensionToWebview =>
  slice(nodeId, { kind: "expansion", nodeId, generation: 1 });

const failed: ExtensionToWebview = {
  type: "expandFailed",
  nodeId: "a#one",
  generation: 1,
  message: "gone",
};

function setup() {
  const sent: ExtensionToWebview[] = [];
  const gate = new MessageGate((message) => sent.push(message));
  return { sent, gate };
}

describe("MessageGate content", () => {
  it("holds a centre slice until the webview is ready", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    expect(sent).toEqual([]);
  });

  it("delivers only the latest content, once, on the first ready", () => {
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

    gate.reset();
    gate.post({ type: "analysisError", message: "boom" });
    gate.post(slice("a#two"));
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([slice("a#two")]);
  });

  it("never replays content when the webview reloads and says ready again", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    gate.markReady();
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([]);
  });

  it("sends content straight through once ready and does not keep it", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post(slice("a#one"));
    expect(sent).toEqual([slice("a#one")]);
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([]);
  });

  it("queues content again after reset", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.reset();
    gate.post(slice("a#one"));
    expect(sent).toEqual([]);
    gate.markReady();
    expect(sent).toEqual([slice("a#one")]);
  });
});

describe("MessageGate ephemeral messages", () => {
  it("drops an expansion slice and expandFailed while the webview is not ready", () => {
    const { sent, gate } = setup();
    gate.post(expansion("a#one"));
    gate.post(failed);
    gate.markReady();
    expect(sent).toEqual([]);
  });

  it("sends them straight through once ready", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post(expansion("a#one"));
    gate.post(failed);
    expect(sent).toEqual([expansion("a#one"), failed]);
  });
});

describe("MessageGate replayed state", () => {
  it("replays settings, then indexing, then busy, then content", () => {
    const { sent, gate } = setup();
    gate.post(slice("a#one"));
    gate.post({ type: "busy", busy: true });
    gate.post({ type: "indexing", indexing: true });
    gate.post({ type: "settings", columnGap: 160 });
    gate.markReady();
    expect(sent.map((message) => message.type)).toEqual([
      "settings",
      "indexing",
      "busy",
      "slice",
    ]);
  });

  it("replays the latest value of each on every ready", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post({ type: "settings", columnGap: 160 });
    gate.post({ type: "settings", columnGap: 224 });
    gate.post({ type: "busy", busy: true });
    sent.length = 0;
    gate.markReady();
    expect(sent).toEqual([
      { type: "settings", columnGap: 224 },
      { type: "busy", busy: true },
    ]);
  });

  it("forgets content on reset but keeps settings, indexing and busy", () => {
    const { sent, gate } = setup();
    gate.markReady();
    gate.post(slice("a#one"));
    gate.post({ type: "settings", columnGap: 160 });
    gate.post({ type: "indexing", indexing: true });
    gate.post({ type: "busy", busy: true });
    sent.length = 0;
    gate.reset();
    gate.markReady();
    expect(sent).toEqual([
      { type: "settings", columnGap: 160 },
      { type: "indexing", indexing: true },
      { type: "busy", busy: true },
    ]);
  });
});
```

Replace `packages/extension/test/webview-messages.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { parseWebviewMessage } from "../src/panel/messages.js";

const project = "/repo/tsconfig.json";

describe("parseWebviewMessage", () => {
  it("accepts the messages with no payload", () => {
    expect(parseWebviewMessage({ type: "ready" })).toEqual({ type: "ready" });
    expect(parseWebviewMessage({ type: "refresh" })).toEqual({
      type: "refresh",
    });
  });

  it("accepts node messages with a project and a string nodeId", () => {
    for (const type of ["openInEditor", "focus"] as const) {
      expect(parseWebviewMessage({ type, project, nodeId: "a.ts#f" })).toEqual({
        type,
        project,
        nodeId: "a.ts#f",
      });
    }
  });

  it("accepts expand with a project, a nodeId and an integer generation", () => {
    expect(
      parseWebviewMessage({
        type: "expand",
        project,
        nodeId: "a.ts#f",
        generation: 3,
      }),
    ).toEqual({ type: "expand", project, nodeId: "a.ts#f", generation: 3 });
  });

  it("accepts openCallSite with a project and a string edgeId", () => {
    expect(
      parseWebviewMessage({ type: "openCallSite", project, edgeId: "e1" }),
    ).toEqual({ type: "openCallSite", project, edgeId: "e1" });
  });

  it("accepts setColumnGap with a finite number", () => {
    expect(parseWebviewMessage({ type: "setColumnGap", value: 128 })).toEqual({
      type: "setColumnGap",
      value: 128,
    });
  });

  it("drops anything malformed or unknown", () => {
    expect(parseWebviewMessage(null)).toBeUndefined();
    expect(parseWebviewMessage("ready")).toBeUndefined();
    expect(parseWebviewMessage({ type: "openInEditor" })).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "openInEditor", nodeId: "a.ts#f" }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "openInEditor", project, nodeId: 3 }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "openCallSite", project, nodeId: "x" }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "expand", project, nodeId: "a.ts#f" }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({
        type: "expand",
        project,
        nodeId: "a.ts#f",
        generation: 1.5,
      }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "setColumnGap", value: Number.NaN }),
    ).toBeUndefined();
    expect(
      parseWebviewMessage({ type: "setColumnGap", value: "wide" }),
    ).toBeUndefined();
    expect(parseWebviewMessage({ type: "bogus" })).toBeUndefined();
  });
});
```

Run: `pnpm --filter code-spider-vscode test dispatch message-gate webview-messages`
Expected: FAIL. `dispatch.test.ts` cannot import `../src/dispatch.js`; the gate
and message tests fail their new expectations.

Implement. Create `packages/extension/src/dispatch.ts`:

Create `packages/extension/src/dispatch.ts`:

```ts
import type { WebviewToExtension } from "@code-spider/webview/protocol";
import type { JumpMessage } from "./navigation.js";
import type { GraphSession } from "./session.js";

export interface JumpPort {
  handle(message: JumpMessage): Promise<void>;
}

export type Dispatch = (message: WebviewToExtension) => Promise<void>;

/**
 * `ready` belongs to the panel's gate. `refresh` is M3b, and `setColumnGap`
 * gets its store in a later task.
 */
export function createDispatcher(deps: {
  jumps: JumpPort;
  session: Pick<GraphSession, "focusNode" | "expand">;
}): Dispatch {
  return async (message) => {
    switch (message.type) {
      case "openInEditor":
      case "openCallSite":
        return deps.jumps.handle(message);
      case "focus":
        return deps.session.focusNode({
          project: message.project,
          nodeId: message.nodeId,
        });
      case "expand":
        return deps.session.expand({
          project: message.project,
          nodeId: message.nodeId,
          generation: message.generation,
        });
      case "ready":
      case "refresh":
      case "setColumnGap":
        return;
    }
  };
}
```

Replace `packages/extension/src/panel/message-gate.ts` with:

```ts
import type { ExtensionToWebview } from "@code-spider/webview/protocol";

type Replayed = "settings" | "indexing" | "busy";
type Kind = Replayed | "content" | "ephemeral";

function kindOf(message: ExtensionToWebview): Kind {
  switch (message.type) {
    case "slice":
      return message.mode.kind === "centre" ? "content" : "ephemeral";
    case "analysisError":
      return "content";
    case "expandFailed":
      return "ephemeral";
    case "settings":
    case "indexing":
    case "busy":
      return message.type;
  }
}

const REPLAY_ORDER: Replayed[] = ["settings", "indexing", "busy"];

/**
 * The webview cannot receive messages until its script has run and posted
 * `ready`, and it restores its own graph from saved state. So the gate keeps
 * three kinds apart:
 * - content (a centre slice, an error) waits for the first `ready` and is
 *   delivered once;
 * - ephemeral messages (an expansion slice, a failed expansion) are sent when
 *   ready and dropped otherwise, so a late answer never reaches a new panel;
 * - settings, indexing and busy are state: the latest of each replays on
 *   every `ready`.
 */
export class MessageGate {
  private ready = false;
  private content: ExtensionToWebview | undefined;
  private readonly replayed = new Map<Replayed, ExtensionToWebview>();

  constructor(private readonly send: (message: ExtensionToWebview) => void) {}

  post(message: ExtensionToWebview): void {
    const kind = kindOf(message);
    if (kind === "settings" || kind === "indexing" || kind === "busy") {
      this.replayed.set(kind, message);
    }
    if (this.ready) {
      this.send(message);
    } else if (kind === "content") {
      this.content = message;
    }
  }

  markReady(): void {
    this.ready = true;
    for (const kind of REPLAY_ORDER) {
      const message = this.replayed.get(kind);
      if (message) this.send(message);
    }
    if (this.content) {
      this.send(this.content);
      this.content = undefined;
    }
  }

  reset(): void {
    this.ready = false;
    this.content = undefined;
  }
}
```

Replace `packages/extension/src/panel/messages.ts` with:

```ts
import type { WebviewToExtension } from "@code-spider/webview/protocol";

/** Messages arrive from a script context, so shape-check before trusting them. */
export function parseWebviewMessage(
  value: unknown,
): WebviewToExtension | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const message = value as Record<string, unknown>;
  const { project, nodeId } = message;
  switch (message.type) {
    case "ready":
    case "refresh":
      return { type: message.type };
    case "openInEditor":
    case "focus":
      return typeof project === "string" && typeof nodeId === "string"
        ? { type: message.type, project, nodeId }
        : undefined;
    case "expand":
      return typeof project === "string" &&
        typeof nodeId === "string" &&
        typeof message.generation === "number" &&
        Number.isInteger(message.generation)
        ? { type: "expand", project, nodeId, generation: message.generation }
        : undefined;
    case "openCallSite":
      return typeof project === "string" && typeof message.edgeId === "string"
        ? { type: "openCallSite", project, edgeId: message.edgeId }
        : undefined;
    case "setColumnGap":
      return typeof message.value === "number" && Number.isFinite(message.value)
        ? { type: "setColumnGap", value: message.value }
        : undefined;
    default:
      return undefined;
  }
}
```

Run: `pnpm --filter code-spider-vscode test dispatch message-gate webview-messages`
Expected: PASS, 21 tests (`dispatch` 4, `message-gate` 11, `webview-messages` 6).
(`message-gate.test.ts` still compiles under vitest even though the extension
does not typecheck yet.)

Now the panel and the extension entry. In `GraphPanel` the webview may be closed
while expansions are in flight; `onClosed` lets the extension clear the jump
table so those answers are dropped.

Edit `packages/extension/src/panel/graph-panel.ts`:

Edit `packages/extension/src/panel/graph-panel.ts` — replace:

```
    private readonly onMessage: (message: WebviewToExtension) => void,
  ) {}

  /** Queued until the webview reports ready, then delivered. */
  post(message: ExtensionToWebview): void {
```

with:

```
    private readonly onMessage: (message: WebviewToExtension) => void,
    private readonly onClosed: () => void,
  ) {}

  /** Delivery follows the gate's rules: content waits for `ready`, expansions do not. */
  post(message: ExtensionToWebview): void {
```

Edit `packages/extension/src/panel/graph-panel.ts` — replace:

```
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.gate.reset();
    });
```

with:

```
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.gate.reset();
      this.onClosed();
    });
```

Edit `packages/extension/src/extension.ts`:

Edit `packages/extension/src/extension.ts` — replace:

```
import { ChangeTracker } from "./changes.js";
import {
  COMMAND_SHOW_GRAPH,
  COMMAND_SHOW_IN_CODE_SPIDER,
  SETTING_MAX_HEAP_MB,
} from "./ids.js";
import { JumpHandler } from "./navigation.js";
```

with:

```
import { ChangeTracker } from "./changes.js";
import { createDispatcher } from "./dispatch.js";
import {
  COMMAND_SHOW_GRAPH,
  COMMAND_SHOW_IN_CODE_SPIDER,
  SETTING_MAX_HEAP_MB,
} from "./ids.js";
import { JumpTable } from "./jump-table.js";
import { JumpHandler } from "./navigation.js";
```

Edit `packages/extension/src/extension.ts` — replace:

```
  /** The entry point a webview click reaches; tests drive click-to-jump here. */
```

with:

```
  /** The entry point a webview message reaches; tests drive the webview's requests here. */
```

Edit `packages/extension/src/extension.ts` — replace:

```
  const panel = new GraphPanel(context.extensionUri, (message) => {
    jumps.handle(message).catch((error: unknown) => {
      notifier.error(
        `Could not open that location: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  });
```

with:

```
  const jumpTable = new JumpTable();
  const panel = new GraphPanel(
    context.extensionUri,
    (message) => {
      dispatch(message).catch((error: unknown) => {
        notifier.error(
          `Could not open that location: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    },
    () => jumpTable.clear(),
  );
```

Edit `packages/extension/src/extension.ts` — replace:

```
    maxHeapMb: getMaxHeapMb,
  });
  const jumps = new JumpHandler(() => session.currentGraph(), revealer);
```

with:

```
    maxHeapMb: getMaxHeapMb,
    jumps: jumpTable,
  });
  const dispatch = createDispatcher({
    jumps: new JumpHandler(jumpTable, revealer),
    session,
  });
```

Edit `packages/extension/src/extension.ts` — replace:

```
    handleWebviewMessage: (message) => jumps.handle(message),
```

with:

```
    handleWebviewMessage: (message) => dispatch(message),
```

- [ ] **Step 6: Smoke cases send the project; typecheck, build and the whole suite**

The four existing smoke cases drive clicks through `handleWebviewMessage`, which
now requires a `project`. Update them (they run in Task 9).

Edit `packages/extension/smoke/suite/extension.smoke.ts`:

Edit `packages/extension/smoke/suite/extension.smoke.ts` — replace:

```
describe("Code Spider", () => {
  let api: ExtensionApi;
```

with:

```
function currentProject(api: ExtensionApi): string {
  const graph = api.currentGraph();
  assert.ok(graph, "no graph: the panel test must pass first");
  return graph.tsconfig;
}

describe("Code Spider", () => {
  let api: ExtensionApi;
```

Edit `packages/extension/smoke/suite/extension.smoke.ts` — replace:

```
    assert.ok(api.currentGraph(), "no graph: the panel test must pass first");

    await api.handleWebviewMessage({
      type: "openInEditor",
      nodeId: "src/signup.ts#validateUser",
    });
```

with:

```
    await api.handleWebviewMessage({
      type: "openInEditor",
      project: currentProject(api),
      nodeId: "src/signup.ts#validateUser",
    });
```

Edit `packages/extension/smoke/suite/extension.smoke.ts` — replace:

```
    assert.ok(api.currentGraph(), "no graph: the panel test must pass first");

    await api.handleWebviewMessage({
      type: "openCallSite",
      edgeId: "src/signup.ts#handleSignup->src/app.ts#main",
    });
```

with:

```
    await api.handleWebviewMessage({
      type: "openCallSite",
      project: currentProject(api),
      edgeId: "src/signup.ts#handleSignup->src/app.ts#main",
    });
```

Run: `pnpm -r typecheck`
Expected: no errors in any package (the extension step also type-checks the
smoke folder).

Run: `pnpm -r test`
Expected: all green. Counts: core 231, CLI 43, webview 58, extension 127. (Read
each package's own `Tests` line.)

Run: `pnpm build`
Expected: completes with no errors.

- [ ] **Step 7: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: modified files under `packages/webview/src`, `packages/webview/test`,
`packages/extension/src`, `packages/extension/test` and
`packages/extension/smoke/suite`; new `packages/extension/src/jump-table.ts`,
`packages/extension/src/dispatch.ts`, `packages/extension/test/jump-table.test.ts`,
`packages/extension/test/dispatch.test.ts`,
`packages/extension/test/session-nodes.test.ts` and
`packages/extension/test/support/session-setup.ts`.

Run: `git diff --check -- packages/webview packages/extension`
Expected: no output.

Run: `git diff -- packages/webview packages/extension`
Expected: only the changes from Steps 1 to 6.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/extension); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `add node-scoped slices, a jump table and the expand and focus protocol`

The implementer does not stage or commit; the user does.

### Task 3: Webview graph-state model

This task is pure logic. It adds the data the webview will own from now on (the
`ViewState`) and the plain functions over it: merge an expansion, collapse a
node, pin and unpin, commit a new centre, step Back, and decide whether a saved
state can be trusted. Nothing is wired into React yet; Tasks 5 to 7 do that.
The column-gap module is created here too, because the view state's default
`columnGap` comes from it (the extension reuses it in Task 7).

**Files:**
- Create: `packages/webview/src/column-gap.ts`
- Modify: `packages/webview/package.json` (export `./column-gap`)
- Create: `packages/webview/src/view/types.ts`
- Create: `packages/webview/src/view/graph-state.ts`
- Create: `packages/webview/src/view/view-state.ts`
- Create: `packages/webview/src/view/persist.ts`
- Test: `packages/webview/test/support/graph-states.ts`
- Test: `packages/webview/test/column-gap.test.ts`
- Test: `packages/webview/test/graph-state.test.ts`
- Test: `packages/webview/test/history.test.ts`
- Test: `packages/webview/test/persist.test.ts`

**Interfaces:**
- Consumes: `GraphSlice`, `GraphNode`, `GraphEdge`, `NodeId` from
  `@code-spider/core/types` (type-only). Slice facts the code relies on: every
  edge's `from` and `to` is a node id in the same slice; the focus node is in
  its own slice; ids never collide with `Object.prototype` names because node ids
  contain `#` and edge ids contain `->`.
- Produces `src/column-gap.ts`: `COLUMN_GAP = { min: 32, max: 480, step: 16,
  default: 192 }` and `normaliseColumnGap(raw: unknown): number` (not a finite
  number gives the default; otherwise clamp to the range, then snap to the
  step). It is exported as `@code-spider/webview/column-gap`.
- Produces `src/view/types.ts`:

  ```ts
  export type Point = { x: number; y: number };
  export type SliceRecord = { members: NodeId[]; edgeIds: string[] };
  export type GraphState = {
    generation: number;
    project: string;
    focusId: NodeId;
    nodes: Record<NodeId, GraphNode>;
    edges: Record<string, GraphEdge>;
    slices: Record<NodeId, SliceRecord>;
    positions: Record<NodeId, Point>;
    pinned: NodeId[];
    revision: number;
  };
  export type ViewState = {
    version: 1;
    nextGeneration: number;
    columnGap: number;
    current: GraphState | undefined;
    history: GraphState[];
  };
  ```

  `slices[key]` records what the slice fetched for `key` brought in:
  `members` are its node ids other than `key`, `edgeIds` all its edge ids. The
  centre's own slice is `slices[focusId]`. A node is *expanded* when it is not
  the centre and `slices` has its key. `revision` goes up by one whenever
  nodes, edges, pins or positions change.
- Produces `src/view/graph-state.ts`: `graphFromSlice(slice, project,
  positions?): GraphState`, `isExpanded(graph, nodeId): boolean`,
  `mergeExpansion(graph, nodeId, slice): { graph: GraphState; added: NodeId[] }`,
  `collapseNode(graph, nodeId): GraphState`, `pinNodes(graph, moved):
  GraphState`, `unpinNode(graph, nodeId): GraphState`, `setPositions(graph,
  positions): GraphState`. All return new objects and never mutate their input.
- Produces `src/view/view-state.ts`: `HISTORY_LIMIT = 20`, `createView(columnGap?):
  ViewState`, `commitCentre(view, graph): ViewState`, `goBack(view): ViewState`,
  `canGoBack(view): boolean`, `replaceCurrent(view, graph): ViewState`.
- Produces `src/view/persist.ts`: `isGraphState(value: unknown): value is
  GraphState` and `isViewState(value: unknown): value is ViewState`.
- Tests after this task: core 231, CLI 43, webview 99 (58 plus 41), extension 127.

- [ ] **Step 1: Column gap module**

The slider's range and the default live in one pure module that both the webview
and (in Task 7) the extension import.

Create `packages/webview/test/column-gap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COLUMN_GAP, normaliseColumnGap } from "../src/column-gap.js";

describe("COLUMN_GAP", () => {
  it("is a 32 to 480 slider in steps of 16 that starts at 192", () => {
    expect(COLUMN_GAP).toEqual({ min: 32, max: 480, step: 16, default: 192 });
    expect((COLUMN_GAP.default - COLUMN_GAP.min) % COLUMN_GAP.step).toBe(0);
  });
});

describe("normaliseColumnGap", () => {
  it("falls back to the default for anything that is not a finite number", () => {
    for (const raw of [undefined, null, "wide", Number.NaN, Infinity, {}]) {
      expect(normaliseColumnGap(raw)).toBe(192);
    }
  });

  it("clamps to the range", () => {
    expect(normaliseColumnGap(0)).toBe(32);
    expect(normaliseColumnGap(-50)).toBe(32);
    expect(normaliseColumnGap(5000)).toBe(480);
  });

  it("snaps to the step and keeps valid values as they are", () => {
    expect(normaliseColumnGap(100)).toBe(96);
    expect(normaliseColumnGap(105)).toBe(112);
    for (const value of [32, 48, 192, 464, 480]) {
      expect(normaliseColumnGap(value)).toBe(value);
    }
  });
});
```

Run: `pnpm --filter @code-spider/webview test column-gap`
Expected: FAIL to import `../src/column-gap.js`.

Create `packages/webview/src/column-gap.ts`:

```ts
export const COLUMN_GAP = {
  min: 32,
  max: 480,
  step: 16,
  default: 192,
} as const;

export function normaliseColumnGap(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return COLUMN_GAP.default;
  }
  const clamped = Math.min(COLUMN_GAP.max, Math.max(COLUMN_GAP.min, raw));
  return Math.round(clamped / COLUMN_GAP.step) * COLUMN_GAP.step;
}
```

Edit `packages/webview/package.json` — replace:

```
    "./protocol": "./src/protocol.ts"
```

with:

```
    "./protocol": "./src/protocol.ts",
    "./column-gap": "./src/column-gap.ts"
```

Run: `pnpm --filter @code-spider/webview test column-gap`
Expected: PASS, 4 tests.

- [ ] **Step 2: The graph state: build, merge, collapse, pin**

Write the support helpers and the tests first. The helpers build small graphs
whose nodes are named by a short name; a supplier of `x` has an edge `supplier ->
x` and a consumer an edge `x -> consumer`, as in the analyser's output.

Create `packages/webview/test/support/graph-states.ts`:

```ts
import type { GraphSlice } from "@code-spider/core/types";
import { graphFromSlice } from "../../src/view/graph-state.js";
import type { GraphState } from "../../src/view/types.js";
import { makeEdge, makeNode, makeSlice } from "./slices.js";

export const PROJECT = "/repo/tsconfig.json";

export const id = (name: string): string => `src/a.ts#${name}`;

export function sliceOf(
  focus: string,
  suppliers: string[] = [],
  consumers: string[] = [],
): GraphSlice {
  const names = [focus, ...suppliers, ...consumers];
  return makeSlice(
    id(focus),
    names.map((name) => makeNode({ id: id(name) })),
    [
      ...suppliers.map((name) => makeEdge(id(name), id(focus))),
      ...consumers.map((name) => makeEdge(id(focus), id(name))),
    ],
  );
}

export function graphOf(
  focus: string,
  suppliers: string[] = [],
  consumers: string[] = [],
): GraphState {
  return graphFromSlice(sliceOf(focus, suppliers, consumers), PROJECT);
}

export function nodeIds(graph: GraphState): string[] {
  return Object.keys(graph.nodes).sort();
}

export function edgeIds(graph: GraphState): string[] {
  return Object.keys(graph.edges).sort();
}
```

Create `packages/webview/test/graph-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  collapseNode,
  graphFromSlice,
  isExpanded,
  mergeExpansion,
  pinNodes,
  setPositions,
  unpinNode,
} from "../src/view/graph-state.js";
import {
  edgeIds,
  graphOf,
  id,
  nodeIds,
  PROJECT,
  sliceOf,
} from "./support/graph-states.js";

describe("graphFromSlice", () => {
  it("builds the centre graph and records the centre's slice", () => {
    const graph = graphOf("a", ["b"], ["c"]);
    expect(graph.project).toBe(PROJECT);
    expect(graph.focusId).toBe(id("a"));
    expect(nodeIds(graph)).toEqual([id("a"), id("b"), id("c")]);
    expect(edgeIds(graph)).toEqual([
      `${id("a")}->${id("c")}`,
      `${id("b")}->${id("a")}`,
    ]);
    expect(graph.slices[id("a")]).toEqual({
      members: [id("a"), id("b"), id("c")].filter((node) => node !== id("a")),
      edgeIds: [`${id("b")}->${id("a")}`, `${id("a")}->${id("c")}`],
    });
    expect(graph.pinned).toEqual([]);
    expect(graph.revision).toBe(0);
    expect(isExpanded(graph, id("a"))).toBe(false);
  });

  it("takes the positions it is given", () => {
    const graph = graphFromSlice(sliceOf("a"), PROJECT, {
      [id("a")]: { x: 5, y: 6 },
    });
    expect(graph.positions).toEqual({ [id("a")]: { x: 5, y: 6 } });
  });
});

describe("mergeExpansion", () => {
  it("adds the nodes and edges that are new and records the slice", () => {
    const graph = graphOf("a", ["b"]);
    const { graph: merged, added } = mergeExpansion(
      graph,
      id("b"),
      sliceOf("b", ["d"], ["a"]),
    );
    expect(added).toEqual([id("d")]);
    expect(nodeIds(merged)).toEqual([id("a"), id("b"), id("d")]);
    expect(edgeIds(merged)).toEqual([
      `${id("b")}->${id("a")}`,
      `${id("d")}->${id("b")}`,
    ]);
    expect(merged.slices[id("b")]).toEqual({
      members: [id("d"), id("a")],
      edgeIds: [`${id("d")}->${id("b")}`, `${id("b")}->${id("a")}`],
    });
    expect(isExpanded(merged, id("b"))).toBe(true);
    expect(merged.revision).toBe(graph.revision + 1);
  });

  it("is idempotent", () => {
    const slice = sliceOf("b", ["d"], ["a"]);
    const once = mergeExpansion(graphOf("a", ["b"]), id("b"), slice);
    const twice = mergeExpansion(once.graph, id("b"), slice);
    expect(twice.added).toEqual([]);
    expect(twice.graph).toEqual(once.graph);
  });

  it("records the slice and adds a missing edge even when no node is new", () => {
    const graph = graphOf("a", [], ["c"]);
    const { graph: merged, added } = mergeExpansion(
      graph,
      id("c"),
      sliceOf("c", [], ["a"]),
    );
    expect(added).toEqual([]);
    expect(nodeIds(merged)).toEqual(nodeIds(graph));
    expect(edgeIds(merged)).toContain(`${id("c")}->${id("a")}`);
    expect(isExpanded(merged, id("c"))).toBe(true);
  });

  it("leaves the revision alone when nothing was added", () => {
    const graph = graphOf("a", ["b"]);
    const { graph: merged } = mergeExpansion(
      graph,
      id("b"),
      sliceOf("b", [], ["a"]),
    );
    expect(isExpanded(merged, id("b"))).toBe(true);
    expect(merged.revision).toBe(graph.revision);
  });

  it("never replaces or moves a node that is already there", () => {
    const base = graphOf("a", ["b"]);
    const graph = setPositions(base, { [id("a")]: { x: 10, y: 20 } });
    const original = graph.nodes[id("a")];
    const { graph: merged } = mergeExpansion(
      graph,
      id("b"),
      sliceOf("b", ["d"], ["a"]),
    );
    expect(merged.nodes[id("a")]).toBe(original);
    expect(merged.positions).toEqual({ [id("a")]: { x: 10, y: 20 } });
  });

  it("does not modify the graph it was given", () => {
    const graph = graphOf("a", ["b"]);
    const snapshot = structuredClone(graph);
    mergeExpansion(graph, id("b"), sliceOf("b", ["d"], ["a"]));
    expect(graph).toEqual(snapshot);
  });
});

describe("collapseNode", () => {
  it("removes only what the expansion brought", () => {
    const base = graphOf("a", ["b"], ["c"]);
    const expanded = mergeExpansion(
      base,
      id("b"),
      sliceOf("b", ["d"], ["a"]),
    ).graph;
    const collapsed = collapseNode(expanded, id("b"));
    expect(nodeIds(collapsed)).toEqual([id("a"), id("b"), id("c")]);
    expect(edgeIds(collapsed)).toEqual(edgeIds(base));
    expect(isExpanded(collapsed, id("b"))).toBe(false);
    expect(collapsed.revision).toBe(expanded.revision + 1);
  });

  it("recurses: whatever was expanded only through the node goes with it", () => {
    let graph = graphOf("a", ["b"]);
    graph = mergeExpansion(graph, id("b"), sliceOf("b", ["d"], ["a"])).graph;
    graph = mergeExpansion(graph, id("d"), sliceOf("d", ["e"], ["b"])).graph;
    expect(nodeIds(graph)).toEqual([id("a"), id("b"), id("d"), id("e")]);

    const collapsed = collapseNode(graph, id("b"));
    expect(nodeIds(collapsed)).toEqual([id("a"), id("b")]);
    expect(Object.keys(collapsed.slices)).toEqual([id("a")]);
    expect(edgeIds(collapsed)).toEqual([`${id("b")}->${id("a")}`]);
  });

  it("keeps a node the centre's slice also brought in", () => {
    const base = graphOf("a", ["b"], ["c"]);
    const expanded = mergeExpansion(
      base,
      id("b"),
      sliceOf("b", [], ["a", "c"]),
    ).graph;
    expect(edgeIds(expanded)).toContain(`${id("b")}->${id("c")}`);

    const collapsed = collapseNode(expanded, id("b"));
    expect(nodeIds(collapsed)).toContain(id("c"));
    expect(edgeIds(collapsed)).not.toContain(`${id("b")}->${id("c")}`);
  });

  it("keeps a node another expanded node's slice also brought in, until that one collapses too", () => {
    let graph = graphOf("a", ["b"], ["c"]);
    graph = mergeExpansion(graph, id("b"), sliceOf("b", ["x"], ["a"])).graph;
    graph = mergeExpansion(graph, id("c"), sliceOf("c", ["x"], ["a"])).graph;

    const withoutB = collapseNode(graph, id("b"));
    expect(nodeIds(withoutB)).toContain(id("x"));
    expect(edgeIds(withoutB)).toContain(`${id("x")}->${id("c")}`);
    expect(edgeIds(withoutB)).not.toContain(`${id("x")}->${id("b")}`);

    const withoutBoth = collapseNode(withoutB, id("c"));
    expect(nodeIds(withoutBoth)).not.toContain(id("x"));
  });

  it("keeps a pinned node as a lone box when it loses all its edges", () => {
    let graph = graphOf("a", ["b"]);
    graph = mergeExpansion(graph, id("b"), sliceOf("b", ["d"], ["a"])).graph;
    graph = pinNodes(graph, { [id("d")]: { x: 40, y: 50 } });

    const collapsed = collapseNode(graph, id("b"));
    expect(nodeIds(collapsed)).toEqual([id("a"), id("b"), id("d")]);
    expect(collapsed.pinned).toEqual([id("d")]);
    expect(collapsed.positions[id("d")]).toEqual({ x: 40, y: 50 });
    expect(edgeIds(collapsed)).toEqual([`${id("b")}->${id("a")}`]);
  });

  it("drops the positions of the nodes it removes", () => {
    let graph = graphOf("a", ["b"]);
    graph = mergeExpansion(graph, id("b"), sliceOf("b", ["d"], ["a"])).graph;
    graph = setPositions(graph, {
      [id("a")]: { x: 0, y: 0 },
      [id("d")]: { x: -400, y: 0 },
    });
    const collapsed = collapseNode(graph, id("b"));
    expect(Object.keys(collapsed.positions)).toEqual([id("a")]);
  });

  it("terminates on cycles and keeps everything the centre still reaches", () => {
    let graph = graphOf("a", ["b"]);
    graph = mergeExpansion(graph, id("b"), sliceOf("b", ["c"], ["a"])).graph;
    graph = mergeExpansion(graph, id("c"), sliceOf("c", ["a"], ["b"])).graph;
    expect(nodeIds(graph)).toEqual([id("a"), id("b"), id("c")]);

    const collapsed = collapseNode(graph, id("b"));
    expect(nodeIds(collapsed)).toEqual([id("a"), id("b")]);
    expect(Object.keys(collapsed.slices)).toEqual([id("a")]);
  });

  it("changes nothing for the centre or for a node that is not expanded", () => {
    const graph = graphOf("a", ["b"]);
    expect(collapseNode(graph, id("a"))).toBe(graph);
    expect(collapseNode(graph, id("b"))).toBe(graph);
    expect(collapseNode(graph, id("missing"))).toBe(graph);
  });
});

describe("pinNodes, unpinNode and setPositions", () => {
  it("writes the positions, pins each node once and counts a revision", () => {
    const graph = graphOf("a", ["b"]);
    const pinned = pinNodes(graph, {
      [id("a")]: { x: 1, y: 2 },
      [id("b")]: { x: 3, y: 4 },
    });
    expect(pinned.positions).toEqual({
      [id("a")]: { x: 1, y: 2 },
      [id("b")]: { x: 3, y: 4 },
    });
    expect(pinned.pinned).toEqual([id("a"), id("b")]);
    expect(pinned.revision).toBe(graph.revision + 1);

    const again = pinNodes(pinned, { [id("a")]: { x: 9, y: 9 } });
    expect(again.pinned).toEqual([id("a"), id("b")]);
    expect(again.positions[id("a")]).toEqual({ x: 9, y: 9 });
  });

  it("ignores nodes the graph does not have", () => {
    const graph = graphOf("a");
    expect(pinNodes(graph, { [id("gone")]: { x: 1, y: 1 } })).toBe(graph);
    expect(setPositions(graph, { [id("gone")]: { x: 1, y: 1 } })).toBe(graph);
  });

  it("unpins without moving the node", () => {
    const pinned = pinNodes(graphOf("a"), { [id("a")]: { x: 7, y: 8 } });
    const unpinned = unpinNode(pinned, id("a"));
    expect(unpinned.pinned).toEqual([]);
    expect(unpinned.positions[id("a")]).toEqual({ x: 7, y: 8 });
    expect(unpinNode(unpinned, id("a"))).toBe(unpinned);
  });

  it("setPositions moves nodes without pinning them", () => {
    const graph = graphOf("a", ["b"]);
    const moved = setPositions(graph, { [id("b")]: { x: 5, y: 6 } });
    expect(moved.positions).toEqual({ [id("b")]: { x: 5, y: 6 } });
    expect(moved.pinned).toEqual([]);
    expect(moved.revision).toBe(graph.revision + 1);
  });
});
```

Run: `pnpm --filter @code-spider/webview test graph-state`
Expected: FAIL to import `../src/view/graph-state.js`.

Implement the types and the functions.

Create `packages/webview/src/view/types.ts`:

```ts
import type { GraphEdge, GraphNode, NodeId } from "@code-spider/core/types";

export type Point = { x: number; y: number };

/** What one slice brought in; the key is the node it was fetched for. */
export type SliceRecord = { members: NodeId[]; edgeIds: string[] };

export type GraphState = {
  generation: number;
  /** Absolute tsconfig path, opaque to the webview. */
  project: string;
  /** The centre. */
  focusId: NodeId;
  nodes: Record<NodeId, GraphNode>;
  edges: Record<string, GraphEdge>;
  /** The key `focusId` holds the centre's own slice. */
  slices: Record<NodeId, SliceRecord>;
  /** Top-left corners in flow coordinates. */
  positions: Record<NodeId, Point>;
  pinned: NodeId[];
  /** Goes up by one on any change to nodes, edges, pins or positions. */
  revision: number;
};

export type ViewState = {
  version: 1;
  /** Starts at 1. */
  nextGeneration: number;
  columnGap: number;
  current: GraphState | undefined;
  /** Oldest first. */
  history: GraphState[];
};
```

Create `packages/webview/src/view/graph-state.ts`:

```ts
import type { GraphSlice, NodeId } from "@code-spider/core/types";
import type { GraphState, Point, SliceRecord } from "./types.js";

export type Merged = { graph: GraphState; added: NodeId[] };

function sliceRecord(slice: GraphSlice, key: NodeId): SliceRecord {
  return {
    members: slice.nodes.map((node) => node.id).filter((id) => id !== key),
    edgeIds: slice.edges.map((edge) => edge.id),
  };
}

function keepEntries<T>(
  record: Record<string, T>,
  keep: (key: string) => boolean,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => keep(key)),
  );
}

export function graphFromSlice(
  slice: GraphSlice,
  project: string,
  positions: Record<NodeId, Point> = {},
): GraphState {
  return {
    generation: 0,
    project,
    focusId: slice.focusId,
    nodes: Object.fromEntries(slice.nodes.map((node) => [node.id, node])),
    edges: Object.fromEntries(slice.edges.map((edge) => [edge.id, edge])),
    slices: { [slice.focusId]: sliceRecord(slice, slice.focusId) },
    positions,
    pinned: [],
    revision: 0,
  };
}

/** Expanded means not the centre and holding a slice of its own. */
export function isExpanded(graph: GraphState, nodeId: NodeId): boolean {
  return nodeId !== graph.focusId && Object.hasOwn(graph.slices, nodeId);
}

/**
 * Adds the nodes and edges whose ids are absent and records the slice. A node
 * that is already there is never replaced.
 */
export function mergeExpansion(
  graph: GraphState,
  nodeId: NodeId,
  slice: GraphSlice,
): Merged {
  const nodes = { ...graph.nodes };
  const edges = { ...graph.edges };
  const added: NodeId[] = [];
  let edgeAdded = false;
  for (const node of slice.nodes) {
    if (Object.hasOwn(nodes, node.id)) continue;
    nodes[node.id] = node;
    added.push(node.id);
  }
  for (const edge of slice.edges) {
    if (Object.hasOwn(edges, edge.id)) continue;
    edges[edge.id] = edge;
    edgeAdded = true;
  }
  const changed = added.length > 0 || edgeAdded;
  return {
    graph: {
      ...graph,
      nodes,
      edges,
      slices: { ...graph.slices, [nodeId]: sliceRecord(slice, nodeId) },
      revision: changed ? graph.revision + 1 : graph.revision,
    },
    added,
  };
}

/** The nodes reachable from the centre through the recorded slices. */
function reachableFromCentre(
  focusId: NodeId,
  slices: Record<NodeId, SliceRecord>,
): Set<NodeId> {
  const reached = new Set<NodeId>([focusId]);
  const pending = [focusId];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    for (const member of slices[id]?.members ?? []) {
      if (reached.has(member)) continue;
      reached.add(member);
      pending.push(member);
    }
  }
  return reached;
}

/**
 * Forgets the node's slice, then everything that is no longer reachable from the
 * centre. Pinned nodes stay, and an edge stays only while both ends do and a
 * remaining slice lists it.
 */
export function collapseNode(graph: GraphState, nodeId: NodeId): GraphState {
  if (!isExpanded(graph, nodeId)) return graph;
  const withoutNode = keepEntries(graph.slices, (key) => key !== nodeId);
  const reachable = reachableFromCentre(graph.focusId, withoutNode);
  const slices = keepEntries(withoutNode, (key) => reachable.has(key));
  const keptNode = (id: NodeId) =>
    reachable.has(id) || graph.pinned.includes(id);
  const listed = new Set(
    Object.values(slices).flatMap((record) => record.edgeIds),
  );
  const nodes = keepEntries(graph.nodes, keptNode);
  const edges = Object.fromEntries(
    Object.entries(graph.edges).filter(
      ([key, edge]) =>
        listed.has(key) && keptNode(edge.from) && keptNode(edge.to),
    ),
  );
  const removed =
    Object.keys(graph.nodes).length !== Object.keys(nodes).length ||
    Object.keys(graph.edges).length !== Object.keys(edges).length;
  return {
    ...graph,
    nodes,
    edges,
    slices,
    positions: keepEntries(graph.positions, keptNode),
    revision: removed ? graph.revision + 1 : graph.revision,
  };
}

function existing(
  graph: GraphState,
  positions: Record<NodeId, Point>,
): [NodeId, Point][] {
  return Object.entries(positions).filter(([id]) =>
    Object.hasOwn(graph.nodes, id),
  );
}

/** Writes final drag positions and pins the dragged nodes. */
export function pinNodes(
  graph: GraphState,
  moved: Record<NodeId, Point>,
): GraphState {
  const entries = existing(graph, moved);
  if (entries.length === 0) return graph;
  const fresh = entries
    .map(([id]) => id)
    .filter((id) => !graph.pinned.includes(id));
  return {
    ...graph,
    positions: { ...graph.positions, ...Object.fromEntries(entries) },
    pinned: [...graph.pinned, ...fresh],
    revision: graph.revision + 1,
  };
}

/** The node keeps its position. */
export function unpinNode(graph: GraphState, nodeId: NodeId): GraphState {
  if (!graph.pinned.includes(nodeId)) return graph;
  return {
    ...graph,
    pinned: graph.pinned.filter((id) => id !== nodeId),
    revision: graph.revision + 1,
  };
}

/** Writes positions without pinning, for layouts. */
export function setPositions(
  graph: GraphState,
  positions: Record<NodeId, Point>,
): GraphState {
  const entries = existing(graph, positions);
  if (entries.length === 0) return graph;
  return {
    ...graph,
    positions: { ...graph.positions, ...Object.fromEntries(entries) },
    revision: graph.revision + 1,
  };
}
```

Run: `pnpm --filter @code-spider/webview test graph-state`
Expected: PASS, 20 tests.

- [ ] **Step 3: The view state: new centre, Back and history**

Write the tests first.

Create `packages/webview/test/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COLUMN_GAP } from "../src/column-gap.js";
import {
  mergeExpansion,
  pinNodes,
  graphFromSlice,
} from "../src/view/graph-state.js";
import {
  canGoBack,
  commitCentre,
  createView,
  goBack,
  HISTORY_LIMIT,
  replaceCurrent,
} from "../src/view/view-state.js";
import { graphOf, id, PROJECT, sliceOf } from "./support/graph-states.js";

describe("createView", () => {
  it("starts empty with generation 1 next and the default column gap", () => {
    expect(createView()).toEqual({
      version: 1,
      nextGeneration: 1,
      columnGap: COLUMN_GAP.default,
      current: undefined,
      history: [],
    });
    expect(createView(96).columnGap).toBe(96);
  });
});

describe("commitCentre", () => {
  it("makes the first graph current with a fresh generation and no history", () => {
    const view = commitCentre(createView(), graphOf("a", ["b"]));
    expect(view.current?.generation).toBe(1);
    expect(view.nextGeneration).toBe(2);
    expect(view.history).toEqual([]);
    expect(canGoBack(view)).toBe(false);
  });

  it("pushes the previous graph when the centre changes", () => {
    const first = commitCentre(createView(), graphOf("a", ["b"]));
    const second = commitCentre(first, graphOf("b", [], ["a"]));
    expect(second.history).toEqual([first.current]);
    expect(second.current?.focusId).toBe(id("b"));
    expect(second.current?.generation).toBe(2);
    expect(canGoBack(second)).toBe(true);
  });

  it("skips a previous graph that re-centring on the same node recreates", () => {
    const first = commitCentre(createView(), graphOf("a", ["b"]));
    const again = commitCentre(first, graphOf("a", ["b"]));
    expect(again.history).toEqual([]);
    expect(again.current?.generation).toBe(2);
  });

  it("keeps a previous graph with expansions, pins or another project", () => {
    const base = graphOf("a", ["b"]);
    const expanded = mergeExpansion(
      base,
      id("b"),
      sliceOf("b", ["d"], ["a"]),
    ).graph;
    const pinned = pinNodes(base, { [id("a")]: { x: 1, y: 1 } });
    const elsewhere = graphFromSlice(
      sliceOf("a", ["b"]),
      "/other/tsconfig.json",
    );

    for (const previous of [expanded, pinned, elsewhere]) {
      const view = commitCentre(commitCentre(createView(), previous), base);
      expect(view.history).toHaveLength(1);
    }
  });

  it("drops the oldest entry when the 21st arrives", () => {
    let view = createView();
    for (let index = 0; index <= HISTORY_LIMIT + 1; index += 1) {
      view = commitCentre(view, graphOf(`n${index}`));
    }
    expect(HISTORY_LIMIT).toBe(20);
    expect(view.history).toHaveLength(20);
    expect(view.history[0]?.focusId).toBe(id("n1"));
    expect(view.history.at(-1)?.focusId).toBe(id("n20"));
    expect(view.current?.focusId).toBe(id("n21"));
  });
});

describe("goBack", () => {
  it("restores the previous graph exactly, with a fresh generation", () => {
    const base = graphOf("a", ["b"]);
    let first = commitCentre(createView(), base);
    first = replaceCurrent(
      first,
      pinNodes(
        mergeExpansion(
          first.current ?? base,
          id("b"),
          sliceOf("b", ["d"], ["a"]),
        ).graph,
        { [id("d")]: { x: 30, y: 40 } },
      ),
    );
    const left = first.current;
    const second = commitCentre(first, graphOf("b", [], ["a"]));

    const back = goBack(second);

    expect(back.current).toEqual({
      ...left,
      generation: second.nextGeneration,
    });
    expect(back.current?.generation).toBeGreaterThan(
      second.current?.generation ?? 0,
    );
    expect(back.nextGeneration).toBe(second.nextGeneration + 1);
    expect(back.history).toEqual([]);
    expect(canGoBack(back)).toBe(false);
  });

  it("steps back through several centres, newest first", () => {
    let view = createView();
    for (const name of ["a", "b", "c"]) {
      view = commitCentre(view, graphOf(name));
    }
    view = goBack(view);
    expect(view.current?.focusId).toBe(id("b"));
    view = goBack(view);
    expect(view.current?.focusId).toBe(id("a"));
  });

  it("changes nothing when there is no history", () => {
    const view = commitCentre(createView(), graphOf("a"));
    expect(goBack(view)).toBe(view);
  });
});

describe("replaceCurrent", () => {
  it("swaps the current graph without touching history or generations", () => {
    const view = commitCentre(createView(), graphOf("a", ["b"]));
    const next = replaceCurrent(
      view,
      graphFromSlice(sliceOf("a"), PROJECT, { [id("a")]: { x: 1, y: 2 } }),
    );
    expect(next.current?.positions).toEqual({ [id("a")]: { x: 1, y: 2 } });
    expect(next.nextGeneration).toBe(view.nextGeneration);
    expect(next.history).toBe(view.history);
  });
});
```

Run: `pnpm --filter @code-spider/webview test history`
Expected: FAIL to import `../src/view/view-state.js`.

Create `packages/webview/src/view/view-state.ts`:

```ts
import { COLUMN_GAP } from "../column-gap.js";
import type { GraphState, ViewState } from "./types.js";

export const HISTORY_LIMIT = 20;

export function createView(columnGap: number = COLUMN_GAP.default): ViewState {
  return {
    version: 1,
    nextGeneration: 1,
    columnGap,
    current: undefined,
    history: [],
  };
}

export function canGoBack(view: ViewState): boolean {
  return view.history.length > 0;
}

function hasExpansions(graph: GraphState): boolean {
  return Object.keys(graph.slices).some((key) => key !== graph.focusId);
}

/** Re-centring on the same node would rebuild it, so Back need not keep it. */
function isRecoverable(previous: GraphState, next: GraphState): boolean {
  return (
    previous.project === next.project &&
    previous.focusId === next.focusId &&
    !hasExpansions(previous) &&
    previous.pinned.length === 0
  );
}

/**
 * Makes a freshly laid-out graph current. The graph it replaces goes onto the
 * history unless it is trivially recoverable, and the new one gets a new
 * generation so answers still in flight for the old one are dropped.
 */
export function commitCentre(view: ViewState, graph: GraphState): ViewState {
  const previous = view.current;
  const keep = previous && !isRecoverable(previous, graph);
  return {
    ...view,
    nextGeneration: view.nextGeneration + 1,
    current: { ...graph, generation: view.nextGeneration },
    history: keep
      ? [...view.history, previous].slice(-HISTORY_LIMIT)
      : view.history,
  };
}

/** Restores the newest history entry as it was, under a fresh generation. */
export function goBack(view: ViewState): ViewState {
  const restored = view.history.at(-1);
  if (!restored) return view;
  return {
    ...view,
    nextGeneration: view.nextGeneration + 1,
    current: { ...restored, generation: view.nextGeneration },
    history: view.history.slice(0, -1),
  };
}

/** For changes to the current graph that are not a new centre. */
export function replaceCurrent(view: ViewState, graph: GraphState): ViewState {
  return { ...view, current: graph };
}
```

Run: `pnpm --filter @code-spider/webview test history`
Expected: PASS, 10 tests.

- [ ] **Step 4: Trusting a saved state**

The webview will restore `getState()` on load. `isViewState` decides whether
what comes back is something the code can safely render.

Create `packages/webview/test/persist.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isGraphState, isViewState } from "../src/view/persist.js";
import { mergeExpansion, pinNodes } from "../src/view/graph-state.js";
import { commitCentre, createView } from "../src/view/view-state.js";
import { graphOf, id, sliceOf } from "./support/graph-states.js";

function populatedView() {
  let view = commitCentre(createView(), graphOf("a", ["b"], ["c"]));
  const base = view.current;
  if (!base) throw new Error("no graph");
  const expanded = mergeExpansion(base, id("b"), sliceOf("b", ["d"], ["a"]));
  view = commitCentre(
    view,
    pinNodes(expanded.graph, { [id("d")]: { x: 1, y: 2 } }),
  );
  return commitCentre(view, graphOf("c", ["a"]));
}

describe("isViewState", () => {
  it("accepts a fresh view and one with a graph and history", () => {
    expect(isViewState(createView())).toBe(true);
    expect(isViewState(populatedView())).toBe(true);
  });

  it("accepts what survives a trip through JSON, which drops undefined", () => {
    const empty = JSON.parse(JSON.stringify(createView())) as unknown;
    const populated = JSON.parse(JSON.stringify(populatedView())) as unknown;
    expect(isViewState(empty)).toBe(true);
    expect(isViewState(populated)).toBe(true);
  });

  it("rejects values that are not a view state", () => {
    for (const value of [undefined, null, 3, "x", [], {}]) {
      expect(isViewState(value)).toBe(false);
    }
  });

  it("rejects another version or a wrong field type", () => {
    const view = createView();
    expect(isViewState({ ...view, version: 2 })).toBe(false);
    expect(isViewState({ ...view, nextGeneration: "1" })).toBe(false);
    expect(isViewState({ ...view, columnGap: Number.NaN })).toBe(false);
    expect(isViewState({ ...view, history: "none" })).toBe(false);
  });

  it("rejects a history longer than the limit or with a broken graph", () => {
    const populated = populatedView();
    const graph = populated.current;
    expect(isViewState({ ...populated, history: Array(21).fill(graph) })).toBe(
      false,
    );
    expect(isViewState({ ...populated, history: [{ focusId: "x" }] })).toBe(
      false,
    );
  });
});

describe("isGraphState", () => {
  const graph = graphOf("a", ["b"], ["c"]);

  it("accepts a built graph", () => {
    expect(isGraphState(graph)).toBe(true);
  });

  it("rejects a graph whose centre is missing or whose parts are malformed", () => {
    expect(isGraphState({ ...graph, focusId: id("gone") })).toBe(false);
    expect(isGraphState({ ...graph, nodes: [] })).toBe(false);
    expect(isGraphState({ ...graph, nodes: { [id("a")]: { id: 3 } } })).toBe(
      false,
    );
    expect(isGraphState({ ...graph, edges: { e: { id: "e" } } })).toBe(false);
    expect(isGraphState({ ...graph, slices: { a: { members: [1] } } })).toBe(
      false,
    );
    expect(isGraphState({ ...graph, positions: { a: { x: 1 } } })).toBe(false);
    expect(isGraphState({ ...graph, pinned: [1] })).toBe(false);
    expect(isGraphState({ ...graph, revision: undefined })).toBe(false);
    expect(isGraphState({ ...graph, project: 5 })).toBe(false);
  });
});
```

Run: `pnpm --filter @code-spider/webview test persist`
Expected: FAIL to import `../src/view/persist.js`.

Create `packages/webview/src/view/persist.ts`:

```ts
import type { GraphState, ViewState } from "./types.js";
import { HISTORY_LIMIT } from "./view-state.js";

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function everyValue(value: unknown, check: (item: unknown) => boolean) {
  return isRecord(value) && Object.values(value).every(check);
}

function isPoint(value: unknown): boolean {
  return isRecord(value) && isNumber(value.x) && isNumber(value.y);
}

function isNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.kind) &&
    isString(value.name) &&
    isString(value.file) &&
    isString(value.codePreview) &&
    isNumber(value.lineCount) &&
    isRecord(value.range)
  );
}

function isEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.from) &&
    isString(value.to) &&
    isString(value.kind) &&
    isString(value.supplies) &&
    typeof value.resolved === "boolean" &&
    isRecord(value.callSite)
  );
}

function isSliceRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    isStringArray(value.members) &&
    isStringArray(value.edgeIds)
  );
}

export function isGraphState(value: unknown): value is GraphState {
  return (
    isRecord(value) &&
    isNumber(value.generation) &&
    isString(value.project) &&
    isString(value.focusId) &&
    everyValue(value.nodes, isNode) &&
    Object.hasOwn(value.nodes as Record_, value.focusId) &&
    everyValue(value.edges, isEdge) &&
    everyValue(value.slices, isSliceRecord) &&
    everyValue(value.positions, isPoint) &&
    isStringArray(value.pinned) &&
    isNumber(value.revision)
  );
}

/** Structural only: enough to trust what `getState()` hands back. */
export function isViewState(value: unknown): value is ViewState {
  return (
    isRecord(value) &&
    value.version === 1 &&
    isNumber(value.nextGeneration) &&
    isNumber(value.columnGap) &&
    (value.current === undefined || isGraphState(value.current)) &&
    Array.isArray(value.history) &&
    value.history.length <= HISTORY_LIMIT &&
    value.history.every(isGraphState)
  );
}
```

Run: `pnpm --filter @code-spider/webview test persist`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck and the whole suite**

Run: `pnpm -r typecheck`
Expected: no errors in any package.

Run: `pnpm -r test`
Expected: all green. Counts: core 231, CLI 43, webview 99, extension 127.

Run: `pnpm build`
Expected: completes with no errors. The bundle is unchanged: nothing imports the
new modules yet.

- [ ] **Step 6: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: modified `packages/webview/package.json`; new
`packages/webview/src/column-gap.ts`, `packages/webview/src/view/` (four files)
and `packages/webview/test/` files `column-gap.test.ts`, `graph-state.test.ts`,
`history.test.ts`, `persist.test.ts`, `support/graph-states.ts`.

Run: `git diff --check -- packages/webview`
Expected: no output.

Run: `git diff -- packages/webview`
Expected: only the `package.json` export line.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/webview); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `add the webview graph state, history and column gap modules`

The implementer does not stage or commit; the user does.

### Task 4: Placement, Tidy, pan-to-reveal and accepting an expansion

Still pure logic, still not wired into React. This task adds the geometry that
makes "no overlap, ever" true (where an expansion's new nodes go, and how Tidy
re-lays the graph around pinned nodes), the pan that brings new nodes into view,
and the two functions that apply an expansion answer to the view state. It
needs Task 3's `GraphState` and `ViewState`.

**Files:**
- Create: `packages/webview/src/graph/placement.ts`
- Create: `packages/webview/src/graph/tidy.ts`
- Create: `packages/webview/src/graph/pan-to-reveal.ts`
- Create: `packages/webview/src/view/expansion.ts`
- Test: `packages/webview/test/support/random.ts`
- Test: `packages/webview/test/placement.test.ts`
- Test: `packages/webview/test/tidy.test.ts`
- Test: `packages/webview/test/pan-to-reveal.test.ts`
- Test: `packages/webview/test/expansion.test.ts`

**Interfaces:**
- Consumes: `NODE_WIDTH` (320) and `nodeHeight(node)` from `src/graph/constants.ts`
  and `src/graph/node-size.ts`; `Point`, `GraphState`, `ViewState` from
  `src/view/types.ts`; `mergeExpansion`, `setPositions` from
  `src/view/graph-state.ts`; `replaceCurrent` from `src/view/view-state.ts`;
  `SliceMode` from `src/protocol.ts`. Analyser facts: an expansion slice holds the
  expanded node `X` plus its callees and callers; each callee has an edge `from
  === callee, to === X` and each caller an edge `from === X, to === caller`.
- Produces `src/graph/placement.ts`:

  ```ts
  export type Rect = { x: number; y: number; width: number; height: number };
  export type Size = { width: number; height: number };
  export const NODE_MARGIN = 32;
  export function isClear(a: Rect, b: Rect, margin: number): boolean;
  export function nearestFreeY(
    preferredY: number,
    column: { x: number; width: number; height: number },
    obstacles: readonly Rect[],
    margin: number,
  ): number;
  export function stackTops(centreY: number, heights: readonly number[]): number[];
  export type AddedNode = { id: NodeId; height: number };
  export type Placement = {
    expandedId: NodeId;
    anchor: Rect;
    added: readonly AddedNode[];
    edges: readonly Pick<GraphEdge, "from" | "to">[];
    existing: readonly Rect[];
    columnGap: number;
  };
  export function placeExpansion(input: Placement): Record<NodeId, Point>;
  ```

  `isClear(a, b, margin)` holds when the horizontal or the vertical gap between
  the rectangles is at least `margin` (a tolerance of 1e-6 absorbs floating point
  error). `nearestFreeY` returns the y nearest `preferredY` (ties go up) at which
  a rectangle of the column's size is `isClear` of every obstacle; the forbidden
  y values are a union of open intervals, so it tests `preferredY` and each
  `obstacle.y + obstacle.height + margin` and `obstacle.y - margin - height`,
  nearest first, and a position under every obstacle is always free. `stackTops`
  returns the preferred tops of a stack of nodes `NODE_MARGIN` apart, centred on
  `centreY`. `placeExpansion` puts suppliers (added nodes with an edge `from === n,
  to === expandedId`) in the column `anchor.x - (NODE_WIDTH + columnGap)` and
  the rest at `anchor.x + (NODE_WIDTH + columnGap)`, each column stacked in id
  order and centred on the anchor's vertical centre, then moves each node, in
  that order, to its `nearestFreeY` among `existing` plus the nodes already
  placed. It returns positions for the added nodes only. `existing` must include
  the anchor.
- Produces `src/graph/tidy.ts`: `TidyInput = { elk: Readonly<Record<NodeId,
  Point>>; sizes: Readonly<Record<NodeId, Size>>; pinned: Readonly<Record<NodeId,
  Point>> }` and `tidyPositions(input: TidyInput): Record<NodeId, Point>`. `sizes`
  lists every node; `elk` is ELK's layout of all of them; `pinned` holds the
  current position of each pinned node.
- Produces `src/graph/pan-to-reveal.ts`: `Viewport = { x: number; y: number;
  zoom: number }`, `REVEAL_PADDING = 24`, `boundingRect(rects: readonly Rect[]):
  Rect | undefined` and `panToReveal(viewport: Viewport, size: Size, rect: Rect,
  padding?: number): Viewport | undefined`. `rect` is in flow coordinates, `size`
  is the visible area in screen pixels; the result is the least pan that puts
  `rect` inside the area with `padding` clear, centring an axis on which it does
  not fit, or `undefined` when no pan is needed.
- Produces `src/view/expansion.ts`: `ExpansionAnswer = { slice: GraphSlice;
  project: string; mode: { kind: "expansion"; nodeId: NodeId; generation:
  number } }`, `applyExpansion(graph, nodeId, slice, columnGap): { graph:
  GraphState; added: NodeId[] }` (merges, then places the added nodes; writes no
  existing position) and `acceptExpansion(view, answer, columnGap): { view:
  ViewState; added: NodeId[] }` (returns the same `view` object and no added ids
  unless `mode.generation` equals `current.generation`, `project` equals
  `current.project`, the node is in the graph and `slice.focusId` equals the node
  id).
- `test/support/random.ts`: `mulberry32(seed): () => number` (uniform in [0, 1))
  and `randomInt(next, min, max): number` (inclusive).
- Tests after this task: core 231, CLI 43, webview 142, extension 127.

- [ ] **Step 1: Seeded random support**

Create `packages/webview/test/support/random.ts`:

```ts
/** A small seeded generator so property tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [min, max], both included. */
export function randomInt(
  next: () => number,
  min: number,
  max: number,
): number {
  return min + Math.floor(next() * (max - min + 1));
}
```

- [ ] **Step 2: Placement**

Write the tests first. The fixed cases pin the rules down; the seeded property
test then throws 300 random layouts at them, including dragged nodes that overlap
each other.

Create `packages/webview/test/placement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NODE_WIDTH } from "../src/graph/constants.js";
import {
  isClear,
  NODE_MARGIN,
  nearestFreeY,
  placeExpansion,
  stackTops,
  type AddedNode,
  type Rect,
} from "../src/graph/placement.js";
import { mulberry32, randomInt } from "./support/random.js";

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

describe("isClear", () => {
  it("is true when the horizontal or the vertical gap reaches the margin", () => {
    const a = rect(0, 0, 100, 100);
    expect(isClear(a, rect(132, 0, 100, 100), 32)).toBe(true);
    expect(isClear(a, rect(0, 132, 100, 100), 32)).toBe(true);
    expect(isClear(rect(132, 0, 100, 100), a, 32)).toBe(true);
  });

  it("is false when the gap is less than the margin, touching or overlapping", () => {
    const a = rect(0, 0, 100, 100);
    expect(isClear(a, rect(131, 0, 100, 100), 32)).toBe(false);
    expect(isClear(a, rect(100, 0, 100, 100), 32)).toBe(false);
    expect(isClear(a, rect(50, 50, 100, 100), 32)).toBe(false);
    expect(isClear(a, a, 32)).toBe(false);
  });

  it("is clear in one axis even when the rectangles overlap in the other", () => {
    expect(isClear(rect(0, 0, 100, 100), rect(50, 200, 100, 100), 32)).toBe(
      true,
    );
  });
});

describe("nearestFreeY", () => {
  const column = { x: 0, width: 100, height: 50 };
  const blocker = rect(0, 100, 100, 100);

  it("keeps the preferred y when it is free", () => {
    expect(nearestFreeY(400, column, [blocker], 32)).toBe(400);
    expect(nearestFreeY(400, column, [], 32)).toBe(400);
  });

  it("moves down when the lower end of the blocked interval is nearer", () => {
    expect(nearestFreeY(140, column, [blocker], 32)).toBe(232);
  });

  it("moves up when the upper end is nearer", () => {
    expect(nearestFreeY(80, column, [blocker], 32)).toBe(18);
  });

  it("sends a tie up", () => {
    expect(nearestFreeY(125, column, [blocker], 32)).toBe(18);
  });

  it("ignores obstacles in other columns", () => {
    expect(nearestFreeY(140, column, [rect(200, 100, 100, 100)], 32)).toBe(140);
  });

  it("moves past an end that another obstacle blocks", () => {
    const second = rect(0, 240, 100, 100);
    expect(nearestFreeY(140, column, [blocker, second], 32)).toBe(18);
    expect(nearestFreeY(300, column, [blocker, second], 32)).toBe(372);
  });
});

describe("stackTops", () => {
  it("centres a single node and a stack on the given line", () => {
    expect(stackTops(100, [40])).toEqual([80]);
    expect(stackTops(100, [40, 60])).toEqual([
      100 - (40 + 32 + 60) / 2,
      100 - (40 + 32 + 60) / 2 + 72,
    ]);
    expect(stackTops(100, [])).toEqual([]);
  });
});

describe("placeExpansion", () => {
  const anchor = rect(1000, 500, NODE_WIDTH, 100);
  const pitch = NODE_WIDTH + 192;
  const node = (id: string, height = 100): AddedNode => ({ id, height });
  const place = (
    added: AddedNode[],
    edges: { from: string; to: string }[],
    existing: Rect[] = [anchor],
  ) =>
    placeExpansion({
      expandedId: "x",
      anchor,
      added,
      edges,
      existing,
      columnGap: 192,
    });

  it("puts suppliers a column to the left and consumers a column to the right", () => {
    const placed = place(
      [node("s", 100), node("c", 60)],
      [
        { from: "s", to: "x" },
        { from: "x", to: "c" },
      ],
    );
    expect(placed).toEqual({
      s: { x: 1000 - pitch, y: 500 },
      c: { x: 1000 + pitch, y: 520 },
    });
  });

  it("treats a node linked both ways as a supplier", () => {
    const placed = place(
      [node("n")],
      [
        { from: "x", to: "n" },
        { from: "n", to: "x" },
      ],
    );
    expect(placed.n?.x).toBe(1000 - pitch);
  });

  it("stacks a column in id order, a margin apart, centred on the anchor", () => {
    const placed = place(
      [node("b"), node("a")],
      [
        { from: "x", to: "a" },
        { from: "x", to: "b" },
      ],
    );
    expect(placed.a).toEqual({ x: 1000 + pitch, y: 434 });
    expect(placed.b).toEqual({ x: 1000 + pitch, y: 566 });
  });

  it("is pushed down by a dragged node on its slot when the lower end is nearer", () => {
    const dragged = rect(1000 + pitch, 480, NODE_WIDTH, 100);
    const placed = place(
      [node("c")],
      [{ from: "x", to: "c" }],
      [anchor, dragged],
    );
    expect(placed.c).toEqual({ x: 1000 + pitch, y: 612 });
  });

  it("is pushed up by a dragged node on its slot when the upper end is nearer", () => {
    const dragged = rect(1000 + pitch, 530, NODE_WIDTH, 100);
    const placed = place(
      [node("c")],
      [{ from: "x", to: "c" }],
      [anchor, dragged],
    );
    expect(placed.c).toEqual({ x: 1000 + pitch, y: 398 });
  });

  it("keeps the nodes it places clear of each other", () => {
    const dragged = rect(1000 + pitch, 440, NODE_WIDTH, 200);
    const placed = place(
      [node("a"), node("b")],
      [
        { from: "x", to: "a" },
        { from: "x", to: "b" },
      ],
      [anchor, dragged],
    );
    const a = rect(placed.a?.x ?? 0, placed.a?.y ?? 0, NODE_WIDTH, 100);
    const b = rect(placed.b?.x ?? 0, placed.b?.y ?? 0, NODE_WIDTH, 100);
    expect(isClear(a, dragged, NODE_MARGIN)).toBe(true);
    expect(isClear(b, dragged, NODE_MARGIN)).toBe(true);
    expect(isClear(a, b, NODE_MARGIN)).toBe(true);
  });
});

describe("placeExpansion on random layouts", () => {
  function nearerClearExists(
    preferred: number,
    chosen: number,
    column: { x: number; height: number },
    obstacles: readonly Rect[],
  ): boolean {
    const reach = Math.abs(chosen - preferred);
    for (
      let y = Math.floor(preferred - reach);
      y <= Math.ceil(preferred + reach);
      y += 1
    ) {
      const distance = Math.abs(y - preferred);
      const nearer = distance < reach || (distance === reach && y < chosen);
      const candidate = rect(column.x, y, NODE_WIDTH, column.height);
      if (
        nearer &&
        obstacles.every((obstacle) => isClear(candidate, obstacle, NODE_MARGIN))
      ) {
        return true;
      }
    }
    return false;
  }

  it("places every node in its column, clear of everything, as near as it can", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const next = mulberry32(seed);
      const anchor = rect(
        randomInt(next, -600, 600),
        randomInt(next, -600, 600),
        NODE_WIDTH,
        randomInt(next, 28, 300),
      );
      const columnGap = 16 * randomInt(next, 2, 30);
      const pitch = NODE_WIDTH + columnGap;
      const columns = [anchor.x - pitch, anchor.x + pitch];

      const existing = [anchor];
      for (let index = randomInt(next, 0, 29); index > 0; index -= 1) {
        const near = next() < 0.7;
        const x = near
          ? (columns[randomInt(next, 0, 1)] ?? 0) + randomInt(next, -200, 200)
          : randomInt(next, -1500, 1500);
        existing.push(
          rect(
            x,
            anchor.y + randomInt(next, -700, 700),
            NODE_WIDTH,
            randomInt(next, 28, 450),
          ),
        );
      }

      const added: AddedNode[] = [];
      const edges: { from: string; to: string }[] = [];
      for (let index = randomInt(next, 0, 12); index > 0; index -= 1) {
        const id = `n${String(index).padStart(2, "0")}`;
        added.push({ id, height: randomInt(next, 28, 450) });
        edges.push(
          next() < 0.5 ? { from: id, to: "x" } : { from: "x", to: id },
        );
      }

      const placed = placeExpansion({
        expandedId: "x",
        anchor,
        added,
        edges,
        existing,
        columnGap,
      });

      const isSupplier = (id: string) =>
        edges.some((edge) => edge.from === id && edge.to === "x");
      const byId = (a: AddedNode, b: AddedNode) => a.id.localeCompare(b.id);
      const order = [
        ...added.filter((n) => isSupplier(n.id)).sort(byId),
        ...added.filter((n) => !isSupplier(n.id)).sort(byId),
      ];
      expect(Object.keys(placed).sort(), `seed ${seed}`).toEqual(
        added.map((n) => n.id).sort(),
      );

      const centre = anchor.y + anchor.height / 2;
      const obstacles = [...existing];
      for (const supplier of [true, false]) {
        const stack = order.filter((n) => isSupplier(n.id) === supplier);
        const tops = stackTops(
          centre,
          stack.map((n) => n.height),
        );
        stack.forEach((n, index) => {
          const at = placed[n.id];
          const x = supplier ? columns[0] : columns[1];
          expect(at?.x, `seed ${seed} ${n.id} column`).toBe(x);
          const placedRect = rect(at?.x ?? 0, at?.y ?? 0, NODE_WIDTH, n.height);
          for (const obstacle of obstacles) {
            expect(
              isClear(placedRect, obstacle, NODE_MARGIN),
              `seed ${seed} ${n.id} clear`,
            ).toBe(true);
          }
          expect(
            nearerClearExists(
              tops[index] ?? 0,
              at?.y ?? 0,
              { x: x ?? 0, height: n.height },
              obstacles,
            ),
            `seed ${seed} ${n.id} optimal`,
          ).toBe(false);
          obstacles.push(placedRect);
        });
      }
    }
  });
});
```

Run: `pnpm --filter @code-spider/webview test placement`
Expected: FAIL to import `../src/graph/placement.js`.

Implement it.

Create `packages/webview/src/graph/placement.ts`:

```ts
import type { GraphEdge, NodeId } from "@code-spider/core/types";
import type { Point } from "../view/types.js";
import { NODE_WIDTH } from "./constants.js";

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

export const NODE_MARGIN = 32;

/** Absorbs floating point error in positions that were computed, not typed. */
const TOLERANCE = 1e-6;

function gap(startA: number, sizeA: number, startB: number, sizeB: number) {
  return Math.max(startA - (startB + sizeB), startB - (startA + sizeA));
}

/** Two nodes are clear when one axis keeps them at least `margin` apart. */
export function isClear(a: Rect, b: Rect, margin: number): boolean {
  return (
    gap(a.x, a.width, b.x, b.width) >= margin - TOLERANCE ||
    gap(a.y, a.height, b.y, b.height) >= margin - TOLERANCE
  );
}

/**
 * The y nearest `preferredY` (a tie goes up) where a rectangle of the column's
 * size is clear of every obstacle. The forbidden y values are open intervals,
 * so the answer is `preferredY` or the end of an interval; a position under
 * every obstacle is always free, which ends the search.
 */
export function nearestFreeY(
  preferredY: number,
  column: { x: number; width: number; height: number },
  obstacles: readonly Rect[],
  margin: number,
): number {
  const isFree = (y: number) => {
    const candidate = { ...column, y };
    return obstacles.every((obstacle) => isClear(candidate, obstacle, margin));
  };
  const ends = obstacles.flatMap((obstacle) => [
    obstacle.y + obstacle.height + margin,
    obstacle.y - margin - column.height,
  ]);
  const nearestFirst = [preferredY, ...ends].sort(
    (a, b) => Math.abs(a - preferredY) - Math.abs(b - preferredY) || a - b,
  );
  const underAll = Math.max(
    preferredY,
    ...obstacles.map((obstacle) => obstacle.y + obstacle.height + margin),
  );
  return nearestFirst.find(isFree) ?? underAll;
}

/** Preferred tops for a stack of nodes `NODE_MARGIN` apart, centred on a line. */
export function stackTops(
  centreY: number,
  heights: readonly number[],
): number[] {
  const total =
    heights.reduce((sum, height) => sum + height, 0) +
    NODE_MARGIN * Math.max(0, heights.length - 1);
  let top = centreY - total / 2;
  return heights.map((height) => {
    const current = top;
    top += height + NODE_MARGIN;
    return current;
  });
}

export type AddedNode = { id: NodeId; height: number };

export type Placement = {
  expandedId: NodeId;
  anchor: Rect;
  added: readonly AddedNode[];
  edges: readonly Pick<GraphEdge, "from" | "to">[];
  /** Every node already in the graph, the anchor included. */
  existing: readonly Rect[];
  columnGap: number;
};

const byId = (a: AddedNode, b: AddedNode) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Suppliers of the expanded node go one column to its left, everything else one
 * column to its right. Each column is a stack in id order centred on the
 * anchor, and each node then moves to the nearest free y, so nothing already in
 * the graph, dragged or not, is ever covered.
 */
export function placeExpansion(input: Placement): Record<NodeId, Point> {
  const pitch = NODE_WIDTH + input.columnGap;
  const suppliers = new Set(
    input.edges
      .filter((edge) => edge.to === input.expandedId)
      .map((edge) => edge.from),
  );
  const columns = [
    {
      x: input.anchor.x - pitch,
      nodes: input.added.filter((node) => suppliers.has(node.id)).sort(byId),
    },
    {
      x: input.anchor.x + pitch,
      nodes: input.added.filter((node) => !suppliers.has(node.id)).sort(byId),
    },
  ];
  const centreY = input.anchor.y + input.anchor.height / 2;
  const obstacles = [...input.existing];
  const placed: Record<NodeId, Point> = {};
  for (const { x, nodes } of columns) {
    const tops = stackTops(
      centreY,
      nodes.map((node) => node.height),
    );
    for (const [index, node] of nodes.entries()) {
      const column = { x, width: NODE_WIDTH, height: node.height };
      const y = nearestFreeY(
        tops[index] ?? centreY,
        column,
        obstacles,
        NODE_MARGIN,
      );
      placed[node.id] = { x, y };
      obstacles.push({ ...column, y });
    }
  }
  return placed;
}
```

Run: `pnpm --filter @code-spider/webview test placement`
Expected: PASS, 17 tests. The property test takes about a second.

- [ ] **Step 3: Tidy**

Tidy takes ELK's layout of the whole graph as plain data, so the tests need no
ELK. Pinned nodes keep their positions; an unpinned node that ELK put on top of
a pinned one is displaced within its own column.

Create `packages/webview/test/tidy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isClear,
  NODE_MARGIN,
  type Rect,
  type Size,
} from "../src/graph/placement.js";
import { tidyPositions } from "../src/graph/tidy.js";
import type { Point } from "../src/view/types.js";
import { mulberry32, randomInt } from "./support/random.js";

const size: Size = { width: 320, height: 100 };
const sizes = { a: size, b: size, c: size, d: size };
const elk = {
  a: { x: 0, y: 0 },
  b: { x: 0, y: 132 },
  c: { x: 512, y: 0 },
  d: { x: 512, y: 132 },
};

describe("tidyPositions", () => {
  it("keeps ELK's layout when nothing is pinned", () => {
    expect(tidyPositions({ elk, sizes, pinned: {} })).toEqual(elk);
  });

  it("never moves a pinned node, whatever ELK says", () => {
    const pinned = { a: { x: 900, y: 900 } };
    const result = tidyPositions({ elk, sizes, pinned });
    expect(result.a).toEqual({ x: 900, y: 900 });
  });

  it("keeps ELK's position for an unpinned node that is clear of every pinned one", () => {
    const result = tidyPositions({
      elk,
      sizes,
      pinned: { a: { x: 2000, y: 2000 } },
    });
    expect(result.b).toEqual(elk.b);
    expect(result.c).toEqual(elk.c);
    expect(result.d).toEqual(elk.d);
  });

  it("moves a node that ELK put on a pinned one within its own column", () => {
    const pinned = { c: { x: 0, y: 40 } };
    const result = tidyPositions({ elk, sizes, pinned });
    expect(result.c).toEqual({ x: 0, y: 40 });
    expect(result.a).toEqual({ x: 0, y: -92 });
    expect(result.b).toEqual({ x: 0, y: 172 });
    expect(result.d).toEqual(elk.d);
  });

  it("places displaced nodes in (x, y, id) order, each clear of those placed before it", () => {
    const result = tidyPositions({
      elk: { p: { x: 0, y: 10 }, q: { x: 0, y: 10 } },
      sizes: { p: size, q: size, pin: size },
      pinned: { pin: { x: 0, y: 0 } },
    });
    expect(result.p).toEqual({ x: 0, y: 132 });
    expect(result.q).toEqual({ x: 0, y: -132 });
  });

  it("returns a position for every node it was given a size for", () => {
    const result = tidyPositions({ elk, sizes, pinned: { b: { x: 5, y: 5 } } });
    expect(Object.keys(result).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("tidyPositions on random layouts", () => {
  it("leaves no overlap except between pinned nodes, and moves nodes only vertically", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const next = mulberry32(seed);
      const sized: Record<string, Size> = {};
      const laid: Record<string, Point> = {};
      for (let column = randomInt(next, 1, 4); column > 0; column -= 1) {
        let y = 0;
        for (let row = randomInt(next, 1, 6); row > 0; row -= 1) {
          const id = `c${column}r${row}`;
          const height = randomInt(next, 28, 300);
          sized[id] = { width: 320, height };
          laid[id] = { x: column * 512, y };
          y += height + NODE_MARGIN;
        }
      }
      const ids = Object.keys(sized);
      const pinned: Record<string, Point> = {};
      for (const id of ids) {
        if (next() < 0.3) {
          pinned[id] = {
            x: randomInt(next, 0, 2200),
            y: randomInt(next, -200, 1200),
          };
        }
      }

      const result = tidyPositions({ elk: laid, sizes: sized, pinned });

      const rectOf = (id: string): Rect => ({
        ...(result[id] ?? { x: 0, y: 0 }),
        ...(sized[id] ?? size),
      });
      for (const id of ids) {
        const pin = pinned[id];
        if (pin) {
          expect(result[id], `seed ${seed} ${id} pinned`).toEqual(pin);
          continue;
        }
        expect(result[id]?.x, `seed ${seed} ${id} column`).toBe(laid[id]?.x);
        const wasClear = Object.keys(pinned).every((other) =>
          isClear(
            { ...(laid[id] ?? { x: 0, y: 0 }), ...(sized[id] ?? size) },
            { ...(pinned[other] ?? { x: 0, y: 0 }), ...(sized[other] ?? size) },
            NODE_MARGIN,
          ),
        );
        if (wasClear) {
          expect(result[id], `seed ${seed} ${id} kept`).toEqual(laid[id]);
        }
      }
      for (const [index, id] of ids.entries()) {
        for (const other of ids.slice(index + 1)) {
          if (pinned[id] && pinned[other]) continue;
          expect(
            isClear(rectOf(id), rectOf(other), NODE_MARGIN),
            `seed ${seed} ${id} vs ${other}`,
          ).toBe(true);
        }
      }
    }
  });
});
```

Run: `pnpm --filter @code-spider/webview test tidy`
Expected: FAIL to import `../src/graph/tidy.js`.

Create `packages/webview/src/graph/tidy.ts`:

```ts
import type { NodeId } from "@code-spider/core/types";
import type { Point } from "../view/types.js";
import {
  isClear,
  NODE_MARGIN,
  nearestFreeY,
  type Rect,
  type Size,
} from "./placement.js";

export type TidyInput = {
  /** ELK's layout of every node. */
  elk: Readonly<Record<NodeId, Point>>;
  sizes: Readonly<Record<NodeId, Size>>;
  /** The current position of each pinned node. */
  pinned: Readonly<Record<NodeId, Point>>;
};

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * ELK's positions for everything unpinned, the current positions for the
 * pinned. An unpinned node that ELK put too close to a pinned one is displaced:
 * it keeps its column and takes the nearest free y. Displaced nodes are placed
 * in (x, y, id) order against the pinned, the undisplaced and those placed
 * before them.
 */
export function tidyPositions(input: TidyInput): Record<NodeId, Point> {
  const result: Record<NodeId, Point> = {};
  const obstacles: Rect[] = [];
  const unpinned: [NodeId, Rect][] = [];
  for (const [id, size] of Object.entries(input.sizes)) {
    const fixed = input.pinned[id];
    const laidOut = input.elk[id];
    if (fixed) {
      result[id] = fixed;
      obstacles.push({ ...fixed, ...size });
    } else if (laidOut) {
      unpinned.push([id, { ...laidOut, ...size }]);
    }
  }

  const pinnedRects = [...obstacles];
  const displaced: [NodeId, Rect][] = [];
  for (const entry of unpinned) {
    const [id, rect] = entry;
    if (pinnedRects.every((pin) => isClear(rect, pin, NODE_MARGIN))) {
      result[id] = { x: rect.x, y: rect.y };
      obstacles.push(rect);
    } else {
      displaced.push(entry);
    }
  }

  displaced.sort(
    ([idA, a], [idB, b]) => a.x - b.x || a.y - b.y || compare(idA, idB),
  );
  for (const [id, rect] of displaced) {
    const y = nearestFreeY(rect.y, rect, obstacles, NODE_MARGIN);
    result[id] = { x: rect.x, y };
    obstacles.push({ ...rect, y });
  }
  return result;
}
```

Run: `pnpm --filter @code-spider/webview test tidy`
Expected: PASS, 7 tests.

- [ ] **Step 4: Pan to reveal**

After an expansion the view does not zoom or refit; it pans by the least amount
that brings the new nodes into view.

Create `packages/webview/test/pan-to-reveal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { boundingRect, panToReveal } from "../src/graph/pan-to-reveal.js";

const area = { width: 800, height: 600 };
const origin = { x: 0, y: 0, zoom: 1 };

describe("panToReveal", () => {
  it("does nothing when the box is already inside with 24 px clear", () => {
    expect(
      panToReveal(origin, area, { x: 100, y: 100, width: 200, height: 100 }),
    ).toBeUndefined();
    expect(
      panToReveal(origin, area, { x: 24, y: 24, width: 752, height: 552 }),
    ).toBeUndefined();
  });

  it("pans left by the overflow plus the padding when the box is off the right edge", () => {
    expect(
      panToReveal(origin, area, { x: 700, y: 100, width: 200, height: 100 }),
    ).toEqual({ x: -124, y: 0, zoom: 1 });
  });

  it("pans right when the box is off the left edge", () => {
    expect(
      panToReveal(origin, area, { x: -50, y: 100, width: 200, height: 100 }),
    ).toEqual({ x: 74, y: 0, zoom: 1 });
  });

  it("pans vertically when the box is below or above the area", () => {
    expect(
      panToReveal(origin, area, { x: 100, y: 550, width: 200, height: 100 }),
    ).toEqual({ x: 0, y: -74, zoom: 1 });
    expect(
      panToReveal(origin, area, { x: 100, y: -80, width: 200, height: 100 }),
    ).toEqual({ x: 0, y: 104, zoom: 1 });
  });

  it("pans both axes at once", () => {
    expect(
      panToReveal(origin, area, { x: 700, y: 550, width: 200, height: 100 }),
    ).toEqual({ x: -124, y: -74, zoom: 1 });
  });

  it("centres an axis on which the box does not fit", () => {
    expect(
      panToReveal(origin, area, { x: 0, y: 100, width: 2000, height: 100 }),
    ).toEqual({ x: -600, y: 0, zoom: 1 });
    expect(
      panToReveal(origin, area, { x: 100, y: 0, width: 200, height: 1400 }),
    ).toEqual({ x: 0, y: -400, zoom: 1 });
  });

  it("accounts for zoom and an existing pan, and never changes the zoom", () => {
    const viewport = { x: 100, y: 50, zoom: 2 };
    expect(
      panToReveal(viewport, area, { x: 300, y: 100, width: 100, height: 50 }),
    ).toEqual({ x: -24, y: 50, zoom: 2 });
  });

  it("honours a different padding", () => {
    expect(
      panToReveal(origin, area, { x: 750, y: 100, width: 100, height: 100 }, 0),
    ).toEqual({ x: -50, y: 0, zoom: 1 });
  });
});

describe("boundingRect", () => {
  it("is undefined for nothing and covers every rectangle otherwise", () => {
    expect(boundingRect([])).toBeUndefined();
    expect(
      boundingRect([
        { x: 10, y: 20, width: 100, height: 50 },
        { x: -30, y: 60, width: 40, height: 200 },
      ]),
    ).toEqual({ x: -30, y: 20, width: 140, height: 240 });
  });
});
```

Run: `pnpm --filter @code-spider/webview test pan-to-reveal`
Expected: FAIL to import `../src/graph/pan-to-reveal.js`.

Create `packages/webview/src/graph/pan-to-reveal.ts`:

```ts
import type { Rect, Size } from "./placement.js";

export type Viewport = { x: number; y: number; zoom: number };

/** Screen pixels left clear around the revealed box. */
export const REVEAL_PADDING = 24;

export function boundingRect(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The shift along one axis, in screen pixels, for a box spanning start..end. */
function shiftFor(
  start: number,
  end: number,
  area: number,
  padding: number,
): number {
  if (end - start > area - 2 * padding) return area / 2 - (start + end) / 2;
  if (start < padding) return padding - start;
  if (end > area - padding) return area - padding - end;
  return 0;
}

/**
 * The least pan that puts `rect` (flow coordinates) inside the visible area
 * (screen pixels) with `padding` clear; an axis the box does not fit on is
 * centred. Undefined when nothing needs to move.
 */
export function panToReveal(
  viewport: Viewport,
  size: Size,
  rect: Rect,
  padding: number = REVEAL_PADDING,
): Viewport | undefined {
  const left = rect.x * viewport.zoom + viewport.x;
  const top = rect.y * viewport.zoom + viewport.y;
  const dx = shiftFor(
    left,
    left + rect.width * viewport.zoom,
    size.width,
    padding,
  );
  const dy = shiftFor(
    top,
    top + rect.height * viewport.zoom,
    size.height,
    padding,
  );
  if (dx === 0 && dy === 0) return undefined;
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}
```

Run: `pnpm --filter @code-spider/webview test pan-to-reveal`
Expected: PASS, 9 tests.

- [ ] **Step 5: Applying and accepting an expansion**

`applyExpansion` merges an expansion into a graph and places the nodes it added;
`acceptExpansion` decides whether an answer from the extension still belongs to
the graph on screen. The tests give the nodes positions first, because a graph
fresh from `graphFromSlice` has none.

Create `packages/webview/test/expansion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NODE_MARGIN, isClear, type Rect } from "../src/graph/placement.js";
import { nodeHeight } from "../src/graph/node-size.js";
import { setPositions } from "../src/view/graph-state.js";
import { acceptExpansion, applyExpansion } from "../src/view/expansion.js";
import { commitCentre, createView } from "../src/view/view-state.js";
import type { GraphState } from "../src/view/types.js";
import {
  graphOf,
  id,
  nodeIds,
  PROJECT,
  sliceOf,
} from "./support/graph-states.js";

const PITCH = 320 + 192;

function placedGraph(): GraphState {
  return setPositions(graphOf("a", ["b"], ["c"]), {
    [id("a")]: { x: 1000, y: 500 },
    [id("b")]: { x: 488, y: 500 },
    [id("c")]: { x: 1512, y: 500 },
  });
}

const expandB = () => sliceOf("b", ["d"], ["a", "e"]);

describe("applyExpansion", () => {
  it("puts suppliers a column left and consumers a column right of the expanded node", () => {
    const lowered = setPositions(placedGraph(), {
      [id("b")]: { x: 488, y: 1500 },
    });
    const { graph, added } = applyExpansion(
      lowered,
      id("b"),
      sliceOf("b", ["d"], ["a", "f"]),
      192,
    );
    expect(added).toEqual([id("d"), id("f")]);
    expect(graph.positions[id("d")]).toEqual({ x: 488 - PITCH, y: 1500 });
    expect(graph.positions[id("f")]).toEqual({ x: 488 + PITCH, y: 1500 });
  });

  it("keeps the new nodes clear of nodes already there, wherever they were dragged", () => {
    const { graph } = applyExpansion(placedGraph(), id("b"), expandB(), 192);
    const height = nodeHeight(
      graph.nodes[id("a")] ?? { lineCount: 3, codePreview: "x" },
    );
    const rectOf = (nodeId: string): Rect => ({
      ...(graph.positions[nodeId] ?? { x: 0, y: 0 }),
      width: 320,
      height,
    });
    expect(graph.positions[id("e")]).toEqual({ x: 1000, y: 384 });
    expect(isClear(rectOf(id("e")), rectOf(id("a")), NODE_MARGIN)).toBe(true);
  });

  it("never writes a position that already exists", () => {
    const before = placedGraph();
    const { graph } = applyExpansion(before, id("b"), expandB(), 192);
    for (const [nodeId, at] of Object.entries(before.positions)) {
      expect(graph.positions[nodeId]).toEqual(at);
    }
    expect(nodeIds(graph)).toEqual([
      id("a"),
      id("b"),
      id("c"),
      id("d"),
      id("e"),
    ]);
  });

  it("records the slice and places nothing when no node is new", () => {
    const before = placedGraph();
    const { graph, added } = applyExpansion(
      before,
      id("c"),
      sliceOf("c", [], ["a"]),
      192,
    );
    expect(added).toEqual([]);
    expect(graph.positions).toEqual(before.positions);
    expect(Object.keys(graph.slices)).toContain(id("c"));
  });
});

describe("acceptExpansion", () => {
  const view = commitCentre(createView(), placedGraph());
  const answer = {
    slice: expandB(),
    project: PROJECT,
    mode: { kind: "expansion", nodeId: id("b"), generation: 1 },
  } as const;

  it("merges a matching answer into the current graph and reports the added nodes", () => {
    const accepted = acceptExpansion(view, answer, 192);
    expect(accepted.added).toEqual([id("d"), id("e")]);
    expect(accepted.view.current?.positions[id("d")]).toBeDefined();
    expect(accepted.view.current?.generation).toBe(1);
    expect(accepted.view.history).toBe(view.history);
    expect(accepted.view.nextGeneration).toBe(view.nextGeneration);
  });

  it("drops an answer for another generation", () => {
    const stale = { ...answer, mode: { ...answer.mode, generation: 2 } };
    const result = acceptExpansion(view, stale, 192);
    expect(result.view).toBe(view);
    expect(result.added).toEqual([]);
  });

  it("drops an answer for another project", () => {
    const result = acceptExpansion(view, { ...answer, project: "/other" }, 192);
    expect(result.view).toBe(view);
  });

  it("drops an answer for a node that is no longer in the graph", () => {
    const gone = { ...answer, mode: { ...answer.mode, nodeId: id("zzz") } };
    expect(acceptExpansion(view, gone, 192).view).toBe(view);
  });

  it("drops an answer whose slice is about another node", () => {
    const mismatched = { ...answer, slice: sliceOf("c", ["d"]) };
    expect(acceptExpansion(view, mismatched, 192).view).toBe(view);
  });

  it("drops an answer when there is no graph", () => {
    const empty = createView();
    expect(acceptExpansion(empty, answer, 192).view).toBe(empty);
  });
});
```

Run: `pnpm --filter @code-spider/webview test expansion`
Expected: FAIL to import `../src/view/expansion.js`.

Create `packages/webview/src/view/expansion.ts`:

```ts
import type { GraphSlice, NodeId } from "@code-spider/core/types";
import { NODE_WIDTH } from "../graph/constants.js";
import { nodeHeight } from "../graph/node-size.js";
import { placeExpansion, type Rect } from "../graph/placement.js";
import type { SliceMode } from "../protocol.js";
import { mergeExpansion, setPositions, type Merged } from "./graph-state.js";
import type { GraphState, ViewState } from "./types.js";
import { replaceCurrent } from "./view-state.js";

export type ExpansionAnswer = {
  slice: GraphSlice;
  project: string;
  mode: Extract<SliceMode, { kind: "expansion" }>;
};

export type Accepted = { view: ViewState; added: NodeId[] };

function rectsOf(graph: GraphState): Rect[] {
  return Object.entries(graph.positions).flatMap(([nodeId, at]) => {
    const node = graph.nodes[nodeId];
    return node ? [{ ...at, width: NODE_WIDTH, height: nodeHeight(node) }] : [];
  });
}

/**
 * Merges the slice, then places the nodes it added around `nodeId`. Nodes that
 * were already there keep their positions, dragged or not. A node without a
 * position anchors at the origin.
 */
export function applyExpansion(
  graph: GraphState,
  nodeId: NodeId,
  slice: GraphSlice,
  columnGap: number,
): Merged {
  const merged = mergeExpansion(graph, nodeId, slice);
  const anchorNode = graph.nodes[nodeId];
  if (!anchorNode || merged.added.length === 0) return merged;
  const anchor: Rect = {
    ...(graph.positions[nodeId] ?? { x: 0, y: 0 }),
    width: NODE_WIDTH,
    height: nodeHeight(anchorNode),
  };
  const placed = placeExpansion({
    expandedId: nodeId,
    anchor,
    added: merged.added.flatMap((id) => {
      const node = merged.graph.nodes[id];
      return node ? [{ id, height: nodeHeight(node) }] : [];
    }),
    edges: slice.edges,
    existing: rectsOf(graph),
    columnGap,
  });
  return { graph: setPositions(merged.graph, placed), added: merged.added };
}

/**
 * Applies an expansion answer only if it still belongs to the graph on screen:
 * same generation and project, the node is still there and the slice is the
 * one asked for. Otherwise the very same view comes back.
 */
export function acceptExpansion(
  view: ViewState,
  answer: ExpansionAnswer,
  columnGap: number,
): Accepted {
  const { slice, project, mode } = answer;
  const current = view.current;
  const belongs =
    current !== undefined &&
    mode.generation === current.generation &&
    project === current.project &&
    Object.hasOwn(current.nodes, mode.nodeId) &&
    slice.focusId === mode.nodeId;
  if (!belongs) return { view, added: [] };
  const { graph, added } = applyExpansion(
    current,
    mode.nodeId,
    slice,
    columnGap,
  );
  return { view: replaceCurrent(view, graph), added };
}
```

Run: `pnpm --filter @code-spider/webview test expansion`
Expected: PASS, 10 tests.

- [ ] **Step 6: Typecheck and the whole suite**

Run: `pnpm -r typecheck`
Expected: no errors in any package.

Run: `pnpm -r test`
Expected: all green. Counts: core 231, CLI 43, webview 142, extension 127.

Run: `pnpm build`
Expected: completes with no errors. The bundle is unchanged: nothing imports the
new modules yet.

- [ ] **Step 7: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: new `packages/webview/src/graph/placement.ts`, `tidy.ts`,
`pan-to-reveal.ts`, `packages/webview/src/view/expansion.ts` and the five test
files `placement.test.ts`, `tidy.test.ts`, `pan-to-reveal.test.ts`,
`expansion.test.ts`, `support/random.ts`; nothing modified.

Run: `git diff --check -- packages/webview`
Expected: no output.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/webview); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `add expansion placement, tidy and pan-to-reveal`

The implementer does not stage or commit; the user does.

### Task 5: One mounted canvas: view state in the app, drag, pins, persistence

The M2 canvas was rebuilt (`key` per layout) from the latest slice. This task
makes the view state the source of truth: `AppState` holds the `ViewState`,
React Flow stays mounted and takes its nodes from the current `GraphState`,
dragging a node pins it, the view state is saved with `setState`, and an
expansion answer that arrives is merged and placed. There is still no button to
expand, no toolbar and no double-click; Tasks 6 and 7 add them. A Tidy function
exists (`useGraphLayout().tidy`) but nothing calls it yet.

**Files:**
- Modify: `packages/webview/src/vscode-api.ts` (replace: `getSavedState`, `saveState`)
- Create: `packages/webview/src/debounce.ts`
- Modify: `packages/webview/src/graph/layout.ts` (replace: `columnGap`, positions as a record)
- Modify: `packages/webview/src/graph/to-flow.ts` (replace: maps a `GraphState`)
- Create: `packages/webview/src/graph/tidy-graph.ts`
- Modify: `packages/webview/src/app-state.ts` (replace: `AppState` holds the `ViewState`)
- Modify: `packages/webview/src/graph/use-layout.ts` (replace: centre layout and Tidy hook)
- Create: `packages/webview/src/use-persisted-view.ts`
- Modify: `packages/webview/src/graph/GraphView.tsx` (replace: one mounted `ReactFlow`)
- Modify: `packages/webview/src/App.tsx` (replace)
- Modify: `packages/webview/src/graph/graph.css` (lines 25-27: node cursors)
- Test: `packages/webview/test/support/flow.ts` (create)
- Test: `packages/webview/test/debounce.test.ts` (create)
- Test: `packages/webview/test/layout.test.ts`, `layout-browser.test.ts`, `to-flow.test.ts`, `app-state.test.ts` (replace)
- Test: `packages/webview/test/tidy-graph.test.ts` (create)
- Delete: `packages/webview/test/apply-positions.test.ts` (tests `applyPositions`, which goes away)

**Interfaces:**
- Consumes: Task 3's `GraphState`, `ViewState`, `graphFromSlice`, `pinNodes`,
  `setPositions`, `commitCentre`, `createView`, `replaceCurrent`, `isViewState`;
  Task 4's `acceptExpansion`, `tidyPositions`; Task 2's `ExtensionToWebview`,
  `WebviewToExtension` and `jump.ts` message builders (they take a `project`).
- Produces `src/vscode-api.ts`: `postToExtension(message)`, `getSavedState():
  unknown`, `saveState(state: unknown): void`.
- Produces `src/debounce.ts`: `class TrailingDebounce<T>` with `constructor(delayMs:
  number, run: (value: T) => void)`, `push(value: T): void` (restarts the timer;
  `run` gets the latest value once `delayMs` pass without another push) and
  `dispose(): void`.
- Produces `src/graph/layout.ts`: `Positions = Record<NodeId, Point>`,
  `buildElkGraph(nodes, edges, columnGap): ElkNode`, `layoutPositions(nodes,
  edges, columnGap): Promise<Positions>`. The ELK options are layered, direction
  RIGHT, `elk.spacing.nodeNode` `"32"` and
  `elk.layered.spacing.nodeNodeBetweenLayers` equal to `String(columnGap)`.
- Produces `src/graph/to-flow.ts`: `SpiderNodeData = { node: GraphNode; isFocus:
  boolean; pinned: boolean }`, `SpiderFlowNode`, `SpiderEdgeData`,
  `SpiderFlowEdge`, `truncateLabel(text, max?)` (still there until Task 8) and
  `toFlow(graph: GraphState): { nodes: SpiderFlowNode[]; edges: SpiderFlowEdge[] }`.
  Node positions come from `graph.positions` (`{ x: 0, y: 0 }` if absent); edges
  whose endpoints are missing are dropped.
- Produces `src/graph/tidy-graph.ts`: `TidyOutcome = { generation: number;
  positions: Record<NodeId, Point> }` and `tidyGraph(getGraph: () => GraphState |
  undefined, getColumnGap: () => number, layout?: typeof layoutPositions):
  Promise<TidyOutcome | undefined>`. It lays out the current graph with ELK and
  returns `tidyPositions` of the result; if the graph's `revision` changed while
  ELK ran it runs again on the current graph; if the graph was replaced (another
  `generation`) or there is none it returns `undefined`.
- Produces `src/app-state.ts`: `AppState = { view: ViewState; error: string |
  undefined; busy: boolean; indexing: boolean; pending: PendingCentre |
  undefined; nextPending: number; fit: FitRequest }`, `PendingCentre = { id:
  number; graph: GraphState; columnGap: number }`, `FitRequest = { token: number;
  duration: number }`, `LocalAction`, `AppAction = ExtensionToWebview |
  LocalAction`, `createAppState(saved: unknown): AppState` and `reduceApp(state,
  action): AppState`. Local actions: `centreLaidOut { id, positions }`,
  `centreLayoutFailed { id, message }`, `dragStopped { positions }`, `tidied {
  generation, positions }`, `tidyFailed { message }`.
- Produces `src/graph/use-layout.ts`: `useGraphLayout(state, dispatch): { tidy: ()
  => void }`.
- Produces `src/use-persisted-view.ts`: `usePersistedView(view: ViewState): void`
  (saves with `saveState`, trailing-debounced 250 ms).
- Behaviour from here: a centre `slice` message is laid out with ELK using the
  current `columnGap` while the old graph stays on screen; the graph is then
  committed (the previous one goes to the history) and the view refits. The
  newest centre slice wins if layouts overlap. An expansion `slice` is merged
  and placed with Task 4's functions; its nodes are not animated or revealed yet
  (Task 6).
- Tests after this task: core 231, CLI 43, webview 162, extension 127.

- [ ] **Step 1: Saved state and a trailing debounce**

Create `packages/webview/test/debounce.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrailingDebounce } from "../src/debounce.js";

describe("TrailingDebounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once with the latest value after the quiet period", () => {
    const seen: number[] = [];
    const debounce = new TrailingDebounce<number>(250, (value) =>
      seen.push(value),
    );
    debounce.push(1);
    vi.advanceTimersByTime(100);
    debounce.push(2);
    vi.advanceTimersByTime(249);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([2]);
  });

  it("runs again for a later push", () => {
    const seen: string[] = [];
    const debounce = new TrailingDebounce<string>(250, (value) =>
      seen.push(value),
    );
    debounce.push("a");
    vi.advanceTimersByTime(250);
    debounce.push("b");
    vi.advanceTimersByTime(250);
    expect(seen).toEqual(["a", "b"]);
  });

  it("does nothing without a push and nothing after dispose", () => {
    const seen: number[] = [];
    const debounce = new TrailingDebounce<number>(250, (value) =>
      seen.push(value),
    );
    vi.advanceTimersByTime(1000);
    debounce.push(1);
    debounce.dispose();
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
  });
});
```

Run: `pnpm --filter @code-spider/webview test debounce`
Expected: FAIL to import `../src/debounce.js`.

Create `packages/webview/src/debounce.ts`:

```ts
/** Runs `run` with the latest pushed value once `delayMs` pass without a push. */
export class TrailingDebounce<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly delayMs: number,
    private readonly run: (value: T) => void,
  ) {}

  push(value: T): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.run(value);
    }, this.delayMs);
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

Run: `pnpm --filter @code-spider/webview test debounce`
Expected: PASS, 3 tests.

Replace `packages/webview/src/vscode-api.ts` with:

```ts
import type { WebviewToExtension } from "./protocol.js";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
};

let api: ReturnType<typeof acquireVsCodeApi> | undefined;

function vscode() {
  api ??= acquireVsCodeApi();
  return api;
}

export function postToExtension(message: WebviewToExtension): void {
  vscode().postMessage(message);
}

/** What `saveState` stored before the webview was reloaded, if anything. */
export function getSavedState(): unknown {
  return vscode().getState();
}

export function saveState(state: unknown): void {
  vscode().setState(state);
}
```

- [ ] **Step 2: Mapping a graph to React Flow, and ELK with a column gap**

`toFlow` now reads a `GraphState`: positions come from the state, a node knows
whether it is pinned. ELK takes the column gap (the first graph is laid out with
192 between columns where M2 hard-coded 96), and positions come back as a plain
record the view state can store. `applyPositions` has no use any more.

The new tests build their graphs through a small support helper.

Create `packages/webview/test/support/flow.ts`:

```ts
import type { GraphSlice } from "@code-spider/core/types";
import { toFlow } from "../../src/graph/to-flow.js";
import type { Point } from "../../src/view/types.js";
import { graphFromSlice } from "../../src/view/graph-state.js";
import { PROJECT } from "./graph-states.js";

/** The React Flow nodes and edges of a slice shown as a fresh centre graph. */
export function flowOf(
  slice: GraphSlice,
  positions: Record<string, Point> = {},
) {
  return toFlow(graphFromSlice(slice, PROJECT, positions));
}
```

Delete `packages/webview/test/apply-positions.test.ts`.

Replace `packages/webview/test/to-flow.test.ts` (the same checks as before, now
through a graph state, plus positions and pins):

Replace `packages/webview/test/to-flow.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { NODE_WIDTH } from "../src/graph/constants.js";
import { nodeHeight } from "../src/graph/node-size.js";
import { toFlow, truncateLabel } from "../src/graph/to-flow.js";
import { graphFromSlice, pinNodes } from "../src/view/graph-state.js";
import { flowOf } from "./support/flow.js";
import { PROJECT } from "./support/graph-states.js";
import { makeEdge, makeNode, makeSlice, readGolden } from "./support/slices.js";

describe("toFlow with a real call-chain slice", () => {
  const slice = readGolden("basic-handleSignup.json");
  const { nodes, edges } = flowOf(slice);

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

describe("toFlow positions and pins", () => {
  const slice = readGolden("basic-handleSignup.json");

  it("takes node positions from the graph and falls back to the origin", () => {
    const { nodes } = flowOf(slice, {
      "src/signup.ts#handleSignup": { x: 40, y: 60 },
    });
    const at = (id: string) => nodes.find((node) => node.id === id)?.position;
    expect(at("src/signup.ts#handleSignup")).toEqual({ x: 40, y: 60 });
    expect(at("src/app.ts#main")).toEqual({ x: 0, y: 0 });
  });

  it("marks exactly the pinned nodes", () => {
    const graph = pinNodes(graphFromSlice(slice, PROJECT), {
      "src/app.ts#main": { x: 1, y: 2 },
    });
    const { nodes } = toFlow(graph);
    expect(
      nodes.filter((node) => node.data.pinned).map((node) => node.id),
    ).toEqual(["src/app.ts#main"]);
    expect(
      nodes.find((node) => node.id === "src/app.ts#main")?.position,
    ).toEqual({ x: 1, y: 2 });
  });
});

describe("toFlow with a JSX slice", () => {
  it("styles the JSX edge distinctly and labels it with the props type", () => {
    const { edges } = flowOf(readGolden("jsx-Page.json"));
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
  const { nodes, edges } = flowOf(slice);

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

  it("drops edges whose endpoint is not in the graph", () => {
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
    const edge = flowOf(slice).edges[0];
    expect(edge?.label).toHaveLength(40);
    expect(edge?.data?.fullLabel).toBe(long);
  });
});
```

Replace `packages/webview/test/layout.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { buildElkGraph, layoutPositions } from "../src/graph/layout.js";
import { flowOf } from "./support/flow.js";
import { makeEdge, makeNode, makeSlice, readGolden } from "./support/slices.js";

describe("buildElkGraph", () => {
  it("asks ELK for a left-to-right layered layout of the sized nodes", () => {
    const { nodes, edges } = flowOf(readGolden("basic-handleSignup.json"));
    const graph = buildElkGraph(nodes, edges, 96);
    expect(graph.layoutOptions).toMatchObject({
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "32",
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

  it("sets the spacing between layers from the column gap", () => {
    const { nodes, edges } = flowOf(readGolden("basic-handleSignup.json"));
    for (const gap of [32, 192, 480]) {
      expect(
        buildElkGraph(nodes, edges, gap).layoutOptions?.[
          "elk.layered.spacing.nodeNodeBetweenLayers"
        ],
      ).toBe(String(gap));
    }
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
    const { nodes, edges } = flowOf(slice);
    const positions = await layoutPositions(nodes, edges, 192);
    const x = (id: string) => positions[id]?.x ?? Number.NaN;
    expect(x("a#a")).toBeLessThan(x("a#b"));
    expect(x("a#b")).toBeLessThan(x("a#c"));
  });

  it("leaves the column gap between a supplier and its consumer", async () => {
    const slice = makeSlice(
      "a#b",
      [makeNode({ id: "a#a" }), makeNode({ id: "a#b" })],
      [makeEdge("a#a", "a#b")],
    );
    const { nodes, edges } = flowOf(slice);
    for (const gap of [32, 192, 480]) {
      const positions = await layoutPositions(nodes, edges, gap);
      const space = (positions["a#b"]?.x ?? 0) - (positions["a#a"]?.x ?? 0);
      expect(space).toBe(320 + gap);
    }
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
    const { nodes, edges } = flowOf(slice);
    const positions = await layoutPositions(nodes, edges, 192);

    const column = suppliers.map((supplier) => positions[supplier.id]);
    expect(new Set(column.map((position) => position?.x)).size).toBe(1);
    expect(positions[consumer.id]?.x).toBeGreaterThan(column[0]?.x ?? 0);

    const height = nodes[0]?.height ?? 0;
    const tops = column
      .map((position) => position?.y ?? 0)
      .sort((a, b) => a - b);
    expect((tops[1] ?? 0) - (tops[0] ?? 0)).toBeGreaterThanOrEqual(height);
    expect((tops[2] ?? 0) - (tops[1] ?? 0)).toBeGreaterThanOrEqual(height);
  });

  it("returns a position for every node and is deterministic", async () => {
    const { nodes, edges } = flowOf(readGolden("basic-handleSignup.json"));
    const first = await layoutPositions(nodes, edges, 192);
    const second = await layoutPositions(nodes, edges, 192);
    expect(Object.keys(first).sort()).toEqual(nodes.map((n) => n.id).sort());
    expect(second).toEqual(first);
  });

  it("lays out a lone node and an edgeless graph", async () => {
    const { nodes, edges } = flowOf(
      makeSlice("a#a", [makeNode({ id: "a#a" })], []),
    );
    const positions = await layoutPositions(nodes, edges, 192);
    expect(positions["a#a"]).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });
});
```

Edit `packages/webview/test/layout-browser.test.ts` — replace:

```
layoutPositions([node("a"), node("b")], [{ id: "e", source: "a", target: "b" }]).then(
  (positions) => { globalThis.result = JSON.stringify([...positions.entries()]); },
```

with:

```
layoutPositions([node("a"), node("b")], [{ id: "e", source: "a", target: "b" }], 96).then(
  (positions) => { globalThis.result = JSON.stringify(positions); },
```

Edit `packages/webview/test/layout-browser.test.ts` — replace:

```
  const positions = new Map<string, { x: number; y: number }>(
    JSON.parse(String(sandbox.result)),
  );
  expect(positions.get("a")?.x).toBeLessThan(positions.get("b")?.x ?? 0);
```

with:

```
  const positions = JSON.parse(String(sandbox.result)) as Record<
    string,
    { x: number; y: number }
  >;
  expect(positions.a?.x).toBeLessThan(positions.b?.x ?? 0);
```

Run: `pnpm --filter @code-spider/webview test to-flow layout`
Expected: FAIL. `toFlow` still expects a slice (it reads `slice.nodes`) and
`layoutPositions` takes no gap and returns a `Map`.

Implement. Replace `packages/webview/src/graph/to-flow.ts`:

Replace `packages/webview/src/graph/to-flow.ts` with:

```ts
import type { GraphEdge, GraphNode } from "@code-spider/core/types";
import type { Edge, Node } from "@xyflow/react";
import type { GraphState } from "../view/types.js";
import { MAX_EDGE_LABEL_CHARS, NODE_WIDTH } from "./constants.js";
import { edgeAppearance } from "./edge-appearance.js";
import { nodeHeight } from "./node-size.js";

export type SpiderNodeData = {
  node: GraphNode;
  isFocus: boolean;
  pinned: boolean;
};
export type SpiderFlowNode = Node<SpiderNodeData, "spider">;
export type SpiderEdgeData = { fullLabel: string };
export type SpiderFlowEdge = Edge<SpiderEdgeData>;

export function truncateLabel(
  text: string,
  max: number = MAX_EDGE_LABEL_CHARS,
): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function toFlowNode(node: GraphNode, graph: GraphState): SpiderFlowNode {
  return {
    id: node.id,
    type: "spider",
    position: graph.positions[node.id] ?? { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: nodeHeight(node),
    data: {
      node,
      isFocus: node.id === graph.focusId,
      pinned: graph.pinned.includes(node.id),
    },
  };
}

function toFlowEdge(edge: GraphEdge): SpiderFlowEdge {
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
}

export function toFlow(graph: GraphState): {
  nodes: SpiderFlowNode[];
  edges: SpiderFlowEdge[];
} {
  const drawn = Object.values(graph.edges).filter(
    (edge) =>
      Object.hasOwn(graph.nodes, edge.from) &&
      Object.hasOwn(graph.nodes, edge.to),
  );
  return {
    nodes: Object.values(graph.nodes).map((node) => toFlowNode(node, graph)),
    edges: drawn.map(toFlowEdge),
  };
}
```

Replace `packages/webview/src/graph/layout.ts` with:

```ts
import type { NodeId } from "@code-spider/core/types";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Point } from "../view/types.js";
import type { SpiderFlowEdge, SpiderFlowNode } from "./to-flow.js";

export type Positions = Record<NodeId, Point>;

const elk = new ELK();

export function buildElkGraph(
  nodes: readonly SpiderFlowNode[],
  edges: readonly SpiderFlowEdge[],
  columnGap: number,
): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "32",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(columnGap),
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
  columnGap: number,
): Promise<Positions> {
  const laidOut = await elk.layout(buildElkGraph(nodes, edges, columnGap));
  const positions: Positions = {};
  for (const child of laidOut.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }
  return positions;
}
```

Run: `pnpm --filter @code-spider/webview test to-flow layout`
Expected: PASS: `to-flow` 12 tests, `layout` 7, `layout-browser` 1.

- [ ] **Step 3: Running Tidy on the current graph**

`tidyGraph` is the part of Tidy that is not React: lay out the whole current
graph with ELK, give the result to `tidyPositions`, and cope with the graph
changing underneath. It takes the layout function as a parameter so the tests
need no ELK.

Create `packages/webview/test/tidy-graph.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { layoutPositions } from "../src/graph/layout.js";
import { tidyGraph } from "../src/graph/tidy-graph.js";
import { pinNodes, setPositions } from "../src/view/graph-state.js";
import type { GraphState } from "../src/view/types.js";
import { commitCentre, createView } from "../src/view/view-state.js";
import { graphOf, id } from "./support/graph-states.js";

const column: typeof layoutPositions = async (nodes) =>
  Object.fromEntries(
    nodes.map((node, index) => [node.id, { x: 0, y: index * 200 }]),
  );

function committed(): GraphState {
  const graph = commitCentre(createView(), graphOf("a", ["b"], ["c"])).current;
  if (!graph) throw new Error("no graph");
  return graph;
}

describe("tidyGraph", () => {
  it("returns the layout for the generation it started on", async () => {
    const graph = committed();
    const outcome = await tidyGraph(
      () => graph,
      () => 192,
      column,
    );
    expect(outcome).toEqual({
      generation: graph.generation,
      positions: {
        [id("a")]: { x: 0, y: 0 },
        [id("b")]: { x: 0, y: 200 },
        [id("c")]: { x: 0, y: 400 },
      },
    });
  });

  it("keeps a pinned node where it is and moves a neighbour that ELK put on it", async () => {
    const graph = pinNodes(committed(), { [id("a")]: { x: 0, y: 200 } });
    const outcome = await tidyGraph(
      () => graph,
      () => 192,
      column,
    );
    expect(outcome?.positions[id("a")]).toEqual({ x: 0, y: 200 });
    expect(outcome?.positions[id("b")]).toEqual({ x: 0, y: 84 });
    expect(outcome?.positions[id("c")]).toEqual({ x: 0, y: 400 });
  });

  it("lays out with the column gap it is given", async () => {
    const layout = vi.fn(column);
    const graph = committed();
    await tidyGraph(
      () => graph,
      () => 96,
      layout,
    );
    expect(layout).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      96,
    );
  });

  it("runs again on the current graph when it changed while ELK ran", async () => {
    const first = committed();
    const second = setPositions(first, { [id("a")]: { x: 5, y: 5 } });
    let current = first;
    const layout = vi.fn<typeof layoutPositions>(async (nodes, edges, gap) => {
      if (layout.mock.calls.length === 1) current = second;
      return column(nodes, edges, gap);
    });

    const outcome = await tidyGraph(
      () => current,
      () => 192,
      layout,
    );

    expect(layout).toHaveBeenCalledTimes(2);
    expect(outcome?.generation).toBe(second.generation);
  });

  it("gives up when the graph was replaced while ELK ran", async () => {
    const first = committed();
    let current: GraphState | undefined = first;
    const layout: typeof layoutPositions = async (nodes, edges, gap) => {
      current = { ...first, generation: first.generation + 1 };
      return column(nodes, edges, gap);
    };
    expect(
      await tidyGraph(
        () => current,
        () => 192,
        layout,
      ),
    ).toBeUndefined();
  });

  it("does nothing without a graph", async () => {
    const layout = vi.fn(column);
    expect(
      await tidyGraph(
        () => undefined,
        () => 192,
        layout,
      ),
    ).toBeUndefined();
    expect(layout).not.toHaveBeenCalled();
  });

  it("passes a layout failure on", async () => {
    const graph = committed();
    const failing: typeof layoutPositions = async () => {
      throw new Error("elk blew up");
    };
    await expect(
      tidyGraph(
        () => graph,
        () => 192,
        failing,
      ),
    ).rejects.toThrow("elk blew up");
  });
});
```

Run: `pnpm --filter @code-spider/webview test tidy-graph`
Expected: FAIL to import `../src/graph/tidy-graph.js`.

Create `packages/webview/src/graph/tidy-graph.ts`:

```ts
import type { NodeId } from "@code-spider/core/types";
import type { GraphState, Point } from "../view/types.js";
import { NODE_WIDTH } from "./constants.js";
import { layoutPositions } from "./layout.js";
import { nodeHeight } from "./node-size.js";
import type { Size } from "./placement.js";
import { tidyPositions } from "./tidy.js";
import { toFlow } from "./to-flow.js";

export type TidyOutcome = {
  generation: number;
  positions: Record<NodeId, Point>;
};

function sizesOf(graph: GraphState): Record<NodeId, Size> {
  return Object.fromEntries(
    Object.values(graph.nodes).map((node) => [
      node.id,
      { width: NODE_WIDTH, height: nodeHeight(node) },
    ]),
  );
}

function pinnedAt(graph: GraphState): Record<NodeId, Point> {
  return Object.fromEntries(
    graph.pinned.flatMap((id) => {
      const at = graph.positions[id];
      return at ? [[id, at]] : [];
    }),
  );
}

/**
 * Lays out the whole current graph and tidies the result around its pinned
 * nodes. If the graph's contents changed while ELK ran the result is stale, so
 * it runs again; if the graph was replaced there is nothing left to tidy.
 */
export async function tidyGraph(
  getGraph: () => GraphState | undefined,
  getColumnGap: () => number,
  layout: typeof layoutPositions = layoutPositions,
): Promise<TidyOutcome | undefined> {
  for (;;) {
    const graph = getGraph();
    if (!graph) return undefined;
    const { nodes, edges } = toFlow(graph);
    const elk = await layout(nodes, edges, getColumnGap());
    const latest = getGraph();
    if (latest?.generation !== graph.generation) return undefined;
    if (latest.revision !== graph.revision) continue;
    return {
      generation: graph.generation,
      positions: tidyPositions({
        elk,
        sizes: sizesOf(graph),
        pinned: pinnedAt(graph),
      }),
    };
  }
}
```

Run: `pnpm --filter @code-spider/webview test tidy-graph`
Expected: PASS, 7 tests.

- [ ] **Step 4: The app reducer holds the view state**

`AppState` now owns the `ViewState`. A centre slice becomes *pending* and is laid
out while the old graph stays on screen; the layout result commits it. Expansion
answers are accepted through Task 4's `acceptExpansion`. Local actions carry the
results of drags, layouts and Tidy.

Replace `packages/webview/test/app-state.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppAction,
  type AppState,
} from "../src/app-state.js";
import { createView, commitCentre } from "../src/view/view-state.js";
import { id, PROJECT, sliceOf } from "./support/graph-states.js";

const centre = (
  focus: string,
  suppliers: string[] = [],
  consumers: string[] = [],
): AppAction => ({
  type: "slice",
  slice: sliceOf(focus, suppliers, consumers),
  project: PROJECT,
  mode: { kind: "centre" },
});

function pendingId(state: AppState): number {
  if (!state.pending) throw new Error("nothing is pending");
  return state.pending.id;
}

/** A state that shows `focus`, as if its layout had finished. */
function showing(
  focus: string,
  suppliers: string[] = [],
  consumers: string[] = [],
  positions: Record<string, { x: number; y: number }> = {},
): AppState {
  const pending = reduceApp(
    createAppState(undefined),
    centre(focus, suppliers, consumers),
  );
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pendingId(pending),
    positions,
  });
}

describe("createAppState", () => {
  it("starts with an empty view", () => {
    expect(createAppState(undefined)).toEqual({
      view: createView(),
      error: undefined,
      busy: false,
      indexing: false,
      pending: undefined,
      nextPending: 1,
      fit: { token: 0, duration: 0 },
    });
  });

  it("restores a saved view and ignores one that fails the structural check", () => {
    const saved = commitCentre(createView(), showing("a").view.current!);
    expect(createAppState(saved).view).toBe(saved);
    expect(createAppState({ version: 2 }).view).toEqual(createView());
    expect(createAppState("junk").view).toEqual(createView());
  });
});

describe("centre slices", () => {
  it("wait for their layout while the old graph stays", () => {
    const before = showing("a", ["b"]);
    const next = reduceApp(before, centre("z"));
    expect(next.pending?.graph.focusId).toBe(id("z"));
    expect(next.pending?.columnGap).toBe(before.view.columnGap);
    expect(next.view).toBe(before.view);
  });

  it("are committed when laid out: new generation, history and a refit", () => {
    const first = showing("a", ["b"]);
    expect(first.view.current?.focusId).toBe(id("a"));
    expect(first.view.current?.generation).toBe(1);
    expect(first.pending).toBeUndefined();
    expect(first.fit).toEqual({ token: 1, duration: 0 });

    const pending = reduceApp(first, centre("z"));
    const second = reduceApp(pending, {
      type: "centreLaidOut",
      id: pendingId(pending),
      positions: { [id("z")]: { x: 7, y: 8 } },
    });
    expect(second.view.current?.focusId).toBe(id("z"));
    expect(second.view.current?.generation).toBe(2);
    expect(second.view.current?.positions).toEqual({
      [id("z")]: { x: 7, y: 8 },
    });
    expect(second.view.history).toEqual([first.view.current]);
    expect(second.fit.token).toBe(2);
  });

  it("let the newest slice win when layouts overlap", () => {
    const one = reduceApp(createAppState(undefined), centre("a"));
    const two = reduceApp(one, centre("b"));
    const stale = reduceApp(two, {
      type: "centreLaidOut",
      id: pendingId(one),
      positions: {},
    });
    expect(stale).toBe(two);
    const fresh = reduceApp(two, {
      type: "centreLaidOut",
      id: pendingId(two),
      positions: {},
    });
    expect(fresh.view.current?.focusId).toBe(id("b"));
  });

  it("keep the old graph and show a banner when the layout fails", () => {
    const before = showing("a");
    const pending = reduceApp(before, centre("z"));
    const failed = reduceApp(pending, {
      type: "centreLayoutFailed",
      id: pendingId(pending),
      message: "boom",
    });
    expect(failed.error).toBe("Could not lay out the graph: boom");
    expect(failed.pending).toBeUndefined();
    expect(failed.view).toBe(before.view);

    const stale = reduceApp(pending, {
      type: "centreLayoutFailed",
      id: 999,
      message: "late",
    });
    expect(stale).toBe(pending);
  });
});

describe("messages about the extension's work", () => {
  it("keeps the graph when an error arrives", () => {
    const before = showing("a");
    const next = reduceApp(before, { type: "analysisError", message: "boom" });
    expect(next.view).toBe(before.view);
    expect(next.error).toBe("boom");
  });

  it("clears a stale error when new work starts, not when it ends", () => {
    const failed = reduceApp(createAppState(undefined), {
      type: "analysisError",
      message: "boom",
    });
    const started = reduceApp(failed, { type: "busy", busy: true });
    expect(started.busy).toBe(true);
    expect(started.error).toBeUndefined();

    const failedAgain = reduceApp(started, {
      type: "analysisError",
      message: "again",
    });
    const ended = reduceApp(failedAgain, { type: "busy", busy: false });
    expect(ended.busy).toBe(false);
    expect(ended.error).toBe("again");
  });

  it("tracks indexing separately from busy", () => {
    const next = reduceApp(createAppState(undefined), {
      type: "indexing",
      indexing: true,
    });
    expect(next.indexing).toBe(true);
    expect(next.busy).toBe(false);
  });

  it("ignores expandFailed and settings until later tasks use them", () => {
    const state = showing("a");
    expect(
      reduceApp(state, {
        type: "expandFailed",
        nodeId: id("a"),
        generation: 1,
        message: "gone",
      }),
    ).toBe(state);
    expect(reduceApp(state, { type: "settings", columnGap: 96 })).toBe(state);
  });
});

describe("expansion answers", () => {
  const positions = {
    [id("a")]: { x: 1000, y: 500 },
    [id("b")]: { x: 488, y: 1500 },
  };

  it("are merged into the current graph and placed", () => {
    const before = showing("a", ["b"], [], positions);
    const next = reduceApp(before, {
      type: "slice",
      slice: sliceOf("b", ["d"], ["a"]),
      project: PROJECT,
      mode: { kind: "expansion", nodeId: id("b"), generation: 1 },
    });
    expect(Object.keys(next.view.current?.nodes ?? {})).toContain(id("d"));
    expect(next.view.current?.positions[id("d")]).toBeDefined();
    expect(next.view.current?.positions[id("a")]).toEqual(positions[id("a")]);
  });

  it("are dropped when they belong to an older graph", () => {
    const before = showing("a", ["b"], [], positions);
    const next = reduceApp(before, {
      type: "slice",
      slice: sliceOf("b", ["d"], ["a"]),
      project: PROJECT,
      mode: { kind: "expansion", nodeId: id("b"), generation: 7 },
    });
    expect(next).toBe(before);
  });
});

describe("drag and Tidy results", () => {
  it("pins dragged nodes at their final positions", () => {
    const before = showing("a", ["b"]);
    const next = reduceApp(before, {
      type: "dragStopped",
      positions: { [id("b")]: { x: 12, y: 34 } },
    });
    expect(next.view.current?.pinned).toEqual([id("b")]);
    expect(next.view.current?.positions[id("b")]).toEqual({ x: 12, y: 34 });
    expect(
      reduceApp(createAppState(undefined), {
        type: "dragStopped",
        positions: {},
      }).view.current,
    ).toBeUndefined();
  });

  it("applies a tidy result to the graph it was computed for and refits over 250 ms", () => {
    const before = showing("a", ["b"]);
    const generation = before.view.current?.generation ?? -1;
    const next = reduceApp(before, {
      type: "tidied",
      generation,
      positions: { [id("a")]: { x: 3, y: 4 } },
    });
    expect(next.view.current?.positions[id("a")]).toEqual({ x: 3, y: 4 });
    expect(next.view.current?.pinned).toEqual([]);
    expect(next.fit).toEqual({ token: before.fit.token + 1, duration: 250 });

    const stale = reduceApp(before, {
      type: "tidied",
      generation: generation + 1,
      positions: { [id("a")]: { x: 3, y: 4 } },
    });
    expect(stale).toBe(before);
  });

  it("shows a banner when Tidy fails and leaves the graph alone", () => {
    const before = showing("a");
    const next = reduceApp(before, { type: "tidyFailed", message: "boom" });
    expect(next.error).toBe("Could not lay out the graph: boom");
    expect(next.view).toBe(before.view);
  });
});
```

Run: `pnpm --filter @code-spider/webview test app-state`
Expected: FAIL (`createAppState` and `reduceApp` are not exported).

Replace `packages/webview/src/app-state.ts` with:

```ts
import type { NodeId } from "@code-spider/core/types";
import type { ExtensionToWebview } from "./protocol.js";
import { acceptExpansion } from "./view/expansion.js";
import { graphFromSlice, pinNodes, setPositions } from "./view/graph-state.js";
import { isViewState } from "./view/persist.js";
import type { GraphState, Point, ViewState } from "./view/types.js";
import { commitCentre, createView, replaceCurrent } from "./view/view-state.js";

/** A centre slice waiting for ELK; the old graph stays on screen meanwhile. */
export type PendingCentre = {
  id: number;
  graph: GraphState;
  columnGap: number;
};

/** The canvas refits whenever `token` changes. */
export type FitRequest = { token: number; duration: number };

export type AppState = {
  view: ViewState;
  error: string | undefined;
  busy: boolean;
  indexing: boolean;
  pending: PendingCentre | undefined;
  nextPending: number;
  fit: FitRequest;
};

export type LocalAction =
  | { type: "centreLaidOut"; id: number; positions: Record<NodeId, Point> }
  | { type: "centreLayoutFailed"; id: number; message: string }
  | { type: "dragStopped"; positions: Record<NodeId, Point> }
  | { type: "tidied"; generation: number; positions: Record<NodeId, Point> }
  | { type: "tidyFailed"; message: string };

export type AppAction = ExtensionToWebview | LocalAction;

const LAYOUT_FAILED = "Could not lay out the graph: ";

export function createAppState(saved: unknown): AppState {
  return {
    view: isViewState(saved) ? saved : createView(),
    error: undefined,
    busy: false,
    indexing: false,
    pending: undefined,
    nextPending: 1,
    fit: { token: 0, duration: 0 },
  };
}

type SliceMessage = Extract<ExtensionToWebview, { type: "slice" }>;

function startCentre(state: AppState, message: SliceMessage): AppState {
  return {
    ...state,
    error: undefined,
    pending: {
      id: state.nextPending,
      graph: graphFromSlice(message.slice, message.project),
      columnGap: state.view.columnGap,
    },
    nextPending: state.nextPending + 1,
  };
}

function mergeAnswer(state: AppState, message: SliceMessage): AppState {
  const { mode } = message;
  if (mode.kind !== "expansion") return state;
  const { view } = acceptExpansion(
    state.view,
    { slice: message.slice, project: message.project, mode },
    state.view.columnGap,
  );
  return view === state.view ? state : { ...state, view };
}

function refit(state: AppState, duration: number): FitRequest {
  return { token: state.fit.token + 1, duration };
}

export function reduceApp(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "slice":
      return action.mode.kind === "centre"
        ? startCentre(state, action)
        : mergeAnswer(state, action);
    case "analysisError":
      return { ...state, error: action.message };
    case "busy":
      return {
        ...state,
        busy: action.busy,
        error: action.busy ? undefined : state.error,
      };
    case "indexing":
      return { ...state, indexing: action.indexing };
    case "expandFailed":
    case "settings":
      return state;
    case "centreLaidOut": {
      if (state.pending?.id !== action.id) return state;
      const graph = { ...state.pending.graph, positions: action.positions };
      return {
        ...state,
        view: commitCentre(state.view, graph),
        pending: undefined,
        fit: refit(state, 0),
      };
    }
    case "centreLayoutFailed":
      if (state.pending?.id !== action.id) return state;
      return {
        ...state,
        pending: undefined,
        error: LAYOUT_FAILED + action.message,
      };
    case "dragStopped": {
      const current = state.view.current;
      if (!current) return state;
      const pinned = pinNodes(current, action.positions);
      return { ...state, view: replaceCurrent(state.view, pinned) };
    }
    case "tidied": {
      const current = state.view.current;
      if (current?.generation !== action.generation) return state;
      return {
        ...state,
        view: replaceCurrent(
          state.view,
          setPositions(current, action.positions),
        ),
        fit: refit(state, 250),
      };
    }
    case "tidyFailed":
      return { ...state, error: LAYOUT_FAILED + action.message };
  }
}
```

Run: `pnpm --filter @code-spider/webview test app-state`
Expected: PASS, 15 tests.

- [ ] **Step 5: The hooks and the mounted canvas**

The remaining files are React glue with no logic of their own: a hook that lays
out pending centres and runs Tidy, a hook that saves the view, the one mounted
canvas, and the app that connects them. They are covered by the typecheck, the
build and the owner's manual list (Task 9); the logic they call is tested above.

Replace `packages/webview/src/graph/use-layout.ts`:

Replace `packages/webview/src/graph/use-layout.ts` with:

```ts
import { useCallback, useEffect, useRef, type Dispatch } from "react";
import type { AppAction, AppState } from "../app-state.js";
import { layoutPositions } from "./layout.js";
import { tidyGraph } from "./tidy-graph.js";
import { toFlow } from "./to-flow.js";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Lays out each pending centre slice with ELK, and offers Tidy for the graph on
 * screen. Stale results are discarded by the reducer, which matches the id of
 * the pending slice and the generation of the graph.
 */
export function useGraphLayout(
  state: AppState,
  dispatch: Dispatch<AppAction>,
): { tidy: () => void } {
  const { pending } = state;
  useEffect(() => {
    if (!pending) return;
    const { nodes, edges } = toFlow(pending.graph);
    layoutPositions(nodes, edges, pending.columnGap).then(
      (positions) =>
        dispatch({ type: "centreLaidOut", id: pending.id, positions }),
      (error: unknown) =>
        dispatch({
          type: "centreLayoutFailed",
          id: pending.id,
          message: messageOf(error),
        }),
    );
  }, [pending, dispatch]);

  const latest = useRef(state.view);
  useEffect(() => {
    latest.current = state.view;
  }, [state.view]);

  const tidy = useCallback(() => {
    tidyGraph(
      () => latest.current.current,
      () => latest.current.columnGap,
    ).then(
      (outcome) => {
        if (outcome) dispatch({ type: "tidied", ...outcome });
      },
      (error: unknown) =>
        dispatch({ type: "tidyFailed", message: messageOf(error) }),
    );
  }, [dispatch]);

  return { tidy };
}
```

Create `packages/webview/src/use-persisted-view.ts`:

```ts
import { useEffect, useRef } from "react";
import { TrailingDebounce } from "./debounce.js";
import { saveState } from "./vscode-api.js";
import type { ViewState } from "./view/types.js";

export const PERSIST_DELAY_MS = 250;

/**
 * Saves the view with the webview's `setState` after it has stopped changing.
 * Drags live in the canvas until they end, so a half-finished drag is never
 * saved. The banner, `busy`, `indexing` and requests in flight are not part of
 * the view.
 */
export function usePersistedView(view: ViewState): void {
  const debounce = useRef<TrailingDebounce<ViewState> | undefined>(undefined);

  useEffect(() => {
    const created = new TrailingDebounce<ViewState>(
      PERSIST_DELAY_MS,
      saveState,
    );
    debounce.current = created;
    return () => created.dispose();
  }, []);

  useEffect(() => {
    debounce.current?.push(view);
  }, [view]);
}
```

Replace `packages/webview/src/graph/GraphView.tsx`. React Flow gets no `key`, so
it stays mounted; positions come from the graph state, except that a node being
dragged follows the pointer through `live` until the drag ends.

Replace `packages/webview/src/graph/GraphView.tsx` with:

```tsx
import type { NodeId } from "@code-spider/core/types";
import {
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type NodeTypes,
  type OnNodeDrag,
  type OnNodesChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FitRequest } from "../app-state.js";
import type { WebviewToExtension } from "../protocol.js";
import type { GraphState, Point } from "../view/types.js";
import { edgeClickMessage, nodeClickMessage } from "./jump.js";
import { SpiderNode } from "./SpiderNode.js";
import { toFlow, type SpiderFlowNode } from "./to-flow.js";

/** Defined once: React Flow re-creates every node if this object changes. */
const nodeTypes: NodeTypes = { spider: SpiderNode };

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
};

const FIT_OPTIONS = { padding: 0.2, maxZoom: 1 };

/** Refits whenever the app asks; the first fit is the `fitView` prop's. */
function FitOnRequest({ fit }: { fit: FitRequest }) {
  const { fitView } = useReactFlow();
  const handled = useRef(fit.token);

  useEffect(() => {
    if (handled.current === fit.token) return;
    handled.current = fit.token;
    const frame = requestAnimationFrame(() => {
      void fitView({ ...FIT_OPTIONS, duration: fit.duration });
    });
    return () => cancelAnimationFrame(frame);
  }, [fit, fitView]);

  return null;
}

export type GraphViewProps = {
  graph: GraphState;
  fit: FitRequest;
  onPost: (message: WebviewToExtension) => void;
  onDragStop: (positions: Record<NodeId, Point>) => void;
};

export function GraphView({ graph, fit, onPost, onDragStop }: GraphViewProps) {
  const flow = useMemo(() => toFlow(graph), [graph]);
  const [live, setLive] = useState<Record<NodeId, Point>>({});
  const nodes = useMemo(
    () =>
      flow.nodes.map((node) => {
        const at = live[node.id];
        return at ? { ...node, position: at } : node;
      }),
    [flow.nodes, live],
  );

  const onNodesChange = useCallback<OnNodesChange<SpiderFlowNode>>(
    (changes) => {
      const moved = changes.flatMap((change) =>
        change.type === "position" && change.dragging && change.position
          ? [[change.id, change.position] as const]
          : [],
      );
      if (moved.length === 0) return;
      setLive((previous) => ({ ...previous, ...Object.fromEntries(moved) }));
    },
    [],
  );

  const onNodeDragStop = useCallback<OnNodeDrag<SpiderFlowNode>>(
    (_event, _node, dragged) => {
      onDragStop(
        Object.fromEntries(dragged.map((node) => [node.id, node.position])),
      );
      setLive({});
    },
    [onDragStop],
  );

  return (
    <div className="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={FIT_OPTIONS}
        minZoom={0.1}
        nodesConnectable={false}
        nodeDragThreshold={4}
        selectNodesOnDrag={false}
        zoomOnDoubleClick={false}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_event, node) => {
          const message = nodeClickMessage(node.data.node, graph.project);
          if (message) onPost(message);
        }}
        onEdgeClick={(_event, edge) =>
          onPost(edgeClickMessage(edge.id, graph.project))
        }
      >
        <FitOnRequest fit={fit} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
```

Replace `packages/webview/src/App.tsx`:

Replace `packages/webview/src/App.tsx` with:

```tsx
import type { NodeId } from "@code-spider/core/types";
import { useCallback, useEffect, useReducer } from "react";
import { createAppState, reduceApp } from "./app-state.js";
import { GraphView } from "./graph/GraphView.js";
import { useGraphLayout } from "./graph/use-layout.js";
import { isExtensionMessage } from "./messages.js";
import { useDelayedFlag } from "./use-delayed-flag.js";
import { usePersistedView } from "./use-persisted-view.js";
import { getSavedState, postToExtension } from "./vscode-api.js";
import type { Point } from "./view/types.js";

/** Work shorter than this never shows a spinner (perf note). */
export const SPINNER_DELAY_MS = 500;

export function App() {
  const [state, dispatch] = useReducer(reduceApp, undefined, () =>
    createAppState(getSavedState()),
  );
  useGraphLayout(state, dispatch);
  usePersistedView(state.view);
  const spinner = useDelayedFlag(state.busy, SPINNER_DELAY_MS);

  const onDragStop = useCallback(
    (positions: Record<NodeId, Point>) =>
      dispatch({ type: "dragStopped", positions }),
    [],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isExtensionMessage(event.data)) dispatch(event.data);
    };
    window.addEventListener("message", onMessage);
    postToExtension({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const graph = state.view.current;
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
        {graph ? (
          <GraphView
            graph={graph}
            fit={state.fit}
            onPost={postToExtension}
            onDragStop={onDragStop}
          />
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

Edit `packages/webview/src/graph/graph.css`:

Edit `packages/webview/src/graph/graph.css` — replace:

```
.react-flow__node {
  cursor: pointer;
}
```

with:

```
.react-flow__node {
  cursor: pointer;
}

.react-flow__node.dragging {
  cursor: grabbing;
}
```

Run: `pnpm -r typecheck`
Expected: no errors in any package.

Run: `pnpm -r test`
Expected: all green. Counts: core 231, CLI 43, webview 162, extension 127.

Run: `pnpm build`
Expected: completes with no errors; `packages/webview/dist/index.js` and
`packages/extension/dist/webview/index.js` are rebuilt.

- [ ] **Step 6: Inspect the task delta and propose the commit**

Run: `git status --short`
Expected: modified `vscode-api.ts`, `app-state.ts`, `App.tsx`, `graph/layout.ts`,
`graph/to-flow.ts`, `graph/use-layout.ts`, `graph/GraphView.tsx`,
`graph/graph.css` and the tests `layout.test.ts`, `layout-browser.test.ts`,
`to-flow.test.ts`, `app-state.test.ts`; deleted
`test/apply-positions.test.ts`; new `src/debounce.ts`, `src/graph/tidy-graph.ts`,
`src/use-persisted-view.ts` and the tests `debounce.test.ts`,
`tidy-graph.test.ts`, `support/flow.ts`.

Run: `git diff --check -- packages/webview`
Expected: no output.

Run: `git diff -- packages/webview`
Expected: only the changes from Steps 1 to 5.

Run: `for f in $(git ls-files --others --exclude-standard -- packages/webview); do git diff --no-index --check -- /dev/null "$f"; done`
Expected: no whitespace warnings (exit status 1 per file is normal).

Proposed commit message: `keep one canvas mounted and own the graph in a persisted view state`

The implementer does not stage or commit; the user does.


### Task 6: Box controls

A double-click on a function or component box expands it in place, or collapses it
again if it is already expanded. A box shows a spinner while its expansion loads,
its failure message for 4 seconds and a pin icon once dragged; new boxes fade in
and the view pans just far enough to show them. There are no expand or collapse
buttons and nothing re-centres from inside the graph (Plan decision 11). The task
ends with the owner's manual check 5.

**Files:**
- Create: `packages/webview/src/graph/node-controls.ts` (pure `nodeControl`, `doubleClickAction`), `node-context.ts` (`NodeContext`: graph, box UI state and the unpin callback, so React Flow's node data stays stable), `reveal.ts` (`revealRect`), `viewport-requests.tsx` (`FitOnRequest`, moved out of `GraphView.tsx`, and the new `RevealOnRequest`)
- Create: `packages/webview/src/app-walk.ts` (pure `AppState` helpers for expansions in flight; keeps `app-state.ts` under 300 lines), `use-walk-timers.ts` (expires a failure after 4 s and `entering` after 300 ms)
- Modify: `packages/webview/src/app-state.ts` (fields and actions below, delegating to `app-walk.ts`), `graph/jump.ts`, `graph/NodeBox.tsx`, `graph/SpiderNode.tsx`, `graph/GraphView.tsx`, `App.tsx`, `graph/graph.css`
- Test: `packages/webview/test/node-controls.test.ts`, `reveal.test.ts`, `app-walk.test.ts` (create); `jump.test.ts`, `node-box.test.tsx` (extend)

**Interfaces:**
- Consumes: `isExpanded`, `collapseNode(graph, nodeId)`, `unpinNode(graph, nodeId)`
  (Task 3); `acceptExpansion(view, answer, columnGap): { view; added }`, `Rect`,
  `boundingRect`, `panToReveal(viewport, size, rect, padding?)` (Task 4);
  `AppState`, `LocalAction`, `FitRequest`, `GraphView` with `{ graph, fit, onPost,
  onDragStop }`, `SpiderNodeData` (Task 5; `refit` in `app-state.ts` is private).
- Produces:

  ```ts
  // graph/node-controls.ts
  export type NodeUi = { busy: boolean; loading: readonly NodeId[] };
  export type NodeControl = "none" | "expand" | "expandDisabled" | "loading" | "collapse";
  export function nodeControl(node: GraphNode, graph: GraphState, ui: NodeUi): NodeControl;
  export function doubleClickAction(node: GraphNode, graph: GraphState, ui: NodeUi): "expand" | "collapse" | "none";
  // app-state.ts: AppState gains
  loading: NodeId[];  failures: Record<NodeId, { message: string; token: number }>;
  entering: { ids: NodeId[]; token: number };  nextToken: number;
  reveal: { token: number; rect: Rect } | undefined;
  // LocalAction gains
  { type: "expandStarted" | "collapsed" | "unpinned"; nodeId: NodeId }
  { type: "failureExpired"; nodeId: NodeId; token: number }
  { type: "enteringExpired"; token: number }
  ```

  Also: `app-walk.ts` exports `resetTransient(state: AppState): AppState` (empties
  `loading`, `failures`, `entering`, `reveal`; Task 7 uses it); `reveal.ts` exports
  `revealRect(graph, ids: readonly NodeId[]): Rect | undefined`; `jump.ts` exports
  `expandMessage(nodeId, project, generation)` and no `focus` builder (the webview
  never sends `focus`); `node-context.ts` exports `NodeActions = { onExpand,
  onCollapse, onUnpin }` (each `(nodeId: NodeId) => void`; `GraphView` takes it as
  `actions`), `NodeContextValue = { graph: GraphState; ui: NodeUi; failures:
  AppState["failures"]; onUnpin: NodeActions["onUnpin"] }` and `NodeContext`;
  `NodeBoxProps` gains optional `pinned`, `loading`, `failure`, `onUnpin`;
  `GraphViewProps` gains `busy`, `loading`, `failures`, `entering`, `reveal`
  (the matching `AppState` fields) and `actions: NodeActions`.

**Behaviour:**
- Superseded in part by Plan decision 12: "busy" here means working (`busy` or a
  pending centre), and Back is ignored while working, so it never clears a pending
  centre.
- Decided by the owner during Task 6, not to reopen: no `[+]`, `[−]` or `[◎]`
  buttons; a double-click never posts `focus`; the webview sends no `focus` at all.
  Re-centring is a single click on a box followed by `Shift+Alt+Q` in the editor.
  The protocol's `focus` and the extension's `focusNode` stay as Task 2 built them.
- A single click still jumps at once. A double-click therefore jumps first and then
  toggles, which is harmless because the code sits beside the panel.
- `doubleClickAction` answers `expand` for a collapsed function or component other
  than the centre while not `busy`, `collapse` for an expanded one (also while
  `busy`), and `none` for everything else: a loading box, the centre, `external`,
  `unknown` and `module` boxes, and a collapsed box while `busy`. It is built on
  `nodeControl`, which classifies each box (spec section 6); `loading` is also what
  shows the spinner.
- Expanding posts `expand` with the graph's `project` and `generation` and marks the
  node loading (several may be in flight); collapsing runs `collapseNode` locally;
  the pin icon runs `unpinNode` without moving the box. The pin and spinner sit in a
  cluster that stops click and double-click propagation and carries `nodrag`, so
  they neither jump, drag nor toggle.
- An accepted expansion clears the node's loading and sets `entering` (the added
  ids) and `reveal` (their bounding box); one that `acceptExpansion` rejects changes
  nothing. `expandFailed` for the current generation clears loading and shows its
  message on the box for 4 s (spec section 7); other generations are dropped. A
  committed centre calls `resetTransient`.
- Fade-in and pan are spec section 5.2: 250 ms, class kept 300 ms, none under
  `prefers-reduced-motion`, no zoom or refit, a 200 ms pan.
- Markup: an inline SVG pin button titled "Unpin" when pinned; a 12 px spinner with
  `role="status"` while loading; a failure strip with `role="alert"` and the message
  in text and `title`; `.node-box { user-select: none }` so a double-click selects no
  text. The pin and spinner cluster renders only when one of them applies.

**Approach and traps:**
- Tokens (`nextToken`) keep a late timer from clearing a newer failure or fade;
  `use-walk-timers.ts` only dispatches the two expiry actions. `collapsed` must also
  drop `loading` and `failures` for nodes that left the graph: an answer for a gone
  node is dropped, so its spinner would never clear.
- `GraphView`'s `onNodeDoubleClick` only runs `doubleClickAction` and calls
  `actions.onExpand` or `actions.onCollapse`; App turns those into the `expand`
  post plus `expandStarted`, and `collapsed`. `zoomOnDoubleClick` is already off
  (Task 5); keep it off or a double-click zooms.
- `RevealOnRequest` follows `FitOnRequest` (handle each token once, in
  `requestAnimationFrame`), reads the pane size with `useStoreApi().getState()`
  inside the effect, and calls `setViewport(next, { duration: 200 })` only when
  `panToReveal` returns a viewport. Compute `reveal` in the reducer, after placement.
- In `GraphView`, keep `nodeTypes` module-level and memoise the context value, or
  React Flow rebuilds every node. Add `entering` classes in the existing `nodes` memo;
  edges keep their `appearance.className`, so append. Fade with `opacity` only
  (React Flow positions with `transform`).
- `NodeBox` renders as before with only `{ node, isFocus }`; `SpiderNode` shows no
  markers without a provider. The failure strip sits inside the box along its
  bottom edge (`.node-box` needs `position: relative`).
- Risk, watched by manual check 5: the first click's jump moves keyboard focus into
  the editor and VS Code might swallow the second click. There is no fallback
  button any more; if check 5 fails, stop and report to the owner.

**Tests:**
- `packages/webview/test/node-controls.test.ts`
  - the centre and the external, unknown and module boxes get `none`
  - a collapsed function or component gets `expand`, and `expandDisabled` while busy
  - a loading box gets `loading`, busy or not
  - an expanded box gets `collapse`, also while busy
  - the centre is never expanded although its slice is recorded
  - `doubleClickAction` gives `expand` for a collapsed function or component
  - `doubleClickAction` gives `collapse` for an expanded one, also while busy
  - `doubleClickAction` gives `none` for a loading box, the centre, external, unknown and module boxes, and a collapsed box while busy
- `packages/webview/test/reveal.test.ts`
  - the rectangle spans the added nodes by position and analytic height
  - ids without a node or position are ignored, and no ids gives `undefined`
- `packages/webview/test/jump.test.ts`
  - `expandMessage` carries node, project and generation
  - no `focus` builder is exported
- `packages/webview/test/node-box.test.tsx`
  - no expand or collapse button renders in any state
  - a loading box renders the spinner; a box neither pinned nor loading renders no marker cluster
  - the pin icon shows only when pinned, titled "Unpin"
  - the failure strip carries the message in its text and `title`
  - the existing cases still pass with only `{ node, isFocus }`
- `packages/webview/test/app-walk.test.ts`
  - `expandStarted` marks a node loading once
  - an accepted answer merges, clears loading and sets `entering` and `reveal`
  - an answer that adds no node clears loading and sets neither
  - an answer for another generation changes nothing, loading included
  - `expandFailed` records a failure and clears loading for the current generation and is dropped otherwise
  - `failureExpired` and `enteringExpired` act only on a matching token
  - `collapsed` collapses and drops loading and failures of removed nodes
  - `unpinned` unpins and keeps the position
  - `centreLaidOut` resets the transient fields

**Steps:**
- [ ] Write the listed tests and see them fail for the right reason
- [ ] Add the pure parts: `nodeControl`, `doubleClickAction`, `revealRect`,
      `expandMessage`, the `AppState` fields and actions with `app-walk.ts`
- [ ] Render the markers and wire the canvas: `NodeBox`, `NodeContext`, `SpiderNode`,
      `onNodeDoubleClick`, `entering` classes, `RevealOnRequest`, App handlers,
      `useWalkTimers`, CSS (keyframes, reduced-motion rule, spinner)
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Manual check 5 (the owner): the implementer stops and reports. The owner runs
      "Run Code Spider" (F5), focuses `handleSignup` in `test-code/basic` and
      double-clicks ten different boxes in a row (expanding as they go gives enough
      of them); each must toggle (expand, or collapse if already expanded) and leave
      the editor at that box's declaration
- [ ] Inspect the task delta (`git diff --check`, `git diff`, and the untracked-file
      loop under Global Constraints) and propose the commit

Proposed commit message: `add double-click expand and collapse to node boxes`

The implementer does not stage or commit; the user does.


### Task 7: Toolbar

A toolbar above the banners with `← Back`, `Tidy` and the Spacing slider. Back steps
through the history of 20, Tidy re-arranges unpinned boxes around pinned ones, and
the slider spreads the columns; its value lives in the extension's global state, so
it survives panels and VS Code restarts.

**Files:**
- Create: `packages/webview/src/toolbar/Toolbar.tsx` (pure markup), `toolbar.css` (`--vscode-button-*` theming), `spacing-control.ts` (`createSpacingControl`), `use-spacing-control.ts` (hook owning one)
- Modify: `packages/webview/src/app-state.ts` (`settingsApplied`, actions `back` and `columnGapChanged`, the `settings` case), `App.tsx` (toolbar above the banners), `main.tsx` (import `toolbar.css`)
- Create: `packages/extension/src/column-gap.ts` (`ColumnGapStore`)
- Modify: `packages/extension/src/dispatch.ts` (route `setColumnGap`), `extension.ts` (store over `context.globalState`, publish at activation), `ids.ts` (`STATE_COLUMN_GAP = "codeSpider.columnGap"`)
- Test: `packages/webview/test/toolbar.test.tsx`, `spacing-control.test.ts`, `app-toolbar.test.ts`, `packages/extension/test/column-gap.test.ts` (create); `dispatch.test.ts` (modify)

**Interfaces:**
- Consumes: `canGoBack(view)`, `goBack(view)` (Task 3); `COLUMN_GAP`,
  `normaliseColumnGap(raw: unknown): number` (Task 3); `TrailingDebounce`,
  `useGraphLayout(state, dispatch): { tidy: () => void }`, `postToExtension`,
  `AppState`, `LocalAction`, `FitRequest` (Task 5); `resetTransient` (Task 6); the
  `settings` and `setColumnGap` messages, `createDispatcher({ jumps, session })`,
  `GraphPanel.post` and the gate's `settings` replay (Task 2).
- Produces (webview):

  ```ts
  export type ToolbarProps = { canBack: boolean; canTidy: boolean; columnGap: number;
    onBack(): void; onTidy(): void; onColumnGap(value: number): void };
  export type SpacingControl = { change(value: number): void; dispose(): void };
  export function createSpacingControl(deps: { dispatch: (action: LocalAction) => void;
    tidy: () => void; post: (message: WebviewToExtension) => void;
    delayMs?: number /* 250 */ }): SpacingControl;
  // AppState gains settingsApplied: boolean (false at start, never persisted)
  // LocalAction gains { type: "back" } | { type: "columnGapChanged"; value: number }
  ```

- Produces (extension): `MementoPort = { get(key: string): unknown; update(key:
  string, value: unknown): PromiseLike<void> }`; `class ColumnGapStore {
  constructor(memento: MementoPort, publish: (columnGap: number) => void);
  get(): number; set(raw: unknown): Promise<void>; publish(): void }`;
  `createDispatcher({ jumps, session, columnGap })` with `columnGap:
  Pick<ColumnGapStore, "set">`.

**Behaviour:**
- Superseded in part by Plan decision 12: "busy" here means working (`busy` or a
  pending centre), and Back is ignored while working, so it never clears a pending
  centre.
- Enablement is spec section 5.7: Back off when the history is empty or `busy`, Tidy
  off with no graph, the slider always on. The slider is `COLUMN_GAP` (min 32, max
  480, step 16, default 192), labelled "Spacing" with the value as `${columnGap}px`.
- Back (spec section 3.2): `goBack`, then refit with duration 0. The reducer ignores
  `back` on an empty history or while `busy`, and clears `pending` (a running layout
  must not commit over the restored graph), the banner and, via `resetTransient`,
  the transient fields.
- Slider (spec section 5.5): `columnGapChanged` stores the normalised value at once
  and moves no position. 250 ms after the last move, run Tidy (pinned boxes stay,
  decided), then post `setColumnGap` with the latest value; a burst posts once.
- `settings`: the first one after each load sets the normalised `columnGap` without
  Tidy; later ones are ignored (they only echo the webview's own value).
- Extension (spec section 5.5): `ColumnGapStore` normalises on read and write under
  `codeSpider.columnGap`; `publish()` posts `settings` at activation and `set` posts
  it after every `setColumnGap`; the gate replays the latest on each `ready`.

**Approach and traps:**
- Do not call Tidy from the change handler: `useGraphLayout` reads `columnGap` from
  a ref updated after render, and the debounce is what makes that safe. Do not post
  `setColumnGap` per input event.
- `.spinner` sits absolutely at the top right of `.app`; keep the toolbar content
  left-aligned.
- The extension imports `@code-spider/webview/column-gap` at runtime. The export
  points at a `.ts` file that esbuild and vitest both transform, and the package is
  already an extension dev dependency, so no manifest or lockfile change. Confirm
  with `pnpm build` and the typecheck.
- Task 2's `dispatch.test.ts` has a `setup()` without a store and a case "ignores
  ready, refresh and setColumnGap"; update both.

**Tests:**
- `packages/webview/test/toolbar.test.tsx`
  - Back and Tidy render disabled or enabled from `canBack` and `canTidy`
  - the slider carries min 32, max 480, step 16 and the current value
  - the "Spacing" label and the `192px` value show
- `packages/webview/test/spacing-control.test.ts` (fake timers)
  - `change` dispatches `columnGapChanged` at once
  - a burst of changes runs `tidy` once and posts one `setColumnGap` with the last value after 250 ms
  - `dispose` cancels a pending run
- `packages/webview/test/app-toolbar.test.ts`
  - `back` restores the previous graph under a new generation with a fresh fit
  - `back` clears `pending`, the error and the transient fields
  - `back` does nothing on an empty history or while busy
  - `columnGapChanged` normalises and clamps and leaves positions alone
  - the first `settings` applies (normalised, no fit) and later ones are ignored
- `packages/extension/test/column-gap.test.ts`
  - the default 192 when nothing or junk is stored
  - `set` stores the normalised value (100 becomes 96) and publishes it
  - `publish` posts the current value
  - a new store over the same memento reads the value back
- `packages/extension/test/dispatch.test.ts`
  - `setColumnGap` calls `columnGap.set` with the value and runs nothing else
  - `ready` and `refresh` still do nothing

**Steps:**
- [ ] Write the listed tests and see them fail for the right reason
- [ ] Webview logic: the `back`, `columnGapChanged` and first-`settings` cases and
      `createSpacingControl`
- [ ] Webview UI: `Toolbar` and CSS mounted in `App`, connected to Back, Tidy
      (`useGraphLayout().tidy`) and the slider
- [ ] Extension: `ColumnGapStore`, the dispatcher route, `globalState` wiring and
      the publish at activation
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, and the untracked-file
      loop under Global Constraints) and propose the commit

Proposed commit message: `add toolbar with back, tidy and a column spacing slider`

The implementer does not stage or commit; the user does.


### Task 8: Labels once per supplier

Type labels are drawn once per supplier, beside its outgoing edge and inside its
node wrapper, instead of on every edge. They drag and fade with the node and
ellipsise at the column gap; the edge labels and their 40-character cap are gone.

**Files:**
- Create: `packages/webview/src/graph/supplier-labels.ts` (`supplierLabels`), `NodeLabels.tsx` (pure markup for one supplier's lines)
- Modify: `packages/webview/src/graph/to-flow.ts` (labels into node data; edges lose `label` and `data`; delete `truncateLabel` and `SpiderEdgeData`), `constants.ts` (delete `MAX_EDGE_LABEL_CHARS`), `SpiderNode.tsx`, `GraphView.tsx` (`columnGap` prop), `graph.css`, and `src/App.tsx` (pass `state.view.columnGap`)
- Test: `packages/webview/test/supplier-labels.test.ts`, `node-labels.test.tsx` (create); `to-flow.test.ts` (modify)

**Interfaces:**
- Consumes: `GraphEdge`, `NodeId` (core types); `toFlow(graph: GraphState)` and
  `SpiderNodeData = { node, isFocus, pinned }` (Task 5); `SpiderNode` (Task 6);
  `GraphViewProps` (Tasks 5 and 6); `AppState.view.columnGap` (Task 7).
- Produces:

  ```ts
  // graph/supplier-labels.ts
  export type LabelLine = { kind: "returns" | "jsx" | "passes"; text: string };
  export function supplierLabels(edges: readonly GraphEdge[]): Map<NodeId, LabelLine[]>;
  // graph/to-flow.ts
  export type SpiderNodeData = { node: GraphNode; isFocus: boolean; pinned: boolean;
    labels: readonly LabelLine[] };
  export type SpiderFlowEdge = Edge; // no data, no label
  ```

  `NodeLabels({ lines }: { lines: readonly LabelLine[] })`; `GraphViewProps` gains
  `columnGap: number`.

**Behaviour:**
- Grouping, joining and order are spec section 5.6 (`call` and `external` give
  `returns`; one line per supplier and kind; distinct `supplies` joined with ` · ` in
  edge-id order; returns, jsx, passes). Geometry, colours and truncation are also
  section 5.6; `returns` uses `--vscode-descriptionForeground`, the colour the old
  edge text had.
- `toFlow` computes the lines from drawn edges only (both ends present), so
  collapsing updates labels; a node supplying nothing gets `labels: []`.
- Labels never enter layout, Tidy or placement; node sizes stay analytic.
- An edge click still jumps to the call site. A click on a label counts as a click
  on its supplier's box; add no handler for it.

**Approach and traps:**
- Render `NodeLabels` as a sibling of `NodeBox` inside `SpiderNode`, not inside the
  box (`.node-box` clips overflow), positioned against the React Flow node wrapper,
  which has the box's size. `flex-direction: column-reverse` puts the first line
  lowest.
- `SpiderNode` cannot render outside React Flow (`Handle` needs its store), so test
  `NodeLabels` and `supplierLabels`, not `SpiderNode`.
- Set `--column-gap` as `${columnGap}px` on `.graph-canvas`; `CSSProperties` rejects
  a custom property, so cast the style object.
- Delete the edge-label leftovers in `graph.css` (`--xy-edge-label-*`,
  `.react-flow__edge-text`) together with `truncateLabel`, `MAX_EDGE_LABEL_CHARS` and
  `SpiderEdgeData`.
- Task 5's `to-flow.test.ts` asserts `label` and `data.fullLabel` in two cases, keeps
  an "omits the label" case that becomes meaningless, and has a `truncateLabel`
  block; rewrite or delete them for the new shape.

**Tests:**
- `packages/webview/test/supplier-labels.test.ts`
  - one line per supplier and kind
  - `call` and `external` merge into one `returns` line
  - `jsx` and `passes` stay separate
  - empty `supplies` is skipped
  - two different `supplies` values join with ` · ` in edge-id order
  - lines come out returns, jsx, passes, and a pure consumer has no entry
- `packages/webview/test/node-labels.test.tsx`
  - one element per line with its kind class and the full text in `title`
  - `returns` comes first in the markup, and an empty list renders nothing
- `packages/webview/test/to-flow.test.ts`
  - a supplier's data carries its lines (golden `handleSignup`: `validateUser` has `ValidUserData`; golden jsx: `SignupForm` has `SignupFormProps`)
  - an edge with a missing end adds no line
  - edges carry no `label` or `data`

**Steps:**
- [ ] Write the listed tests and see them fail for the right reason
- [ ] Add `supplierLabels` and `NodeLabels`; move the labels into `toFlow`'s node data
- [ ] Render them in `SpiderNode`, pass `columnGap` to `--column-gap`, add the CSS
- [ ] Delete `truncateLabel`, `MAX_EDGE_LABEL_CHARS`, `SpiderEdgeData` and the
      edge-label CSS; fix the Task 5 `to-flow` tests
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, and the untracked-file
      loop under Global Constraints) and propose the commit

Proposed commit message: `draw type labels once per supplier instead of per edge`

The implementer does not stage or commit; the user does.


### Task 9: Smoke tests, docs and the manual check list

Two smoke cases prove re-centring by node id and that a node brought in by an
expansion can be clicked. The main design spec records what M3a changed. The
owner's manual check list, in the final names, closes M3a.

**Files:**
- Modify: `packages/extension/smoke/suite/extension.smoke.ts` (two cases after the existing four)
- Modify: `docs/superpowers/specs/2026-08-22-code-spider-design.md` (sections 4.3, 7.5, 8.2 and the section 10 M3 list)

**Interfaces:**
- Consumes: `ExtensionApi.handleWebviewMessage(message)` and `currentGraph()`
  (`tsconfig` is the project); the smoke file's `currentProject(api)` (Task 2),
  `openFile`, `activeEditor` and `graphPanelTab()`; the `focus` and `expand`
  messages; `GraphPanel`'s `onClosed` clearing the jump table and `JumpHandler`
  ignoring an id the table lacks (Task 2).
- Produces: a smoke suite of six cases. No code interface.

**Behaviour:**
- Case 1 (spec section 8): `focus` for `src/signup.ts#validateUser`; then
  `api.currentGraph()?.slice.focusId` is that id. The webview no longer sends
  `focus` (Plan decision 11), so this case covers the extension side only.
- Case 2 (spec section 8): after `expand` of `src/signup.ts#handleSignup`,
  `openInEditor` for `src/signup.ts#createUser` puts the cursor at line index 7,
  character 0, on `export async function createUser`.
- Doc edits (spec section 2, and Plan decision 11): in 4.3, a re-centre (Show Graph
  from the editor) discards the visible graph's expansions but the Back history (20
  graphs) keeps them; in 7.5, replace "ELK runs only over the newly added subgraph"
  with our own column placement that never moves existing nodes, ELK serving only a
  new centre and Tidy, and add that labels are drawn once per supplier with M2's
  40-character cap gone; in 8.2, "expand click" becomes a double-click on a box and
  the table row "Expand `+`" becomes "Expand (double-click)"; in the section 10 M3
  list, mark expand-on-demand with pinning (double-click to expand and collapse),
  draggable nodes, the slider and no-overlap done in M3a, mark "Re-centre from
  inside the graph" as dropped (a single click plus `Shift+Alt+Q` covers it), and
  leave the refresh button, zoom level of detail and the file watcher as M3b.
  Sections 7.4 (`focus` stays in the protocol), 7.6 and 8.1 describe no double-click
  or in-graph re-centre; leave them, and the rest of that file, alone.

**Approach and traps:**
- The jump table keeps every slice sent since the panel opened, and the earlier
  cases already sent `createUser` (a neighbour of `handleSignup`), so case 2 would
  pass even if expansion never fed the table. So: close the Code Spider tab
  (`vscode.window.tabGroups.close`) and wait until `graphPanelTab()` is gone, which
  clears the table; run `codeSpider.showGraph` with the cursor in `validateUser` (its
  graph is only `validateUser` and `handleSignup`); open `src/app.ts`, send
  `openInEditor` for `createUser` and assert the editor did not move; then `expand`
  `handleSignup` (any integer `generation`) and click `createUser`.
- Read `currentProject(api)` after the new `showGraph`, not before. The mocha
  timeout (120 s) covers the extra panel open.

**Tests:**
- `packages/extension/smoke/suite/extension.smoke.ts`
  - "re-centres on a node by its id" (case 1, extension side only)
  - "jumps to a node that only an expansion brought in" (case 2, with the panel closed and reopened first)

**Manual check list (the owner runs it after Task 9; check 5 is the one the owner
runs at the end of Task 6, and is listed again here).** Setup: `pnpm build`, F5 with "Run Code Spider" (Extension Development Host on
`test-code/basic`), open `src/signup.ts`, cursor in `handleSignup`, `Shift+Alt+Q`.
1. Double-click `main`: no new box and no failure message appears; double-click it
   again: still nothing changes (it expanded, then collapsed, with nothing to add).
2. Click `validateUser`, then press `Shift+Alt+Q` in the editor to re-centre on it.
   Double-click `handleSignup`: `createUser`, `sendWelcome`, `main`, `retry` fade in
   without zoom, panning only if off screen. Double-click `handleSignup` again:
   those four go, `validateUser` and `handleSignup` stay.
3. Drag `createUser`: a pin icon appears. Double-click a neighbour to expand it:
   nothing moves. Drag another box onto where an expansion would land, then
   double-click to expand: the new boxes keep a visible gap. Click the pin: it
   vanishes and the box stays put.
4. Click a box: the editor jumps to its declaration at once. Click an edge: the call
   site.
5. Double-click ten different boxes in a row: each toggles (expands, or collapses if
   it was expanded) and the editor is at that box's declaration.
6. `← Back` returns the previous graph with expansions, positions and pins, and is
   disabled at the start. Re-centre 21 times with Show Graph from the editor,
   alternating between two functions: Back stops after 20.
7. Pin two boxes, press `Tidy`: the others re-lay out, the pinned two stay, nothing
   overlaps, the view fits.
8. Move the Spacing slider through both ends: boxes settle after a pause, labels
   ellipsise at narrow gaps with the full text on hover. Close the panel, run Show
   Graph: the value is kept; restart the dev host: still kept. Boxes also move
   apart vertically as the slider goes up and closer as it goes down; at the
   default the graph looks as it did before.
9. In `test-code/jsx` focus `Page`: `SignupForm` has one purple `SignupFormProps`
   label. In `basic` focus `handleSignup`: `validateUser`, `createUser` and
   `sendWelcome` each carry one label (`ValidUserData`, `User`, `void`) and
   `handleSignup` one `User` label for its two consumers.
10. "Developer: Reload Webviews": graph, pins and Back history return. Rename
    `createUser`, save, double-click its old box (one you have not expanded): the
    failure message shows about 4 s (undo the rename). Switch light and dark
    themes: boxes, labels, toolbar and pins follow.
11. (From the Task 5 review.) Drag a box: its edges stay drawn and follow it for the
    whole drag.
12. (From the Task 5 review.) Click a box while the pointer moves a few pixels (under
    the 4 px drag threshold): the editor still jumps to the code and the box neither
    moves nor pins.

**Steps:**
- [ ] Write the two smoke cases after the existing four
- [ ] Edit the four sections of the main design spec
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test` and `pnpm build` pass;
      `pnpm --filter code-spider-vscode check:electron` exits 0 (on exit 2 stop and
      report its `sudo apt install` line); `pnpm --filter code-spider-vscode
      test:smoke` reports six passing
- [ ] Hand the manual check list to the owner with the report (the implementer
      cannot run it)
- [ ] Inspect the task delta (`git diff --check`, `git diff`, and the untracked-file
      loop under Global Constraints) and propose the commit

Proposed commit message: `add smoke cases for re-centre and expansion, update the design spec`

The implementer does not stage or commit; the user does.
