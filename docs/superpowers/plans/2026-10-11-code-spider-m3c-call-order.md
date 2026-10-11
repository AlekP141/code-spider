# Code Spider M3c: Call Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to
> validate this plan and hand it to `subagent-driven-development` for
> task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the functions a function calls from top to bottom in the order the calls appear in the code: on the first
layout, on Tidy, when a box is expanded and on Refresh.

**Architecture:** One pure module (`graph/call-order.ts`) decides every ordering. The first layout and Tidy share one new
function, `layoutGraph`, which feeds ELK in that order and then re-sorts each column, because ELK's own options do not
guarantee it. Expansion and Refresh stack called boxes with the same module. The protocol, `GraphState`, the worker and the
extension do not change; core gets one fix so the first call site is kept.

**Tech Stack:** As M3b: TypeScript 5.6+ (strict, `noUncheckedIndexedAccess`), pnpm workspaces, esbuild, React 19.3,
`@xyflow/react` 12.12, `elkjs` 0.12 (`elk.bundled.js`), ts-morph in core, Vitest 2. **No new dependencies.**

**Spec:** none, by the owner's choice ("this is a simpler and smaller task, skip the spec and go straight to the plan").
The Design section is the source ("D1" to "D10"). Background: docs/superpowers/specs/2026-10-11-code-spider-m3b-design.md
("section n") and docs/superpowers/specs/2026-08-22-code-spider-design.md ("§n").

**Status:** not started. Baseline at commit `c13a574`, all passing: core 248, CLI 39, webview 405, extension 206, smoke 7,
`pnpm probe` 9 checks. The owner's manual checks (D10) have NOT been run.

## Design (agreed 2026-10-11, no separate spec)

**Request.** "for the nodes of functions that are called within the selected function, they should always be displayed in
the order that they are in the code. From top to bottom." For `handleSignup` in `test-code/basic` the boxes on the left must
read `validateUser`, `createUser`, `sendWelcome`. Today they come out `validateUser`, `sendWelcome`, `createUser`.
**Owner's decision.** On Refresh, called boxes are put in code order: a new call's box is inserted in its place and the
boxes below slide down; reordered calls swap; boxes the user dragged (pinned) stay exactly where they are; nothing moves if
the order is already right. This amends M3b's "Refresh keeps positions and only makes room" for called boxes only.

1. **D1 Code order.** An edge runs from the called function (`from`, the supplier) to the caller (`to`); called boxes sit one
   column to the left of their caller. For a function F, the place of a called function G is the earliest `callSite` among
   the graph's edges G to F of any kind (`call`, `jsx`, `external`, `passes`), compared by `startLine`, `startColumn`,
   `endLine`, `endColumn`, then node id. A function called twice sits at its first call. Unresolved boxes (`unknown:` ids,
   edge kind `call`, `resolved: false`) and external boxes (`external:` ids, edge kind `external`) count. A call inside
   another call's arguments (`a(b())`) is placed by where it starts, so `a` comes first. Callers (the right side) have no
   code order and keep id order.
2. **D2 The walk.** One pure module, `graph/call-order.ts`, decides all ordering. `calledInOrder(nodeId, edges)` returns the
   suppliers of `nodeId` in code order (a self edge is ignored). `walkOrder(graph)` starts at `focusId`, visits a node, then
   each of its called functions in code order, then each of its callers in id order, depth first, never twice; nodes not
   reached are appended in id order. Only edges with both ends in `nodes` count.
3. **D3 A new graph and Tidy.** `layoutGraph(graph, columnGap)` in `graph/layout.ts` serves `use-layout.ts` (first layout)
   and `tidy-graph.ts` (whose injectable `layout` becomes this function). It (1) gives ELK its nodes in walk order and its
   edges ordered by the walk position of `to`, then of `from`, with the options `elk.layered.considerModelOrder.strategy`
   = `NODES_AND_EDGES` and `elk.layered.crossingMinimization.forceNodeModelOrder` = `true`; (2) runs ELK; (3) re-sorts every
   column with `orderColumns` (`graph/order-columns.ts`). A column is the nodes with the same x (within the existing
   tolerance). Its ELK tops, sorted ascending, are its slots; the k-th node of the column in walk order takes the k-th slot;
   then one sweep from the top makes each top at least the previous box's bottom plus the row gap. x never changes.
   Guarantee, by construction and pinned by tests: after a fresh layout, or a Tidy with nothing pinned, every column is top
   to bottom in walk order with no two boxes closer than the row gap. So each function's called boxes that share a column
   are in code order, except a box the walk reached earlier through another function. Evidence (throwaway scripts against
   elkjs 0.12.0, not kept): on 300 seeded random graphs, with no option 273 had a column out of walk order and with both
   options 78 still did, typically when a called function also shows other callers. So the re-sort is the guarantee; the
   options only bring ELK's coordinates closer. In the same scripts ELK's columns were always exactly one pitch (node width
   plus column gap) apart. Tidy with pinned boxes is otherwise unchanged: `tidyPositions` receives the
   re-sorted positions, pinned boxes stay, a box too close to one moves to the nearest free place and may then be out of
   order. User positions win.
4. **D4 Expanding a box (`placeExpansion`).** The left column (the newly added called functions of the expanded box) is
   stacked in code order of the expanded function; the right column stays in id order. `Placement.edges` must carry
   `callSite`. Every column keeps its order when something is in the way: the first box takes the nearest free place to its
   preferred top as today (`nearestFreeY`, a tie goes up); each later box goes at the lowest free place at or below both its
   preferred top and the previous box's bottom plus the row gap. Unchanged: boxes already on screen never move on expand;
   nothing overlaps; with nothing in the way the stack is centred on the expanded box exactly as today.
