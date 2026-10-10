# Code Spider M3b: refresh, watching and detail

**Date:** 2026-10-11
**Status:** Approved design, ready for implementation planning
**Main spec:** [2026-08-22-code-spider-design.md](2026-08-22-code-spider-design.md).
**Previous milestone:** [2026-10-10-code-spider-m3a-design.md](2026-10-10-code-spider-m3a-design.md);
M3b builds on all of it. "§n" means a section of the main spec, "section n" a section of this one.
M3a's document is not edited; where this one differs, this one wins (section 2).

## 1. Problem and goal

A graph from M3a is frozen when drawn. Edit a function and its box still shows the old code,
height and callers. The only fix is `Shift+Alt+Q`, which throws away your expansions, positions and
pins, and nothing says the graph is out of date. Smaller problems: in a mixed-line-ending file the
cursor can land in the wrong function, zoomed-out code is unreadable, and lines have one look.

M3b adds a **Refresh** button that re-reads the code for the graph on screen and keeps what you
built; a file watcher that only records changed files and puts a dot on Refresh; grey bars for
zoomed-out code; a **Lines** switch; one cursor conversion in core; and a checked-in script that
tests the real webview bundle. It is the second half of §10 M3.

## 2. Scope

**In scope:** (1) Refresh; (2) a file watcher that only records changed files; (3) a "changed
since drawn" dot on Refresh; (4) zoom level of detail; (5) cursor position converted to an offset
in core, for the CLI and the extension; (6) the Lines switch; (7) the Electron check script.

**Not built:** Refresh of graphs in the Back history; cancelling a running analysis (a refresh
with many expansions costs the sum of them); live updates (nothing is re-analysed until Refresh
or a new centre); showing which boxes are expanded; removing the unused `focus` message; a
`WebviewPanelSerializer`; M4 (truncation "+N more", the `.vsix`).

**M3a rules that change.** §3.1: optional fields. §4.1, §4.2: the protocol and the worker's
`focus` request. §4.3: the dispatcher handles `refresh` and `setEdgeStyle`; the gate gains the
rules of section 3. §5.5: `settings` and the stores carry the edge style too. §6: while a refresh
runs a double-click collapses nothing (section 4.5). §8: seven smoke cases.

**Changes to the main spec**, all made with M3b, in its last task:

- §3: the non-goal "Live file watching or auto-refresh" becomes "Live updates: re-analysing or
  redrawing as code changes"; the M3b watcher only records.
- §6: core keeps two analysis operations, focus and expand; focus is addressed by offset
  (`analyzeFocus`) or by line and character (`analyzeFocusAt`). Core also exports
  `positionToOffset` and `NodeNotFoundError`. "Exactly two functions" is reworded.
- §7.4: the protocol of section 3. §7.5: a paragraph on line style (stepped by default, curved
  on request, stored globally, every graph). §8.1: the toolbar gains Refresh and Lines; the
  command sends line and character and the worker converts them against the file on disk.
- §7.6: "Zoom as level of detail" as built: bars that follow each line's length and
  indentation, below a zoom of 0.5. "Sizing and refresh" as built: a refreshed box takes its
  new height, boxes it now touches move down just enough, everything else stays.
- §8.2: "There is no file watching and no automatic re-analysis" becomes: a watcher records
  which files changed so the warm project can apply them; nothing re-analyses on its own. The
  vanished-node rule adds: a pinned box the rebuilt graph no longer reaches is removed too
  (unlike Collapse), and a vanished centre fails the refresh. The table row stays.
- §9: the CLI's `line:col` goes through core; six smoke cases become seven; a bullet for the
  Electron check script. §10: the M3b items done, plus the dot, Lines switch, cursor fix and
  check script. §12: Live updates stays deferred, noting the watcher only records.
- §13: rewritten to the current agreement: the coordinator commits each approved task; plans are
  not line-for-line code.

## 3. Protocol and shapes

`packages/webview/src/protocol.ts` (types only):

