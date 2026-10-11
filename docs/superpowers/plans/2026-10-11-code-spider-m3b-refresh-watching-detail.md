# Code Spider — M3b Refresh, Watching and Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to
> validate this plan and hand it to `subagent-driven-development` for
> task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Refresh button that re-reads the code for the graph on screen and keeps what the user built, a file watcher
that only records changed files and lights a dot on Refresh, grey bars for zoomed-out code, a Lines switch, one cursor
conversion in core, and a checked-in Electron script that tests the real webview bundle.

**Architecture:** The webview owns the view state and rebuilds a graph from one `refreshed` answer with pure functions
(`rebuildGraph`, `makeRoom`). The extension gets one worker request per refresh (the centre plus every expansion), a
`ChangeTracker` that records changed paths and a counter (the source version), and two file watchers that only feed the
tracker. The protocol stays defined once in `packages/webview/src/protocol.ts`.

**Tech Stack:** TypeScript 5.6+ (strict, `noUncheckedIndexedAccess`), pnpm workspaces, esbuild (CommonJS for extension
and worker, IIFE for the webview), React 19.3, `@xyflow/react` 12.12, `elkjs` 0.12 (`elk.bundled.js`), ts-morph in core,
Vitest 2, mocha with `@vscode/test-electron` (pinned VS Code build in `packages/extension/vscode-version.json`) for
smoke. **No new dependencies.**

**Spec:** docs/superpowers/specs/2026-10-11-code-spider-m3b-design.md ("section n" is a section of it, "§n" a section of
the main spec). The previous milestone: docs/superpowers/specs/2026-10-10-code-spider-m3a-design.md.

**Status:** built on 2026-10-11 in thirteen task commits (`f5684f5` to `bb03837`, on top of the plan commit `eed017e`)
plus the integration-review fixes. Final automated counts: core 248, CLI 39, webview 405, extension 206, smoke 7 cases,
`pnpm probe` 9 checks. The owner's ten manual checks (spec section 11) have NOT been run.
Baseline at commit `16afb67`, all passing: core 231, CLI 43, webview 290, extension 139, smoke 6.

## Global Constraints

Every task's requirements include these.

**Scope.** M3b only. Not built: Refresh of graphs in the Back history; cancelling a running analysis; live updates (the
watcher only records); showing which boxes are expanded; removing the unused `focus` message; a `WebviewPanelSerializer`;
M4 (truncation "+N more", the `.vsix`).

**TDD, once for every task.** Write the listed tests, see them fail for the right reason, implement, see them pass. A task's
"Tests" list is the set of new cases; all existing tests must still pass. Counts are not quoted in tasks. A task that
deletes tests says which.

**Repository rules (from the owner's instructions).**
- Files aim for 300 lines or fewer, hard cap 500; split by responsibility. Current sizes to watch: `session.ts` 191,
  `app-state.ts` 223, `graph-state.ts` 189, `GraphView.tsx` 199, `graph.css` 272, `extension.ts` 109. New logic goes in
  the new files each task names, not into these, and none of them may pass 300 lines.
- Comments are minimal: only logic that is hard to follow, never a label for the next line. Prefer simpler code to a comment.
- Pure logic is unit-tested. `packages/core` never imports `vscode`. Theme only through `--vscode-*` variables. Node sizes
  stay analytic (never measured from the DOM). No `unsafe-eval`.
- The extension imports the webview's protocol type-only. The runtime exceptions are `@code-spider/webview/column-gap` and,
  new in Task 11, `@code-spider/webview/edge-style`.
- Style is Prettier defaults (double quotes, semicolons, trailing commas, two-space indent), matched by hand. Prettier is
  not installed and must not be added. Packages are `"type": "module"` with `.js` import specifiers and
  `moduleResolution: Bundler`. Do not weaken `tsconfig.base.json`.
- Persisted shapes: every new field on `GraphState` and `ViewState` is optional, so the persisted `version` stays 1
  (spec section 3).

**Commands** (begin every Bash command with `cd /home/motodox/code/AlekP141/code-spider && `).
- `pnpm -r typecheck`; `pnpm -r test`; `pnpm build`. One package: `pnpm --filter @code-spider/core test <name>` (also
  `@code-spider/cli`, `@code-spider/webview`, `code-spider-vscode`; names follow the script with no `--`).
- Smoke: `pnpm --filter code-spider-vscode check:electron` first (exit 0 means the pinned VS Code can start here; exit 2
  prints the `sudo apt install` line, and the implementer stops and reports it), then
  `pnpm --filter code-spider-vscode test:smoke` (it runs `pnpm build` itself). The smoke tests are not part of
  `pnpm -r test`. This machine is WSL2 with WSLg (`DISPLAY=:0`); `xvfb-run` is not installed, so no wrapper is used. The
  smoke runner removes `ELECTRON_RUN_AS_NODE` and `VSCODE_*`, which the shell inherits from the editor.
- Probe (Task 12): `pnpm probe`. Separate from `pnpm -r test`.
- `cp` is aliased to interactive on this machine and hangs: use `command cp -f`.
- `git diff` and `git diff --check` skip untracked files, so every task's last step also runs
  `for f in $(git ls-files --others --exclude-standard -- <paths>); do git diff --no-index --check -- /dev/null "$f"; done`
  (exit status 1 only means the file differs from `/dev/null`; whitespace warnings are what matter).

**Commits.** The implementer never stages or commits. After a task's review is approved and the coordinator has re-run
the checks, the coordinator (Claude) stages that task's exact paths and commits them: one commit per task, a plain one-line
lowercase message saying what happened, no `feat:` or `chore:` prefixes or scopes, no attribution trailers. Nothing is
ever pushed. Each task ends with its proposed message.

**Version pins in use** (unchanged): `react` and `react-dom` ^19.3.0, `@xyflow/react` ^12.12.0, `elkjs` ^0.12.0,
`esbuild` ^0.28.2, `ts-morph` ^23.0.0, `@types/vscode` and `engines.vscode` ^1.140.0 with VS Code 1.141.0 for smoke,
`@vscode/test-electron` ^3.1.0, `mocha` ^12.0.3, `typescript` ^5.6.0, `vitest` ^2.1.0. No lockfile change.

## Agent Execution Contract

- Each task uses exactly one isolated `workflow-implementer` (Sonnet) and exactly one independent read-only
  `workflow-reviewer` (Sonnet, `high`).
- Both are reused with `SendMessage` for every fix and re-review of that task.
- After two failed fix rounds on the same substantive issue, stop and ask the owner whether to replace that task's
  implementer with a `workflow-author`; keep the same reviewer. Never replace an unresumable agent silently.
- One fresh `workflow-reviewer` does the integration review after the last task and is reused for its rechecks.
- Minor review findings are fixed, not parked, unless a later task rewrites the file.

## Plan decisions

The spec's outline has nine tasks. Where it leaves a choice, the plan decides:

1. **Thirteen tasks.** Split where a reviewer could reject one part and approve its neighbour: the refresh path into the
   worker (3), the session (4) and the unsaved-edit notice (5); the webview refresh into pure rebuild and make room (6)
   and the app wiring (7). Merged: the tracker and the worker cache are one pipeline (2).
2. **The watchers (and the debounce) are Task 9, after the dot (Task 8).** They post `sourceChanged`, which no consumer
   can handle before Task 8, and the protocol and its consumers must change together.
3. **Protocol landing.** Task 4: `refresh` fields, `refreshed`, `refreshFailed` (guard, gate, parse and dispatch; the
   webview reducer ignores the two answers until Task 7 so `reduceApp` stays exhaustive). Task 8: `sourceChanged` and
   `sourceVersion` on the centre `SliceMode`. Task 11: `edgeStyle` on `settings`, and `setEdgeStyle`. Each lands with every
   consumer and test fixture. `refreshed` carries `sourceVersion` from Task 4; centre slices from Task 8.
4. **State lands where first used:** `AppState.refreshing` in Task 7, `latestSourceVersion` in Task 8, `GraphState.sourceVersion`
   in Task 6 (the rebuild sets it).
5. **New files for size or sharing:** `watched-paths.ts` (shared by the tracker and the worker bundle, so it imports
   nothing), `worker/apply-changes.ts` (`project-cache.ts` is 120 lines), `session-refresh.ts`, `app-refresh.ts`,
   `app-settings.ts`, `graph/lod.ts`, `graph/code-lines.ts`.
6. **`NodeNotFoundError` lives in `core/src/errors.ts`.** The session's request type is `RefreshGraphRequest`, because
   the worker already owns the name `RefreshRequest` (spec section 3).
7. **`toFlow(graph, edgeStyle = DEFAULT_EDGE_STYLE)`:** ELK's callers (`use-layout.ts`, `tidy-graph.ts`) need no edge style.
8. **Both extension stores announce through one `() => void`.** `ColumnGapStore`'s constructor takes it instead of
   `(columnGap) => void`, and its `publish()` goes; `extension.ts` calls `announce()` once at activation.
9. **`latestSourceVersion` keeps the larger value seen, and `resetTransient` leaves it alone** (it describes the
   workspace, not the graph).
10. **Strict messages.** The `settings` guard and the `setEdgeStyle` parse reject an unknown style name instead of
    normalising it; the stores normalise anyway.
11. **The probe finds the CSP by bundling `packages/extension/src/panel/html.ts` with esbuild at run time**, so one source
    of truth exists; its run directory lives under `packages/extension/.vscode-test/` (already git-ignored).
12. **README and the M3a documents are not edited:** the README is two lines and mentions neither the toolbar nor the CLI.

## File structure (new files)

| File | Responsibility | Task |
|---|---|---|
| `packages/core/src/position.ts` | `positionToOffset` | 1 |
| `packages/core/src/errors.ts` | `NodeNotFoundError` | 3 |
| `packages/extension/src/watched-paths.ts` | which paths are tracked; config file names; watcher globs | 2, 9 |
| `packages/extension/src/worker/apply-changes.ts` | applies a queue of changed paths to one project entry | 2 |
| `packages/extension/src/session-refresh.ts` | refresh outcome messages and the unsaved-edit text | 4, 5 |
| `packages/extension/src/vscode/documents.ts`, `vscode/watchers.ts` | VS Code adapters: unsaved documents; file watchers | 5, 9 |
| `packages/extension/src/debounce.ts`, `edge-style-store.ts` | extension's own trailing debounce; the edge-style store | 9, 11 |
| `packages/webview/src/graph/make-room.ts`, `view/refresh.ts` | pure: fix overlaps; rebuild a graph from an answer | 6 |
| `packages/webview/src/app-refresh.ts`, `app-settings.ts` | reducer logic for refresh and the dot; for `settings` and edge style | 7, 8, 11 |
| `packages/webview/src/graph/lod.ts`, `graph/code-lines.ts` | zoom threshold rule; code split into indent and text | 10 |
| `packages/webview/src/edge-style.ts` | `EdgeStyle` and its normaliser, shared with the extension | 11 |
| `packages/webview/probe/*` | Electron probe: `run.mjs`, `main.js`, `harness.js`, `fixtures.js`, `checks-*.js` | 12 |

---

### Task 1: Cursor position in core, the CLI, the worker and the extension

The cursor's line and character become an offset in core, against the text of the file the project holds (the file on
disk), so a mixed-line-ending file focuses the right function. The CLI and the extension stop doing their own arithmetic.