5. **D5 Refresh (`rebuildGraph`).** For the centre and then each applied expansion, in the order the rebuild applies them,
   the function's group is its called functions per that slice's edges that kept a position, are not pinned, stand in that
   function's called column (x equal to the function's x minus one pitch, pitch = node width plus the column gap
   `rebuildGraph` is given, within the existing tolerance), and are not already in an earlier function's group. If the
   group's top-to-bottom order equals code order and the slice brings no new called function, the group is untouched (so
   unchanged code moves nothing, as in M3b). Otherwise the group plus the slice's new called functions is restacked in code
   order, one row gap apart, from the top of the topmost existing member, in the same column; the new boxes count as `added`
   (they fade in). A function with no existing group member places its new boxes through `placeExpansion` as today. Then
   make-room runs over everything (only downward, pinned fixed). Invariant, stated and tested: make-room cannot reverse a
   restacked group, because its members are exactly one row gap apart, are processed top first and only slide down, so a
   member that slides forces the next to slide below it. Pinned boxes never move and belong to no group. New callers are
   placed as in M3b. A graph laid out before this milestone has groups in id order, so its first Refresh restacks them.
   Today make-room runs before any new box is placed; the exact new order of operations is in Task 4.
6. **D6 Core.** `putEdge` keeps the first call site per (from, to, kind), and `collectCalleeEdges` walks every call
   expression before every `new` expression, so when one target is both called and created with `new` the kept site can be
   the later one. Invocations are processed in source order. Call and `new` share the edge kind `call` (both go through
   `addCallEdge` and `addNodeEdge`, and `edgeId` gives `from->to` for kind `call`), so they are one edge. No type or
   protocol change; goldens are expected to be unchanged.
7. **D7 Unchanged.** The message protocol, `GraphState`, `ViewState` (so saved panels), the worker and the extension package.
   Back graphs and saved graphs keep their layout until Tidy or Refresh. Dragging and pinning.
8. **D8 Out of scope.** An order for callers; numbering lines or boxes; ordering where lines attach to a box; moving pinned
   boxes; moving existing boxes on expand; re-sorting on Back.
9. **D9 Risks.** Order now wins over fewest crossings, so graphs with shared functions can show more crossing lines. The
   column re-sort can leave a box less well aligned with its neighbours than ELK had it. A restack can push unrelated boxes
   down through make-room. The "same column" rule depends on the pitch of the gap the graph was laid out with: a graph keeps
   its own `columnGap` (set by layout and Tidy) and `rebuildGraph` receives it, so moving the slider after layout changes
   nothing for that graph; only a saved graph with no `columnGap` falls back to the view's gap, may miss its column, is not
   restacked, and gets M3b's behaviour.
10. **D10 Owner's manual checks (NOT RUN by anyone; the owner runs them).** Setup: `pnpm build`, F5 "Run Code Spider" on
    `test-code/basic`, open `src/signup.ts`, cursor in `handleSignup`, `Shift+Alt+Q`; use a scratch copy for edits.
    (1) The three boxes on the left read `validateUser`, `createUser`, `sendWelcome`. (2) Expand a box that calls several
    functions: its new boxes are in code order. (3) Swap two calls in `handleSignup`, save, Refresh: the two boxes swap,
    nothing else moves. (4) Add a call between two existing ones, save, Refresh: its box fades in between them and the ones
    below slide down. (5) Drag `createUser` away, swap calls, save, Refresh: `createUser` stays, the others are in order.
    (6) Drag boxes around, press Tidy: unpinned boxes return in code order.

## Global Constraints

Every task's requirements include these.

**Scope.** M3c only; D8 lists what is not built and D7 what does not change. No smoke case is added.

**TDD, once for every task.** Write the listed tests, see them fail for the right reason, implement, see them pass. A task's
"Tests" list is the set of new cases; all existing tests must still pass unless the task says which change and why. Every
new assertion is proven by breaking the code it guards, watching it fail, and restoring it.

