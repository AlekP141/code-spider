# Code Spider: Open and Closed Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to
> validate this plan and hand it to `subagent-driven-development` for
> task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boxes start closed (just the header, with larger header text), and a click on a box jumps to its code in the editor
and opens the box in the graph, pushing the boxes below it down, so a fresh diagram is no longer full of code.

**Architecture:** A new optional list `open` on `GraphState` says which boxes show their code. `nodeHeight` takes that flag, so
everything that places or sizes a box (ELK, Tidy, expansion, Refresh, reveal, React Flow) uses the height that is drawn.
Opening reuses the existing `makeRoom` to push unpinned boxes down; a click and a chevron in the header dispatch two new
local actions. The protocol, the extension, the worker and core do not change.

**Tech Stack:** As M3c: TypeScript 5.6+ (strict, `noUncheckedIndexedAccess`), pnpm 11 workspaces, esbuild, React 19.3,
`@xyflow/react` 12.12, `elkjs` 0.12, Vitest 2. **No new dependencies.**

**Spec:** none, by the owner's standing choice for small changes ("skip the spec and go straight to the plan"). The Design
section is the source ("D1" to "D15"). Background: docs/superpowers/specs/2026-08-22-code-spider-design.md ("§n") and the
previous plan docs/superpowers/plans/2026-10-11-code-spider-m3c-call-order.md, whose conventions this plan follows.

## Global Constraints

Every task's requirements include these.

**Scope.** Open and closed boxes, the larger header and the failure message move only. D14 lists what does not change and what
is out of scope.

**TDD, once for every task.** Write the listed tests, see them fail for the right reason, implement, see them pass. A task's
"Tests" list is the set of new cases; every existing test must still pass unless the task names it and says why it changes.
When an existing test has to change because a number or a height changed, recompute the expected value from the named heights
and keep what the test proves. Never loosen an assertion, delete a case, or lower a counter that proves a property test is not
vacuous; if a counter then fails, make the generator open more boxes, and if that does not help stop and report.