```ts
export type SliceMode =
  | { kind: "centre"; sourceVersion: number } // new field
  | { kind: "expansion"; nodeId: NodeId; generation: number };

// ExtensionToWebview gains
  | { type: "refreshed"; project: string; generation: number; sourceVersion: number;
      centre: GraphSlice; expansions: { nodeId: NodeId; slice: GraphSlice }[] }
  | { type: "refreshFailed"; generation: number; message: string }
  | { type: "sourceChanged"; version: number }
// and settings becomes
  | { type: "settings"; columnGap: number; edgeStyle: EdgeStyle };

// WebviewToExtension: refresh gains fields, setEdgeStyle is new
  | { type: "refresh"; project: string; generation: number; focusId: NodeId; expanded: NodeId[] }
  | { type: "setEdgeStyle"; value: EdgeStyle };
```

`expanded` is the keys of `GraphState.slices` other than `focusId`, in their recorded order.
Today `refresh` has no fields and is parsed, dispatched as a no-op and never sent. `sourceVersion`
sits in the centre mode so a centre without one cannot be built; expansions carry none.
`parseWebviewMessage` and `isExtensionMessage` check the new shapes structurally.

```ts
// view/types.ts
GraphState.sourceVersion?: number; // change counter when this graph's data was read
ViewState.edgeStyle?: EdgeStyle;   // absent in older saves: the default
// AppState gains transient fields, never persisted
refreshing: boolean; latestSourceVersion: number | undefined;
// worker/protocol.ts
FocusRequestBody = { kind: "focus"; file; line; character; changedFiles }
RefreshRequest = { kind: "refresh"; tsconfig; focusId; expanded: NodeId[]; changedFiles }
RefreshResult = { tsconfig; repoRoot; centre: GraphSlice | undefined;
                  expansions: { nodeId: NodeId; slice: GraphSlice }[] }
// WorkerResponse gains { id; kind: "refreshed"; result: RefreshResult }
```

The optional fields keep `version` at 1 so older saved panels restore. `isGraphState` accepts a
missing `sourceVersion` and rejects a non-number; `isViewState` accepts a missing `edgeStyle` and
rejects an unknown name. `AnalysisPort` and `WorkerClient` gain `refresh(tsconfig, focusId,
expanded, changedFiles)`; `focus` takes `(file, line, character, changedFiles)`.

**MessageGate.** `sourceChanged` is state: the latest replays on every `ready`, after `busy` and
before content. `refreshed` and `refreshFailed` are ephemeral like an expansion answer: sent
when ready, dropped otherwise.

## 4. Refresh

### 4.1 What you see

A **Refresh** button sits in the toolbar next to Tidy (order: Back, Tidy, Refresh, Lines,
Spacing). It re-reads the code for the graph on screen. Code, types, box heights, callers and
callees update; expansions, positions, pins and the viewport stay. A box whose code grew gets
taller and boxes it now touches slide down just enough. New neighbours fade in beside the box
they belong to; vanished boxes disappear. The view never pans, zooms or fits.

### 4.2 Flow

1. The webview sends `refresh` for the current graph.
2. `GraphSession.refresh` refuses a `project` the jump table has not seen (`refreshFailed`,
   "Unknown project"), shows the unsaved-edits message if needed (section 4.6), and brackets the
   work with `busy` through the same outstanding count as centre requests. It captures the centre
   token without bumping it, drains the tracker (section 5.3) and sends ONE worker request.
3. The worker opens the project by `tsconfig` (applying changed files first, as every request
   does), runs `expandNode` for `focusId` and then each id in `expanded`, and answers
   `refreshed`. `expandNode` throws a new core class, `NodeNotFoundError`, for its two "Node not
   found" cases (missing file, missing declaration; messages unchanged); "Node is not expandable"
   stays a plain error. The worker catches only `NodeNotFoundError`: for the centre it returns
   `centre: undefined` and skips the expansions; for an expanded id it leaves that id out. Any
   other error fails the whole request.