**Files:**
- Create: `packages/core/src/position.ts`
- Modify: `packages/core/src/analyze.ts` (add `analyzeFocusAt` beside `analyzeFocus`), `packages/core/src/index.ts` (exports)
- Modify: `packages/cli/src/index.ts` (delete `lineColToOffset` and the file read; call `analyzeFocusAt` with `line - 1`, `col - 1`;
  keep the `File not found` check)
- Modify: `packages/extension/src/worker/protocol.ts`, `worker/handler.ts`, `worker/worker-client.ts`, `ports.ts`, `session.ts`
  (`FocusRequest` loses `text`), `vscode/focus-request.ts` (stop reading `document.getText()`)
- Delete: `packages/extension/src/positions.ts`, `packages/extension/test/positions.test.ts`
- Test: `packages/core/test/position.test.ts`, `analyze-at.test.ts` (create); `packages/cli/test/cli.test.ts` (delete the
  `lineColToOffset` describe, six cases); extension `worker-handler.test.ts`, `worker-client.test.ts`,
  `worker-integration.test.ts`, `session.test.ts`, `session-nodes.test.ts`, `session-closed.test.ts`, `support/fixtures.ts`
  (replace `offsetOf` with `positionOf(file, needle, delta): { line; character }`)

**Interfaces:**
- Produces:

  ```ts
  // @code-spider/core
  export function positionToOffset(text: string, line: number, character: number): number; // zero-based
  export type AnalyzeAtRequest = { file: string; line: number; character: number; repoRoot: string };
  export function analyzeFocusAt(project: Project, req: AnalyzeAtRequest): GraphSlice;
  // extension
  FocusRequestBody = { kind: "focus"; file: string; line: number; character: number; changedFiles: string[] };
  AnalysisPort.focus(file: string, line: number, character: number, changedFiles: string[]): Promise<FocusResult>;
  FocusRequest = { file: string; line: number; character: number; isDirty: boolean }; // no text
  ```

**Behaviour:**
- `positionToOffset`: line breaks, clamping, the byte-order mark and the `RangeError` are spec section 7; its examples are
  test cases.
- `analyzeFocusAt` converts against `project.getSourceFile(file)?.getFullText()`, fails with `File is not in project: <file>`
  (the message `resolveFocus` uses) when absent, then does what `analyzeFocus` does. `analyzeFocus` by offset stays for core's tests.
- The CLI keeps one-based `file:line:col`; a late column now clamps, a line past the end still fails as a one-line error.
- `showGraph` still refuses a dirty document with the existing "save first" warning.

**Approach and traps:**
- One scan with `/\r\n|\r|\n/g` finds line starts; do not split and re-join.
- The mixed-ending core test writes its file into `os.tmpdir()` with its own `tsconfig.json` (git would normalise a checked-in one).
- `positions.ts` is imported only by `session.ts`. `offsetOf` has four call sites in the extension tests (`worker-handler`, `worker-integration`); `worker-client.test.ts`
  posts a literal `offset: 12`; three session test files build a `FocusRequest` with `text`.
- The worker's `open(file)` already puts the focused file into the project and `showGraph` always sends it in `changedFiles`, so
  the text `analyzeFocusAt` reads is the disk text.

**Tests:**
- `position.test.ts`: LF; CRLF; mixed `"ab\r\ncd\nef"` gives 5 for (1,1) and 8 for (2,1); lone CR `"ab\rcd"` (1,1) is 4
- `position.test.ts`: `"﻿ab\ncd"` (0,1) is 2 and line 1 offsets do not shift; no BOM counts as no BOM
- `position.test.ts`: a character past the end clamps to the line end without the break; a negative character clamps to 0
- `position.test.ts`: a trailing newline gives an addressable empty last line; a line past the end or negative throws
  `RangeError` "Line N is out of range (file has M lines)"
- `analyze-at.test.ts`: same slice as `analyzeFocus` at the equivalent offset on `test-code/basic`
- `analyze-at.test.ts`: in a mixed-ending file written at run time the cursor lands in the function the disk text puts there
- `analyze-at.test.ts`: a file not in the project fails; a line out of range rejects with `RangeError`
- `cli.test.ts`: a column past the end of the line gives the same slice as a valid column; a line past the end throws `out of range`
- extension tests: the worker handler, client, integration and session cases pass `line` and `character`

**Steps:**
- [ ] Add `positionToOffset` and `analyzeFocusAt` to core with their exports
- [ ] Move the CLI onto `analyzeFocusAt`; delete `lineColToOffset` and its tests
- [ ] Carry `line` and `character` through the worker request, handler, client, port, session and `focus-request.ts`; delete `positions.ts` and its test
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `convert the cursor position against the file on disk through core`

### Task 2: Changed files: tracker, versions and the worker cache

The tracker records changed paths by file name and keeps a counter, and the worker's project cache applies each kind of
change (spec sections 5.1 to 5.3). No watcher yet (Task 9).

**Files:**
- Create: `packages/extension/src/watched-paths.ts`, `packages/extension/src/worker/apply-changes.ts`
- Modify: `packages/extension/src/changes.ts` (`ChangeTracker`; `ANALYSABLE_LANGUAGE_IDS` and `isAnalysableLanguage` stay),
  `worker/project-cache.ts`, `session.ts` (`.files` at the four `drain()` calls), `extension.ts` (`onDidSaveTextDocument` calls
  `changes.mark(document.uri.fsPath)` for `file` documents)
- Test: `packages/extension/test/watched-paths.test.ts`, `worker-changes.test.ts` (create); `changes.test.ts` (rewrite the
  `ChangeTracker` block); the session tests that call `changes.markSaved` or read `drain()`