**Repository rules (from the owner's instructions).**
- Files aim for 300 lines or fewer, hard cap 500; split by responsibility. Sizes to watch: `placement.ts` 129, `refresh.ts` 142,
  `placement.test.ts` 237, `rebuild-graph.test.ts` 286 (no new cases go there), probe `fixtures.js` 235, `checks-basic.js` 248.
- Comments are minimal: only logic that is hard to follow, never a label for the next line. Prefer simpler code to a comment.
- Pure logic is unit-tested. `packages/core` never imports `vscode`. Node sizes stay analytic. No `unsafe-eval`. Test literals
  contain no invisible characters; write them as escapes.
- Style is Prettier defaults, matched by hand (Prettier is not installed and must not be added). Packages are `"type": "module"`
  with `.js` import specifiers. Do not weaken `tsconfig.base.json`. Persisted shapes do not change. No lockfile change.

**Commands** (begin every Bash command with `cd /home/motodox/code/AlekP141/code-spider && `).
- `pnpm -r typecheck`; `pnpm -r test`; `pnpm build`. One package: `pnpm --filter @code-spider/webview test <name>` (also
  `@code-spider/core`). Probe: `pnpm probe` (separate from `pnpm -r test`; it uses the machine's WSLg display).
- Smoke is not part of a task's checks. The coordinator runs `pnpm --filter code-spider-vscode check:electron` and `test:smoke`
  once after Task 5 and expects seven passing cases.
- `cp` is aliased to interactive on this machine and hangs: use `command cp -f`.
- `git diff` and `git diff --check` skip untracked files, so every task's last step also runs
  `for f in $(git ls-files --others --exclude-standard -- <paths>); do git diff --no-index --check -- /dev/null "$f"; done`
  (exit status 1 only means the file differs from `/dev/null`; whitespace warnings are what matter).

**Commits.** Work is on `main`; never branch, never push. The implementer never stages or commits. After a task's review is
approved and the coordinator has re-run `pnpm -r typecheck`, `pnpm -r test`, `pnpm build` and the task's verify step, the
coordinator stages that task's exact paths and commits them: one commit per task, one plain lowercase line saying what
happened, no `feat:` or `chore:` prefix, no `Co-Authored-By` or any other trailer. Each task ends with its proposed message.

**Manual checks** are the owner's (D10). No one records them as run; the final report hands them over. Plain words in all text.

## Agent Execution Contract

- Each task uses exactly one isolated `workflow-implementer` and exactly one independent read-only `workflow-reviewer` (both
  Sonnet in this repo; the agent definitions set the models). Reviewers of Tasks 2 to 5 also run `pnpm probe`.
- Both are reused with `SendMessage` for every fix and re-review of that task.
- After two failed fix rounds on the same substantive issue, stop and ask the owner whether to replace that task's
  implementer with a `workflow-author`; keep the same reviewer. Never replace an unresumable agent silently.
- One fresh `workflow-reviewer` does the integration review after the last task and is reused for its rechecks.
- Minor review findings are fixed, not parked, unless a later task rewrites the file.

## Plan decisions

1. **Five tasks, as agreed.** Each can be rejected on its own: the source of the order (1), the first layout and Tidy (2),
   expansion (3), Refresh (4), the probe and documents (5).
2. **`layoutPositions` and `buildElkGraph` stay** as the raw ELK step with their real-ELK tests; the app calls `layoutGraph`.
3. **Three small moves avoid import cycles.** `compareIds` moves from `placement.ts` to `graph/compare-ids.ts` (Task 1),
   because `placement.ts` will import `call-order.ts`, which needs it. `TOLERANCE` is exported from `placement.ts` (Task 2).
   `lowestClearY` moves from `make-room.ts` to `placement.ts` (Task 3) so both can use it.
4. **JSX gets the D6 fix too.** `jsxElementsOf` lists every self-closing element before every opening element, so a
   component used first as `<A>..</A>` and later as `<A />` keeps the later site. Same cause, same fix, same task.
5. **Refresh runs in three passes** (restack, make room, place the rest), set out in Task 4. Today make-room runs before any
   new box is placed; it now also sees the restacked new called boxes.
6. **Main spec §9 and §10 get small edits** beside §7.5 and §8.2, because §9 says the probe runs nine checks and §10 lists
   what each milestone did.
7. **`restackCalled` returns `members` even when it moves nothing**, so the caller can claim an untouched group; otherwise a
   later function could claim the same boxes and restack them.
8. **An id missing from `orderColumns`' `order` goes last, by id**, so the function is total; `layoutGraph` always passes every
   id, so this never happens in the app.
9. **Test helpers `site` and `calledSlice` are made once, in Task 1**, and used by Tasks 2 to 4, so no test builds call sites by hand.
10. **The probe keeps check 6's meaning** ("nothing else moves") by calling `extra` last in the fixture, and adds a tenth check for
    the swap and insert, instead of rewriting check 6.

## File structure (new files)

| File | Responsibility | Task |
|---|---|---|
| `packages/webview/src/graph/call-order.ts` | `calledInOrder`, `walkOrder`: every ordering decision | 1 |
| `packages/webview/src/graph/compare-ids.ts` | `compareIds`, moved so `call-order.ts` and `placement.ts` do not import each other | 1 |
| `packages/webview/src/graph/order-columns.ts` | pure column re-sort | 2 |
| `packages/webview/src/view/refresh-order.ts` | pure restack of one function's called boxes | 4 |
| `packages/webview/probe/fixtures-order.js` | only if `fixtures.js` would pass 290 lines | 5 |

---

### Task 1: The order's source

Core keeps the first call site in source order, and the webview gets the one module that decides every ordering (D1, D2, D6).

**Files:**
- Create: `packages/webview/src/graph/call-order.ts`, `packages/webview/src/graph/compare-ids.ts`
- Modify: `packages/core/src/callees.ts`, `packages/core/src/jsx-edges.ts`; `packages/webview/src/graph/placement.ts` (stops
  defining `compareIds`), `tidy.ts`, `make-room.ts`, `supplier-labels.ts` (import it from `compare-ids.js`)
- Test: `packages/core/test/callees-order.test.ts`, `packages/webview/test/call-order.test.ts` (create);
  `test/support/slices.ts` (add `site`), `test/support/graph-states.ts` (add `calledSlice`)

**Interfaces:**
- Consumes: `GraphEdge`, `Range`, `NodeId` (`@code-spider/core/types`); `GraphState` (`view/types.ts`).
- Produces:

  ```ts
  // graph/compare-ids.ts
  export const compareIds: (a: string, b: string) => number; // moved unchanged
  // graph/call-order.ts
  export type CallEdge = Pick<GraphEdge, "from" | "to" | "callSite">;
  export function calledInOrder(nodeId: NodeId, edges: Iterable<CallEdge>): NodeId[];
  export function walkOrder(graph: Pick<GraphState, "focusId" | "nodes" | "edges">): NodeId[];
  // test/support
  export function site(line: number, column?: number): Range; // column defaults to 3; the range is six characters wide
  export function calledSlice(focus: string, called: string[], consumers?: string[]): GraphSlice; // like sliceOf; call i at site(i + 2)
  ```

**Behaviour:**
- Core: process call and `new` expressions in source order (by start position), and JSX elements likewise. `putEdge` keeps its
  rule. `basic-handleSignup.json` and `jsx-Page.json` must stay byte for byte; if one changes, stop and explain it.
- `calledInOrder`: D1. Suppliers are the `from` of edges whose `to` is `nodeId`; a self edge is ignored; each supplier sits at
  its earliest site over all its edges to `nodeId`; sort by the D1 comparison, ending on `compareIds`.
- `walkOrder`: D2. The callers of a node are the `to` of edges whose `from` is that node, in `compareIds` order, without
  duplicates and without the node itself. Only edges whose `from` and `to` are both keys of `nodes` are used. If `focusId` is
  not a key of `nodes` the walk starts from the unreached rule alone (every node in id order). Pure; it changes none of its
  inputs; a cycle ends. For the `handleSignup` graph the order is handleSignup, validateUser, createUser, sendWelcome, main,
  retry: the depth-first visit of validateUser finds its caller handleSignup already visited and moves on.
- The order of the sort is the order of reading: `a(b())` puts `a` first, because `a` starts first. That is the D1 rule, not
  the order in which the calls run.

**Approach and traps:**
- `collectCalleeEdges` concatenates `getDescendantsOfKind(CallExpression)` and `getDescendantsOfKind(NewExpression)`; sort the
  combined list by `getStart()`, the position `rangeOf` reports. `sort` is stable. `addUnknown` also uses kind `call`, so an
  unresolved name called and created with `new` shows the same bug.
- The core test can use an undeclared name (`new Legacy()` on one line, `Legacy()` on the next) or a plain function; the
  analyser ignores type errors. Build it with `memoryProject` and `collectCalleeEdges` as `collectMemoryPage` does.
- `call-order.ts` must not import `placement.ts`. Index the edges once per call rather than scanning them for every node.
  Walk with a visited set; a graph is tens of nodes, so recursion depth is no concern, but a loop with a stack is equally fine.
- `makeEdge` gives every edge the same call site, so `call-order` tests build edges with `makeEdge(from, to, { callSite: site(n) })`
  and set `kind` (`jsx`, `external`, `passes`) and `resolved: false` where a case needs them.
- Only `callees.test.ts` (a start line above zero) and `callers-shapes.test.ts` (caller edges, which this task does not touch)
  assert on a `callSite`, so the rest of core's tests do not depend on which site an edge holds.
- `basic-handleSignup.json` (callees at lines 17, 18, 19) is the real shape for the `walkOrder` case: `readGolden`, then
  `graphFromSlice`.

**Tests:**
- `callees-order.test.ts`: a `new` before a call to the same function keeps the `new`'s site (kind `call`, one edge)
- `callees-order.test.ts`: an opening tag before a self-closing tag of the same component keeps the opening tag's site
- `call-order.test.ts`, `calledInOrder`: orders suppliers by start line, then start column
- `call-order.test.ts`: a tie goes to end line, then end column, then node id
- `call-order.test.ts`: a function called twice sits at its first call
- `call-order.test.ts`: the earliest site wins across the kinds `call`, `jsx`, `external` and `passes`
- `call-order.test.ts`: unresolved and external suppliers are included; a self edge and edges into other nodes are not
- `call-order.test.ts`: accepts a one-shot iterable and does not change the edges it is given
- `call-order.test.ts`, `walkOrder`: the `handleSignup` golden gives handleSignup, validateUser, createUser, sendWelcome, main, retry
- `call-order.test.ts`: depth first, so an expanded called function's own called functions come before its next sibling
- `call-order.test.ts`: callers in id order; a function two others call is visited once, where the walk first reaches it
- `call-order.test.ts`: an edge with an end outside `nodes` is ignored
- `call-order.test.ts`: nodes the walk does not reach are appended in id order
- `call-order.test.ts`: a cycle (a calls b, b calls a) ends and lists each node once

**Steps:**
- [ ] Write the 2 core cases, the 12 `call-order` cases and the two support helpers; see them fail
- [ ] Fix the source order in `callees.ts` and `jsx-edges.ts`; run the goldens and the rest of core
- [ ] Move `compareIds` and write `call-order.ts`; see the cases pass
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test` (core 250, webview 417) and `pnpm build` pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `keep the first call site in source order and add the call order module`

### Task 2: A new graph and Tidy

The first layout and Tidy give ELK the walk order, then every column is re-sorted into it (D2, D3).

**Files:**
- Create: `packages/webview/src/graph/order-columns.ts`
- Modify: `graph/layout.ts` (the options, `layoutGraph`), `graph/placement.ts` (export `TOLERANCE`), `graph/use-layout.ts`,
  `graph/tidy-graph.ts`
- Test: `test/order-columns.test.ts`, `layout-graph.test.ts`, `layout-order-property.test.ts`, `tidy-graph-order.test.ts`
  (create); `layout.test.ts` (one case), `layout-browser.test.ts` (calls `layoutGraph`), `tidy-graph.test.ts` (new fakes)

**Interfaces:**
- Consumes: `walkOrder` (Task 1); `toFlow`; `rowGap`; `TOLERANCE`; `Positions`, `Point`.
- Produces:

  ```ts
  // graph/order-columns.ts
  export function orderColumns(
    positions: Record<NodeId, Point>,
    heights: Readonly<Record<NodeId, number>>,
    order: readonly NodeId[],
    margin: number,
  ): Record<NodeId, Point>;
  // graph/layout.ts
  export function layoutGraph(graph: GraphState, columnGap: number): Promise<Positions>;
  // graph/tidy-graph.ts: the third parameter becomes `layout: typeof layoutGraph = layoutGraph`
  ```

**Behaviour:**
- `orderColumns`: D3 step 3. Columns are found by sorting on x and splitting where the difference exceeds `TOLERANCE`. An id
  missing from `order` goes after the listed ones, in id order. It changes no input and keeps every x exactly.
- `layoutGraph`: `toFlow(graph)`; nodes sorted by walk position; edges sorted by the walk position of `target`, then `source`,
  then edge id; `layoutPositions`; `orderColumns` with the flow nodes' heights and `rowGap(columnGap)`. `buildElkGraph` sets
  `"elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES"` and `"elk.layered.crossingMinimization.forceNodeModelOrder":
  "true"`. Keep the re-sort even if small graphs pass without it (D3 evidence).
- `use-layout.ts` calls `layoutGraph(pending.graph, pending.columnGap)`. `tidyGraph` calls `layout(graph, columnGap)`; its
  retry loop, stale checks and `tidyPositions` call stay.

**Approach and traps:**
- ELK's x values start at 12, not 0, and its columns are exactly one pitch apart; compare x with `TOLERANCE`.
- Worked example for the sweep, margin 32: one column with slots (ELK tops) 12 and 144, a box `tall` of height 300 and a box
  `short` of height 50. Walk order `short`, `tall`: short 12, tall 144 (144 is at least 12 + 50 + 32). Walk order `tall`,
  `short`: tall 12, and short needs at least 12 + 300 + 32 = 344, so it goes to 344, below its slot.
- Heights for `orderColumns` come from the flow nodes' `height` (the analytic `nodeHeight`, the same numbers ELK was given).
  The walk position of a node is its index in `walkOrder(graph)`; build one `Map` and use it for both sorts.
- With the walk order as input and both options, ELK itself already puts the `handleSignup` callees in code order. That does
  not remove the need for `orderColumns`: D3's evidence is about graphs where a function has several callers.
- `layout-browser.test.ts` bundles `layout.ts` for a sandbox that forbids string evaluation. Its entry now calls `layoutGraph`
  with a literal two-node `GraphState` (generation, project, focusId, nodes with `lineCount` and `codePreview`, edges, slices,
  positions, pinned, revision), so the walk and the re-sort are in the bundle too.
- `tidy-graph.test.ts` fakes take `(graph, columnGap)` now (build their positions from `Object.keys(graph.nodes)`), and the
  "lays out with the column gap" case expects `toHaveBeenCalledWith(graph, 96)`.
- The property builds each graph from the seed: 2 to 14 function nodes with `lineCount` 1 to 30, random edges (so some functions
  have several callers and some are called by several), a distinct random call site per edge, one or two expansions merged with
  `mergeExpansion`. It reads each column from the result (same x within `TOLERANCE`) and compares it with `walkOrder`. It also
  counts, over all seeds, the columns of three or more boxes and the columns whose order `layoutPositions` alone (walk-order
  input, both options, no re-sort) got wrong; pick the minimum counts from a first run, well below what it shows, and write
  them into the test so a generator that stops producing hard cases fails. Seed with `mulberry32` as the other property tests do.
- `tidy-graph-order.test.ts` pins `createUser` at x 5000, y 0 (far from the column) and expects it unchanged there, with
  `validateUser` above `sendWelcome` in the called column and no two boxes closer than the row gap.
- Neither `use-layout.ts` nor `tidy-graph.ts` needs `toFlow` any more; `sizesOf` stays. `order-columns.ts` uses
  `Record<NodeId, Point>`, not `Positions`, so it does not import `layout.ts`.

**Tests:**
- `order-columns.test.ts`: a column's slots, top to bottom, go to its boxes in walk order
- `order-columns.test.ts`: a taller box now above another pushes it down so the row gap holds
- `order-columns.test.ts`: x never changes and two columns are ordered separately
- `order-columns.test.ts`: x values within `TOLERANCE` are one column and a larger difference is two
- `order-columns.test.ts`: an id missing from the order goes after the listed ones, in id order
- `order-columns.test.ts`: follows the margin it is given (16, 32 and 80)
- `order-columns.test.ts`: changes none of its inputs; an empty input gives an empty result
- `layout-graph.test.ts` (real ELK): the `handleSignup` golden reads validateUser, createUser, sendWelcome top to bottom in one
  column, with main and retry in the column on the right
- `layout-graph.test.ts`: the same order however the slice lists its nodes and edges
- `layout-graph.test.ts`: a fixed graph ELK alone leaves out of walk order (the first seed the property finds with
  `orderColumns` switched off) comes out in walk order
- `layout-graph.test.ts`: an expanded called function's own called functions sit in the next column, in code order
- `layout-graph.test.ts`: unequal heights keep the row gap in one column at gaps 32, 192 and 480
- `layout-graph.test.ts`: columns are one pitch apart, every node has a position, two runs are equal
- `layout-graph.test.ts`: a lone node and an edgeless graph
- `layout-order-property.test.ts`: over 300 seeded random graphs at gaps 32, 192 and 480 (random heights and call sites, shared
  functions, expansions) every column is in walk order and no two boxes of a column are closer than the row gap; counters prove
  the run is not vacuous (columns of three or more; columns ELK alone had out of order)
- `tidy-graph-order.test.ts`: Tidy with nothing pinned (real layout) puts the `handleSignup` called column in code order
- `tidy-graph-order.test.ts`: with `createUser` pinned elsewhere it stays put; the unpinned boxes keep code order and clear it
- `layout.test.ts`: `buildElkGraph` sets both option values

**Steps:**
- [ ] Write the 18 cases (support from Task 1), adjust the browser test and the tidy fakes; see them fail
- [ ] Write `orderColumns`; export `TOLERANCE`; add the options and `layoutGraph`
- [ ] Switch `use-layout.ts` and `tidy-graph.ts` to `layoutGraph`
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test` (webview 435), `pnpm build` and `pnpm probe` pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `lay out the first graph and tidy in code order and re-sort every column`

### Task 3: Expanding a box

New called boxes of an expanded box are stacked in code order, and a column never loses its order to an obstacle (D4).

**Files:**
- Modify: `packages/webview/src/graph/placement.ts`, `packages/webview/src/graph/make-room.ts` (imports `lowestClearY`)
- Test: `test/placement-order.test.ts`, `placement-order-property.test.ts` (create); `placement.test.ts` and
  `placement-property.test.ts` (edges carry a call site); `expansion.test.ts` (one case)

**Interfaces:**
- Consumes: `calledInOrder`, `CallEdge` (Task 1); `compareIds`.
- Produces:

  ```ts
  // graph/placement.ts
  export type Placement = { /* as today */ edges: readonly CallEdge[]; /* as today */ };
  export function lowestClearY(rect: Rect, obstacles: readonly Rect[], margin: number): number; // moved from make-room.ts
  ```

**Behaviour:**
- D4. Left column: the added nodes that are suppliers of `expandedId`, in the order `calledInOrder(expandedId, edges)` gives. A
  node linked both ways is a supplier, as today. Right column: the other added nodes, in id order.
- Per column, preferred tops come from `stackTops` in that order. The first box: `nearestFreeY` of its top. Box k: the
  `lowestClearY` of the rectangle whose top is the larger of its preferred top and the previous box's bottom plus the margin.
  Each placed box joins the obstacles. This applies to the right column too.
- `view/expansion.ts` and `view/refresh.ts` already pass `slice.edges`; they need no change.

**Approach and traps:**
- The M3b case "stacks a column in id order, a margin apart, centred on the anchor" uses consumers (`from: "x"`), the right
  column, so it keeps passing; it only needs a call site on its edge literals (a local `edge(from, to, line)` built on `site`).
  The left column needs the new cases. `makeEdge` and `sliceOf` give every edge one site, so existing tests fall back to id
  order and stay green.
- `placement-property.test.ts` expects every box to be as near its preferred top as it can be. That stops holding for a later
  box, which may only sit below the previous one. Keep the check for the first box of each column; for the others check "at or
  below the bound, and no clear y exists between the bound and the chosen y". Its expected left order becomes code order.
- `lowestClearY` returns the smallest y at or below `rect.y` where the rectangle is clear; the `make-room.test.ts` cases stay
  untouched and green.
- `nearestFreeY` can put the first box above an obstacle; the rule then forces later boxes below it, never above an earlier box.

**Tests:**
- `placement-order.test.ts`: suppliers are stacked in code order, not id order
- `placement-order.test.ts`: consumers are still stacked in id order
- `placement-order.test.ts`: with nothing in the way and unequal heights the stack is centred on the anchor, a margin apart
- `placement-order.test.ts`: an obstacle on the first slot: the first box takes the nearest free place (a tie goes up), later boxes follow in order
- `placement-order.test.ts`: an obstacle in the middle of the stack pushes later boxes down and never above an earlier one.
  Two fixed layouts that the old rule reverses (anchor at x 1000, y 500, height 100; margin 32; left column x 488; a dragged box
  in that column): obstacle y 584, height 200 with suppliers of height 84, 200, 200 gives tops 276, 816, 1048 (the old rule
  gave 276, 44, 816); obstacle y 730, height 84 with heights 200, 200, 100 gives 268, 846, 1078 (the old rule gave 268, 846, 598)
- `placement-order.test.ts`: an obstacle covering the whole stack leaves every box on one side of it, in order
- `placement-order.test.ts`: a supplier with two edges of different kinds sits at its earliest site
- `placement-order.test.ts`: at gaps 32, 192 and 480 the boxes keep code order and the row gap (`it.each`, 3 cases)
- `placement-order-property.test.ts`: at gaps 32, 192 and 480 (`it.each`, 3 cases, 100 seeds each) with random anchors, obstacles and
  edges: suppliers read in code order and consumers in id order, every box is clear of everything, each box is at or below its
  bound and no lower free y exists
- `expansion.test.ts`: `applyExpansion` puts new suppliers in code order beside the expanded box

**Steps:**
- [ ] Write the cases and give the existing edge literals a call site; see the new ones fail
- [ ] Move `lowestClearY` and import it in `make-room.ts`; the make-room tests still pass
- [ ] Change `Placement.edges` and the stacking in `placeExpansion`; fix `placement-property.test.ts` as described
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test` (webview 449), `pnpm build` and `pnpm probe` pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `stack the boxes of an expansion in code order and keep a column's order around obstacles`

### Task 4: Refresh

Refresh puts each function's unpinned called boxes in code order, inserts new calls in place, and moves nothing when the order
is already right (D5).

**Files:**
- Create: `packages/webview/src/view/refresh-order.ts`
- Modify: `packages/webview/src/view/refresh.ts` (aim for 200 lines or fewer)
- Test: `test/rebuild-graph-order.test.ts`, `rebuild-graph-order-property.test.ts` (create); `rebuild-graph-property.test.ts` (one assertion)

**Interfaces:**
- Consumes: `calledInOrder`, `CallEdge` (Task 1); `TOLERANCE` (Task 2); `placeExpansion`; `makeRoom`; `rowGap`; `NODE_WIDTH`.
- Produces:

  ```ts
  // view/refresh-order.ts
  export type Restack = { members: NodeId[]; positions: Record<NodeId, Point>; added: NodeId[] };
  export function restackCalled(input: {
    key: NodeId; edges: readonly CallEdge[];
    positions: Readonly<Record<NodeId, Point>>; kept: ReadonlySet<NodeId>; fresh: ReadonlySet<NodeId>;
    pinned: ReadonlySet<NodeId>; grouped: ReadonlySet<NodeId>;
    heights: Readonly<Record<NodeId, number>>; columnGap: number;
  }): Restack;
  // rebuildGraph(current, answer, columnGap): Rebuilt  keeps its signature
  ```

**Behaviour:**
- `restackCalled` handles one applied function: `key` and that slice's `edges`. `positions` is every position known so far,
  `kept` the ids that had a position before the refresh, `fresh` the slice's new nodes, `grouped` the ids already in an
  earlier group. `called` = `calledInOrder(key, edges)`. With no position for `key` the result is empty. `members` = ids of
  `called` that are in `kept`, not pinned, not in `grouped`, at x equal to the key's x minus `NODE_WIDTH + columnGap` within
  `TOLERANCE`; it is always returned, so the caller can claim them. If the members' (top, id) order equals their order in
  `called` and no id of `called` is in `fresh`, `positions` and `added` are empty; they are also empty with no members.
  Otherwise the members and the `fresh` ids of `called` are laid out in `called` order from the topmost member's top, each one
  `rowGap(columnGap)` below the previous bottom, with fresh heights. Members keep their x; new boxes take the column's x.
- `rebuildGraph` order of operations, exact: (1) the fixpoint and the kept positions and pins, as in M3b; (2) each new node goes
  to the first applied slice that lists it (M3b's rule), giving `fresh` per slice; (3) restack pass: for each applied slice in
  application order call `restackCalled`, merge its positions, add its `members` to `grouped`, collect its `added`; (4)
  `makeRoom` over every box that has a position (kept and restacked), pinned fixed, merge what moved; (5) place pass: for each
  applied slice in application order, its `fresh` nodes still without a position go through `placeExpansion` as in M3b (anchor =
  the key's rectangle, `existing` = everything placed so far), collected in `added`; (6) the result fields, `revision + 1` and
  `sourceVersion` as in M3b. Only step 4 changes meaning: it ran before any new box existed, and now also sees the restacked
  new called boxes. Put the D5 invariant in a short comment above it.

**Approach and traps:**
- Membership uses `kept`, not `positions`, so a new box an earlier restack placed never counts as a member.
- Worked example (gap 192, so margin 32 and pitch 512; a box with `lineCount` 3 and a code preview is 84 high): the centre `a`
  stands at (1000, 0); `x` and `y` stand in column 488 at tops 0 and 400 (id order, far apart). The new code calls `y` then `x`.
  The group is not in code order, so `y` goes to 0 and `x` to 0 + 84 + 32 = 116. With the same positions and code calling `x`
  then `y` the group is in order, nothing is new, and nothing moves. With a new call `n` between them, order `x`, `n`, `y`:
  `x` stays at 0, `n` takes 116 and `y` goes to 232.
- Heights come from `nodeHeight` of the rebuilt nodes (fresh data); reuse the existing `keptBoxes` helper for the make-room input
  and `rectsOf` for `existing`. `restackCalled` receives a `heights` record, so it stays free of `GraphNode`.
- Read the members' current order by (top, id); lay the restack out in the order of `called`.
- A function whose called boxes are all pinned, off column or absent has no members: its new boxes go through `placeExpansion`
  in step 5, which already orders them (Task 3).
- `rebuild-graph-property.test.ts` asserts kept unpinned boxes never move up. A restack moves boxes up (one row gap apart is
  closer than ELK's spacing). Change only that assertion: boxes that are the `from` of no edge in the rebuilt graph never move
  up; every kept box still never moves sideways. Say why in the report.
- These M3b tests must pass unchanged: `rebuild-graph.test.ts`, `rebuild-graph-placement.test.ts`, `make-room.test.ts`,
  `app-refresh.test.ts`, `app-refresh-view.test.ts`, `expansion.test.ts`, and the rest of `rebuild-graph-property.test.ts`.
  Fixtures from `sliceOf` share one call site, so code order is id order there. If one fails, stop and report; do not edit it.
- If the property finds a counterexample to the D5 invariant, stop and report it. Do not weaken the assertion or add a fix-up pass.
- `app-refresh.ts` passes `current.columnGap ?? view.columnGap` to `rebuildGraph`; do not change that.
- The property builds a centre and up to three expansions as `rebuild-graph-property.test.ts` does, but positions called boxes
  by hand: for each applied function, put its called functions in its called column (x minus one pitch) at random tops in
  random order, pin about a third, and move about one in six to another x. The "after" check recomputes the groups from the
  rebuilt graph by the D5 definition (walking the applied slices in `Object.keys(graph.slices)` order) and asserts each group's
  tops ascend in `calledInOrder` order. The edits shuffle the calls' sites, drop some calls and add new ones. Counters (minimums
  from a first run, written into the test): restacked groups, pinned boxes beside a group, new called boxes placed.

**Tests** (all in `rebuild-graph-order.test.ts` unless noted; build graphs with `calledSlice`, `withPositions`, `answerOf`):
- unchanged code moves nothing and adds nothing, even when the called boxes sit far apart
- two calls that swapped swap places; the second sits one row gap below the first; the rest stay
- a new call between two existing ones is inserted there, the box below slides down, and `added` lists the new id
- a new call after the last one goes below it and no existing box moves
- a new call before the first one takes the top of the group and the others slide down
- a pinned called box never moves and belongs to no group; the unpinned ones restack around it
- a called box outside the called column (another x) is left alone
- an expanded function's called boxes restack on their own while the centre's group is untouched
- a box two functions call joins only the earlier function's group
- a function with no group member places its new called boxes through `placeExpansion`, in code order
- new callers are placed as in M3b (right column, id order)
- a pinned box overlapping the group's top pushes the whole group down, order and spacing kept
- a `columnGap` that differs from the gap the boxes were laid out with restacks nothing; a new called box is placed as in M3b
- a graph laid out in id order is restacked by its first Refresh, and a second Refresh moves nothing
- `rebuild-graph-order-property.test.ts`: over 240 seeded graphs at gaps 32, 192 and 480 (called boxes in random order, some
  pinned or off column, random edits to the calls) after Refresh every unpinned group is in code order, nothing overlaps unless
  both boxes are pinned, pinned boxes did not move and no kept box moved sideways; counters prove restacks, pinned boxes and
  new called boxes all occurred

**Steps:**
- [ ] Write the cases and the property; change the one assertion in `rebuild-graph-property.test.ts`; see the new ones fail
- [ ] Write `restackCalled`
- [ ] Rebuild `rebuildGraph` in the six steps above; the unchanged M3b tests still pass
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test` (webview 464), `pnpm build` and `pnpm probe` pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `put the called boxes in code order when refreshing and slide the others down`

### Task 5: Probe and documents

The probe shows the order on the real built page; the documents say what M3c changed (D5, D10).

**Files:**
- Modify: `packages/webview/probe/fixtures.js`, `probe/checks-basic.js`, `probe/checks-detail.js`
- Modify: `docs/superpowers/specs/2026-08-22-code-spider-design.md` (§7.5, §8.2, §9, §10),
  `docs/superpowers/specs/2026-10-11-code-spider-m3b-design.md` (section 15), this plan (status line)

**Interfaces:**
- Consumes: the built page (`pnpm probe` builds it); the `refreshed` message; `ID`, `messages` and `sendRefresh` (in `checks-detail.js`).
- Produces: `messages.reordered(generation, sourceVersion)` in `fixtures.js`; a tenth check; `pnpm probe` with ten checks.

**Behaviour:**
- Fixtures: `fixtures.js` gets a `site(line, column)` helper (its `edge` still defaults to `RANGE`) and every edge a site that
  matches the fixture's code text. Centre, `CODE.main` = `  return helper(format());` on line 2: `helper` at line 2 column 10,
  `format` at line 2 column 17, so code order (helper, format) differs from id order (`format` sorts first). Helper's
  slice keeps one shared site for parse and validate (they stay in id order, as in check 3), but its `helper->main` edge must
  carry the same site as in the centre slice of the same answer, because a later slice replaces an edge an earlier one
  brought (`applySlice`). `REFRESHED_MAIN_CODE` keeps its marker
  `refreshedMarker` but calls `extra` last, on the line after the three `helper(format())` lines: `helper` line 2, `format`
  to its right on the same line, `extra` on line 5. So check 6 still means "nothing else moves": `extra` lands under `helper`.
- Data for check 10: a leaf `late` (add to `ID` and `CODE`), a main (new constant `REORDERED_MAIN_CODE`) whose lines call
  `extra`, then `late`, then `helper(format())`, with sites to match; `REORDERED_CENTRE` with edges extra, late, helper, format;
  `REORDERED_HELPER_SLICE` like `REFRESHED_HELPER_SLICE` but with the new main node (the worker makes one request, so a node
  two slices share is identical in both). `messages.reordered` mirrors `messages.refreshed`.
- What check 10 starts from: after checks 1 to 9 `format` is pinned (check 4), `helper` is on top of the called column and
  `extra` is under it (check 6). The new code order is `extra`, `late`, `helper`, so the group `helper`, `extra` is restacked
  from `helper`'s old top: `extra` there, `late` under it, `helper` under that.
- Check 1 adds: `helper` is above `format` and they share x. Check 10, "a refresh that swaps and inserts calls lands the boxes in
  code order": click Refresh and expect the same message as check 6 (`sendRefresh`, now counting two); watch entering; send
  `messages.reordered`; wait for `late`; expect `extra`, `late`, `helper` in strictly increasing y in one column, no two
  overlapping, `late` fading in, and `main`, `format` (pinned), `parse` and `validate` not moved.
- Documents, all in plain words and each edit local (keep the surrounding text):
  - §7.5 gets one paragraph after "Expansion must not reshuffle the canvas": the functions a box calls are drawn one column
    to its left, top to bottom in the order the calls appear in the code (a function called twice sits at its first call;
    callers have no order). The first layout and Tidy re-sort each column after ELK; an expansion stacks its new called boxes in
    that order; Refresh puts a function's unpinned called boxes back in that order. A box the user dragged never moves.
    The sentence "ELK serves only a new centre and Tidy" stays true.
  - §8.2, in the paragraph that ends "Positions, pins, expansions and the viewport stay.": add "except that a function's
    unpinned called boxes are put back in code order, a new call's box is inserted in its place and the boxes below slide down;
    a box that already reads in order does not move, and pinned boxes never move."
  - §9, the probe bullet: "ten checks", with "call order" added to the list.
  - §10: after the last "Done in M3b" bullet, a bullet "Done in M3c: called boxes are drawn in the order of the calls in the
    code, on the first layout, Tidy, expansion and Refresh."
  - M3b spec section 15 gets one bullet: "Call order (M3c). Sections 4.1 and 4.4 say Refresh keeps positions and only makes
    room. M3c changes that for called boxes: Refresh puts a function's unpinned called boxes in code order (see the M3c plan,
    D5). The probe (section 9) has ten checks, not nine: check 1 also asserts that the called boxes read in code order, and
    check 10 refreshes an answer that swaps and inserts calls." Sections 1 to 14 stay as written.
  - This plan's status line becomes "built in five task commits" with the final automated counts and the sentence that the
    owner's manual checks (D10) have NOT been run; the coordinator adds commit ids later.

**Approach and traps:**
- `fixtures.js` is 235 lines; keep every probe file under 300. If the additions would pass 290, put the check-10 data in a
  new `probe/fixtures-order.js`.
- Posted messages pile up in the page until a reload (check 5 reloads), and `sendRefresh` waits for exactly one `refresh`
  message. Give it the expected count (1 for check 6, 2 for check 10) and compare the last message with the wanted one. In
  check 10 call `h.watchEntering()` again before sending the answer; it starts a fresh set, so earlier boxes do not count.
- Check 4 drops `format` on a free spot found by `pickDrag`; moving `helper` above `format` changes the layout it searches. If
  no offset in `DRAG_OFFSETS` is free, change the offsets, not the layout.
- Prove the new assertions: reverse the call-site comparison in `call-order.ts` and check 1 and check 10 fail by name; make
  `restackCalled` return an empty result and check 10 fails. Restore both.
- Register check 10 last in the exported list of `checks-detail.js` (184 lines), so it runs after the Lines check.

**Tests:**
- `probe` check 1 (extended): the centre's called column is in code order on the real page
- `probe` check 10 (new): a refresh answer that swaps and inserts calls lands the boxes in code order
- `probe` checks 2 to 9: unchanged and still passing

**Steps:**
- [ ] Update the fixtures, extend check 1, write check 10; show each fails when the code is broken, then restore
- [ ] Edit the main spec, the M3b spec section 15 and this plan's status line
- [ ] Verify: `pnpm probe` exits 0 with ten passing checks; `pnpm -r typecheck`, `pnpm -r test` (core 250, CLI 39, webview 464,
  extension 206) and `pnpm build` pass
- [ ] Hand the owner's six manual checks (D10) over in the report as NOT RUN
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `check call order in the probe and update the design specs for M3c`