4. The answer is dropped if a newer centre request started meanwhile or the panel closed.
   Otherwise every returned slice goes into the jump table (`jumps.add` overwrites by id), the
   session's remembered graph becomes the refreshed centre (so `currentGraph()` reflects it), and
   `refreshed` is posted. A missing centre posts `refreshFailed`: "The function at the centre of
   this graph no longer exists. Put the cursor in a function and press Shift+Alt+Q." Other
   failures post `refreshFailed` with `describeFailure`'s text; a crash still toasts once through
   `notifyCrash`.
5. The webview applies `refreshed` only if `generation`, `project` and `centre.focusId` equal the
   current graph's; otherwise it is ignored. A matching `refreshFailed` shows its message the
   way an `analysisError` is (`state.error`); the old graph stays.

### 4.3 The rebuild

A pure function in its own file, `view/refresh.ts` (`graph-state.ts` is already 189 lines):
`rebuildGraph(current, answer, columnGap)` returns the new graph and its new node ids. `current`
is the graph as it is when the answer arrives.

1. Start from `graphFromSlice(answer.centre, current.project)`. Then apply expansions to a
   fixpoint. A pass walks the answer's expansions in order; one is applied when its node is in
   the rebuilt graph, is still expanded in `current` (`isExpanded`), has `slice.focusId` equal to
   its node id, and is not yet applied. Passes repeat until one applies nothing. Expansions never
   applied are dropped: that removes a vanished expanded box with everything reachable only
   through it, and a box the user collapsed while the refresh ran.
2. Applying adds the slice's nodes and its edges whose ends are present, and records
   `slices[nodeId]` as `mergeExpansion` does, but replaces a node or edge already present with
   the fresh data (the "replace" `mergeExpansion` deliberately does not do). One worker request
   made every slice, so a node two slices share is identical in both.
3. A node in both `current` and the rebuilt graph keeps its position and its pin. A pinned node
   not in the rebuilt graph is removed, pinned or not. Refresh rebuilds from the centre outwards
   and cannot re-check a disconnected box, so a pinned lone box is lost; the owner accepted
   this (Collapse keeps such boxes).
4. Make room and place the new nodes (section 4.4).
5. The result keeps `generation`, `project`, `focusId` and `columnGap`, raises `revision` by one,
   takes `sourceVersion` from the answer, and leaves the history alone. A drag under way is not
   in the view yet, so the rebuild uses committed positions; `dragStopped` later ignores a box
   that no longer exists. A Tidy in progress sees the new `revision` and runs again.

### 4.4 Make room, then place the new

`graph/make-room.ts` (pure, over rectangles) first fixes overlaps among kept boxes, whose
heights are now the fresh ones.

- Sort kept boxes by (top, x, id); take them in that order. Pinned boxes never move. An unpinned
  box's obstacles are every pinned box and every box already taken. If it is not `isClear` of
  all of them, with `rowGap(columnGap)` as margin, it moves down, keeping its x, to the smallest
  y at or below its own at which it is clear (candidates: its y, and each obstacle's bottom plus
  the margin). A moved box counts at its new y.
- Boxes only move down, so a box that grew into a pinned box below it jumps below that box. Two
  pinned boxes that overlap because the upper grew stay so, as when a user drags one onto
  another.