**Interfaces:**
- Produces:

  ```ts
  // watched-paths.ts (imports nothing)
  export const SOURCE_EXTENSIONS: readonly string[]; // ts tsx mts cts js jsx mjs cjs
  export function isConfigFile(path: string): boolean;  // tsconfig*.json or jsconfig*.json
  export function isTrackedPath(path: string): boolean; // listed extension (any case) or config file, no node_modules segment
  // changes.ts
  export type Drained = { files: string[]; version: number };
  export class ChangeTracker {
    constructor(onMarked?: (version: number) => void);
    mark(fsPath: string): void;  // ignores untracked paths
    drain(): Drained;
  }
  // worker/project-cache.ts: ProjectEntry gains notIncluded: Set<string>
  // worker/apply-changes.ts
  export function applyChangedFiles(entry: ProjectEntry, files: Iterable<string>): void;
  ```

**Behaviour:**
- Tracker: spec section 5.1. `version` goes up by one per tracked `mark`, even for a path already waiting; `drain()` empties
  the files, reports the counter and never resets it; `onMarked` runs with the new version on each tracked mark.
- Segments are split on `/` and `\`. The extension test is case-insensitive; the `node_modules` segment and config file names match as written.
- Cache: the per-path rules of spec section 5.2. `noteChanged` handles config files first: one in the batch drops every loaded
  project and clears `tsconfigByFile` (keep `addedFiles`), then queues the rest for the projects still loaded. `applyChangedFiles`
  handles the queue: known files `refreshFromFileSystemSync()`; unknown files that exist and are not in `notIncluded` are
  candidates, and a batch with candidates calls `addSourceFilesFromTsConfig` once; candidates still not held join `notIncluded`;
  absent unknown paths are ignored. The queue clears only after the whole batch.
- The cache change is invisible to the protocol; the `drain()` guarantee of spec section 5.3 needs a test, not code.

**Approach and traps:**
- `noteChanged` runs first in every handler request and `refreshChanged` runs inside `openTsconfig`. A focus on a file outside
  the tsconfig's include therefore costs one config re-read the first time (the file is then recorded as not included and
  `open()` adds it as today); that is expected.
- `evictOldest` drops `pending` with the entry, so `notIncluded` needs no other cleanup.
- `session.warm` also drains: it takes `.files` like the others. The version is not used until Tasks 4 and 8.
- Existing session tests call `changes.markSaved("typescript", path)`: change them to `mark(path)`.

**Tests:**
- `watched-paths.test.ts`: every listed extension is tracked, upper case too; `.d.ts` is tracked; `.md`, `.json` and `.css` are not
- `watched-paths.test.ts`: `tsconfig.json`, `tsconfig.build.json`, `jsconfig.json` are config files; `tsconfig.txt` and `xtsconfig.json` are not
- `watched-paths.test.ts`: any `node_modules` segment excludes the path, with `/` or `\`
- `changes.test.ts`: `mark` ignores untracked paths without a version change or callback
- `changes.test.ts`: the version rises per tracked mark, also for a path already waiting; the callback gets each version
- `changes.test.ts`: `drain` returns files once and deduplicated with the current version, then empty with the same version
- `worker-changes.test.ts`: a changed known file is re-read; a deleted one is forgotten (`getSourceFile` is undefined)
- `worker-changes.test.ts`: three new files the tsconfig includes cause one `addSourceFilesFromTsConfig` and are all held
- `worker-changes.test.ts`: an existing file outside the include causes one re-read, then never again for the same path; an absent path none
- `worker-changes.test.ts`: a config change drops every loaded project (`openTsconfig` returns a new entry) and forgets the tsconfig lookup
- `worker-changes.test.ts`: a throw while applying leaves the queue for the next use
- `worker-changes.test.ts` (spec section 5.3): after a request carrying an edit fails (unknown node; and one failing before the
  project opens), a request carrying no files sees the edit

**Steps:**
- [ ] Add `watched-paths.ts` and rebuild `ChangeTracker`; switch the session and `extension.ts` to `drain().files` and `mark`
- [ ] Add `apply-changes.ts` and wire `ProjectCache` (`notIncluded`, config drop, batch rules)
- [ ] Update the session tests; add the new tests
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `track changed paths by name and extension and apply them in the worker cache`

### Task 3: Worker refresh

A `refresh` request opens the project by tsconfig and expands the centre and every expanded node in one go (spec
section 4.2 step 3). Core gets `NodeNotFoundError`.

**Files:**
- Create: `packages/core/src/errors.ts`
- Modify: `packages/core/src/analyze.ts` (the two "Node not found" throws), `packages/core/src/index.ts`
- Modify: `packages/extension/src/worker/protocol.ts`, `worker/handler.ts`, `worker/worker-client.ts`, `ports.ts`
- Test: `packages/core/test/node-not-found.test.ts` (create); extension `worker-handler.test.ts`, `worker-client.test.ts`,
  `worker-integration.test.ts`; `support/session-setup.ts` and any other `AnalysisPort` literal (add `refresh`)

**Interfaces:**
- Consumes: `expandNode(project, nodeId, repoRoot)`; `ProjectCache.openTsconfig`; `NodeId`, `GraphSlice`.
- Produces:

  ```ts
  export class NodeNotFoundError extends Error {}  // @code-spider/core
  // worker/protocol.ts
  export type RefreshRequest = { kind: "refresh"; tsconfig: string; focusId: NodeId; expanded: NodeId[]; changedFiles: string[] };
  export type RefreshResult = { tsconfig: string; repoRoot: string; centre: GraphSlice | undefined;
    expansions: { nodeId: NodeId; slice: GraphSlice }[] };
  // WorkerRequestBody gains RefreshRequest; WorkerResponse gains { id: number; kind: "refreshed"; result: RefreshResult }
  AnalysisPort.refresh(tsconfig: string, focusId: NodeId, expanded: NodeId[], changedFiles: string[]): Promise<RefreshResult>;
  ```

**Behaviour:**
- `NodeNotFoundError` is thrown for the missing-file and missing-declaration cases with the messages unchanged
  (`Node not found (missing file): <id>` and `Node not found: <id>`); "Node is not expandable" stays a plain `Error`.
- The handler runs `expandNode` for `focusId`, then for each id of `expanded` in order. It catches only `NodeNotFoundError`:
  for the centre it answers `centre: undefined, expansions: []`; for an expanded id it leaves that id out. Anything else
  falls to the existing catch and answers `failed`.
- `repoRoot` and `tsconfig` come from the opened entry. `WorkerClient.refresh` follows `sliceForNode`: a reply of another
  kind rejects with `Unexpected worker response`.

**Approach and traps:**
- Use `cache.openTsconfig`, not `open`; the handler's first statement (`noteChanged`) already covers `changedFiles`.
- Core is bundled into `worker.cjs`, so `instanceof NodeNotFoundError` holds in the worker; the integration test proves it
  on the real bundle (the test builds it in `beforeAll`).

**Tests:**
- `node-not-found.test.ts`: a missing file and a missing declaration throw `NodeNotFoundError` with the old messages
- `node-not-found.test.ts`: an `external:` id and a `#<module>` id throw a plain `Error`, not `NodeNotFoundError`
- `worker-handler.test.ts`: refresh answers the centre and the expansions in the order asked, with `repoRoot` and `tsconfig`
- `worker-handler.test.ts`: a missing centre gives `centre: undefined` and no expansions
- `worker-handler.test.ts`: a missing expanded id is left out and the others stay
- `worker-handler.test.ts`: an unexpandable id in `expanded` fails the whole request with its message
- `worker-handler.test.ts`: changed files in the request are applied before the slices are made
- `worker-client.test.ts`: `refresh` posts the request body and resolves with the result; a mismatched reply rejects
- `worker-integration.test.ts`: a real worker answers a refresh for `handleSignup` with `validateUser` expanded

**Steps:**
- [ ] Add `NodeNotFoundError` and throw it from `expandNode`
- [ ] Add the request, result and response types; the handler case; `WorkerClient.refresh`; `AnalysisPort.refresh`
- [ ] Update the `AnalysisPort` fakes; add the tests
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `add a refresh request to the worker and a not-found error to core`

### Task 4: Session refresh and the protocol

`GraphSession.refresh` runs one worker request and answers `refreshed` or `refreshFailed` (spec section 4.2 steps 1 to 4).
The protocol gains the refresh messages and every consumer follows.