**Repository rules (from the owner's instructions).**
- Files must never exceed 500 lines (hard limit); aim for at most 300. Split by responsibility. Sizes today (`wc -l`):
  `app/app-state.ts` 244, `graph/GraphView.tsx` 225, `graph/graph.css` 278, `view/graph-state.ts` 189, `view/refresh.ts` 183,
  `view/refresh-order.ts` 179, `view/persist.ts` 167, `graph/nodes/NodeBox.tsx` 130, `App.tsx` 129; tests
  `view/graph-state.test.ts` 292, `view/rebuild-graph.test.ts` 286, `app/app-state.test.ts` 265,
  `view/rebuild-graph-order-edges.test.ts` 268, `graph/to-flow.test.ts` 241, `view/persist.test.ts` 235; probe
  `checks-basic.js` 258, `checks-detail.js` 225, `fixtures.js` 234. No new case goes into a test file that is above 260 lines
  unless its task says so; new cases go in the new files the tasks name.
- Comments are minimal: only for logic that is hard to follow, never a label for the next line; match the surrounding style.
- No new dependency; `pnpm-lock.yaml` and `pnpm-workspace.yaml` do not change. No DOM test environment is added (the repo has
  none: Vitest runs in Node and the React tests use `renderToStaticMarkup`); behaviour that needs real mouse input is proved by
  the probe.
- Packages are `"type": "module"` with `.js` import specifiers. `tsconfig.base.json` is not weakened. Test literals contain no
  invisible characters.
- **Wording.** In code and prose "open" and "closed" mean a box shows or hides its code. "Expand", "collapse" and "expanded"
  belong only to the double-click walk (`isExpanded`, `collapseNode`, `onExpand`, `onCollapse`, `expandStarted`, `collapsed`)
  and are never used for this change.
- Formatting: no formatter is installed or runnable (`.prettierrc` is `{}`, Prettier is not a dependency and must not be
  added). Write Prettier defaults by hand: 80 columns, double quotes, semicolons, trailing commas, two-space indent.

**Commands** (begin every Bash command with `cd /home/motodox/code/AlekP141/code-spider && `).
- `pnpm test` (all four packages), `pnpm typecheck`, `pnpm build`. One package or file:
  `pnpm --filter @code-spider/webview test <name>`.
- `pnpm probe` runs `node build.mjs && node probe/run.mjs` in `packages/webview`: it builds the webview, then opens it in the
  cached VS Code 1.141.0 (Electron) in `packages/extension/.vscode-test`, with a fake `acquireVsCodeApi`, the real content
  security policy and real mouse input. It needs Linux and the cached VS Code (`pnpm --filter code-spider-vscode check:electron`
  checks the libraries Electron needs; `download:vscode` fetches VS Code). It is separate from `pnpm test`. It ran in this environment on
  2026-10-13. The probe's page theme (`probe/fixtures-page.js`) must define every `--vscode-*` variable the CSS uses, or the run
  stops with "the probe theme does not define"; this change adds no new variable.
- Smoke (`pnpm --filter code-spider-vscode test:smoke`) is not part of a task's checks. The coordinator may run it once after
  the last task. Nothing in `packages/extension` depends on code being visible in the webview (its smoke suite reads the
  analyser's slice through `api.currentGraph()`, its tests use `codePreview: "x"` as plain data, and `readme.test.ts` checks only
  the build, install and shortcut sentences), so the extension package is not edited.
- `git diff` and `git diff --check` skip untracked files, so the last step of a task that creates files also runs
  `for f in $(git ls-files --others --exclude-standard -- <paths>); do git diff --no-index --check -- /dev/null "$f"; done`
  (exit status 1 only means the file differs from `/dev/null`; whitespace warnings are what matter).

**Commits.** Work is on `main`; never branch, never push. The implementer never stages or commits. After a task's review is
approved and the coordinator has re-run `pnpm typecheck`, `pnpm test`, `pnpm build` and the task's verify step, the
coordinator commits that task's exact paths (the owner has authorised this for code-spider plan execution): one commit per
task, one plain lowercase imperative line, no `feat:` or `chore:` prefix, no `Co-Authored-By` or any other trailer. Each task
ends with its proposed message.

**Baseline (HEAD `8a931ae`, tree clean, measured 2026-10-13 with Node v23.9.0 and pnpm 11.24.0).** `pnpm typecheck` clean in
all four packages. `pnpm test`: core 250 tests (35 files), CLI 39 (3), webview 507 (57), extension 216 (29). `pnpm build`
passes. `pnpm probe` ran here and passed 10 checks. Smoke was not re-run by the plan author. Expected webview totals after each
task are in the verify steps; other packages stay at 250, 39 and 216. A count that differs is a question to ask, not a reason to
add or drop cases.

**Evidence behind the Design.** The plan author built the whole change once in a throwaway copy of HEAD outside the repo (not
kept), to check the design before writing tasks. Results: changing only `HEADER_HEIGHT` to 36 breaks exactly 9 existing tests in
5 files and leaves `pnpm probe` at 10 passing; changing `nodeHeight` to take the flag needs five caller files in `src` updated, and
in the tests breaks 38 cases (20, in 13 files, after three test builders open all their boxes); with the full feature the
unmodified probe fails only check 2 (the box below the clicked one moved from y 80 to y 136, that is 56, the code region of a
three-line function); with checks 1, 2 and 5 adapted and two new checks, all 12 pass; breaking the failure-message CSS makes the
new check 12 fail by name; with everything except click-to-open the unmodified probe passes all 10.

## Agent Execution Contract

- Each task uses exactly one isolated `workflow-implementer` (Haiku, `high`) implementer and exactly one independent read-only `workflow-reviewer` (Sonnet, `high`) reviewer.
- Reuse both task agents with `SendMessage` for every fix and re-review.
- After two failed fix rounds on the same substantive issue, stop and ask whether to replace that task's implementer with a Sonnet `workflow-author`; keep the same reviewer. Never replace an unresumable task agent silently.
- A multi-task plan uses one fresh `workflow-reviewer` (Sonnet, `high`) integration reviewer, reused for all integration rechecks.

---

## Design (agreed 2026-10-13, no separate spec)

**Request (owner, verbatim).** "Currently, the nodes start and they are fully open with their code inside it. This is creating a
lot of noise and clutter in the diagrams straight away. I want to change this behaviour to be the following: Nodes start
closed, this means they just have the header text section. When you single click on a node, it jumps to the code in the code
editor AND it opens the node in code spider so you can see the code expanded. This should also push the nodes below down to
make space. When you double click, you draw all the connected nodes - this behaviour stays as it currently is. Also, lets
increase the font size of the headers - this should help when viewing a zoomed out diagram to still be able to see the function
names without wanting to read the code text"

**Owner's answers (2026-10-13).** (1) An open box is closed with a small chevron in its header; a single click only ever opens;
it is accepted that a double click also opens the box it lands on. (2) When a box is closed, the boxes that were pushed down stay
where they are; the Tidy button packs the graph again. (3) The centre box starts open; every other box starts closed.

1. **D1 Words.** "Open" means a box shows its code region; "closed" means it is only its header. The names that already exist
   for the double-click walk keep their meaning and do not change. New names: `open`, `isOpen`, `openNode`, `closeNode`,
   `nodeOpened`, `nodeClosed`, `onOpen`, `onClose`, `openBox`, `closeBox`, the classes `is-open` and `is-closed`, and the
   labels "Show code" and "Hide code".
2. **D2 State.** `GraphState` (`view/types.ts`) gains `open?: NodeId[]`: the boxes whose code is shown. Absent in older saves
   and then it means none are open, so a view saved before this change shows every box closed, the centre too, until clicked.
   `isOpen(graph, nodeId)` is true exactly when `graph.open` lists the id; it sits beside `isExpanded` in `view/graph-state.ts`.
   `graphFromSlice` sets `open` to `[focusId]` when the focus node exists and `hasCodeRegion` is true for it (`codePreview` is
   not empty), otherwise to `[]`. `mergeExpansion` keeps `open` and the boxes it adds are closed. `collapseNode` (the walk's
   collapse) drops the boxes it removes from `open` and leaves an absent `open` absent. Only a box with a code region can be
   open (external, unknown and module chips have `codePreview === ""`). `open` travels inside each `GraphState`, so Back and the
   history restore the open state of the graph they restore, and the persisted view (webview `setState`) keeps it across a
   reload. A new centre (Show Graph) is built by `graphFromSlice` again, so it starts with only its centre open, even on the same
   function; `isRecoverable` in `view/view-state.ts` is not changed.
3. **D3 Saved views.** `isGraphState` (`view/persist.ts`) accepts a missing `open`; when `open` is present it must be a string
   array, and `isConsistent` requires every id to be a node of that graph. It does not check code regions (a listed box without
   one still draws closed, see D4 and D10).
4. **D4 Heights.** `HEADER_HEIGHT` is 36 (was 28). `nodeHeight(node, open)` in `graph/nodes/node-size.ts` takes the flag as a
   required second parameter: `HEADER_HEIGHT` when `open` is false, and `HEADER_HEIGHT + codeRegionHeight(node)` when it is
   true (a chip's code region is 0, so it is always the header). The required parameter makes the compiler find every caller.
   Callers in `src`, each passing `isOpen(graph, id)`: `graph/to-flow.ts` (the flow node's `height` and `measured.height`, one
   value), `view/expansion.ts` (`rectsOf`, and the anchor and the added nodes in `applyExpansion`; added nodes are not open),
   `view/refresh.ts` (`keptBoxes`, and the `heights` map in `rebuildGraph`, which also feeds `restackPass` and `placePass`),
   `graph/viewport/reveal.ts`, `graph/layout/tidy-graph.ts` (`sizesOf`). ELK's first layout and Tidy get their heights through
   `toFlow`, so they follow automatically. React Flow sets a node wrapper's inline width and height from the node's
   `width`/`height` (`getNodeInlineStyleDimensions` in @xyflow/react 12.12) and `.node-box` fills the wrapper (`height: 100%`),
   so a changed `height` from `toFlow` resizes the box; the throwaway build confirmed it. Tests and test support that call
   `nodeHeight` must change too (Task 3 lists them).
5. **D5 Opening makes room.** `openNode(graph, nodeId, columnGap)` returns the very same graph when the box is already open, is
   not in `nodes`, or has no code region. Otherwise it adds the id to `open`, then runs `makeRoom` (`graph/layout/make-room.ts`)
   over every node that has a position, at its open-aware height computed from the graph with the new `open` applied, with the
   fixed set `pinned` = the graph's pinned ids plus the opened id, and no chains, and applies the returned positions. Revision
   goes up by exactly one. Consequences: only unpinned boxes move, only downwards, never sideways; the opened box does not move;
   boxes above, beside or in other columns do not move unless they are closer than the row gap to the opened box or to a box
   that was pushed; a pinned box directly below an opening box is not moved and may be overlapped (dragged boxes stay put, as
   everywhere else); a pushed box is not pinned. `columnGap` is `graph.columnGap ?? view.columnGap`, picked the way `acceptAnswer`
   in `app/app-walk.ts` picks it.
6. **D6 Closing.** `closeNode(graph, nodeId)` returns the very same graph when the box is not open; otherwise it removes the id
   from `open` and adds one to the revision. It moves nothing: the boxes that were pushed stay where they are (owner's answer 2)
   and Tidy packs them again.
7. **D7 Clicks and the chevron.** `onNodeClick` in `graph/GraphView.tsx` keeps posting `nodeClickMessage` (jump to the editor)
   and then calls `onOpen(node.id)`; the `justUnpinned` guard still returns before both. A click on a box that is already open
   or has no code region opens nothing (the reducer returns the same state). `onNodeDoubleClick` is unchanged, so a double click
   jumps, opens and draws the connected boxes (accepted by the owner); the walk's expansion is placed around the box's open
   height. The chevron is a button in the existing `.node-controls nodrag` span of the header (`Markers` in
   `graph/nodes/NodeBox.tsx`), which already stops click and double-click propagation, so the chevron neither jumps to the
   editor nor draws the connected boxes. It shows on every box with a code region, opens a closed box and closes an open one, with `aria-label` and `title` "Show code"
   when closed and "Hide code" when open, and is an inline SVG like `PinIcon`: a chevron pointing right when closed and down when
   open. In the span it comes after the pin and the spinner. `Markers` renders nothing only for a box that is not pinned, not
   loading and has no code region.
8. **D8 Reducer, timing, Back, reload.** Two local actions, `{ type: "nodeOpened" | "nodeClosed"; nodeId: NodeId }`
   (`app/app-state.ts`), handled by `openBox` and `closeBox` in a new `app/app-open.ts`; each returns the very same state when
   there is no current graph or the graph function returned the same graph. They are allowed at any time, including while busy,
   loading or refreshing: they are local and need no answer from the extension. `NodeActions` (`graph/nodes/node-context.ts`)
   gains `onOpen(nodeId)` and `onClose(nodeId)`; `App.tsx` wires them to `dispatch`. Refresh rule, verified in
   `app/app-refresh.ts`: `applyRefreshed` reads `state.view.current` at the moment the answer arrives, checks generation, project
   and focus, and passes that graph to `rebuildGraph`; so an open or close made while the request was in flight is part of
   `current` and is carried over (D9), and nothing is lost. Back and reload need nothing beyond D2.
9. **D9 Refresh.** `rebuildGraph` starts from `graphFromSlice(answer.centre, ...)`, which sets `open` to the centre (D2). It
   replaces that with the carried list: the ids in `current.open` (none if absent) that are still nodes of the rebuilt graph and
   still have a code region. So the centre keeps whatever state it had, open or closed, and does not reopen by itself; a box new
   to the graph is closed; a box that left the graph leaves `open`. This rebuilt graph is the one all of `rebuildGraph` reads,
   so `heights`, `keptBoxes`, `placePass`'s `rectsOf` and the returned graph agree (D4). Because heights are open-aware, a closed
   box whose code grew pushes nothing, and an open one that grew gets room as before.
10. **D10 Closed rendering.** `NodeBox` takes `open?: boolean` (default closed) and treats a box as showing code only when
    `open` is true and the node has a code region. A closed box renders the header only: no `<pre class="node-code">` at all.
    `.node-box` gets `is-open` or `is-closed` accordingly (a box with no code region is always `is-closed`), and the header's
    bottom border is removed for `is-closed`, as it is for chips today. An open box renders exactly as before.
11. **D11 How `open` reaches the box.** `open` goes into the React Flow node data like `pinned` (`SpiderNodeData.open`, set by
    `toFlow` from `isOpen`), not into the context: it changes only with the graph, and the same value decides the node's
    `height` in `toFlow`, so the height and the drawing cannot disagree. The handlers `onOpen` and `onClose` come from
    `NodeContext` like `onUnpin`, because the data must stay stable.
12. **D12 The failure message.** `.node-failure` is absolutely positioned at the bottom inside `.node-box`, which has
    `overflow: hidden`; on a header-only box it would cover the name. It becomes a sibling after the `.node-box` element, so
    `NodeBox` returns a fragment of the box and, when there is a failure, the strip; the React Flow wrapper
    (`.react-flow__node`, already `position: absolute`, with an explicit height) is its containing block, and the strip hangs
    just below the box: `top: 100%`, left and right 0, no `bottom`, a border on all sides and rounded bottom corners. Open and
    closed boxes alike; node sizes do not change. The labels (`NodeLabels`) already hang outside the box the same way.
13. **D13 Header size.** `HEADER_HEIGHT` 36 and `.node-name { font-size: 16px; }` (it inherits about 13px today). The async
    badge (10px) and the input type (11px) keep their sizes. Two test files hard-code the old 28 and three more hard-code numbers
    derived from it (see Task 1); the `28` minimums of random heights in other tests are unrelated and stay.
14. **D14 Unchanged and out of scope.** Unchanged: the message protocol, the extension, the worker and core; the zoomed-out mode
    (`is-zoomed-out`, `graph/viewport/lod.ts`: code below zoom 0.5 is grey bars, names stay text); the walk (double click);
    dragging and pinning; Tidy's algorithm. Out of scope: any animation of the height change; "open all" and "close all";
    moving boxes back up on close; panning or fitting the view when a box opens (the code may open below the visible area); any
    change to `isRecoverable`.
15. **D15 Risks and known limits.** Opening can push boxes a long way when a pinned box is in the way, because a pushed box jumps
    below it. A pinned box under an opening box can end up partly covered. Closing leaves gaps until Tidy. A quick double click
    on the chevron opens then closes it. The failure strip is about 19px tall and the smallest row gap is 16px, so for four
    seconds it can cover the top 3px of the box below at the tightest spacing. Views saved before this change load with every
    box closed. Show Graph on the same function resets the open state.

## Plan decisions

1. **Six tasks, header first.** Header size (1), the open field (2), drawing what is open (3), opening and closing (4), the
   chevron, the click and the failure message with their probe checks (5), documents (6). The header goes first because it
   changes the same expected numbers as the open-aware heights; doing it once up front means Task 3 recomputes them only once,
   with final values. The state (2) is separate from the geometry (3) because nothing reads `open` for geometry until Task 3,
   and a reviewer can approve the field and its persistence without reading the test migration.
2. **Closed rendering is in Task 3**, not Task 5, so the build never draws a clipped `<pre>` in a header-only box. After Tasks 3
   and 4 the app starts with closed boxes and no control to open them; it is green but not shippable, and nothing is released
   between tasks. Task 5 completes the behaviour.
3. **The probe changes in Task 5**, with the behaviour they prove, because the existing check 2 asserts that a click moves
   nothing, which stops being true in that task. Tasks 1 to 4 leave the probe at 10 passing, unchanged. The new checks live in a
   new file `probe/checks-open.js`, so no probe file passes 300 lines.
4. **New code files:** `view/open-close.ts` (`openNode`, `closeNode`), `view/room-boxes.ts` (`roomBoxes`, which replaces the
   private `keptBoxes` of `view/refresh.ts` so both use one function), `app/app-open.ts` (`openBox`, `closeBox`).
   `isOpen` stays in `view/graph-state.ts` (189 lines today, under 200 after).
5. **Test builders.** `test/support/graph-states.ts` gets `openAll`, and `test/support/geometry.ts` gets `OPEN_HEIGHT` and
   `CLOSED_HEIGHT` for the standard three-line test function, so tests that need code-height boxes ask for them and tests
   that need the default state use `graphFromSlice` as it is.
6. **No unit test for `GraphView`'s click handler or the chevron's `onClick`.** There is no DOM environment and none is added.
   The reducer (`nodeOpened`) is unit-tested in Task 4 and the click, the chevron and the stop-propagation are proved on the
   real page by probe checks 2 and 11 in Task 5.
7. **Cross-path tests in Task 4.** M3c found that tests that each exercise one layout path miss bugs between paths, so
   `test/view/open-paths.test.ts` runs open, close, Refresh, expansion and Tidy back to back.
8. **Documents:** the root README (required) and small edits to the main design spec §7.6, §7.7, §8, §9 and §10, as M3c did for
   its own change. The spec edits are the plan author's addition to the brief; the coordinator may drop them from Task 6.

## File structure (new files)

Paths in the tasks are relative to `packages/webview/` unless they start with `README.md` or `docs/`.

| File | Responsibility | Task |
|---|---|---|
| `packages/webview/src/view/open-close.ts` | `openNode`, `closeNode`: the two pure state changes | 4 |
| `packages/webview/src/view/room-boxes.ts` | `roomBoxes`: positioned boxes at their open-aware heights, for `makeRoom` | 4 |
| `packages/webview/src/app/app-open.ts` | `openBox`, `closeBox`: the reducer's two small handlers | 4 |
| `packages/webview/probe/checks-open.js` | probe checks 11 (chevron) and 12 (failure message) | 5 |
| `packages/webview/test/view/graph-state-open.test.ts` | `isOpen`, the default, `mergeExpansion`, `collapseNode` | 2 |
| `packages/webview/test/view/persist-open.test.ts` | saved-view validation of `open` | 2 |
| `packages/webview/test/view/rebuild-graph-open.test.ts` | Refresh carry-over of `open` | 2 |
| `packages/webview/test/graph/nodes/node-box-open.test.tsx` | closed and open rendering (Task 3), chevron and failure strip (Task 5) | 3, 5 |
| `packages/webview/test/view/open-heights.test.ts` | every consumer uses the open-aware height | 3 |
| `packages/webview/test/view/open-close.test.ts` | `openNode`, `closeNode` | 4 |
| `packages/webview/test/app/app-open.test.ts` | the two actions through `reduceApp` | 4 |
| `packages/webview/test/view/open-paths.test.ts` | open, close, Refresh, expansion and Tidy back to back | 4 |

---

### Task 1: Bigger headers

The header is 36px tall and its name is 16px (D13). Nothing about open or closed yet.

**Files:**
- Modify: `packages/webview/src/graph/constants.ts` (`HEADER_HEIGHT`), `packages/webview/src/graph/graph.css` (`.node-name`)
- Test (modify, numbers only): `packages/webview/test/graph/nodes/node-box.test.tsx`, `test/graph/to-flow.test.ts`,
  `test/graph/layout/tidy-graph.test.ts`, `test/view/expansion.test.ts`, `test/view/rebuild-graph-order.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `HEADER_HEIGHT === 36` (every later task derives heights from the constant, never from the number); `.node-name`
  at 16px.

**Behaviour:**
- `HEADER_HEIGHT` becomes 36. In `graph.css`, `.node-name` gets `font-size: 16px;`; `.node-async` (10px) and `.node-input`
  (11px) are untouched. `NodeBox` already sizes the header from the constant.
- Nine existing tests fail on the constant change alone (measured), each on an old number that contains the old header: in
  `node-box.test.tsx` "sizes the header and the code region from the shared constants" (the literal `height:28px`); in
  `to-flow.test.ts` "maps every node with uniform width and analytic height" (literal `28 + 6 * 16 + 8`) and "sizes chips as
  header-only boxes and functions by their lines" (literals `28`, `28 + 12 * 16 + 8`); in `tidy-graph.test.ts` "keeps a
  pinned node where it is and moves a neighbour that ELK put on it" and "clears a pinned node by the row gap of the column gap
  it lays out with" (the literal `84`, both the box height and the position that depends on it); in `expansion.test.ts` "keeps the new nodes clear of nodes already there,
  wherever they were dragged" (the literal top `384`); in `rebuild-graph-order.test.ts` the three "make-room keeps a group in
  order" cases (the literal `TALL = 356`, the height of a 20-line box). Replace each literal with an expression of
  `HEADER_HEIGHT`, `nodeHeight(...)` and `rowGap(...)` so the test states its geometry and survives the next change to a
  constant; the `expansion` top is recomputed from the new heights.

**Approach and traps:**
- Do not touch the `28` minimums of random heights in `placement-property.test.ts`, `placement-order-property.test.ts`,
  `placement-order.test.ts` and `tidy.test.ts`; they are arbitrary box heights, not the header.
- `nodeHeight(node)` still takes one argument in this task; the flag comes in Task 3.
- The probe needs no edit: it compares positions and sizes relatively, and it passed 10 checks with only this change.

**Tests:** no new cases. The nine named cases change as above.

**Steps:**
- [ ] Change the constant and the CSS, and see exactly the nine named tests fail, each on an old number (any other failure is
  a stop-and-report)
- [ ] Rewrite the nine expectations from constants and the box heights, keeping what each proves
- [ ] Verify: `pnpm typecheck`, `pnpm test` (webview 507, others unchanged), `pnpm build` and `pnpm probe` (10 checks) pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`) and propose the commit

Proposed commit message: `make the box headers taller and their names larger`

The implementer does not stage or commit; the coordinator commits after review approval.

### Task 2: The open field

`GraphState` can say which boxes are open; new graphs open only the centre; saves, history, the walk's collapse and Refresh keep
the list (D2, D3, D9). Nothing draws or sizes from it yet.

**Files:**
- Modify: `packages/webview/src/view/types.ts`, `src/view/graph-state.ts`, `src/view/persist.ts`, `src/view/refresh.ts`
- Test (create): `test/view/graph-state-open.test.ts`, `test/view/persist-open.test.ts`, `test/view/rebuild-graph-open.test.ts`

**Interfaces:**
- Consumes: `hasCodeRegion(node)` from `src/graph/nodes/node-size.ts` (exists).
- Produces:

  ```ts
  // view/types.ts, in GraphState (after `pinned`)
  /** Nodes whose code is shown; absent in older saves, which means none. */
  open?: NodeId[];
  // view/graph-state.ts
  export function isOpen(graph: GraphState, nodeId: NodeId): boolean;
  ```

**Behaviour:**
- `graphFromSlice`: `open` is `[focusId]` when `nodes[focusId]` exists and `hasCodeRegion` is true, else `[]`. The result
  always has the field.
- `isOpen`: `graph.open?.includes(nodeId) ?? false`.
- `mergeExpansion` is unchanged (it spreads the graph, so `open` is kept; its new nodes are not listed).
- `collapseNode`: when `open` is present, keep only ids of nodes that stay; an absent `open` stays absent; the existing return
  of the very same graph when the node is not expanded, and the revision rule, are unchanged.
- `isGraphState`: `value.open === undefined || isStringArray(value.open)`. `isConsistent`: every id of `graph.open ?? []` is a
  key of `graph.nodes`.
- `rebuildGraph` (D9): right after `rebuildSlices`, build `rebuilt` as that graph with `open` replaced by the ids in
  `current.open ?? []` that are nodes of it and have a code region; everything after reads this `rebuilt`. The returned graph
  spreads `rebuilt`, so it carries `open`. No height changes yet.

**Approach and traps:**
- `graph-state.ts` gains an import of `hasCodeRegion` from `../graph/nodes/node-size.js`; `node-size.ts` imports only
  constants, so there is no cycle.
- `graph-state.test.ts` (292 lines), `persist.test.ts` and `rebuild-graph.test.ts` get no new cases; use the new files.
- Existing tests that compare whole graphs keep passing because only a new field appears; if one does not, report it.
- Build test graphs for the new `rebuildGraph` cases with `graphFromSlice`, `answerOf`, `tweakNode` and `withPositions` from
  `test/support/graph-states.ts`, setting `open` by hand; `graphAt` and `openAll` do not exist until Task 3.

**Tests:**
- `graph-state-open.test.ts`: `graphFromSlice` lists only the centre in `open`
- `graph-state-open.test.ts`: `graphFromSlice` leaves `open` empty when the centre has no code region
- `graph-state-open.test.ts`: `isOpen` is true for a listed box, false for others and false when `open` is absent
- `graph-state-open.test.ts`: `mergeExpansion` keeps `open` and the boxes it adds are not open
- `graph-state-open.test.ts`: `collapseNode` drops the boxes it removes from `open` and keeps the others
- `graph-state-open.test.ts`: `collapseNode` keeps the open state of a pinned box that stays as a lone box
- `graph-state-open.test.ts`: `collapseNode` leaves an absent `open` absent
- `persist-open.test.ts`: a graph without `open` (an older save) is accepted
- `persist-open.test.ts`: `open: []` and a list of ids in the graph are accepted and survive a JSON round trip
- `persist-open.test.ts`: `open` that is not an array is rejected
- `persist-open.test.ts`: `open` holding a non-string is rejected
- `persist-open.test.ts`: `open` holding an id that is not a node is rejected
- `persist-open.test.ts`: a bad `open` inside a history entry makes `isViewState` false
- `rebuild-graph-open.test.ts`: Refresh keeps the open state of the boxes that survive
- `rebuild-graph-open.test.ts`: a closed centre stays closed after Refresh
- `rebuild-graph-open.test.ts`: an open centre stays open after Refresh
- `rebuild-graph-open.test.ts`: a box that left the graph leaves `open`
- `rebuild-graph-open.test.ts`: a box new to the graph is closed
- `rebuild-graph-open.test.ts`: a graph with no `open` rebuilds with an empty list

**Steps:**
- [ ] Write the 19 cases and see them fail for the right reason
- [ ] Add the field, `isOpen`, the `graphFromSlice` default and the `collapseNode` change
- [ ] Add the validation to `persist.ts` and the carry-over to `rebuildGraph`
- [ ] Verify: `pnpm typecheck`, `pnpm test` (webview 526), `pnpm build` and `pnpm probe` (10 checks) pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `track which boxes are open and keep that through saves, collapse and refresh`

The implementer does not stage or commit; the coordinator commits after review approval.

### Task 3: Draw what is open

Every height comes from `nodeHeight(node, open)`, so non-centre boxes are laid out and drawn at header height, and `NodeBox`
draws no code in a closed box (D4, D10, D11).

**Files:**
- Modify (source): `packages/webview/src/graph/nodes/node-size.ts`, `src/graph/to-flow.ts`, `src/view/expansion.ts`,
  `src/view/refresh.ts`, `src/graph/viewport/reveal.ts`, `src/graph/layout/tidy-graph.ts`, `src/graph/nodes/NodeBox.tsx`,
  `src/graph/nodes/SpiderNode.tsx`, `src/graph/graph.css`
- Modify (test support): `test/support/graph-states.ts`, `test/support/geometry.ts`, `test/support/refresh-order.ts`,
  `test/support/order-graphs.ts`, `test/support/pinned-column.ts`
- Modify (tests): `test/graph/nodes/node-size.test.ts`, `test/graph/to-flow.test.ts`, `test/graph/viewport/reveal.test.ts`,
  `test/graph/nodes/node-box.test.tsx`, `test/view/expansion.test.ts`, `test/view/graph-column-gap.test.ts`,
  `test/graph/layout/tidy-graph.test.ts`, `test/graph/layout/tidy-graph-order.test.ts`,
  `test/graph/layout/tidy-pinned-order.test.ts`, `test/graph/layout/layout-graph.test.ts`,
  `test/graph/layout/layout-order-property.test.ts` (only if it fails), `test/view/rebuild-graph-placement.test.ts`,
  `test/view/rebuild-graph-order.test.ts`, `test/view/rebuild-graph-order-edges.test.ts`,
  `test/view/rebuild-graph-order-property.test.ts`, `test/view/rebuild-graph-property.test.ts`
- Test (create): `test/graph/nodes/node-box-open.test.tsx`, `test/view/open-heights.test.ts`

**Interfaces:**
- Consumes: `isOpen`, `GraphState.open` (Task 2); `hasCodeRegion`, `codeRegionHeight` (exist).
- Produces:

  ```ts
  // graph/nodes/node-size.ts
  export function nodeHeight(node: Sized, open: boolean): number;
  // graph/to-flow.ts
  export type SpiderNodeData = {
    node: GraphNode; isFocus: boolean; pinned: boolean; open: boolean; labels: readonly LabelLine[];
  };
  // graph/nodes/NodeBox.tsx: NodeBoxProps gains
  open?: boolean;
  // test/support/graph-states.ts
  export function openAll(graph: GraphState): GraphState; // open = ids of every node with a code region
  // test/support/geometry.ts
  export const OPEN_HEIGHT: number;   // nodeHeight({ lineCount: 3, codePreview: "x" }, true)
  export const CLOSED_HEIGHT: number; // nodeHeight({ lineCount: 3, codePreview: "x" }, false) === HEADER_HEIGHT
  ```

**Behaviour:**
- `nodeHeight`: D4. Every `src` caller passes `isOpen(graph, id)` for the graph it is working on: `toFlowNode` computes `open`
  once and uses it for `height`, `measured.height` and `data.open`; `rectsOf`; the anchor and the added nodes in
  `applyExpansion` (the added nodes are looked up in `merged.graph`, where they are closed); `keptBoxes` and the `heights` map
  in `rebuildGraph`, both from the `rebuilt` graph that already carries `open`; `revealRect`; `sizesOf`.
- `NodeBox` (D10): `open` defaults to closed; it shows code only when `open` is true and `hasCodeRegion(node)`; a closed box has
  no `<pre>`; the `.node-box` classes get `is-open` or `is-closed`; in `graph.css` add `.node-box.is-closed .node-header` to the
  existing rule that removes the header's bottom border. `SpiderNode` passes `open={data.open}`. `Markers`, the failure strip
  and the chevron are untouched in this task.
- Test support: `rectOf` in `geometry.ts` uses `isOpen`; `HEIGHT` in `refresh-order.ts` becomes `OPEN_HEIGHT` (keep exporting
  the name `HEIGHT`); `graphAt` returns `openAll(...)` of what it built; `randomGraph` in `order-graphs.ts` returns
  `openAll(graph)` and `crowded` uses `isOpen`; `laidOutCalls` in `pinned-column.ts` opens all its boxes. `graphOf` keeps
  returning the default state (only the centre open).

**Approach and traps:**
- **Test migration is the bulk of this task.** After the signature change the plan author's throwaway copy had 38 existing
  cases failing; 20 in 13 files stayed failing after three builders (`graphAt`, `randomGraph`, `laidOutCalls`) opened all their
  boxes. The causes are: (a) a box
  that an answer or an expansion brings is closed, so expected tops that assumed a code-height new box change (all the
  `rebuild-graph-*` and `expansion`/`graph-column-gap` cases); (b) graphs built by `graphFromSlice` or `graphOf` have only the
  centre open, so expectations about other boxes' heights change (`to-flow`, `reveal`, `tidy-graph`, `tidy-graph-order`,
  `tidy-pinned-order`, `layout-graph`); (c) calls to `nodeHeight(node)` need the flag (`node-size`, `reveal`,
  `rebuild-graph-placement`, `expansion`, `graph-column-gap`, `tidy-graph-order`, and the support files). For each: either open
  the boxes the test is about (`openAll`) when the test is about unequal tall boxes, or recompute the expected number from
  `OPEN_HEIGHT`, `CLOSED_HEIGHT`, `HEADER_HEIGHT` and `rowGap(...)`. Do not paste computed literals.
- The four property tests (`rebuild-graph-property`, `rebuild-graph-order-property`, `tidy-pinned-order`,
  `layout-order-property`) carry counters that prove they reach hard shapes; keep the counters' minimums, open more boxes in the
  generator if a counter drops, and stop and report if that does not restore it.
- `to-flow.test.ts` (241 lines) takes the three new cases below and stays under 300.
- `refresh.ts` still has its private `keptBoxes`; Task 4 moves it. Keep `rebuildGraph`'s order of operations exactly (M3c D5).
- Do not add `aria` or other attributes; the chevron is Task 5.

**Tests:**
- `node-size.test.ts`: a closed box is the header height whatever its line count
- `node-size.test.ts`: an open box with no code region is still the header height
- `to-flow.test.ts`: in a fresh graph the centre is full height and every other box is the header height
- `to-flow.test.ts`: a box listed in `open` gets the full height in `height` and in `measured`, and `data.open` is true
- `to-flow.test.ts`: `data.open` follows `isOpen` for every node
- `reveal.test.ts`: an open box counts at its full height in the revealed rectangle
- `node-box-open.test.tsx`: a closed box renders the header and no `<pre>` or `node-code`
- `node-box-open.test.tsx`: an open box renders the code region with the same height style as before
- `node-box-open.test.tsx`: `.node-box` carries `is-closed` when closed and `is-open` when open
- `node-box-open.test.tsx`: a box with no code region is `is-closed` and has no `<pre>` even when `open` is true
- `node-box-open.test.tsx`: without the `open` prop the box is closed
- `open-heights.test.ts`: `rectsOf` gives an open box its full height and a closed box the header height
- `open-heights.test.ts`: `applyExpansion` centres the new column on the full height of an open expanded box
- `open-heights.test.ts`: `applyExpansion` keeps new boxes clear of an open box's code region
- `open-heights.test.ts`: `applyExpansion` stacks new boxes at the closed height, a row gap apart
- `open-heights.test.ts`: `rebuildGraph` gives room to an open kept box that grew, pushing the box below by the overlap
- `open-heights.test.ts`: `rebuildGraph` moves nothing when a closed box's code grew
- `open-heights.test.ts`: `rebuildGraph` places a new box at the closed height
- `open-heights.test.ts`: `tidyGraph` (fake layout) keeps clear of a pinned open box by its full height and of a pinned closed box by the header only
- `open-heights.test.ts`: `layoutGraph` (real ELK) keeps the row gap between an open and a closed box in one column
- Existing cases named in the approach change as described; `node-box.test.tsx` gets `open: true` in its `render` helper and in
  its two direct `renderToStaticMarkup` calls, so its existing cases keep meaning "an open box".

**Steps:**
- [ ] Write the 20 new cases and the support helpers; see the new cases fail
- [ ] Change `nodeHeight`, let the compiler list the callers, pass `isOpen` at each (D4)
- [ ] Add `data.open`, the `NodeBox` `open` prop, the closed rendering and the CSS rule
- [ ] Migrate the existing tests as described; every migrated case still proves what it proved
- [ ] Verify: `pnpm typecheck` (both tsconfigs), `pnpm test` (webview 546), `pnpm build` and `pnpm probe` (10 checks, unchanged) pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `draw boxes closed or open and size them by what is shown`

The implementer does not stage or commit; the coordinator commits after review approval.

### Task 4: Open and close a box

The two pure state changes, the reducer actions that use them, and the `NodeActions` and `App` wiring (D5, D6, D8). Nothing in
the UI calls them yet.

**Files:**
- Create: `packages/webview/src/view/open-close.ts`, `src/view/room-boxes.ts`, `src/app/app-open.ts`
- Modify: `src/view/refresh.ts` (uses `roomBoxes`), `src/app/app-state.ts`, `src/graph/nodes/node-context.ts`, `src/App.tsx`
- Test (create): `test/view/open-close.test.ts`, `test/app/app-open.test.ts`, `test/view/open-paths.test.ts`

**Interfaces:**
- Consumes: `isOpen` (Task 2); `nodeHeight(node, open)`, `OPEN_HEIGHT`, `CLOSED_HEIGHT`, `openAll` (Task 3); `makeRoom`, `RoomBox`
  (`graph/layout/make-room.ts`); `hasCodeRegion`; `replaceCurrent` (`view/view-state.ts`).
- Produces:

  ```ts
  // view/open-close.ts
  export function openNode(graph: GraphState, nodeId: NodeId, columnGap: number): GraphState;
  export function closeNode(graph: GraphState, nodeId: NodeId): GraphState;
  // view/room-boxes.ts
  export function roomBoxes(graph: GraphState, positions?: Record<NodeId, Point>): RoomBox[];
  // positions defaults to graph.positions; a node without a node entry is skipped
  // app/app-open.ts
  export function openBox(state: AppState, nodeId: NodeId): AppState;
  export function closeBox(state: AppState, nodeId: NodeId): AppState;
  // app/app-state.ts, LocalAction gains
  | { type: "nodeOpened" | "nodeClosed"; nodeId: NodeId }
  // graph/nodes/node-context.ts, NodeActions gains
  onOpen: (nodeId: NodeId) => void;
  onClose: (nodeId: NodeId) => void;
  ```

**Behaviour:**
- `openNode`, `closeNode`: D5 and D6 exactly. The opened graph is `{ ...graph, open: [...(graph.open ?? []), nodeId] }` before
  `roomBoxes` is computed from it, so the opened box is measured at its full height. The result merges only the positions
  `makeRoom` returned and adds one to `revision`. No `pinNodes` or `setPositions` call (they would add a second revision or
  pin).
- `roomBoxes(graph, positions)`: one `{ id, rect }` per entry of `positions` whose node exists, `rect` at the stored point,
  `NODE_WIDTH` wide, `nodeHeight(node, isOpen(graph, id))` high. `refresh.ts` calls it where it called `keptBoxes(rebuilt,
  restacked.positions)` and the private function goes; the refresh tests stay green unchanged.
- `openBox`/`closeBox`: D8. `openBox` passes `current.columnGap ?? state.view.columnGap`, returns `state` itself when
  `openNode` returned the same graph or there is no current graph, and otherwise
  `{ ...state, view: replaceCurrent(state.view, graph) }`. They do not look at `busy`, `loading` or `refreshing`.
- `reduceApp` gets one union member and two `case` lines (`nodeOpened`, `nodeClosed`); `app-state.ts` stays near 252 lines.
  `App.tsx` adds `onOpen` and `onClose` to the `actions` memo, each a `dispatch` of the matching action.

**Approach and traps:**
- `makeRoom` sorts by top, then x, then id, and treats the fixed set as obstacles from the start, so putting the opened id into
  `pinned` is what stops the opened box from being pushed by a box that sorts before it. Pass no chains.
- Only `makeRoom`'s result is applied; a box it did not return did not move.
- Cross-path tests (`open-paths.test.ts`) build their graph with `graphFromSlice`, `calledSlice` and `withPositions`, positions
  one `CLOSED_HEIGHT + rowGap(192)` apart in a column, because `graphAt` opens everything.
- Tidy in the cross-path test uses the real `tidyGraph` with the real `layoutGraph` (about 0.3 s); Refresh uses `rebuildGraph`
  with `answerOf`.
- `open-close.ts` imports from `graph/layout/`, the same direction `view/refresh.ts` and `view/expansion.ts` already use.

**Tests:**
- `open-close.test.ts`: opening adds the id to `open` and adds exactly one to the revision
- `open-close.test.ts`: opening an open box, a missing box or a box with no code region returns the very same graph
- `open-close.test.ts`: opening pushes the box directly below down until it clears the opened box by the row gap
- `open-close.test.ts`: a box that is already clear, above, beside or in another column does not move
- `open-close.test.ts`: the opened box does not move
- `open-close.test.ts`: the push cascades down a column of four boxes, keeping their order and the row gap
- `open-close.test.ts`: a pinned box below is not moved even if it is now overlapped, and an unpinned box skips below it
- `open-close.test.ts`: the row gap used follows the column gap (32 and 480)
- `open-close.test.ts`: a box without a position opens and nothing moves
- `open-close.test.ts`: a pushed box is not pinned and the input graph is not modified
- `open-close.test.ts`: closing removes the id, adds one to the revision and moves nothing
- `open-close.test.ts`: closing a closed or missing box, or any box when `open` is absent, returns the very same graph
- `open-close.test.ts`: opening again after a close moves nothing further
- `app-open.test.ts`: `nodeOpened` opens the box in the current graph and replaces the view's current
- `app-open.test.ts`: `nodeOpened` with no graph showing, an unknown id or a chip returns the very same state
- `app-open.test.ts`: the push uses the graph's own column gap rather than the view's
- `app-open.test.ts`: `nodeOpened` and `nodeClosed` work while busy, loading and refreshing
- `app-open.test.ts`: `nodeClosed` closes an open box and returns the same state for a closed one
- `app-open.test.ts`: Back restores the earlier graph with its own open state
- `app-open.test.ts`: a `refreshed` answer that arrives after a box was opened keeps it open and keeps the pushed positions
- `app-open.test.ts`: a view saved after opening a box and restored by `createAppState` still has it open
- `open-paths.test.ts`: open a box, then Refresh with unchanged code: nothing moves, the open state is kept and nothing is added
- `open-paths.test.ts`: open then close a box, then Refresh with unchanged code: nothing moves
- `open-paths.test.ts`: open a box then expand it with the walk: the new called boxes centre on its open height and nothing overlaps
- `open-paths.test.ts`: open a box then Tidy: every column is clear by the row gap at open heights; close it and Tidy again: the positions equal those of a Tidy of the same graph that was never opened

**Steps:**
- [ ] Write the 25 cases and see them fail for the right reason
- [ ] Write `roomBoxes` and switch `refresh.ts` to it; the refresh tests still pass
- [ ] Write `openNode`, `closeNode`, `app-open.ts`; add the action, the two cases, `NodeActions` and the `App` wiring
- [ ] Verify: `pnpm typecheck`, `pnpm test` (webview 571), `pnpm build` and `pnpm probe` (10 checks, unchanged) pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `open a box to push the boxes below it down, and close it without moving anything`

The implementer does not stage or commit; the coordinator commits after review approval.

### Task 5: The chevron, the click and the failure message

A click opens a box, a chevron in the header opens and closes it, the failure message hangs below the box, and the probe proves
all of it on the real page (D7, D10, D11, D12).

**Files:**
- Modify (source): `packages/webview/src/graph/nodes/NodeBox.tsx`, `src/graph/nodes/node-context.ts`,
  `src/graph/nodes/SpiderNode.tsx`, `src/graph/GraphView.tsx`, `src/graph/graph.css`
- Modify (test): `test/graph/nodes/node-box.test.tsx` (two cases), `test/graph/nodes/node-box-open.test.tsx` (add cases)
- Modify (probe): `probe/page-helpers.js`, `probe/fixtures.js`, `probe/checks-basic.js`, `probe/main.js`
- Create (probe): `probe/checks-open.js`

**Interfaces:**
- Consumes: `NodeActions.onOpen`, `onClose` (Task 4); `SpiderNodeData.open`, `NodeBoxProps.open` (Task 3); `ID`, `PROJECT`,
  `messages` from `probe/fixtures.js`; `assert`, `assertSamePositions` from `probe/harness.js`.
- Produces:

  ```ts
  // graph/nodes/NodeBox.tsx: NodeBoxProps gains
  onOpen?: NodeActions["onOpen"];
  onClose?: NodeActions["onClose"];
  // graph/nodes/node-context.ts: NodeContextValue gains
  onOpen: NodeActions["onOpen"];
  onClose: NodeActions["onClose"];
  // probe/fixtures.js: messages gains
  expandFailed(nodeId, generation, message) // { type: "expandFailed", nodeId, generation, message }
  ```

  The DOM contract the probe and the documents rely on: a `button.node-control` inside the header's `.node-controls` with
  `aria-label` and `title` "Show code" or "Hide code"; `.node-box.is-open` / `.node-box.is-closed`; `.node-failure` as a sibling
  after `.node-box`.

**Behaviour:**
- Chevron (D7): in `Markers`, a `button` of type `button`, class `node-control`, `title` and `aria-label` "Show code" when the
  box is closed and "Hide code" when open, an inline SVG 12 by 12 on a `0 0 16 16` viewBox with `fill="currentColor"` like
  `PinIcon`, a right-pointing chevron whose path carries `transform="rotate(90 8 8)"` only when open (so it points down). Its
  `onClick` calls `onClose` when open and `onOpen` when closed, with the node id. It renders only for a box with a code region
  and comes after the pin and the spinner. `Markers` returns null only when the box is not pinned, not loading and has no code
  region. The span's existing `stop` handlers already keep the click away from the node; add none to the button.
- Context (D11): `NodeContextValue` gains `onOpen`/`onClose`; `GraphView` takes them from `actions` and puts them in the
  `context` memo and its dependency list; `SpiderNode` passes them to `NodeBox` with the other controls.
- Click (D7): `onNodeClick` posts `nodeClickMessage` when there is one and then calls `onOpen(node.id)`; the `justUnpinned`
  early return stays first; `onOpen` joins the callback's dependency list. `onNodeDoubleClick` does not change.
- Failure strip (D12): `NodeBox` returns a fragment: the `.node-box` div, then the `.node-failure` div (same `role="alert"`,
  `title` and text) when `failure` is set. CSS: remove `bottom: 0`, add `top: 100%`, give it a border on all sides instead of
  `border-top`, and `border-radius: 0 0 4px 4px`; keep left and right 0, `position: absolute` and the rest.
- Probe, in the order of the file:
  - `page-helpers.js` `nodes()`: add `open: element.querySelector(".node-code") !== null` and `failureTop:
    element.querySelector(".node-failure")?.getBoundingClientRect().top`.
  - `fixtures.js` `messages.expandFailed`.
  - Check 1 (`centreDraws`) also asserts: only `main` is open (`open` true for it, false for `helper` and `format`); a closed
    box's on-screen height is the header height times the zoom, within 1px (36 flow pixels); `.node-name` has computed font
    size `16px`.
  - Check 2 (`clickOpensEditor`, renamed "a click opens the editor and the box, and does not pin") keeps its two clicks (travel
    0 and 3) and its `openInEditor` assertions, and replaces "a click moved nothing" by: `main` and `helper` have not moved;
    `helper` is open and its code contains `validate`; `format` is still closed, has the same x, and its y grew by exactly the
    code region of a three-line function, 56 flow pixels (3 lines at 16 plus 2 at 4), within 1; nothing is pinned. The measured
    run: `format` went from y 80 to y 136.
  - Check 5 (`reloadRestores`) also asserts that every box's `open` flag is the same after the reload.
  - Check 11 (new, `checks-open.js`, "the chevron opens and closes a box without jumping"): remember the counts of
    `openInEditor` and `expand` messages and every box's position and pin; click the centre of `late`'s
    `[aria-label="Show code"]`; wait until `late` is open; `helper`, which sits below it, moved down by at least the 56-pixel
    code region (at least, not exactly, because `format` was dragged next to that column in check 4 and a pinned box can
    push it further); every other box is where it was; click `[aria-label="Hide code"]`; wait until `late` is closed; nothing
    moved compared with the open state; the two message counts are unchanged; no pin changed.
  - Check 12 (new, "a failure message hangs below a closed box"): `extra` is closed; send `messages.expandFailed(ID.extra,
    shared.generation, "Could not expand: gone")`; wait for `failureTop`; assert `failureTop` is at or below the box's bottom
    (`top + height - 1`) and that the box's height did not change (within 0.5).
  - `main.js` appends `...require("./checks-open.js")` to `checks` after `checks-detail.js`. The probe then has 12 checks.

**Approach and traps:**
- The wrapper `.react-flow__node` is the containing block for `top: 100%` because React Flow positions it absolutely and gives it
  an explicit height; the strip must be a sibling of `.node-box`, not inside it (`overflow: hidden` would clip it).
- `node-box.test.tsx`: "renders a spinner while loading" asserts there is no `<button`; a code box now has the chevron, so
  assert there is no `Unpin` button instead. "renders no marker markup when idle or without props" uses a function box; run it on
  a chip (`codePreview: ""`) instead, since a code box now always has a chevron.
- Checks 11 and 12 depend on the state the earlier checks leave: after check 10 the called column reads `extra`, `late`,
  `helper` top to bottom, `helper` is open (check 2), `format` is pinned elsewhere, and `shared.generation` was set by check 3.
  Keep them last.
- The `stop` handlers are on the `.node-controls` span; if the chevron were outside it, a chevron click would jump and open. Check
  11 would fail on the message counts.
- After adding check 2's new push assertion, `pickDrag` in check 4 still finds a free spot in the 1200 by 800 window (the throwaway
  run did); if it does not, change `DRAG_OFFSETS`, not the layout.