A new node is one in the rebuilt graph with no kept position. Each belongs to the first slice in
application order (the centre first) that listed it. For each slice with new nodes, in that
order, call `placeExpansion` with the slice's key as `expandedId`, the key's rectangle as
`anchor`, those nodes, the slice's edges, and `existing` = every rectangle placed so far (kept
boxes after making room, plus new boxes placed earlier). The key always has a position: a slice
is applied only once its node is in the graph. The gap is the graph's own (`current.columnGap ??
view.columnGap`), so nothing is covered (M3a section 5.2). New nodes and their edges fade in
(`entering`, 250 ms); nothing is revealed, panned or fitted.

### 4.5 When Refresh is allowed

`canRefresh(state)`: there is a graph, `isWorking(state)` is false, `state.loading` is empty and
`state.refreshing` is false; otherwise the button is disabled. `refreshing` is set by the local
action `refreshStarted` (ignored unless `canRefresh`) and cleared by a matching `refreshed` or
`refreshFailed`, by `busy: false` (posted only when nothing is outstanding, so it also covers a
dropped answer) and by `resetTransient` (new centre, Back). It closes the gap before the
extension's `busy: true` arrives and tells a refresh from a centre request, which `busy` cannot.

**Double-click today:** `nodeControl` gives `loading` for a loading box, `collapse` for an
expanded one even while `ui.busy`, else `expandDisabled` if busy, else `expand`. So while busy a
double-click cannot expand but still collapses (M3a section 6). **What changes:** `NodeUi` gains
`refreshing`. While true, a collapsed function or component is `expandDisabled` and an expanded
one the new `collapseDisabled`; neither acts. Centre requests keep today's rules. Dragging,
pinning, unpinning and Tidy stay allowed during a refresh.

### 4.6 Unsaved edits

Analysis reads from disk. When a refresh is requested and an open document with unsaved edits is
one of the files of the nodes known for that project (the jump table gains `files(project)`),
the extension shows a status bar message for 5 seconds: "Code Spider: signup.ts has unsaved
changes; the graph shows the saved version." (several: "Code Spider: 2 files have unsaved
changes; ..."). The refresh still runs; no toast. `Notifier` gains `status(message)` over
`setStatusBarMessage(message, 5000)`; the session gets a port listing unsaved `file` documents.

Size: refresh logic goes in new files, not into `session.ts` (191 lines) or `app-state.ts` (223).

## 5. File watching and the dot

### 5.1 Watcher and tracker

At activation the extension creates two `createFileSystemWatcher`s: source files (`ts`, `tsx`,
`mts`, `cts`, `js`, `jsx`, `mjs`, `cjs`) and `tsconfig*.json` / `jsconfig*.json`. Create, change
and delete call `ChangeTracker.mark(path)`, as does `onDidSaveTextDocument` for `file` documents
(it still matters for files outside the workspace folders, which the watcher does not see).

`ChangeTracker` changes from "saved documents by language id" to "changed paths by file name and
extension": a path is tracked when its extension (any case) is listed or its name is a
`tsconfig*.json` / `jsconfig*.json`, and no segment is `node_modules`; `mark` ignores other
paths. (`ANALYSABLE_LANGUAGE_IDS` stays for the command and warm-up.) A `version` counter goes up
by one each time a tracked path is marked, even one already waiting; `drain()` returns `{ files,
version }`. A callback runs on each mark; the extension feeds it a 200 ms trailing debounce (its
own; it may not import the webview's) that posts `sourceChanged` with the version then. The
watcher never triggers analysis or redraws; it only lights the dot.

### 5.2 Worker side

`ProjectCache` already queues every noted path for each loaded project and applies the queue the
next time that project is used. Per queued path:

- **Config file:** `noteChanged` drops every loaded project at once and clears the
  file-to-tsconfig lookup (`findTsconfig` depends on which configs exist). Each project reloads
  from disk on next use; files added by focusing outside an include are re-added, as today.
- **Known source file:** `refreshFromFileSystemSync()`. ts-morph reads the file; if it is gone it
  calls `forget()` on the source file and returns `FileSystemRefreshResult.Deleted`, so the
  project stops holding it; if the text differs it replaces it in place. Today's code already
  makes this call, so deletion needs a test, not new code.
- **Unknown file that exists on disk** and is not in the project's not-included set: a candidate
  new file. If the batch has any, the project calls `addSourceFilesFromTsConfig(tsconfig)` once:
  ts-morph re-reads the config, resolves its file list from disk and adds each listed file it
  does not hold. Each candidate still not held goes into the not-included set (on the project
  entry, gone when the project is dropped or evicted), so that path never causes another re-read.
- **Unknown and absent:** ignored.

The queue is cleared only after the whole batch is applied, so a throw leaves it for next use.

### 5.3 `drain()` and the dot

`drain()` empties the tracker. Nothing is lost: the handler calls `cache.noteChanged` first in
every request, before anything that can fail, so a request that fails afterwards has already
queued (usually applied) the files; a project not loaded reads disk when it loads; a crashed,
recycled or unstartable worker is replaced by a fresh one that reads disk. No path loses drained
files while the same worker lives, so no fix is specified. **Required test:** load a project, edit a file, send a request carrying it that fails
(an unknown node; and a variant failing before the project opens), then send one carrying no
files: its answer reflects the edit.

The tracker's `version` is the **source version**. Every centre `slice` and every `refreshed`
carries the value when that request's files were drained, not when the answer arrived. An
expansion answer carries none and leaves the graph's `sourceVersion` alone, since the rest of the
graph is as old as before. A graph restored by Back keeps the version it was drawn at.

The webview keeps the latest `sourceChanged` as `latestSourceVersion`. Refresh shows a small dot
when the graph has a `sourceVersion` **lower than** it (not merely different, which would flash
for 200 ms when an answer with a newer version beats its debounced `sourceChanged`). The dot has
the accessible label "Files changed since this graph was drawn", which the button's `title`
repeats; otherwise the title is "Re-read the code for this graph". The dot means "a source file in
the workspace changed", not "this graph is wrong"; build output written as `.js` can light it. The
counter lives as long as the extension host and a panel never outlives it (no serializer); a
future serializer must seed it differently.

## 6. Zoom level of detail

Below a zoom of 0.5 (`LOD_ZOOM` in `graph/constants.ts`) the code region of every box shows grey
bars instead of text, each with its line's length and indentation. The header (name, async
badge, input type) and the type labels stay text. At 0.5 and above: text. No hysteresis.

- `NodeBox` renders each `codePreview` line as its leading whitespace (`[ \t]*`) followed by
  `<span class="code-text">` holding the rest. Lines split at `\n`; a trailing `\r` is dropped; a
  blank line has no span.
- One class, `is-zoomed-out`, on the canvas container (the element that sets `--column-gap`)
  makes `.code-text` transparent with a muted background (`--vscode-editorLineNumber-foreground`).
  The text stays in the DOM at all times, so nothing mounts or unmounts at the threshold.
- One subscription for the canvas: `useStore((s) => s.transform[2] < LOD_ZOOM)`, a boolean, so
  React re-renders only when the threshold is crossed. No per-node subscription; `nodeTypes`
  stays module-level. `GraphView` renders the container outside `<ReactFlow>`, out of reach of
  the store, so it mounts a `ReactFlowProvider` and the component inside reads the flag.
- Box sizes do not depend on zoom, so this never causes layout.

## 7. Cursor position

**Problem.** The extension turns the cursor's line and character into an offset against VS
Code's in-memory text (`positions.ts`), but the worker reads the file from disk. VS Code
normalises line endings in memory, so in a mixed-ending file the offset lands in the wrong place.
The CLI has its own copy of the arithmetic.

**Design.** Core exports `positionToOffset(text, line, character)`, zero-based:

- A line break is `\r\n`, `\n` or a lone `\r`, each once (VS Code's rule).
- `character` is clamped to 0 and to the line's length (break excluded).
- A line outside the text throws `RangeError("Line N is out of range (file has M lines)")`, N
  one-based, as today.
- A leading U+FEFF is not a character of line 0; offsets count past it when present. VS Code
  hides it, and ts-morph keeps it in a file's text after `refreshFromFileSystemSync` but not
  after the first load.

Examples: `"ab\r\ncd\nef"` `(1,1)` is 5, `(2,1)` is 8; `"ab\rcd"` `(1,1)` is 4; `"\uFEFFab\ncd"` `(0,1)` is 2.

Core also exports `analyzeFocusAt(project, { file, line, character, repoRoot })`: it converts
against the text of the source file the project holds (the file on disk, because `showGraph`
always puts the focused file in the changed batch), then does what `analyzeFocus` does; a file not
in the project fails as today. `analyzeFocus` by offset stays for core's tests.

The worker's `focus` request carries `line` and `character` instead of `offset`; the extension's
`FocusRequest` loses the document text; `positions.ts` and its test are deleted. The CLI's
`lineColToOffset` and its tests are deleted; the CLI stops reading the file and calls
`analyzeFocusAt` with `line - 1` and `col - 1` (its own `readFileSync` text keeps a byte-order
mark the project's may lack). One behaviour change: a column past the end of a line clamps, as in
the editor, instead of failing. The "save first" warning for a dirty document stays: unsaved
edits still move lines.

## 8. Line style

A **Lines** switch in the toolbar: a two-button group labelled "Lines" with `aria-pressed`,
**Stepped** (today's look, React Flow's `smoothstep`) and **Curved** (React Flow's default bezier
edge, type `default`). Default: Stepped. `toFlow(graph, edgeStyle)` sets the edge `type`.
Arrowheads, dashes, colours and type labels (beside the supplier box, not on the path) are
unchanged. It moves no box, needs no layout, and applies to every graph, current and history. It
follows the Spacing value's path:

- `packages/webview/src/edge-style.ts`: `EDGE_STYLES`, `EdgeStyle`, the default and
  `normaliseEdgeStyle(raw)` (unknown gives the default), exported as
  `@code-spider/webview/edge-style`, a second pure module the extension imports at runtime.
- The extension stores the normalised value in `globalState` under `codeSpider.edgeStyle` (an
  `EdgeStyleStore` over the same Memento port). Both stores call one `announce()` that posts the
  pair as `settings`, at activation and after every `setColumnGap` or `setEdgeStyle`, so the gate
  always replays both.
- The webview applies only the first `settings` after each load (`settingsApplied`), for both
  values, without running Tidy. The value lives in the persisted `ViewState` (`edgeStyle?`), as
  the column gap does, so a reload shows the right lines at once instead of flashing the
  default. `createView` takes it; `commitCentre` and `goBack` keep it. A click dispatches
  `edgeStyleChanged` (normalised; no-op if unchanged) and posts `setEdgeStyle` at once.

## 9. Electron check script

**Why.** No automated test loads the real webview bundle. In M3a the two real defects in the
wiring (edges vanishing during a drag, clicks with a few pixels of movement doing nothing) were
found only by throwaway Electron scripts the reviewers wrote; jsdom has no real layout and would
not have caught them. The owner chose a checked-in script, with no new dependency.

**What.** `packages/webview/probe/run.mjs`, run by `pnpm probe` (root, filtering to the webview)
and the webview's `probe` script, which builds the webview first; separate from `pnpm test`. It
gets the VS Code build the smoke tests download by importing `downloadVSCode` from
`../../extension/scripts/vscode.mjs` (see also `download-vscode.mjs`, `check-electron-libs.mjs`) and
opens the built page offscreen with: a fake `acquireVsCodeApi` (an inline script with the page's
nonce) that records posted messages and keeps state in `sessionStorage`, so a reload restores as
VS Code's does; the CSP of `buildWebviewHtml`, so a regression such as `unsafe-eval` fails; the
`--vscode-*` variables the stylesheet reads, at fixed dark values. It sends extension-to-webview
messages with `window.postMessage` and real mouse input with `sendInputEvent`, and asserts on the
DOM through `executeJavaScript`.

**Mechanism known to work** (the plan may confirm a cheaper one): a run directory holding the
Electron files of the downloaded build with its `resources/app` replaced by the script's own
`main.js` and `package.json`, so the VS Code binary starts as plain Electron. Electron looks for
`resources/app` beside the real executable, so the binary must sit in that directory; the rest may
be copied or linked. `main.js` calls `app.disableHardwareAcceleration()` and opens an offscreen
`BrowserWindow`. The script exits 1 and names the failed check; exit 2 if Electron cannot start
(as `check-electron-libs.mjs`); a global timeout kills Electron. A VS Code bump may need this
layout rechecked.

**Checks**, in order:

1. A centre slice draws its boxes and edges at non-zero size.
2. A click posts `openInEditor`, also with a few pixels of movement, and the box is not pinned.
3. A double-click posts `expand`; the answer adds boxes; existing boxes keep their positions.
4. During a drag, edges stay in the DOM with non-empty paths; afterwards the box shows its pin.
5. A page reload restores the same graph and positions (once the saved state holds it).
6. Refresh posts `refresh` with `focusId` and `expanded`; a `refreshed` answer changes a box's
   code text while kept boxes keep their positions.
7. `sourceChanged` makes the dot appear; a `refreshed` answer with the newer version clears it.
8. Zooming out below 0.5 puts `is-zoomed-out` on the canvas; zooming in removes it.
9. Clicking Curved posts `setEdgeStyle`, and edge paths gain a `C` command that Stepped lack.

## 10. Errors

| Failure | Result |
|---|---|
| Refresh: the centre no longer exists | `refreshFailed` with the fixed message in the banner; graph unchanged |
| Refresh: any other failure, or an unknown project | `refreshFailed` with the text; a crash toasts once |
| Refresh: an expanded node no longer exists | Left out silently, with what only it reached |
| `refreshed` for an older graph; an answer after a newer centre request or a closed panel | Ignored by the webview; dropped by the extension |

## 11. Testing

**Pure tests, beside the code** (vitest; webview in node, markup through `renderToStaticMarkup`):

- Core: `positionToOffset` (LF, CRLF, mixed LF/CRLF, lone CR, byte-order mark, a character past
  the end of a line, a line out of range); `analyzeFocusAt` on a mixed-ending file the test
  writes at run time (git must not change it); `NodeNotFoundError` for both cases with the old
  messages, "not expandable" still plain. CLI: the `lineColToOffset` tests go; one test that a
  late column clamps.
- Webview: `rebuildGraph` (data replaced; positions and pins kept; a vanished expanded box and
  its dependents dropped; the fixpoint; a collapse during the refresh honoured; a vanished
  pinned box removed; new nodes clear of everything at gaps 32, 192 and 480, seeded as in
  `placement-property`); make room; the reducer (`refreshStarted` guards, matching and ignored
  answers, `refreshFailed`, `busy: false`, `sourceChanged`, `settings`, `edgeStyleChanged`); the
  dot rule; `nodeControl` with `refreshing`; `persist`; `messages`; `edge-style`; `to-flow`;
  `node-box` markup; toolbar markup.
- Extension: `changes` (tracked paths, `node_modules`, config names, version, the `drain` pair);
  the debounce; `message-gate`; `session` refresh (busy bracket, drops, jump table,
  `currentGraph`, the centre message, one crash toast, unsaved-edit messages for one, two and no
  files); `dispatch`; `webview-messages`; the edge-style store; `worker-handler` and
  `worker-client`; `ProjectCache` (changed file refreshed, deleted forgotten, new included file
  added after one re-read, a not-included path never re-read, a config change drops all
  projects); the `drain()` test of section 5.3.

**Smoke** (`smoke/suite/extension.smoke.ts`, seven cases). Case 7, "refreshes the centre after a
file changes": copy `test-code/basic` to a temporary directory (never edit the checked-in
fixture; delete the copy afterwards), show the graph for `handleSignup` from the copy, edit
`handleSignup` with a `WorkspaceEdit` and save, send `refresh` through `handleWebviewMessage`,
and check that `api.currentGraph()` now holds the new text and did not before. The save is what
reaches the tracker: the copy is outside the workspace, so the watcher cannot see it.

**Manual checks** (the owner runs them after the last task; also run `pnpm probe`). Setup:
`pnpm build`, F5 with "Run Code Spider" on `test-code/basic`, open `src/signup.ts`, cursor in
`handleSignup`, `Shift+Alt+Q`. Use a scratch copy of the fixture for anything that edits files.

1. Expand `validateUser`, drag `createUser`, pan and zoom. Add three lines in `sendWelcome`,
   save, press Refresh: code and height update; expansions, pins, positions and view stay; a
   box now touched slides down.
2. Expand `validateUser`. Add a function that calls it, save, Refresh: the caller fades in. Pin
   it, delete the function, save, Refresh: it is gone, pinned or not.
3. Rename `handleSignup`, save, Refresh: the banner says the centre is gone; the graph stays.
4. In a scratch git repo copy, `git switch` to a branch that changes `validateUser`: the dot
   appears; Refresh updates the box.
5. The dot appears a fifth of a second after a save or a terminal edit, not after editing a
   Markdown file; Refresh clears it.
6. Show graph A, then B, save a file, press Back: the dot is on; Refresh clears it.
7. Zoom out below half: code becomes bars of the right length and indent, header and labels stay
   text, no box resizes; zoom in: text returns.
8. Click Curved: all lines curve, nothing moves, Back graphs too. Reload the window, run Show
   Graph: still Curved.
9. In a scratch copy run `sed -i '1,6s/$/\r/' src/signup.ts`, open it, put the cursor at the start
   of `export async function createUser`, `Shift+Alt+Q`: the centre is `createUser` (it was
   `validateUser`).
10. Type in `validateUser` without saving, press Refresh: the status bar names `signup.ts` for
    about 5 s and the saved code shows. With two files: "2 files".

## 12. Task outline

The plan refines this and may split any task. Each leaves `pnpm -r typecheck` and `pnpm -r test`
green (and `pnpm build` where a bundle changes).

1. **Cursor position in core:** `positionToOffset`, `analyzeFocusAt`, worker and extension
   changes, CLI and test removals.
2. **Watcher and tracker:** path predicates, `ChangeTracker`, `ProjectCache` file handling,
   watchers, debounce, the `drain()` test.
3. **Refresh path:** `NodeNotFoundError`, worker, client, port, `GraphSession.refresh`, jump-table
   `files`, unsaved-edit message, dispatch, parse, gate rules.
4. **Refresh in the webview:** `rebuildGraph`, make room, `GraphState.sourceVersion?`, reducer,
   `refreshing`, button, double-click rule.
5. **The dot.** 6. **Zoom level of detail.** 7. **Line style:** `edge-style`, store, switch.
8. **Electron check script.**
9. **Smoke, docs and manual checks:** case 7, the main-spec changes of section 2.

## 13. Risks

1. **Large batches.** A `git switch` touching thousands of files is applied file by file (a read
   and reparse each); no threshold is built. Measure it.
2. **Refresh cost.** One request runs the centre and every expansion on the one worker thread,
   so other requests wait; no cancellation. A tsconfig re-read walks the file system.
3. **Dot accuracy.** False alarms: build output. Misses: `files.watcherExclude` directories, and
   files outside the workspace changed without a save in VS Code.

## 14. Working agreement and constraints

Agents build it: one implementer and one independent reviewer per task, and one integration
reviewer at the end. The coordinator (Claude) commits each task itself once its review is approved
and the checks have been re-run: one commit per task, a plain one-line message, no `feat:` or
`chore:` prefixes, no attribution trailers. Nothing is ever pushed. Plans are plans: files,
interfaces between tasks, behaviour rules, traps, and tests as named cases, with no implementation
code or test code.

Files aim for 300 lines (hard cap 500), split by responsibility. Comments are minimal. Pure logic
is unit-tested. The extension imports the webview's protocol type-only; the runtime exceptions are
`@code-spider/webview/column-gap` and, new, `edge-style`. `packages/core` never imports `vscode`.
Theme only through `--vscode-*` variables. Node sizes stay analytic. No `unsafe-eval`.