**Files:**
- Modify: `packages/webview/src/protocol.ts`, `messages.ts` (guard), `app-state.ts` (the reducer ignores `refreshed` and `refreshFailed`)
- Modify: `packages/extension/src/panel/messages.ts` (parse), `panel/message-gate.ts` (ephemeral), `dispatch.ts`, `session.ts`
- Create: `packages/extension/src/session-refresh.ts`
- Test: `packages/webview/test/messages.test.ts`; extension `webview-messages.test.ts`, `message-gate.test.ts`, `dispatch.test.ts`,
  `session-refresh.test.ts` (create)

**Interfaces:**
- Consumes: `AnalysisPort.refresh`, `RefreshResult` (Task 3); `ChangeTracker.drain(): { files; version }` (Task 2);
  `JumpRegistry.add(project, result)`, `has(project)`.
- Produces (protocol shapes exactly as spec section 3):

  ```ts
  // protocol.ts
  | { type: "refresh"; project: string; generation: number; focusId: NodeId; expanded: NodeId[] }          // WebviewToExtension
  | { type: "refreshed"; project: string; generation: number; sourceVersion: number;
      centre: GraphSlice; expansions: { nodeId: NodeId; slice: GraphSlice }[] }                            // ExtensionToWebview
  | { type: "refreshFailed"; generation: number; message: string }
  // session.ts
  export type RefreshGraphRequest = { project: string; generation: number; focusId: NodeId; expanded: NodeId[] };
  GraphSession.refresh(request: RefreshGraphRequest): Promise<void>;
  // session-refresh.ts
  export const CENTRE_GONE_MESSAGE =
    "The function at the centre of this graph no longer exists. Put the cursor in a function and press Shift+Alt+Q.";
  ```

**Behaviour:**
- Flow, token rules, drops, jump-table and `currentGraph()` updates, and the two failure texts: spec section 4.2 steps 2 to 4
  and section 10. A missing centre posts `refreshFailed` with `CENTRE_GONE_MESSAGE` and changes neither the table nor
  `currentGraph()`; an unknown project posts `refreshFailed` "Unknown project" before any busy or worker work.
- `sourceVersion` is `drain().version` read when the files are drained, before awaiting the worker. `refreshed.project` is the
  answer's `tsconfig` and `refreshed.generation` the request's.
- Gate: `refreshed` and `refreshFailed` are ephemeral (spec section 3). Parse accepts `refresh` only with a string `project`,
  an integer `generation`, a string `focusId` and `expanded` as an array of strings.
- Guard (`isExtensionMessage`): `refreshed` needs string `project`, numeric `generation` and `sourceVersion`, an object `centre`
  and `expansions` as an array of `{ nodeId: string; slice: object }`; `refreshFailed` needs numeric `generation` and a string `message`.

**Approach and traps:**
- Extract the busy bracket (`outstanding` count, `busy` true and false) from `replaceGraph` into one private method both use.
  `refresh` reads `this.latest` and never increments it, so an older centre request still wins its own answer.
- The catch must apply the same `token !== this.latest || !panel.isOpen()` drop as `replaceGraph`, then `describeFailure` and
  `notifyCrash` (one toast for a crash that rejects several requests).
- Message builders go in `session-refresh.ts`; `session.ts` must stay well under 300 lines.
- `reduceApp` is exhaustive over `AppAction`: add `case "refreshed": case "refreshFailed": return state;`. Task 7 replaces it.

**Tests:**
- `session-refresh.test.ts`: an unknown project posts `refreshFailed` "Unknown project", with no busy and no worker call
- `session-refresh.test.ts`: posts busy true, then `refreshed` with the drained version, then busy false; one worker call with tsconfig, focusId, expanded and the drained files
- `session-refresh.test.ts`: a mark after the drain and before the answer does not change the answer's `sourceVersion`
- `session-refresh.test.ts`: every returned slice enters the jump table (a node only an expansion brought resolves); `currentGraph()` becomes the refreshed centre
- `session-refresh.test.ts`: a missing centre posts `CENTRE_GONE_MESSAGE` and leaves the table and `currentGraph()` alone
- `session-refresh.test.ts`: another failure posts `refreshFailed` with its text; a crash shared by a refresh and an expansion toasts once
- `session-refresh.test.ts`: a newer centre request or a closed panel drops the answer; busy false still follows
- `session-refresh.test.ts`: an older centre request still posts its slice after a refresh started; busy false comes after both
- `message-gate.test.ts`: `refreshed` and `refreshFailed` are sent when ready, dropped when not, never replayed
- `webview-messages.test.ts`: `refresh` parses with all four fields; missing, mistyped or non-string `expanded` members are dropped
- `dispatch.test.ts`: `refresh` routes to `session.refresh` with the four fields and runs nothing else
- `messages.test.ts` (webview): `refreshed` and `refreshFailed` are accepted when well-formed and rejected otherwise

**Steps:**
- [ ] Extend `protocol.ts`, the guard, the parse, the gate and the dispatcher; make `reduceApp` ignore the two answers
- [ ] Extract the busy bracket and add `GraphSession.refresh` with `session-refresh.ts`
- [ ] Add the tests
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `add the refresh path to the session, the protocol and the message gate`

### Task 5: Unsaved-edit notice on refresh

When a refresh is requested and an open document with unsaved edits belongs to the project's known files, a status bar
message says the graph shows the saved version (spec section 4.6). No toast; the refresh still runs.

**Files:**
- Modify: `packages/extension/src/ports.ts`, `jump-table.ts`, `session.ts`, `session-refresh.ts`, `vscode/notifier.ts`, `extension.ts`
- Create: `packages/extension/src/vscode/documents.ts`
- Test: `packages/extension/test/jump-table.test.ts`, `session-refresh.test.ts`; `support/session-setup.ts` (fakes)

**Interfaces:**
- Consumes: `GraphSession.refresh`, `session-refresh.ts` (Task 4).
- Produces:

  ```ts
  // ports.ts
  Notifier.status(message: string): void;            // vscode: setStatusBarMessage(message, 5000)
  export interface DocumentsPort { unsavedFiles(): string[] } // absolute fsPaths of dirty `file` documents
  JumpRegistry.files(project: string): string[];     // JumpTable: join(repoRoot, node.file) per node with a file, deduplicated
  SessionDeps.documents: DocumentsPort;
  // session-refresh.ts
  export function unsavedEditsMessage(files: readonly string[]): string | undefined;
  ```

**Behaviour:**
- Wording is spec section 4.6: one file names its base name, several say "N files"; none gives `undefined` and no call.
- `refresh` shows the message after the unknown-project check and before the busy bracket, from the dirty documents that
  are also in `jumps.files(project)`; it never blocks or changes the refresh.

**Approach and traps:**
- Compare paths exactly as `join(repoRoot, node.file)` against `document.uri.fsPath`; documents of other schemes are not listed.
- `vscode/documents.ts` is thin glue over `vscode.workspace.textDocuments` and has no test of its own.
- Adding members to `Notifier`, `JumpRegistry` and `SessionDeps` breaks every fake: update `session-setup.ts` and other literals.

**Tests:**
- `jump-table.test.ts`: `files` returns absolute, deduplicated paths of nodes that have a file, skips externals, and is empty for an unknown project
- `session-refresh.test.ts`: one unsaved project file gives the "signup.ts has unsaved changes" status text; two give "2 files"
- `session-refresh.test.ts`: an unsaved document outside the project gives no message
- `session-refresh.test.ts`: the refresh still posts `refreshed`; neither `warn` nor `error` is called
- `session-refresh.test.ts`: an unknown project shows no status message

**Steps:**
- [ ] Add the ports, `JumpTable.files`, `unsavedEditsMessage` and the session call
- [ ] Add the VS Code adapters and wire them in `extension.ts`
- [ ] Update the fakes; add the tests
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `tell the user when a refresh reads saved code while edits are unsaved`

### Task 6: Rebuild a graph and make room

Two pure functions: `rebuildGraph` turns the current graph and a `refreshed` answer into the new graph, and `makeRoom` slides
boxes down just enough (spec sections 4.3 and 4.4). Nothing is wired yet.

**Files:**
- Create: `packages/webview/src/view/refresh.ts`, `packages/webview/src/graph/make-room.ts`
- Modify: `packages/webview/src/view/types.ts` (`GraphState.sourceVersion?: number`), `view/persist.ts` (`isGraphState`: a missing
  `sourceVersion` passes, a non-number or non-finite one fails), `view/expansion.ts` (export `rectsOf`)
