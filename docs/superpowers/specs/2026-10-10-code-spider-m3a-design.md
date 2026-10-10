# Code Spider — M3a Walking the Graph — Design

**Date:** 2026-10-10
**Status:** Approved design, ready for implementation planning
**Main spec:** [2026-08-22-code-spider-design.md](2026-08-22-code-spider-design.md).
This is its companion: "§n" means a section of the main spec, "section n" a
section of this one.

## 1. Problem and goal

M2 shows one radius-1 slice. To see what lies two hops out of `handleSignup`
you must go back to the editor, put the cursor in `validateUser` and press
`Shift+Alt+Q`; the first graph is gone with no way back. Nodes cannot be moved,
and the type labels sit on the edges and pile up on each other.

M3a lets you walk the graph from inside it: expand a neighbour in place,
re-centre on it, step Back, drag nodes and tidy up, with no overlap and one
readable type label per supplier. It is the first half of §10 M3.

## 2. Scope

**In scope:** expand and collapse; re-centre from inside the graph; Back
history; dragging and pinning; guaranteed no overlap; Tidy; the column-spacing
slider; type labels once per supplier; a types-only core entry so the webview
type-checks `src/` without Node types.

**M3b, later:** the refresh button, the file watcher, zoom level of detail,
sharing line:col to offset through core, mixed-EOL offset drift. **M4:**
polish, truncation "+N more", the `.vsix`. **Not built at all:** worker
cancellation (a superseded request still runs; its answer is dropped); merging
slices from different tsconfigs; forward history; staleness handling (Back
restores without re-analysis, and an expansion reads files as they are on disk
now, so old and new nodes can disagree until M3b's refresh).

**Changes to the main spec.** §7.5 "ELK runs only over the newly added
subgraph" becomes our own column placement (section 5.2), because ELK treats
existing positions as hints, which breaks "existing nodes never move". §4.3's
"discards prior expansions" now describes only the visible graph; the Back
history keeps the discarded one. §7.5 labels are no longer per edge (section
5.6) and M2's 40-character cap (`MAX_EDGE_LABEL_CHARS`) is deleted.

## 3. State and ownership

**The webview owns the view state:** the centre, merged slices, expanded nodes,
positions, pins, Back history and column gap. It is plain data with pure
functions over it (`view/graph-state.ts`, `view/view-state.ts`), persisted with
the webview `setState`/`getState` API so a reload restores the graph. The
extension keeps only a jump lookup table (section 4.3) and analyses on request.

### 3.1 Shapes

`packages/webview/src/view/types.ts`:

```ts
export type Point = { x: number; y: number };

/** What one slice brought in; the key is the node it was fetched for. */
export type SliceRecord = { members: NodeId[]; edgeIds: string[] };

export type GraphState = {
  generation: number;
  project: string; // absolute tsconfig path, opaque to the webview
  focusId: NodeId; // the centre
  nodes: Record<NodeId, GraphNode>;
  edges: Record<string, GraphEdge>;
  slices: Record<NodeId, SliceRecord>; // key focusId = the centre's slice
  positions: Record<NodeId, Point>; // top-left, flow coordinates
  pinned: NodeId[];
  revision: number; // +1 on any change to nodes, edges, pins or positions
};

export type ViewState = {
  version: 1;
  nextGeneration: number; // starts at 1
  columnGap: number;
  current: GraphState | undefined;
  history: GraphState[]; // oldest first, at most HISTORY_LIMIT = 20
};
```

`members` is the slice's node ids other than its key. A node is *expanded*
when it is not the centre and `slices` has its key. Records, not `Map`s, so the
state survives `structuredClone` and JSON.

### 3.2 Pure operations

**Merge** (`mergeExpansion`) adds nodes and edges whose ids are absent (an
existing node is never replaced), records `slices[nodeId]` and returns the added
ids. An expansion that adds no node still adds missing edges and records the
slice, so its button turns to `[−]`. `applyExpansion` merges, then places the
added nodes (section 5.2), writing no existing position.

**Collapse.** `collapseNode(graph, X)`:

1. Delete `slices[X]`.
2. Compute R, the nodes reachable from the centre: start with `{focusId}`; for
   each id in R with a slice, add that slice's `members`; repeat to a fixpoint.
3. Delete every slice whose key is not in R. This is the recursion: whatever
   was expanded only through X loses its expansion.
4. Keep a node if it is in R or pinned; delete the others and their positions.
5. Keep an edge only if both ends are kept and a remaining slice lists it.

So a node stays if it is the centre, is pinned, or the centre's slice or
another still-expanded node's slice also brought it in. A pinned node that
loses all its edges stays as a lone box.

**Generations.** The webview mints them. `commitCentre(view, graph)` and
`goBack(view)` give the graph becoming current `generation = nextGeneration++`,
so Back also invalidates answers in flight for the graph being left.
`acceptExpansion(view, answer, columnGap)` returns the view unchanged unless
`mode.generation` equals `current.generation`, `project` equals
`current.project`, the node is in the graph and `slice.focusId` equals the node
id.

**History.** Every new centre pushes the previous graph, whatever its source:
double-click, `Shift+Alt+Q` or the context menu, except a trivially recoverable
graph (same `project` and `focusId`, no expansions, nothing pinned). The 21st
entry drops the oldest. Back restores nodes, edges, expansions, positions and
pins exactly, without re-analysis, then refits the view. No forward history.

**Persistence.** `view/persist.ts` exports `isViewState(value)` (structural,
`version === 1`). `App` restores `getState()` if it passes, else starts empty.
`setState(view)` runs after each view change, trailing-debounced 250 ms and not
mid-drag. The banner, `busy`, `indexing`, in-flight expansions and failure
messages are not persisted. After a restore the view fits.

## 4. Protocol and extension

### 4.1 Messages

`packages/webview/src/protocol.ts` (types only; imports from
`@code-spider/core/types`):

```ts
export type SliceMode =
  | { kind: "centre" } // replace the graph
  | { kind: "expansion"; nodeId: NodeId; generation: number }; // merge

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
  | { type: "refresh" }; // still unhandled; M3b
```

`project` is the absolute path of the tsconfig that produced a slice. The
webview copies it into `GraphState.project` and sends it on every message
naming a node or edge. Node ids are relative to the project root and Back can
restore a graph from another project, so one id can mean different files;
`project` keeps them apart and tells the extension which project to ask. An
`expansion` slice echoes the `generation` it was asked with. `busy` covers
centre requests only; an expansion spins on its own box. `parseWebviewMessage`
and `isExtensionMessage` validate the new shapes.

### 4.2 Worker

`packages/extension/src/worker/protocol.ts`:

```ts
export type FocusResult = {
  slice: GraphSlice;
  repoRoot: string;
  tsconfig: string; // new; the handler already holds entry.tsconfig
};
export type ExpandResult = FocusResult;

export type SliceForNodeRequest = {
  kind: "sliceForNode";
  tsconfig: string;
  nodeId: NodeId;
  changedFiles: string[];
};
// WorkerRequest gains SliceForNodeRequest; WorkerResponse gains
// { id: number; kind: "sliced"; result: ExpandResult }
```

`AnalysisPort` and `WorkerClient` gain
`sliceForNode(tsconfig, nodeId, changedFiles): Promise<ExpandResult>`. The
handler answers with `expandNode(entry.project, nodeId, entry.repoRoot)` on an
entry from the new `ProjectCache.openTsconfig(tsconfig)`, which reuses the warm
project, reloads it if evicted (`MAX_PROJECTS = 3`) and applies pending changed
files like `open`. It never calls `findTsconfig`: that picks a project from a
file path and could pick another project for a node reached from a neighbouring
package. Re-centre and expansion both use this request; core needs no change,
because the project lookup lives in the worker.

### 4.3 Extension

**Jump table** (`src/jump-table.ts`). Per project it holds `repoRoot` and every
node and edge sent to the panel since it opened, later slices overwriting
earlier ones: `add(project, { slice, repoRoot })`, `has(project)`,
`nodeTarget(project, nodeId)`, `callSiteTarget(project, edgeId)` (each returns
the existing `JumpTarget` or `undefined`), `clear()`. `JumpHandler` reads it
instead of `session.currentGraph()`, so clicks on expanded nodes and on nodes
restored by Back jump. `GraphPanel` takes an `onClosed` callback, run from
`onDidDispose`, that clears it. `ExtensionApi.currentGraph()` stays (latest
centre result).

**Session** (`session.ts`):

- `focusNode({ project, nodeId })` shares `showGraph`'s `latest` token (the
  newest centre request wins) and `busy` bracket; calls
  `worker.sliceForNode(project, nodeId, changes.drain())`; adds to the table;
  posts `slice` with `mode: centre`; on failure posts `analysisError`.