- **Prove each new assertion by breaking the code it guards, watching the named check fail, and restoring.** Remove the
  `onOpen(node.id)` call (check 2 fails: not open); make `openNode` skip `makeRoom` (check 2: the box below did not move); return
  the full height for a closed box (check 1); delete `font-size: 16px` (check 1); remove the span's `onClick={stop}` (check 11:
  the chevron jumped); put `bottom: 0` back and drop `top: 100%` (check 12). Report each, and finish with `git diff` showing no
  residue of the breaks.
- `checks-basic.js` is 258 lines and grows by about 30; keep it under 300.

**Tests:**
- `node-box-open.test.tsx`: a closed box with a code region shows the chevron titled and labelled "Show code"
- `node-box-open.test.tsx`: an open box shows it titled and labelled "Hide code"
- `node-box-open.test.tsx`: only the open chevron is rotated 90 degrees
- `node-box-open.test.tsx`: a box with no code region has no chevron, even when `open` is true
- `node-box-open.test.tsx`: in `.node-controls` the chevron comes after the pin and the spinner
- `node-box-open.test.tsx`: the failure message is a sibling after the box, outside it (the markup before it has as many closing as opening `div`s), with its `role="alert"`, title and text
- `node-box.test.tsx`: the two marker cases above change as described
- Probe: check 1 extended, check 2 rewritten, check 5 extended, check 11 and check 12 new; checks 3, 4 and 6 to 10 unchanged and passing