- Test: `packages/webview/test/rebuild-graph.test.ts`, `rebuild-graph-property.test.ts`, `make-room.test.ts` (create); `persist.test.ts`

**Interfaces:**
- Consumes: the `refreshed` message of Task 4; `graphFromSlice`, `isExpanded`
  (`graph-state.ts`); `placeExpansion`, `isClear`, `Rect` (`graph/placement.ts`); `rowGap` (`column-gap.ts`); `nodeHeight`; `NODE_WIDTH`.
- Produces:

  ```ts
  // view/refresh.ts
  export type RefreshAnswer = Extract<ExtensionToWebview, { type: "refreshed" }>;
  export type Rebuilt = { graph: GraphState; added: NodeId[] }; // added: nodes with no kept position
  export function rebuildGraph(current: GraphState, answer: RefreshAnswer, columnGap: number): Rebuilt;
  // graph/make-room.ts
  export type RoomBox = { id: NodeId; rect: Rect };
  export function makeRoom(boxes: readonly RoomBox[], pinned: ReadonlySet<NodeId>, columnGap: number): Record<NodeId, Point>; // moved boxes only
  ```

**Behaviour:**
- `rebuildGraph`: the fixpoint, replace-on-apply, kept positions and pins, removed pinned boxes, the new-node rule, the result's
  fields and `revision + 1` are spec section 4.3; `sourceVersion` comes from the answer; `columnGap` is the caller's (the graph's own).