- `expand({ project, nodeId, generation })` sets no `busy`, takes no token and
  may overlap other expansions. It adds to the table and posts `slice` with
  `mode: { kind: "expansion", nodeId, generation }`, or `expandFailed` on
  failure. After the await it posts nothing if `table.has(project)` is false
  (the panel closed meanwhile).
- Both refuse a `project` the table has never seen (`expandFailed` "Unknown
  project" / `analysisError`), so the webview cannot name an arbitrary tsconfig.
- A `WorkerCrashedError` also raises `notifier.error`, as in `showGraph`, which
  now posts `project: result.tsconfig` and `mode: centre`.

**Dispatch** (`src/dispatch.ts`): `createDispatcher({ jumps, session, columnGap })`
routes `openInEditor`/`openCallSite` to `JumpHandler`, `focus` to `focusNode`,
`expand` to `expand` and `setColumnGap` to the store (section 5.5), and ignores
`ready` and `refresh`. `ExtensionApi.handleWebviewMessage` uses it too.

**MessageGate.** The webview restores its own graph and an expansion slice is
not self-contained, so replaying "the latest slice" is wrong. New rules: a
`centre` slice and `analysisError` are *content*, kept only while not ready,
delivered once on the first `ready`, then cleared; an `expansion` slice and
`expandFailed` are *ephemeral*, sent when ready and dropped otherwise, so a late
answer never reaches a newly opened panel; `busy`, `indexing` and the new
`settings` replay on every `ready`, in the order settings, indexing, busy,
content. A message sent while the webview reloads is lost.

## 5. Placement and layout

Geometry uses the analytic sizes: width `NODE_WIDTH` (320), height
`nodeHeight(node)`. Nothing is measured from the DOM. Labels (section 5.6) lie
outside the node rectangle and never enter layout or overlap checks.

### 5.1 New centre

ELK, layered, direction RIGHT, as in M2. `layoutPositions(nodes, edges,
columnGap)` sets `elk.layered.spacing.nodeNodeBetweenLayers` to `columnGap`
(M2 hard-codes `"96"`; the default is now 192, section 5.5) and keeps
`elk.spacing.nodeNode` at `"32"`. The old graph stays
until the slice is laid out; then `commitCentre` swaps it in and the view fits
(`padding: 0.2`, `maxZoom: 1`, as in M2). The newest centre slice wins if
layouts overlap.

### 5.2 Expansion

`graph/placement.ts` exports `Rect`, `NODE_MARGIN` (32), `isClear`,
`nearestFreeY` and `placeExpansion`.

- `pitch = NODE_WIDTH + columnGap`. Added nodes with an edge `from === n,
  to === X` (X the expanded node) are *suppliers*; the rest are *consumers*. A
  node linked both ways is a supplier.
- Suppliers go in the column `x = X.x − pitch`, consumers at `X.x + pitch`. In
  each column the nodes are stacked in id order, `NODE_MARGIN` apart, the stack
  centred on X's vertical centre.
- In stack order each node takes `nearestFreeY`: the y nearest its stack
  position (ties go up) whose rectangle is `isClear` of every obstacle: all
  nodes already in the graph, X included, wherever they were dragged, plus
  added nodes placed before it.
- `isClear(a, b, margin)` holds when the horizontal or the vertical gap between
  the rectangles is at least `margin`. The forbidden y values in a column are a
  union of open intervals, so the nearest free y is the preferred y or an
  interval end (`obstacle.bottom + margin`, `obstacle.top − margin − height`);
  `nearestFreeY` tests exactly those, nearest first. One always exists.
- Existing nodes never move. Added nodes and their edges fade in over 250 ms
  (class kept 300 ms; no animation under `prefers-reduced-motion`).
- The view does not zoom or refit. `graph/pan-to-reveal.ts` exports
  `panToReveal(viewport, size, rect, padding)`: the least shift (200 ms) that
  puts the added nodes' bounding box inside the visible area with 24 px clear;
  an axis where the box exceeds the area is centred.

### 5.3 Dragging and pins

React Flow stays mounted for the life of the panel (no `key` per layout). A
drag moves the node live through React Flow's change handling;
`onNodeDragStop` writes the final position of every node it reports into the
view state and adds them to `pinned`. `nodeDragThreshold={4}` stops a plain
click becoming a drag. A pinned node shows a pin icon (inline SVG) in its
header; clicking it unpins without moving the node. `zoomOnDoubleClick` is off.

### 5.4 Tidy

`graph/tidy.ts` exports `tidyPositions({ elk, sizes, pinned })`, pure, with
ELK's output as input so tests need no ELK.

1. ELK lays out every node and edge (layers reflect the whole graph). Pinned
   nodes keep their current positions and ignore ELK's.
2. An unpinned node whose ELK rectangle is not `isClear` of some pinned node is
   *displaced*. Displaced nodes, sorted by (x, y, id), each move within their
   own column (x unchanged) with `nearestFreeY`; the obstacles are the pinned
   nodes, the undisplaced unpinned nodes and the displaced nodes placed so far.
3. The view fits (`padding: 0.2`, `maxZoom: 1`, 250 ms).

Undisplaced nodes keep ELK's positions, so ELK's spacing holds between them.
Tidy records `revision` at the start; if the graph changed while ELK ran, the
result is discarded and Tidy runs again on the current graph. A layout failure
leaves positions unchanged and shows the banner.

### 5.5 Column-spacing slider

A range input in the toolbar sets `columnGap`: **min 32, max 480, step 16,
default 192**. The default favours readable labels: a label has room for
`columnGap − 12` px, about 27 characters of 11 px monospace at 192, so
`ValidUserData` fits where 96 (about 12) would truncate it. A first graph is
therefore wider than in M2, which hard-coded 96. 32 is `NODE_MARGIN`, so a
neighbouring column is never closer than the margin. At 480 a label has room
for about 70 characters; longer types ellipsise and show in full on hover.

`packages/webview/src/column-gap.ts` holds `COLUMN_GAP = { min, max, step,
default }` and `normaliseColumnGap(raw)` (not a finite number gives the
default; otherwise clamp, then snap to the step). It is exported as
`@code-spider/webview/column-gap` and imported by the extension: one pure value
module, a deliberate exception to M2's "the protocol is types only".

Moving the slider updates `columnGap` at once (label widths follow); after
250 ms without movement it runs Tidy and posts `setColumnGap`. The extension
stores the normalised value in `globalState` under `codeSpider.columnGap`
(`src/column-gap.ts`, over a Memento-like `get`/`update` port) and posts
`settings` at activation and after every `setColumnGap`, so the gate always
replays the current value. The webview applies only the first `settings`
message after each load, without running Tidy. The value survives panels and
VS Code restarts.

### 5.6 Labels, once per supplier

`graph/supplier-labels.ts`:

```ts
export type LabelLine = { kind: "returns" | "jsx" | "passes"; text: string };
export function supplierLabels(
  edges: readonly GraphEdge[],
): Map<NodeId, LabelLine[]>;
```

Edge kinds map to line kinds: `call` and `external` to `returns`, `jsx` to
`jsx`, `passes` to `passes`. A supplier (`edge.from`) gets at most one line per
kind: the distinct non-empty `supplies` values in edge-id order joined with
` · ` (normally one value, since `supplies` belongs to the supplier). Order:
returns, jsx, passes. Only drawn edges (both ends present) count, so collapsing
updates labels.

Each line renders inside its supplier's node wrapper, so it drags and fades
with the node: left edge 6 px right of the box, bottom edge 4 px above the
box's vertical centre (clear of the outgoing edge), 11 px editor font, 14 px
line height, `max-width: calc(var(--column-gap) − 12px)`, one line with CSS
ellipsis, full text in `title`, editor-coloured background. Lines stack upward,
`returns` nearest the edge. `jsx` lines use `--vscode-charts-purple`, `passes`
lines `--vscode-charts-blue` in italic, matching their edges. Edges lose their
`label`; an edge click still jumps to the call site.

Same-column labels cannot collide: three lines reach 46 px above the centre,
at most 32 px above a node's top (minimum height 28), and the node above ends
at least `NODE_MARGIN` higher. Dragged nodes carry no such guarantee.

### 5.7 Toolbar

Above the banners: `← Back`, `Tidy` and the slider with a "Spacing" label and
its value, themed with `--vscode-button-*`. Back is disabled when the history
is empty or `busy`; Tidy when there is no graph.

## 6. Interactions

**Single click** on a node or edge jumps at once, unchanged, with no delay.
**Double-click** on a `function` or `component` node other than the centre
posts `focus` (`onNodeDoubleClick`); elsewhere it does nothing. Its first click
already jumped, harmless because the code sits beside the panel. Node boxes are
`user-select: none` so a double-click selects no text.

**Known risk, verified in Task 6.** The first click's jump goes through
`EditorRevealer.reveal`, whose `showTextDocument` moves keyboard focus into the
editor, and VS Code might then swallow the second click so `dblclick` never
reaches the webview. No automated test can click, so the owner checks by hand
before committing Task 6 (manual check 5). Pass: ten consecutive double-clicks
on different nodes each re-centre the graph and leave the editor at that node's
declaration. **Fallback if it fails:** remove the double-click handler and add a
`[◎]` button to the header cluster, left of `[+]`, same eligibility, title
"Re-centre here", posting the same `focus`. The single-click jump keeps its
present focus behaviour either way.

**Header controls** (`graph/node-controls.ts`, pure
`nodeControl(node, graph, ui)`) sit at the right end of the header after the
input type: the pin icon if pinned, then the expand control.

| Node | Expand control |
|---|---|
| centre, `external`, `unknown`, `module` | none |
| `function`/`component`, collapsed | `[+]`, disabled while `busy` |
| loading | 12 px spinner, not clickable |
| expanded | `[−]`, also while `busy` |

`[+]` posts `expand` with the graph's `project` and `generation` and marks the
node loading; several may be in flight, each merging when it arrives. `[−]`
calls `collapseNode` locally. Controls stop click and double-click
propagation, so they never jump, drag or re-centre. A pending centre, by any
route, leaves the old graph visible with the existing spinner; `[+]` and Back
are disabled while `busy`, and answers for the old graph are dropped by
generation.

## 7. Errors

| Failure | Result |
|---|---|
| Expansion fails (renamed since, worker crash, unknown project) | `expandFailed`: the box shows the message for 4 s (full text in `title`), the button resets to `[+]`, the graph is unchanged |
| Re-centre fails | `analysisError`, `busy: false`: old graph and history unchanged, existing banner shows the message |
| Answer for an older graph (generation, project, missing node, `focusId`) | Dropped silently |
| ELK fails (new centre or Tidy) | Old graph and positions kept; banner "Could not lay out the graph: ..." |
| Persisted state fails `isViewState` | Ignored; the panel starts empty |
| Panel closed with requests in flight | Table cleared; session posts nothing; gate drops expansion messages |

## 8. Testing

**Pure webview tests** (vitest, node environment, no DOM; markup through
`renderToStaticMarkup`):

- `graph-state.test.ts`: merge is idempotent, adds missing edges when no node
  is new, never moves or replaces existing nodes. Collapse: removes only what
  the expansion brought; recursive A to B to C; kept because the centre's slice
  brought it; kept because another expanded node's slice did, gone once that
  one collapses too; kept because pinned; an edge needs both ends and a
  remaining slice; cycles. `acceptExpansion` drops a wrong generation, project,
  missing node or `focusId`.
- `history.test.ts`: push, pop, limit 20, the trivially-recoverable skip,
  Back's fresh generation, exact restore.
- `placement.test.ts`: a seeded property test (`test/support/random.ts`,
  mulberry32): 300 random layouts of up to 30 obstacles at arbitrary integer
  positions, dragged ones overlapping each other, and up to 12 added nodes.
  Asserts each added node sits in its column, is `isClear` of every other node
  by `NODE_MARGIN`, and is optimal (no nearer integer y is clear). Fixed cases:
  forced down vs up, ties go up, supplier/consumer split.
- `tidy.test.ts`: pinned never move; no unpinned node overlaps a pinned one;
  displaced nodes keep their column; undisplaced keep ELK's position.
- `supplier-labels.test.ts`: one line per supplier and kind; call and external
  merge; jsx and passes separate; empty text skipped.
- Also `pan-to-reveal`, `node-controls` (each row of section 6's table),
  `persist`, `column-gap`, `messages`, `app-state`, `to-flow`, `layout` (ELK
  option follows `columnGap`) and `node-box` (controls markup).

**Extension unit tests:** `jump-table` (merge, per-project isolation, `clear`);
`session` (`focusNode` brackets `busy`, newest wins; `expand` posts no `busy`,
echoes the generation, posts `expandFailed` and nothing after `clear`);
`worker-handler`, `worker-integration`, `project-cache` and `worker-client`
(`sliceForNode` answers in the given tsconfig, fails clearly on a missing node;
`openTsconfig` reuses and reloads); `message-gate` (content once, expansions
never queued); `webview-messages`; `dispatch`; `column-gap`.

**Smoke tests** (`smoke/suite/extension.smoke.ts`; the four existing cases now
send `project: api.currentGraph()!.tsconfig`). Two new ones, after them, on
`test-code/basic`:

1. Re-centre by node id: `focus` for `src/signup.ts#validateUser`; then
   `api.currentGraph()?.slice.focusId` is that id.
2. A node added by an expansion can be clicked: `expand`
   `src/signup.ts#handleSignup`, then `openInEditor` for
   `src/signup.ts#createUser`, which only that expansion brought in; the editor
   lands on line index 7, the start of its declaration.

**Manual check list** (the owner runs it after Task 9; item 5 earlier, per
section 6). In `test-code/basic`, focus `handleSignup`:

1. Click `[+]` on `main`: no new node, the button reads `[−]`. Click it: `[+]`.
2. Focus `validateUser`, expand `handleSignup`: `createUser`, `sendWelcome`,
   `main`, `retry` fade in without zoom, panning only if off screen. Collapse
   `handleSignup`: they go; the other two stay.
3. Drag `createUser`: the pin icon appears. Expand a neighbour: nothing moves.
   Drag another node onto where an expansion would land, then expand: the new
   nodes keep a visible gap. Click the pin: it vanishes, the node stays put.
4. Click a node: the editor jumps at once. Click an edge: the call site.
5. Double-click a neighbour ten times: it re-centres each time (section 6).
6. `← Back` returns the previous graph with its expansions and positions and is
   disabled at the start. Re-centre 21 times: Back stops after 20.
7. Pin two nodes and press Tidy: unpinned nodes re-layout, pinned stay,
   nothing overlaps, the view fits.
8. Move the slider through both ends: nodes settle after a pause, labels
   ellipsise at narrow gaps with the full text on hover. Close the panel, run
   Show Graph: the value is kept; restart the dev host: still kept.
9. In `test-code/jsx` focus `Page`: `SignupForm` has one purple
   `SignupFormProps` label. In `basic`, each supplier of `handleSignup` has one.
10. "Developer: Reload Webviews": graph, pins and Back history return. Rename
    `createUser`, save, click `[+]` on its old box: the message shows about 4 s
    (undo the rename). Switch light and dark themes: everything follows.

## 9. Task outline

The plan refines this and may split any task that outgrows one commit. Each
task leaves `pnpm -r typecheck` and `pnpm -r test` green (and `pnpm build`
where a bundle changes).

1. **Types-only core entry.** `packages/core/package.json` exports
   `"./types": "./src/types.ts"`; the webview's `src/` and `protocol.ts`
   import types from `@code-spider/core/types`. `packages/webview/tsconfig.json`
   covers `src` with `types: []`; a new `tsconfig.test.json` covers src, test
   and `vitest.config.ts` with `types: ["node"]`; `typecheck` runs both. (With
   `types: []` today's only errors are the `node:` imports reached through
   core's index.) No other core change.
2. **Worker and extension.** The protocol (section 4.1), with the minimal
   webview reducer change that keeps M2 working (it takes `centre` slices and
   ignores `expansion` ones); `FocusResult.tsconfig`; `sliceForNode` through
   handler, cache, client and port; `JumpTable`; session `focusNode`/`expand`;
   dispatcher; gate rules; panel `onClosed`; existing smoke cases updated.
3. **Webview graph-state model.** `view/types.ts`, `graph-state.ts`,
   `view-state.ts`, `persist.ts` and tests. Pure, not yet wired.
4. **Placement and Tidy.** `placement.ts`, `tidy.ts`, `pan-to-reveal.ts`,
   `test/support/random.ts` and the property tests. Pure, not yet wired.
5. **Persistent React Flow state.** `AppState` holds `ViewState`; `layout.ts`
   takes `columnGap`; `use-layout.ts` becomes a centre-layout and Tidy hook;
   `to-flow.ts` maps `GraphState`; one mounted `ReactFlow`; drag, pins,
   `setState` persistence; expansion answers merge (no button yet).
6. **Box controls.** `node-controls.ts`, `[+]`/`[−]`, spinner, failure text,
   pin icon, double-click, fade-in, pan to reveal. Ends with manual check 5; on
   failure the `[◎]` fallback is built in the same task.
7. **Toolbar.** `toolbar/Toolbar.tsx`, Back, Tidy, the slider, `column-gap.ts`
   (webview module and extension store), `settings`, `setColumnGap`.
8. **Labels.** `supplier-labels.ts`, rendering in `SpiderNode`, removal of edge
   labels, `truncateLabel` and `MAX_EDGE_LABEL_CHARS`.
9. **Smoke tests and the manual check list** (section 8).

## 10. Working agreement and constraints

Per §13: agents build it, one implementer and one independent reviewer per
task, and the owner makes every commit, one task at a time. Nothing is staged,
committed or pushed without the owner asking. Files stay under 300 lines (hard
cap 500); comments are minimal; Prettier style, matched by hand. Theme only
through `--vscode-*` variables. `packages/core` never imports `vscode`. Node
sizes stay analytic. No `unsafe-eval`: ELK stays `elk.bundled.js`.