**Steps:**
- [ ] Write the 6 unit cases and the probe changes first; see the unit cases and probe checks 2, 11 and 12 fail (the new
  assertions of checks 1 and 5 test earlier tasks and pass at once)
- [ ] Add the chevron, the context members, the `SpiderNode` wiring and the click in `GraphView`
- [ ] Move the failure strip out of the box (markup and CSS)
- [ ] Show each new probe assertion fails when its code is broken, then restore (list above)
- [ ] Verify: `pnpm typecheck`, `pnpm test` (webview 577), `pnpm build` pass and `pnpm probe` passes 12 checks
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `open a box on click, add the chevron and hang the failure message below the box`

The implementer does not stage or commit; the coordinator commits after review approval.

### Task 6: Documents

The README and the main design spec say what a user now sees (D1, D7, D13). No code changes.

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-08-22-code-spider-design.md`

**Interfaces:**
- Consumes: the behaviour built in Tasks 1 to 5.
- Produces: text only. `packages/extension/README.md` is a generated copy (gitignored, written by `package:vsix`) and is not
  edited.

**Behaviour:**
- README, plain words, no relative links, no images, and nothing that looks like `#` followed by a digit (the extension's
  `readme.test.ts` forbids those):
  - Replace the sentence "Each box shows a function's name and the start of its code." with: "Each box shows a function's name.
    The box in the middle also shows the start of its code (it is open); every other box starts closed, with just its name."
  - Replace the first bullet with: "Click a box to jump to that function in the editor. The box opens to show the start of its
    code, and any boxes below it move down to make room."
  - Add a bullet after it: "Click the small arrow at the right of a box's name to open or close the box. Closing a box leaves
    the other boxes where they are; press `Tidy` to line them up again. Boxes that have no code of their own, such as code from
    outside your project, have no arrow and do not open."
  - Append to the double-click bullet: "A double-click also opens the box."
  - In the `Tidy` bullet, append: "It also removes the empty space left by boxes you closed."