- `makeRoom`: the order, obstacles, margin `rowGap(columnGap)`, down-only moves and the pinned exceptions are spec section 4.4.
- New nodes belong to the first slice in application order that listed them; each slice with new nodes calls `placeExpansion`
  as in spec section 4.4 (anchor = the slice key's rectangle, `existing` = everything placed so far).

**Approach and traps:**
- `mergeExpansion` must stay as it is (it never replaces). The replace-on-apply step is new code in `refresh.ts`.
- Work out rectangles after heights are fresh (`nodeHeight` of the rebuilt nodes), then `makeRoom`, then place.
- The key of a later slice may itself be new; because a slice applies only once its key is in the graph, that key was placed by
  an earlier slice. Place slices in application order.
- A pass of the fixpoint walks the answer's expansions in answer order; the result must not depend on that order.
- `makeRoom` keeps a moved box at its new y for later boxes, and pinned boxes constrain every unpinned box whatever the sort order.

**Tests:**
- `rebuild-graph.test.ts`: node data and edges are replaced by the fresh ones; a slice record's members and edge ids are fresh
- `rebuild-graph.test.ts`: kept nodes keep position and pin; a node that left loses its position
- `rebuild-graph.test.ts`: a vanished expanded box drops with everything reachable only through it
- `rebuild-graph.test.ts`: an expansion reachable only through another applies in a later pass, whatever the answer order
- `rebuild-graph.test.ts`: an expansion the user collapsed meanwhile, or whose `slice.focusId` differs, is not applied
- `rebuild-graph.test.ts`: a pinned box the rebuilt graph no longer reaches is removed with its pin; a reached one stays
- `rebuild-graph.test.ts`: `revision + 1`; generation, project, focusId and columnGap kept; `sourceVersion` from the answer
- `rebuild-graph.test.ts`: a node listed by the centre and an expansion is placed for the centre; `added` lists exactly the new ids
- `rebuild-graph.test.ts`: a grown box makes the box below it slide down by exactly the overlap plus the margin
- `rebuild-graph-property.test.ts`: over seeded random graphs at gaps 32, 192 and 480 (seeded as in `placement-property`),
  no new node overlaps any box and kept unpinned boxes never move up or sideways
- `make-room.test.ts`: no overlap moves nothing; an overlap moves the lower box to the upper's bottom plus margin, same x
- `make-room.test.ts`: a pushed box pushes the next; a box that grew into a pinned box jumps below it
- `make-room.test.ts`: pinned boxes never move, and two overlapping pinned boxes stay overlapped
- `make-room.test.ts`: ties on top are ordered by x then id; the margin follows `rowGap` at gaps 32, 192 and 480
- `persist.test.ts`: `sourceVersion` missing is accepted, a number accepted, a string or `NaN` rejected (current and history)

**Steps:**
- [ ] Add `sourceVersion?` and its persist rule
- [ ] Write `makeRoom`
- [ ] Write `rebuildGraph` (fixpoint, apply, kept state, make room, placement)
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `rebuild a graph from a refresh answer and make room for taller boxes`

### Task 7: Refresh in the app

The Refresh button, the `refreshing` state, applying `refreshed` and `refreshFailed`, and the double-click rule during a
refresh (spec sections 4.1, 4.2 step 5 and 4.5).

**Files:**
- Create: `packages/webview/src/app-refresh.ts`
- Modify: `packages/webview/src/app-state.ts`, `app-walk.ts` (`resetTransient`), `App.tsx`, `toolbar/Toolbar.tsx`,
  `graph/node-controls.ts`, `graph/jump.ts`, `graph/GraphView.tsx` (`ui` also carries `refreshing`)
- Test: `packages/webview/test/app-refresh.test.ts` (create); `node-controls.test.ts` (existing calls get `refreshing: false`),
  `toolbar.test.tsx`, `jump.test.ts`

**Interfaces:**
- Consumes: `rebuildGraph`, `RefreshAnswer` (Task 6); `refreshed`, `refreshFailed` (Task 4); `isWorking`, `resetTransient`; `entering` fields of `AppState`.
- Produces:

  ```ts
  // app-state.ts: AppState.refreshing: boolean; LocalAction gains { type: "refreshStarted" }
  // app-refresh.ts
  export function canRefresh(state: AppState): boolean;
  // node-controls.ts
  export type NodeUi = { busy: boolean; loading: readonly NodeId[]; refreshing: boolean };
  export type NodeControl = "none" | "expand" | "expandDisabled" | "loading" | "collapse" | "collapseDisabled";
  // jump.ts
  export function refreshMessage(graph: GraphState): WebviewToExtension; // expanded = slice keys but focusId, recorded order
  // Toolbar.tsx: ToolbarProps gains canRefresh: boolean; onRefresh(): void  (order: Back, Tidy, Refresh, Spacing)
  ```

**Behaviour:**
- `canRefresh` and when `refreshing` is set and cleared: spec section 4.5. `refreshed` applies only when `generation`, `project` and
  `centre.focusId` equal the current graph's (spec section 4.2 step 5); a matching `refreshFailed` puts its message in `state.error`.
- An applied answer replaces `view.current` with `rebuildGraph(current, action, current.columnGap ?? view.columnGap).graph`,
  sets `entering` to the added ids (merged with ids still fading, as `acceptAnswer` does), advances `nextToken`, and touches neither
  `fit` nor `reveal`. No added ids leaves `entering` alone.
- While `refreshing`, `nodeControl` gives `expandDisabled` for a collapsed function or component and `collapseDisabled` for an
  expanded one (after the `none` and `loading` checks); `doubleClickAction` gives `none` for both.
- The button, labelled "Refresh", posts `refreshMessage(graph)` and dispatches `refreshStarted`; title "Re-read the code for this graph".

**Approach and traps:**
- Put the reducer logic in `app-refresh.ts` (`startRefresh`, `applyRefreshed`, `failRefresh`); `app-state.ts` only dispatches to it.
- `busy: false` clears `refreshing`; `busy: true` does not. `resetTransient` (new centre, Back) clears it too.
- Build the click handler from the render's `canRefresh(state)` and post only if it held, so a double click cannot post twice; the
  reducer guard is the second line.
- `NodeUi.refreshing` is required: update `GraphView`'s `nodeUi` and every direct `nodeControl` caller in tests.

**Tests:**
- `app-refresh.test.ts`: `refreshStarted` sets `refreshing` when allowed; ignored with no graph, while busy or pending, while a box loads, or already refreshing
- `app-refresh.test.ts`: `canRefresh` mirrors the same guards
- `app-refresh.test.ts`: a matching `refreshed` shows new code, keeps positions, clears `refreshing`, raises `revision`, leaves `fit` and `reveal` unchanged
- `app-refresh.test.ts`: added nodes enter (`entering.ids`, new token); an answer that adds none leaves `entering` alone
- `app-refresh.test.ts`: an answer for another generation, project or centre is ignored and leaves `refreshing` as it was
- `app-refresh.test.ts`: a matching `refreshFailed` sets `error`, clears `refreshing`, keeps the graph; another generation is ignored
- `app-refresh.test.ts`: `busy: false` clears `refreshing` (the dropped-answer case), `busy: true` does not; a new centre and Back clear it
- `app-refresh.test.ts`: a box collapsed after `refreshStarted` stays collapsed when the answer arrives
- `node-controls.test.ts`: refreshing gives `expandDisabled` and `collapseDisabled`; `none` and `loading` unchanged; double-click gives `none` for both
- `toolbar.test.tsx`: Refresh renders between Tidy and Spacing, disabled from `canRefresh`, with the title
- `jump.test.ts`: `refreshMessage` lists the expanded keys except the centre in recorded order, with project and generation

**Steps:**
- [ ] Add `refreshing`, `refreshStarted`, `canRefresh` and the `refreshed` / `refreshFailed` handling in `app-refresh.ts`
- [ ] Add `refreshMessage`, the `NodeUi` / `nodeControl` change and the GraphView plumbing
- [ ] Add the Refresh button to `Toolbar` and wire `App.tsx`
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `add the Refresh button and the refresh flow to the webview`

### Task 8: Source version and the dot

Every centre slice carries the source version, the webview remembers the latest `sourceChanged`, and Refresh shows a dot when the
graph is older (spec section 5.3, the last two paragraphs). The watchers that send `sourceChanged` come in Task 9.

**Files:**
- Modify: `packages/webview/src/protocol.ts`, `messages.ts`, `app-state.ts`, `app-refresh.ts`, `App.tsx`, `toolbar/Toolbar.tsx`, `toolbar/toolbar.css`
- Modify: `packages/extension/src/session.ts` (centre mode carries the version), `panel/message-gate.ts` (`sourceChanged` is replayed state)
- Test: `packages/webview/test/app-source-version.test.ts` (create), `messages.test.ts`, `toolbar.test.tsx`; every fixture that builds a centre mode
  (`app-state`, `app-toolbar`, `app-walk`, `app-walk-batches`, `graph-column-gap`, `messages` in the webview; `session`, `session-nodes`,
  `message-gate` in the extension); extension `session.test.ts`, `message-gate.test.ts`

**Interfaces:**
- Consumes: `ChangeTracker.drain(): Drained` (Task 2); `GraphState.sourceVersion?` (Task 6); `resetTransient` (Task 7).
- Produces:

  ```ts
  // protocol.ts
  export type SliceMode = { kind: "centre"; sourceVersion: number } | { kind: "expansion"; nodeId: NodeId; generation: number };
  | { type: "sourceChanged"; version: number }  // ExtensionToWebview
  // app-state.ts: AppState.latestSourceVersion: number | undefined
  // app-refresh.ts
  export function showsChangeDot(state: Pick<AppState, "view" | "latestSourceVersion">): boolean;
  // Toolbar.tsx: ToolbarProps gains changedSince: boolean
  ```

**Behaviour:**
- The dot rule, its label "Files changed since this graph was drawn", the button `title` swap and the Back behaviour: spec section 5.3.
  `showsChangeDot` is true only when the graph has a `sourceVersion` and `latestSourceVersion` is defined and larger.
- `sourceChanged` stores the larger of the old and new value; `resetTransient` does not touch it.
- A committed centre takes `sourceVersion` from its slice's mode (set on the pending graph in `startCentre`); expansions leave it alone.
- The session posts `{ kind: "centre", sourceVersion }` from the `drain()` that gathered that request's files, in `showGraph` and `focusNode`.
- Gate: `sourceChanged` replays after `busy` and before content on every `ready`.

**Approach and traps:**
- `replaceGraph`'s `analyse` callback must report the version it drained, not the tracker's version when the answer lands.
- The dot sits inside the Refresh button as a `role="img"` span with the label; the button's visible text stays "Refresh".
- Persisted graphs from before this task have no `sourceVersion`; they never show a dot until Refresh sets one.

**Tests:**
- `app-source-version.test.ts`: `sourceChanged` stores the version and keeps the larger one when an older arrives
- `app-source-version.test.ts`: a committed centre stores `sourceVersion` from the mode; an expansion leaves it; Back restores the graph's own value
- `app-source-version.test.ts`: `resetTransient` keeps `latestSourceVersion`
- `app-source-version.test.ts`: `showsChangeDot` is false with no graph, no graph version, no latest, equal versions, a higher graph version; true when the graph is lower
- `app-source-version.test.ts`: a `refreshed` answer with the newer version clears the dot
- `messages.test.ts`: a centre mode without a numeric `sourceVersion` is rejected; `sourceChanged` needs a numeric `version`
- `toolbar.test.tsx`: the dot renders only with `changedSince`, carries the label, and the button title changes with it
- `message-gate.test.ts`: the latest `sourceChanged` replays on every `ready`, after `busy` and before content
- `session.test.ts`: `showGraph` and `focusNode` post the version drained for that request; a later mark does not change it

**Steps:**
- [ ] Change `SliceMode`, add `sourceChanged`, and update the guard, the gate, the session and all fixtures
- [ ] Add `latestSourceVersion`, the reducer cases and `showsChangeDot`
- [ ] Render the dot in `Toolbar` and wire `App.tsx`
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `show a dot on Refresh when files changed since the graph was drawn`

### Task 9: File watchers

Two watchers and the saves feed the tracker; a 200 ms trailing debounce turns marks into `sourceChanged` (spec section 5.1).
Nothing analyses or redraws.

**Files:**
- Create: `packages/extension/src/debounce.ts`, `packages/extension/src/vscode/watchers.ts`
- Modify: `packages/extension/src/watched-paths.ts` (globs), `extension.ts`
- Test: `packages/extension/test/debounce.test.ts` (create), `watched-paths.test.ts`

**Interfaces:**
- Consumes: `ChangeTracker(onMarked)`, `mark` (Task 2); `{ type: "sourceChanged"; version: number }`, `GraphPanel.post` (Task 8).
- Produces:

  ```ts
  // watched-paths.ts
  export const SOURCE_WATCH_GLOB: string; // **/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}, built from SOURCE_EXTENSIONS
  export const CONFIG_WATCH_GLOB: string; // **/{tsconfig,jsconfig}*.json
  // debounce.ts
  export class TrailingDebounce<T> { constructor(delayMs: number, run: (value: T) => void); push(value: T): void; dispose(): void }
  // vscode/watchers.ts
  export function registerChangeWatchers(onChange: (fsPath: string) => void): vscode.Disposable;
  ```

**Behaviour:**
- Create, change and delete events of both watchers call `changes.mark(uri.fsPath)`; so does `onDidSaveTextDocument` for `file`
  documents (it also covers files outside the workspace folders). The debounce is 200 ms, trailing, and posts
  `sourceChanged` with the latest version. `extension.ts` disposes the watchers and the debounce.
- `TrailingDebounce` has the same behaviour as the webview's `debounce.ts`, but the extension may not import the webview at runtime
  beyond the two named modules, so it is a copy.

**Approach and traps:**
- Create the debounce before the `ChangeTracker` and pass `(version) => debounce.push(version)`; the panel already exists at that point.
- Tracker predicates already drop `node_modules` and unlisted files, so the watchers may fire for everything the globs match.
- `registerChangeWatchers` has no unit test (it needs `vscode`); the globs and the debounce are tested, and manual checks 4 and 5 cover the wiring.
- A path watched and saved at once is marked twice; that is fine (the counter rises per mark).

**Tests:**
- `debounce.test.ts` (fake timers): a burst runs once with the last value after the delay; `dispose` cancels a pending run; a later push runs again
- `watched-paths.test.ts`: `SOURCE_WATCH_GLOB` lists exactly `SOURCE_EXTENSIONS`
- `watched-paths.test.ts`: `CONFIG_WATCH_GLOB` names both `tsconfig` and `jsconfig`

**Steps:**
- [ ] Add the globs and the debounce
- [ ] Add `registerChangeWatchers` and wire it, the debounce and the save hook in `extension.ts`
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `watch source and config files and tell the webview when they change`

### Task 10: Zoom level of detail

Below a zoom of 0.5 every box shows its code as grey bars that follow each line's length and indent (spec section 6).

**Files:**
- Create: `packages/webview/src/graph/lod.ts`, `packages/webview/src/graph/code-lines.ts`
- Modify: `packages/webview/src/graph/constants.ts` (`LOD_ZOOM = 0.5`), `NodeBox.tsx`, `GraphView.tsx`, `graph.css`
- Test: `packages/webview/test/lod.test.ts`, `code-lines.test.ts` (create); `node-box.test.tsx`

**Interfaces:**
- Produces:

  ```ts
  // graph/lod.ts
  export function isZoomedOut(zoom: number): boolean;           // zoom < LOD_ZOOM
  export function canvasClassName(zoomedOut: boolean): string;  // "graph-canvas" plus "is-zoomed-out" when true
  // graph/code-lines.ts
  export type CodeLine = { indent: string; text: string };
  export function splitCodeLines(codePreview: string): CodeLine[]; // split at \n, drop a trailing \r, indent = leading [ \t]*
  ```

**Behaviour:**
- `NodeBox` renders each line as its `indent` followed by `<span class="code-text">` holding `text`; a line whose `text` is empty has no
  span. Lines are separated by `\n` text nodes inside the `<pre>`, so the region's height and clip are unchanged.
- The class on the canvas container, the CSS and the single boolean subscription: spec section 6. The header, the type labels
  and every box size stay as they are.
- In `graph.css`: `.is-zoomed-out .code-text` gets `color: transparent`, a `--vscode-editorLineNumber-foreground` background and a
  small border radius.

**Approach and traps:**
- `GraphView` renders the container outside `<ReactFlow>`, out of reach of the store. Export `GraphView` as a wrapper that mounts
  `ReactFlowProvider` around the existing body; the body subscribes with `useStore((s) => isZoomedOut(s.transform[2]))`, a boolean, so it
  re-renders only when the threshold is crossed (selecting the raw zoom would re-render on every wheel tick), and builds the container class with `canvasClassName`. Keep `nodeTypes` module-level.
- `FitOnRequest` and `RevealOnRequest` use `useReactFlow` and keep working inside the provider.
- Keep `GraphView.tsx` under 300 lines; `graph.css` is 272, so add the rules compactly.
- The text stays in the DOM at all times, so nothing mounts or unmounts at the threshold. `\r` is dropped only at the line end.

**Tests:**
- `lod.test.ts`: 0.49 is zoomed out, 0.5 and 1 are not; `canvasClassName` adds `is-zoomed-out` only when true
- `code-lines.test.ts`: splits at `\n`; drops a trailing `\r`; indent takes spaces and tabs only
- `code-lines.test.ts`: a blank line and a whitespace-only line give empty `text`; joining indent and text with `\n` restores the input without `\r`
- `node-box.test.tsx`: non-blank lines render indent then `<span class="code-text">`; blank lines render no span
- `node-box.test.tsx`: the `<pre>`'s text content equals `codePreview`; its height style is unchanged; chips still render no `<pre>`

**Steps:**
- [ ] Add `LOD_ZOOM`, `lod.ts` and `code-lines.ts`
- [ ] Render the lines in `NodeBox`; add the CSS
- [ ] Add the provider and the single subscription in `GraphView`
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `draw zoomed-out code as grey bars`

### Task 11: Line style

A Lines switch (Stepped or Curved) in the toolbar, stored globally like the Spacing value and applied to every graph (spec section 8).
`settings` carries both values, so the webview and the extension change together.

**Files:**
- Create: `packages/webview/src/edge-style.ts`, `packages/webview/src/app-settings.ts`, `packages/extension/src/edge-style-store.ts`
- Modify (webview): `package.json` (export `"./edge-style": "./src/edge-style.ts"`), `protocol.ts`, `messages.ts`, `view/types.ts`, `view/view-state.ts`
  (`createView(columnGap, edgeStyle)`), `view/persist.ts`, `app-state.ts` (move `withColumnGap` and the `settings` case to `app-settings.ts`),
  `graph/to-flow.ts`, `graph/GraphView.tsx`, `toolbar/Toolbar.tsx`, `toolbar/toolbar.css`, `App.tsx`
- Modify (extension): `column-gap.ts`, `ids.ts` (`STATE_EDGE_STYLE = "codeSpider.edgeStyle"`), `dispatch.ts`, `panel/messages.ts`, `extension.ts`
- Test: webview `edge-style.test.ts`, `app-settings.test.ts` (create), `persist.test.ts`, `messages.test.ts`, `to-flow.test.ts`, `toolbar.test.tsx`,
  `history.test.ts`, `app-state.test.ts` and `app-toolbar.test.ts` (their `settings` cases); extension `edge-style-store.test.ts` (create), `column-gap.test.ts`, `dispatch.test.ts`,
  `webview-messages.test.ts`, `message-gate.test.ts`

**Interfaces:**
- Consumes: `MementoPort` (`column-gap.ts`); the `settings` replay in `MessageGate` (kind `settings`, unchanged).
- Produces:

  ```ts
  // edge-style.ts (pure; imported at runtime by the extension)
  export const EDGE_STYLES = ["stepped", "curved"] as const;
  export type EdgeStyle = (typeof EDGE_STYLES)[number];
  export const DEFAULT_EDGE_STYLE: EdgeStyle = "stepped";
  export function normaliseEdgeStyle(raw: unknown): EdgeStyle;
  // protocol.ts
  | { type: "settings"; columnGap: number; edgeStyle: EdgeStyle }   // ExtensionToWebview
  | { type: "setEdgeStyle"; value: EdgeStyle }                      // WebviewToExtension
  // view/types.ts: ViewState.edgeStyle?: EdgeStyle; app-state.ts: LocalAction gains { type: "edgeStyleChanged"; value: EdgeStyle }
  // to-flow.ts: toFlow(graph: GraphState, edgeStyle: EdgeStyle = DEFAULT_EDGE_STYLE); GraphViewProps gains edgeStyle: EdgeStyle
  // Toolbar.tsx: ToolbarProps gains edgeStyle: EdgeStyle; onEdgeStyle(value: EdgeStyle): void  (order: Back, Tidy, Refresh, Lines, Spacing)
  // extension
  export class EdgeStyleStore { constructor(memento: MementoPort, announce: () => void); get(): EdgeStyle; set(raw: unknown): Promise<void> }
  ColumnGapStore: constructor(memento: MementoPort, announce: () => void); publish() removed
  createDispatcher deps gain edgeStyle: Pick<EdgeStyleStore, "set">
  ```

**Behaviour:**
- Stored value, `announce()` posting the pair, first-`settings`-only rule, persistence in `ViewState`, `createView` and `commitCentre` / `goBack`
  keeping it, the click handler: spec section 8. `isViewState` accepts a missing `edgeStyle` and rejects an unknown name.
- Stepped is React Flow's `smoothstep`, Curved its default bezier type `default`; nothing else about edges changes; no layout runs.
- The switch is a `role="group"` labelled "Lines" holding two buttons, Stepped and Curved, each `aria-pressed`. A click on the active style does nothing; otherwise
  the app dispatches `edgeStyleChanged` and posts `setEdgeStyle` at once (no debounce).
- `settings` is rejected by the guard when `edgeStyle` is not in `EDGE_STYLES`; `setEdgeStyle` is dropped by the parse under the same rule.
- `extension.ts` builds one `announce` that posts `{ type: "settings", columnGap: columnGapStore.get(), edgeStyle: edgeStyleStore.get() }`
  and calls it once at activation; both stores call it after every `set`.

**Approach and traps:**
- Read the style as `view.edgeStyle ?? DEFAULT_EDGE_STYLE` everywhere; old saves have none.
- `app-settings.ts` holds `settings`, `columnGapChanged` and `edgeStyleChanged`; keep `settingsApplied` semantics (the first `settings` after
  each load applies both values without Tidy).
- `use-layout.ts` and `tidy-graph.ts` call `toFlow(graph)` for ELK and stay unchanged.
- `ColumnGapStore`'s existing tests assert `publish` and a one-argument announce: rewrite them for the new constructor.

**Tests:**
- `edge-style.test.ts`: both names pass; an unknown name, a number and `undefined` give the default
- `app-settings.test.ts`: the first `settings` applies both values, normalised, without a fit; later ones are ignored
- `app-settings.test.ts`: `edgeStyleChanged` stores the style, is a no-op for the same style, and leaves positions alone
- `persist.test.ts`: a view without `edgeStyle` is accepted; an unknown name is rejected
- `history.test.ts`: `commitCentre` and `goBack` keep `edgeStyle`; `createView` takes it
- `messages.test.ts`: `settings` needs a known `edgeStyle`
- `to-flow.test.ts`: stepped edges have type `smoothstep`, curved `default`; classes, dashes and markers are identical; the default is stepped
- `toolbar.test.tsx`: the "Lines" group has Stepped and Curved with the right `aria-pressed`, between Refresh and Spacing
- `edge-style-store.test.ts`: junk gives the default; `set` stores the normalised value and announces; a new store over the same memento reads it back
- `column-gap.test.ts`: the store announces after `set` through the single callback
- `dispatch.test.ts`: `setEdgeStyle` calls the store and nothing else; `webview-messages.test.ts`: parse accepts the two names and drops others

**Steps:**
- [ ] Add `edge-style.ts`, its export, the protocol and guard changes, and the view-state field with its persist rule
- [ ] Add `app-settings.ts` and the `to-flow` / `GraphView` / `Toolbar` / `App` changes
- [ ] Add `EdgeStyleStore`, change `ColumnGapStore`, and update the dispatcher, parse and `extension.ts`
- [ ] Update the existing `settings` fixtures and tests; add the new ones
- [ ] Verify: `pnpm -r typecheck` and `pnpm -r test` pass; `pnpm build` completes
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `add a Lines switch for stepped or curved edges`

### Task 12: Electron check script

`pnpm probe` loads the real webview bundle in Electron (the VS Code build the smoke tests download, started as plain Electron) and
runs the nine checks of spec section 9. It is separate from `pnpm -r test`.

**Files:**
- Create: `packages/webview/probe/run.mjs` (Node driver), `main.js` and `package.json` (the Electron app), `harness.js`, `fixtures.js`,
  `checks-basic.js` (checks 1 to 5), `checks-detail.js` (checks 6 to 9)
- Modify: `packages/webview/package.json` (`"probe": "node build.mjs && node probe/run.mjs"`), root `package.json`
  (`"probe": "pnpm --filter @code-spider/webview probe"`)

**Interfaces:**
- Consumes: `downloadVSCode()` from `packages/extension/scripts/vscode.mjs`; `buildWebviewHtml` from `packages/extension/src/panel/html.ts`
  (bundled by esbuild at run time); `packages/webview/dist/index.js` and `index.css`; the protocol messages of Tasks 4, 8 and 11.
- Produces: exit 0 when all nine pass; 1 naming the first failed check; 2 when Electron cannot start (no display or missing libraries,
  with the hint to run `pnpm --filter code-spider-vscode check:electron`). One JSON line per check goes from `main.js` to `run.mjs`.

**Behaviour:**
- The page, fake `acquireVsCodeApi` (records posted messages, keeps state in `sessionStorage`), CSP, theme variables, input method and the
  nine checks, in order: spec section 9. A global timeout kills Electron: exit 2 if no check had started, else 1 naming the running check.
- Fixtures are small slices built in `fixtures.js` (a centre with two neighbours, one expansion answer, a `refreshed` answer whose code and
  height differ); no golden files.
- Check 9 compares the `d` attribute of edge paths: curved paths contain `C`, stepped ones do not.

**Approach and traps:**
- First step, confirm the cheapest run directory under `packages/extension/.vscode-test/probe-run`: hard-link the `code` binary (223 MB)
  with `fs.linkSync` and symlink the other top-level files and directories, with `resources/` a real directory holding only `app/`
  (the probe's `main.js` and `package.json`). Confirm `app.getAppPath()` reports the run directory, not the real VS Code (a symlinked
  binary resolves back to the real directory and would start VS Code). If linking fails, copy the binary; if Electron still starts VS Code,
  use the spec's mechanism (copy what is needed).
- Start Electron with `--no-sandbox --disable-gpu --user-data-dir=<temp>` and the environment scrubbed of `ELECTRON_RUN_AS_NODE` and
  `VSCODE_*`, as `smoke/run.ts` does; the machine's WSLg display (`DISPLAY=:0`) is used. `main.js` calls `app.disableHardwareAcceleration()`
  and opens an offscreen window (`show: false`, `webPreferences.offscreen: true`).
- The fake API script needs the page's nonce: build the HTML with `buildWebviewHtml` (`cspSource: "file:"`) and insert the script before
  the bundle's tag. Reload (check 5) must wait for the persist debounce (250 ms) before reloading.
- Mouse input is `sendInputEvent` in page coordinates; wait a frame after each event. Keep every file under 300 lines.
- The checks are the tests: prove the harness can fail by temporarily adding `unsafe-eval` to the CSP, and removing the `is-zoomed-out`
  class toggle, and see checks fail by name; revert both before finishing.

**Steps:**
- [ ] Confirm the run-directory assembly and that `main.js` starts under it
- [ ] Build the page setup (CSP from `html.ts`, fake API, theme variables) and the harness
- [ ] Write the nine checks and the driver's exit codes and timeout
- [ ] Add the two `probe` scripts; show the harness fails when deliberately broken, then revert
- [ ] Verify: `pnpm probe` exits 0 with nine passing checks; `pnpm -r typecheck`, `pnpm -r test` and `pnpm build` still pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `add the Electron probe script for the real webview bundle`

### Task 13: Smoke case 7, the design spec and the manual check list

One smoke case proves refresh end to end through the real extension. The main design spec records what M3b changed. The owner's manual
check list closes M3b.

**Files:**
- Modify: `packages/extension/smoke/suite/extension.smoke.ts` (case 7 after the existing six)
- Modify: `docs/superpowers/specs/2026-08-22-code-spider-design.md` (§3, §6, §7.4, §7.5, §7.6, §8.1, §8.2, §9, §10, §12, §13)

**Interfaces:**
- Consumes: `ExtensionApi.handleWebviewMessage`, `currentGraph()`; the smoke file's `currentProject`; the
  `refresh` message (Task 4); `ChangeTracker` fed by `onDidSaveTextDocument` (Task 2).
- Produces: a smoke suite of seven cases.

**Behaviour:**
- Case 7, "refreshes the centre after a file changes" (spec section 11): copy `test-code/basic` into a temporary directory (the checked-in
  fixture is never edited; the copy is deleted afterwards), run `codeSpider.showGraph` on `handleSignup` in the copy, edit `handleSignup`
  with a `WorkspaceEdit` and save the document, send `refresh` through `handleWebviewMessage` (project from `currentProject(api)`, any
  integer generation, `focusId` `src/signup.ts#handleSignup`, `expanded: []`), and assert that `api.currentGraph()` holds the new text and
  did not before. The save, not a watcher, reaches the tracker, because the copy is outside the workspace.
- Doc edits: apply every bullet of spec section 2, "Changes to the main spec". In §9 the smoke sentence names seven cases and the
  refresh case, the CLI sentence says `line:col` goes through core, and a bullet adds the Electron probe. The M3a spec and the README
  are not edited.
- Owner's manual checks (spec section 11, the setup there, a scratch copy for anything that edits files). The implementer cannot run
  them; the report hands them over: (1) a refresh keeps expansions, pins, positions and the view while code and heights update;
  (2) a new caller fades in and a deleted pinned box goes; (3) a renamed centre gives the banner and keeps the graph; (4) a `git switch`
  lights the dot and Refresh fixes the box; (5) the dot comes a fifth of a second after a save or terminal edit, not for Markdown;
  (6) Back after a save shows the dot and Refresh clears it; (7) zooming below half gives bars of the right length and indent with no resize;
  (8) Curved applies to every graph and survives a window reload; (9) the `sed` CRLF copy focuses `createUser`; (10) the unsaved-edit
  status message for one and two files. Also run `pnpm probe`.

**Approach and traps:**
- `os.tmpdir()` has no git root, so `findTsconfig` falls back to the copy's own `tsconfig.json`. Read `currentProject(api)` after the
  new `showGraph`. The previous case left its panel open; `showGraph` reuses it. Wait for `applyEdit` and `save` to resolve before sending
  `refresh`, and remove the copy in a `finally`.
- Spec text edits are small and local; keep each section's surrounding wording, and make §13 match the current agreement.

**Tests:**
- `extension.smoke.ts`: "refreshes the centre after a file changes" (case 7)

**Steps:**
- [ ] Write smoke case 7
- [ ] Apply the main-spec edits
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test`, `pnpm build` pass; `pnpm --filter code-spider-vscode check:electron` exits 0 (on exit 2 stop and report its `sudo apt install` line); `pnpm --filter code-spider-vscode test:smoke` reports seven passing; `pnpm probe` exits 0
- [ ] Hand the manual check list to the owner with the report
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and report

Proposed commit message: `add the refresh smoke case and update the design spec for M3b`