- Main design spec (each edit local, surrounding text kept):
  - §7.6, after "Every node renders as a box: a two-part header ... above a code region.": "A box is open or closed. Closed, it is
    only the header; open, it also shows the code region. The box in the middle starts open and every other box starts closed.
    A click on a box jumps to its code and opens it, pushing the unpinned boxes below it down to make room; a small arrow in the
    header opens and closes it. Closing leaves the other boxes where they are, and Tidy packs them again."
  - §7.6 sizing: the formula line becomes "height = header, plus clamp(lineCount, 3, 25) × lineHeight when the box is open", and the
    sentence "A side benefit: variable heights make a zoomed-out graph encode complexity visually. A tall box is a long
    function ..." has "A tall box" changed to "A tall open box".
  - §7.7: "Clicking a node calls `showTextDocument` and reveals its declaration range." gets "and opens the node in the graph"
    before its full stop.
  - §8, the paragraph beginning "Inside the panel, a double-click on a box expands it in place": add the sentence "A click
    opens a box to show its code and a small arrow in its header closes it again; boxes start closed except the one in the
    middle."
  - §9, the probe bullet: "runs ten checks" becomes "runs twelve checks", and "the Lines switch and a refresh that swaps and
    inserts calls" becomes "the Lines switch, a refresh that swaps and inserts calls, the chevron and the failure message".
  - §10, after the last "Done in M3c" bullet: "- Done after M4 (2026-10-13): boxes start closed, showing only the header, except
    the one in the middle; a click jumps to the code and opens the box, pushing the boxes below it down; a small arrow in the
    header opens and closes it; the header text is larger."

**Approach and traps:**
- Match the exact existing sentences before replacing; if one has moved since this plan, change the nearest equivalent and say so.
- `pnpm test` runs `readme.test.ts` in the extension package; run it, not just the webview tests.
- No claim about the owner's manual checks goes in any document.

**Tests:** no new cases; `pnpm test` (all four packages) is the check that the README sentences the extension tests read are intact.

**Steps:**
- [ ] Edit the README as above and re-read it for plain words
- [ ] Edit the main design spec as above
- [ ] Verify: `pnpm test` (webview 577, extension 216), `pnpm typecheck` and `pnpm build` pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`) and propose the commit

Proposed commit message: `describe closed and open boxes in the readme and the design spec`

The implementer does not stage or commit; the coordinator commits after review approval.

---

## Owner's manual checks (NOT RUN by anyone; the owner runs them)

Setup: `pnpm build`, F5 "Run Code Spider" on `test-code/basic`, open `src/signup.ts`, cursor in `handleSignup`, `Shift+Alt+Q`. Use a
scratch copy for edits.

1. The boxes start closed except the centre: `handleSignup` shows its code, and `validateUser`, `createUser`, `sendWelcome`,
   `main` and `retry` show only their names, in a larger type than before.
2. Click `validateUser`: the editor jumps to it, the box opens, and the boxes below it in the same column move down; boxes in
   other columns do not move.
3. Click the arrow in an open box's header: it closes and nothing else moves. Click the arrow of a closed box: it opens and the
   editor does not jump.
4. Double-click a closed function box: the editor jumps, the box opens and the functions around it are drawn; double-click it
   again and they go.
5. Reload the VS Code window (or the webview): the boxes you opened are still open, the others closed.
6. Open two boxes, close one, press Tidy: the empty space left by the closed box goes.
7. Drag a box under an open one, then open the box above it: the dragged box stays where it is (it may be partly covered).
8. Zoom out below half: the function names are easy to read and the code is grey bars.
9. Edit a function in the scratch copy, save, press Refresh: open boxes stay open, closed boxes stay closed, and the centre stays
   as you left it.
10. Optional, hard to trigger: in the scratch copy, rename a function so a double-click on its old box fails: the failure
    message shows under the box, not over its name.
