# Code Spider Folder Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to
> validate this plan and hand it to `subagent-driven-development` for
> task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The source and test folders of `core`, `extension` and `webview` are grouped by what the files do, so the owner can
find a file by browsing instead of scanning a flat list of 18 to 58 siblings. Nothing else changes: no file is renamed, no
code is edited except the paths in import lines and the few settings and strings that name a path, and every test count and
test name comes out the same.

**Architecture:** Four tasks, each independently green and committed alone: core (1), extension (2), webview without `graph/`
(3), webview `graph/` (4). Each task moves its files with `git mv`, rewrites the relative import paths, edits the few path
strings that TypeScript does not check, and then proves it is move-only: the same sorted list of test names, a diff of only
renames and import-line edits, and the same built bundles apart from esbuild's module-path comment lines. A fresh reviewer
repeats the proof after Task 4.

**Tech Stack:** As M4 (TypeScript 5.6+ strict, pnpm 11 workspaces, esbuild, Vitest 2, `@vscode/test-electron`). No new
dependency; `pnpm-lock.yaml` and `pnpm-workspace.yaml` do not change.

**Spec:** none; the approved design is in this plan.

## Global Constraints

Every task's requirements include these.

**Scope.** Move-only. Out of scope: renaming any file, export, function, test or `describe` title; any change of behaviour;
the CLI package (its three source files and three tests stay exactly as they are; its tests keep reading core's goldens by
relative path); `test-code/`; old plans, specs and notes under `docs/` and everything under `local-agent-docs/` (they name old
paths and are left as written); the unchanged source folders `extension/src/panel`, `extension/src/vscode`,
`extension/src/worker`, `webview/src/toolbar` and `webview/src/view` (a file in them changes only where an import path
changed). No new file is created in the repo (apart from the temporary files of the deliberate breaks, which are removed), so no
`index.ts` barrel and no new test.

**Baseline (HEAD `18c3bb9`, tree clean).** From the coordinator: `pnpm -r typecheck` clean; `pnpm -r test`: core 250, CLI 39,
webview 507, extension 216; `pnpm build` passes; `pnpm --filter code-spider-vscode test:smoke` 7 passing; `pnpm probe` 10
checks; `pnpm check:vsix` 7 passing with a `.vsix` of exactly 8 files. The plan author re-measured the four test counts in a
throwaway copy of HEAD (core 250 in 35 files, CLI 39 in 3, webview 507 in 57, extension 216 in 29) and then ran everything
again on that copy with all four tasks applied: typecheck clean, the same four counts, the same sorted test-name lists, smoke 7
passing, probe 10 checks, `check:vsix` 7 passing with the same eight entries. Tools: Node v23.9.0, pnpm 11.24.0. If the coordinator commits this plan before Task 1, "HEAD" in the tasks means the commit
before that task; the plan commit changes no code, so the quoted bundle hashes and sizes still hold. **These four
counts and the two smoke, probe and `check:vsix` numbers do not change in any task.** A task that leaves any of them different
is wrong, not "updated".

**No new behaviour, so no TDD cycle.** There is no new test to write first. The proofs below take its place, and each task's
steps make every proof fail once on purpose (a check that was only ever seen passing is not done) and then restore.

**Move-only rules.**
- Moves are `git mv`, one per row of the move tables (`mkdir -p` the folder first; `git mv` does not create folders). File
  names stay exactly as they are; only the folder changes.
- **`git mv` stages the rename, and that is the one exception to "the implementer never stages".** The implementer stages
  nothing else: no `git add`, `git reset`, `git stash`, `git restore` or `git checkout`. The reviewer and the coordinator
  therefore expect staged renames (`R`) plus unstaged edits (`RM`, ` M`) in `git status`.
- Allowed edits, and nothing else: (a) the module specifier of an `import`, an `export ... from` and a side-effect `import`
  (`import "./x.css"`); (b) re-wrapping those statements (below); (c) the path strings listed in the task; (d) the `exports`
  targets in `packages/webview/package.json` (Task 3). No renamed identifier, no changed test title, no re-sorted or
  re-ordered imports (the order of imports fixes the order of modules in the bundles, which Proof P5 compares), no added
  comment, no fix of anything noticed on the way. A noticed problem goes in the report, not in the diff.
- A specifier keeps its style: `.js` for TypeScript files, no extension where it had none (`core/test/node-id.test.ts` imports
  `../src/node-id`, `core/test/smoke.test.ts` imports `../src/index`), `.css` for styles, `.mjs` for scripts.
- Only real import and export declarations are rewritten, never text that merely looks like one. A test source in an
  in-memory project is a string: `core/test/arrow-consts.test.ts:64` holds `` `import { helper, legacy } from "./helpers";` ``
  inside a template, and `./helpers` also names a real file there, so a rewriter that works on lines of text would silently
  change that test's input. Rewrite from the parse tree (TypeScript's compiler API is installed), or by hand.
- **How to rewrite the import paths.** Each task changes the paths in 40 to 75 files, so use a throwaway script kept in
  `<scratch>` (never in the repo), or work by hand with the typechecker as the net. The script: parse each `.ts` and `.tsx`
  file under the package's `src` and `test` with TypeScript's compiler API (installed under `node_modules`); for every import,
  `export ... from` and side-effect import whose specifier starts with `.`, resolve it against the file's old place using the
  task's move rows, and write the specifier relative to the file's new place, in the same style as before (`.js`, none, or
  `.css`); report any specifier it cannot resolve; then re-wrap the statements it changed. The plan author did all four tasks
  this way on a throwaway copy and got the numbers quoted in this plan.
- Restore a deliberate break by undoing the exact edit from a copy kept in `<scratch>` (`command cp -f`). Never restore with
  `git checkout`, `git restore` or `git stash`: the index holds the moved files with their old contents, so those commands
  would also throw away the import edits.
- `<scratch>` is the scratchpad directory the session was given, outside the repo. Write its real path in each command; shell
  state does not persist between commands.

**Formatting (Prettier defaults, matched by hand; Prettier is not installed and must not be added).** Print width 80. A moved
file's import paths only get longer, so some lines pass 80 columns:
- an import or export with two or more specifiers that no longer fits on one line is broken to one specifier per line, with a
  trailing comma, and the closing line is `} from "path";`;
- an import with a single specifier stays on one line however long it is (Prettier does not break it); none exceeds 80 columns
  in this plan;
- an import already on several lines stays on several lines.
In the replay the numbers of re-wrapped imports were 5, 3, 4 and 16 for Tasks 1 to 4. P6 lists any added line wider than 80
columns; the output must be empty.

**Repository rules (from the owner's instructions).**
- Work on `main`; never branch; never push.
- Code files aim for 300 lines, hard cap 500; no file here gets longer except by a re-wrapped import. Comments are minimal;
  this plan adds none. This is for code; documents have no length target.
- `cp` and `mv` are aliased to interactive on this machine and hang: any plain shell copy or move is `command cp -f` /
  `command mv -f`. File moves in this plan are `git mv`.
- Begin every Bash command with `cd /home/motodox/code/AlekP141/code-spider && `.
- Smoke, probe and `check:vsix` start a real VS Code or Electron and need a display (`DISPLAY=:0` under WSLg).
  `pnpm --filter code-spider-vscode check:electron` says whether VS Code can start here; it exits 0 when it can.

**Commits.** The implementer never commits. After a task's review is approved and the coordinator has re-run
`pnpm -r typecheck`, `pnpm -r test`, `pnpm build` and the task's verify step, the coordinator commits that task's files only:
one commit per task, one plain lowercase line, no `feat:` or `chore:` prefix, no `Co-Authored-By` or any other trailer. The
renames are already staged by `git mv`; the coordinator stages the task's paths with `git add -A -- <the paths named in the
task's Files>` so that both sides of each rename and every edit are in. Each task ends with its proposed message.

**Manual checks** are the owner's (end of this plan). No one records them as run.

## Agent Execution Contract

- Each task uses exactly one isolated `workflow-implementer` and exactly one independent read-only `workflow-reviewer`, both
  Sonnet. The reviewer reruns the proofs on the implementer's tree and repeats at least one of the deliberate breaks.
- Both are reused with `SendMessage` for every fix and re-review of that task.
- After two failed fix rounds on the same substantive issue, stop and ask the owner. Never replace an unresumable agent
  silently.
- One fresh `workflow-reviewer` does the integration review after Task 4 and is reused for its rechecks.
- Minor review findings are fixed, not parked, unless a later task rewrites the file.
- Tasks run in order 1, 2, 3, 4. None needs an earlier task's moves to be green; the order only keeps each review small and
  lets Task 4 build on the paths Task 3 made.

## Design (agreed 2026-10-12 in conversation, no separate spec)

**Request, in the owner's words.** "The files are not in subfolders and not organised well. It's just a sea of sibling files.
Can we clean these up and group them by functionality/component/whatever makes sense to make it easier to navigate."

Files directly in each folder today: `core/src` 22 (no subfolders), `core/test` 36, `extension/src` 18 (beside `panel/`,
`vscode/`, `worker/`), `extension/test` 29, `webview/src` 18 (beside `graph/`, `toolbar/`, `view/`), `webview/src/graph` 29,
`webview/test` 58 (57 tests and a `tsconfig.json`). The CLI package (3 source files, 3 tests) is left alone.

What the owner was told: file names stay the same and only folders change; moves use `git mv` so history follows each file;
old plans and specs that name old paths are left as written, and only the README and anything the build reads are updated; a
few files could sit in two places and the plan author checks each against the code.

**D1 Source layout.** Folders hold what the files do. Files that are the entry of the package, or that everything shares,
stay at the top.

```
packages/core/src
  index.ts  types.ts  errors.ts  analyze.ts                    stay at the top
  project/    project, ts-morph-paths
  focus/      focus, position, bound-functions, callable-names
  nodes/      node-builder, node-id, labels, classify, externals
  callees/    callees, jsx-edges, pass-edges, passing, graph-helpers
  callers/    callers, references

packages/extension/src
  extension.ts  worker.ts  ids.ts  ports.ts                    stay at the top
  session/    session, session-refresh, dispatch, jump-table, navigation, ranges
  changes/    changes, watched-paths, source-changes, warm-once, debounce
  settings/   column-gap, edge-style-store, settings-values
  panel/  vscode/  worker/                                     unchanged

packages/webview/src
  main.tsx  App.tsx  styles.css                                stay at the top
  app/        app-state, app-refresh, app-settings, app-walk, app-working,
              use-walk-timers, use-persisted-view, use-delayed-flag, delayed-flag, debounce
  host/       protocol, messages, vscode-api
  settings/   column-gap, edge-style
  graph/
    GraphView.tsx  to-flow  edge-appearance  jump  constants  graph.css      stay at graph's top
    layout/     layout, tidy, tidy-graph, placement, make-room, order-columns, call-order, compare-ids, use-layout
    nodes/      NodeBox, SpiderNode, NodeLabels, node-size, node-context, node-controls,
                supplier-labels, code-lines, node-labels.css
    viewport/   pan-to-reveal, reveal, viewport-requests, lod, live-positions
  toolbar/  view/                                              unchanged
```

**D2 Test layout.** Tests move into folders that mirror the source: `src/session/session.ts` is tested under
`test/session/`. Rules, in this order:
1. A test of a file in a source folder goes in the same folder name under `test/`.
2. A test of a file left at the top of `src` stays at the top of `test`.
3. A test that covers several files goes where the code that decides its outcome lives, judged by what its own top `describe`
   names. Tests that go in through `analyze.ts` (every `analyzeFocus`, `analyzeFocusAt` and `expandNode` scenario) are tests of
   a file at the top, so they stay at the top (rule 2).
4. A test that covers the package rather than one source folder (the manifest, the README, the `.vsix` file list, a scan of all
   of `src`) stays at the top.
5. `test/support/` (extension, webview), `core/test/helpers.ts` and `core/test/__goldens__` do not move. Their paths to
   `test-code/` and to core's goldens are computed from their own place, so keeping them where they are keeps those paths
   right. `core/test/__goldens__` is also read by relative path from four other places, so it cannot move
   (see "Facts verified").
6. The test file keeps its name and the folder name is the source folder's name, so `test/graph/layout/placement.test.ts`
   tests `src/graph/layout/placement.ts`.

**D3 Package exports.** The keys of `packages/webview/package.json` `exports` stay `./protocol`, `./column-gap` and
`./edge-style`; only the targets change (`./src/host/protocol.ts`, `./src/settings/column-gap.ts`,
`./src/settings/edge-style.ts`). `@code-spider/webview/protocol` and the other two keep working in the extension without an
edit there. `packages/core/package.json` names `./src/index.ts` and `./src/types.ts`, which stay, so it is untouched.

**D4 What is updated and what is not.** Updated: relative import paths; the path strings of rows 1, 5 and 6 and the `exports` block of row 7 in the table under
"Facts verified"; the CSS import in `webview/src/main.tsx` (row 8). Not updated: `docs/` and `local-agent-docs/`. The root `README.md`
names only `packages/extension/package.json` (line 44), which does not move, and no other path of the repo, so it does not go
stale and is not edited.

**D5 Four tasks.** One per package, with that package's tests moved in the same task as its source, so a package is never
half-moved at a commit. The webview is split in two because one task would touch 113 files, 94 of them renamed: Task 3 (75 files) does every
source folder except `graph/` (plus the tests of those folders and of `view/` and `toolbar/`), Task 4 (70 files) does `graph/`
and its tests. The price is that some import lines are edited twice, once in each task (for example in `App.tsx` and in the
files of `graph/`); a file edited in both tasks appears in both lists.

## Placement decisions

Every source file was checked against its imports and its importers (module graph read from the code, not from names). The
outcome is that **all files are placed where the owner's design put them**. The decisions that needed a reason:

**core**
- `passing.ts` stays in `callees/`. Its importers are `callees/pass-edges.ts` and `callers/callers.ts`. After the move,
  `callers/callers.ts` imports `../callees/passing.js`, the only import between those two folders, and `callees/` never
  imports `callers/`. Putting it in `callers/` would only turn that import around; `focus/` is wrong because `passing.ts`
  imports nothing from the package. It is the pass-edge half of the pair `pass-edges` + `passing`, so it sits with that half.
- `bound-functions.ts` stays in `focus/` although `callers/callers.ts` and `callees/graph-helpers.ts` import it. `focus.ts`
  imports it, and it is what lets a `const f = () =>` count as a callable; it is the lower layer.
- `callable-names.ts` stays in `focus/`. It names a focus target (`nodeNameOf`) and finds targets by name
  (`targetsQualifiedAs`); `nodes/node-builder.ts` and `analyze.ts` import it.
- `position.ts` stays in `focus/`. Only `analyze.ts` (for `analyzeFocusAt`) and `index.ts` import it.
- `externals.ts` stays in `nodes/`. Four files in `callees/` import it, two in `nodes/`; it decides whether a node is external,
  which is a property of the node.
- `graph-helpers.ts` stays in `callees/`: only `callees.ts`, `jsx-edges.ts` and `pass-edges.ts` import it.
- `references.ts` stays in `callers/`: only `callers.ts` imports it.
- The only file the folders import from the top is `types.ts` (eight imports); `errors.ts` is used by `analyze.ts` and
  `index.ts` only. Nothing imports `analyze.ts` except `index.ts`. There is no import cycle today and none after.

**extension**
- `ports.ts` stays at the top: `session/` (three files) and `vscode/` (three files) import it. `ids.ts` stays: `settings/`,
  `panel/` and `vscode/` import it.
- `navigation.ts` and `ranges.ts` stay in `session/`: `navigation.ts` carries `EditorPort`, which `vscode/editor.ts`
  implements, and is used by `dispatch.ts`, `jump-table.ts` and `extension.ts`.
- `dispatch.ts` stays in `session/`: it routes a parsed webview message to `session`, `navigation` and the two settings
  stores; `panel/` does not import it.
- `watched-paths.ts` goes to `changes/`. Three places import it: `changes.ts`, `vscode/watchers.ts` and
  `worker/project-cache.ts`. The last one is in the worker bundle, so the worker now imports `../changes/watched-paths.js`;
  the worker bundle already contained that module and contains the same code after the move (P5).
- `debounce.ts` (extension) goes to `changes/` with its only importer `source-changes.ts`.
- `settings/` holds the two stores that keep a setting (`column-gap`, `edge-style-store`) and the pure `settings-values`.
  These are three different files from the webview's `settings/` folder; the packages do not share a folder.

**webview**
- `compare-ids.ts` stays in `graph/layout/` (the owner's grouping). Six files in `layout/` import it; `nodes/supplier-labels.ts`
  and `view/refresh-order.ts` do too. It is the weakest placement of the plan and it is two lines long: if the owner does not
  want `nodes/` and `view/` to import from `layout/`, `graph/` top beside `constants.ts` is the alternative.
- `live-positions.ts` stays in `viewport/` (the owner's grouping). It keeps where dragged boxes are while a drag lasts, for
  `GraphView.tsx` only, next to the other "what the canvas is showing now" files (`lod`, `reveal`, `pan-to-reveal`,
  `viewport-requests`). `layout/` is the alternative; it computes positions but does not hold drag state.
- `node-size.ts` stays in `nodes/` although `layout/tidy-graph.ts`, `viewport/reveal.ts`, `to-flow.ts` and `view/expansion.ts`
  use it: it is the size of a node box.
- `use-layout.ts` stays in `layout/` (it runs `layoutGraph` and `tidyGraph`; `App.tsx` imports it).
- `debounce.ts` goes to `app/` with `use-persisted-view.ts`; `toolbar/spacing-control.ts` imports it too.
- `protocol.ts` goes to `host/` with `messages.ts` and `vscode-api.ts`; `settings/edge-style.ts` is imported by `host/protocol.ts`,
  not the other way round.
- Module cycles that exist today: `extension/src/worker/apply-changes.ts` and `project-cache.ts` import each other (both stay in
  `worker/`), and in the webview `app-state.ts` is imported by, and imports, `app-refresh.ts`, `app-settings.ts`,
  `app-walk.ts` and `app-working.ts` (a five-file cycle). **All five go to `app/` together, so no move splits a cycle across
  folders.** No other module cycle exists.
- Folder-level coupling that exists today as file imports and becomes visible, and is not changed here. In the webview,
  `app/` imports `graph/layout/placement` and `graph/viewport/reveal`; `view/` imports `graph/constants`, `graph/layout/*` and
  `graph/nodes/node-size`; and the other way `graph/*` imports `app/app-state` and `view/types`, so `app` and `view` each form a
  loop with `graph` at folder level (the files do not). Inside `graph/`, `nodes/supplier-labels.ts` imports
  `layout/compare-ids.ts` and `layout/tidy-graph.ts` imports `nodes/node-size.ts`. Core and the extension have no such loop:
  in core `callers` imports `callees` (only `passing`), `nodes` and `focus`, `callees` imports `nodes` and `focus`, `nodes`
  imports `focus`, and `focus` and `project` import nothing from another folder; in the extension `vscode` imports `session`,
  `changes` and `settings`, `session` imports `changes`, `settings` and `worker`, `worker` imports `changes`, and `panel`,
  `changes` and `settings` import nothing from another folder (only `ids.ts` and `ports.ts` at the top).

**tests**
- core: the 13 scenario tests that enter only through `analyze.ts` (`aliases`, `barrel`, `constructors`, `default-exports`,
  `edge-ids`, `expand-resolution`, `expand`, `module-callers`, `node-not-found`, `passes`, `qualified-ids`, `unknown-nodes`,
  `wrapped-consts`) stay at the top with `analyze.test.ts`, `analyze-at.test.ts` and `smoke.test.ts` (rule 3 and 2). That
  leaves 16 test files and `helpers.ts` at the top of `core/test`, against 36 today.
- core: `project.test.ts` goes to `project/` (it tests `findTsconfig`, `loadProject` and `warmProject`); it reads the analyze
  golden through `new URL`, which is edited. `arrow-consts`, `callees-order`, `jsx-edges`, `jsx-external` and `jsx` go to
  `callees/` (they call `collectCalleeEdges` directly or through `helpers.collectMemoryPage`); `callers-jsx` to `callers/`
  (its describe is `collectCallerEdges`).
- extension: `manifest.test.ts`, `readme.test.ts` and `vsix-files.test.ts` stay at the top (rule 4): they cover `package.json`,
  the root README and `scripts/vsix-files.mjs`, and they reach those by paths from their own place. `worker-integration.test.ts`
  goes to `worker/` with the other four `worker-*` tests (it spawns `src/worker/spawn.ts` and `worker-client.ts`); its `packageDir`
  is edited. `session-crash.test.ts` goes to `session/` (it drives `GraphSession` through a crashing worker client).
  `webview-messages.test.ts` goes to `panel/` (it tests `src/panel/messages.ts`).
- webview: `core-types-entry.test.ts` stays at the top (rule 4: it scans all of `src`). `order-paths.test.ts`,
  `graph-column-gap.test.ts` and `history.test.ts` go to `view/`: what decides them is `view/refresh`, `view/graph-state` and
  `view/view-state` (layout calls only set the scene). `app-toolbar.test.ts` goes to `app/` (it tests `goBack` and `isWorking`).
  `layout-browser.test.ts` goes to `graph/layout/` (it bundles `layout.ts` for a browser-like context; two path edits).
- Where the owner might disagree: the 16 loose core tests at the top, and the weak webview placements above. They are decisions
  of this plan, listed here so they can be changed with a later one-line move.

## Facts verified (HEAD `18c3bb9`)

Everything below was read from the code or run in a throwaway copy of the repo outside the working tree.

**Path strings and settings that name a place, and what happens if one is left wrong.** TypeScript checks the import paths
(`pnpm -r typecheck` fails on a wrong one). These it does not check:

| # | Where | What it is | Moves? | If left wrong | Handling |
|---|---|---|---|---|---|
| 1 | `core/test/project.test.ts:121-124` | `new URL("./__goldens__/basic-handleSignup.json", import.meta.url)` read with `readFileSync` | to `test/project/` | loud: ENOENT, one test fails | edit to `../__goldens__/...` (Task 1) |
| 2 | `core/test/analyze.test.ts:71`, `:113` | `toMatchFileSnapshot("./__goldens__/...")` | stays | **silent**: vitest writes a new file and passes ("Snapshots 1 written"); shown in the replay | file stays and is not edited; P6 catches a stray file; Task 1 proves it |
| 3 | `core/test/helpers.ts:9`, `:13` | `resolve(here, "../../../test-code", ...)` | stays | none | none |
| 4 | `core/test/arrow-consts.test.ts:64` | an import line inside a template string, naming `./helpers` | to `test/callees/` | silent change of the test's input if a text rewriter touches it | do not touch; P4 shows it unchanged |
| 5 | `extension/test/worker-integration.test.ts:14` (used at `:15`, `:24`) | `packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")`, then `join(packageDir, "dist/worker.cjs")` and `execFileSync(node, ["build.mjs"], { cwd: packageDir })` | to `test/worker/` | loud: "Cannot find module .../test/build.mjs", the file fails and its 4 tests are `skipped` | edit to `"../.."` (Task 2) |
| 6 | `webview/test/layout-browser.test.ts:7` and `:10` | `packageDir = resolve(dirname(...), "..")` used as esbuild's `resolveDir`, and the text `import { layoutGraph } from "./src/graph/layout.ts";` inside the `entry` template | to `test/graph/layout/` | loud: esbuild "Build failed with 1 error" for each | edit line 7 to `"../../.."` and line 10 to `./src/graph/layout/layout.ts` (Task 4) |
| 7 | `webview/package.json:7-9` | `exports` targets `./src/protocol.ts`, `./src/column-gap.ts`, `./src/edge-style.ts` | all three files move | loud: `pnpm -r typecheck` fails with TS2307 in the extension | edit the targets, keep the keys (Task 3) |
| 8 | `webview/src/main.tsx:5` | `import "./graph/node-labels.css"` | the css moves to `graph/nodes/` | loud: esbuild error | rewritten with the other imports (Task 4); `:4`, `:6`, `:7` do not move |

Looked at and **not** affected, so no task edits them:
- Tests that build a path from their own place and stay put: `core/test/helpers.ts`, `extension/test/manifest.test.ts:17,106`
  (root `package.json`), `extension/test/readme.test.ts:8-9` (root README), `extension/test/support/fixtures.ts:6,8,33` (`test-code`
  and core's goldens), `extension/test/support/manifest.ts:33,36`, `extension/test/vsix-files.test.ts:5` (`../scripts/vsix-files.mjs`),
  `webview/test/core-types-entry.test.ts:6-7` (walks all of `src` recursively, so it sees the new folders),
  `webview/test/support/slices.ts:11,15` (core's goldens).
- Core's goldens are read by relative path from `cli/test/cli.test.ts:16`, `cli/test/timing.test.ts:12`,
  `extension/test/support/fixtures.ts:33`, `webview/test/support/slices.ts:15` and `core/test/analyze.test.ts`, `project.test.ts`.
  `test-code/` is reached by relative path from `core/test/helpers.ts:13`, `cli/test/cli.test.ts:12`, `cli/test/timing.test.ts:8`,
  `extension/test/support/fixtures.ts:8` and `extension/smoke/run.ts:40`. None of these places moves.
- Esbuild entries: `extension/build.mjs:11-12` (`src/extension.ts`, `src/worker.ts`), `webview/build.mjs:8` (`src/main.tsx`),
  `extension/build-smoke.mjs:4-6` (`smoke/...`); all stay. `extension/smoke/suite/extension.smoke.ts:6` imports
  `../../src/extension.js`, which stays. The smoke runner and `scripts/*.mjs` name no path in `src` or `test`.
- The extension finds its worker with `join(context.extensionPath, "dist", "worker.cjs")` (`extension.ts:38`) and the webview
  assets with `joinPath(extensionUri, "dist", "webview")` (`panel/graph-panel.ts:39`): both are `dist`, not `src`.
- `webview/probe/run.mjs:51` bundles `../extension/src/panel/html.ts`. `panel/` does not move, so the probe needs no edit. The
  rest of the probe names no path in `src` or `test`.
- `createRequire(import.meta.url)` in `core/src/ts-morph-paths.ts:49-50` and `core/test/ts-morph-paths.test.ts:5` resolves
  `ts-morph` by node resolution, which does not depend on the folder depth.
- Module mocks and dynamic imports: **none exist.** A search of every `src`, `test`, `smoke`, `probe` and `scripts` folder for
  `vi.mock`, `vi.doMock`, `vi.importActual`, `vi.importMock`, `vi.hoisted`, `vi.unmock`, `importOriginal` and `import(` found
  nothing. `vi.mocked` (`extension/test/session-refresh-unsaved.test.ts:21`) is a typing helper for an existing mock, not a
  path. There is therefore no `vi.mock` path to prove live; the proofs for the table above stand in for it. In the `src`
  folders of core, extension and webview the only `import.meta` is `core/src/ts-morph-paths.ts:49` (the bullet above);
  `new URL(` and `import.meta.url` elsewhere are in tests, scripts, build files and the probe, all listed above or unaffected
  (`extension/scripts/*.mjs`, `webview/build.mjs:25`, `extension/build.mjs:5`, `webview/probe/run.mjs:20,23`, which resolve
  `dist`, `.vscode-test`, `README.md` and `vscode-version.json`, none of which moves).
- Consumers of the webview exports: 14 import lines in 13 extension files (`@code-spider/webview/protocol` 11,
  `/edge-style` 2, `/column-gap` 1): `src/panel/message-gate.ts:1`, `panel/messages.ts:1-2`, `panel/graph-panel.ts:4`,
  `ports.ts:2`, `navigation.ts:3`, `extension.ts:2`, `source-changes.ts:1`, `session-refresh.ts:3`, `column-gap.ts:1`,
  `edge-style-store.ts:4`, `dispatch.ts:1`, `test/message-gate.test.ts:4`, `test/support/session-setup.ts:2`. They import by
  key, so none is edited. Imports of `@code-spider/core` (17) and `@code-spider/core/types` (42) all use the two package
  entries; nothing imports deeper into core, so core's moves cannot break another package.
- No CSS file uses `@import` or `url(`. The four stylesheets are imported only from `main.tsx`.
- Root `README.md`: no path other than `packages/extension/package.json` (line 44).

**Folder files after the moves** (the integration review counts these):

| Folder | Files | Folder | Files |
|---|---|---|---|
| `core/src` | 4 | `core/test` | 17 (16 tests, `helpers.ts`) |
| `core/src/{project,focus,nodes,callees,callers}` | 2, 4, 5, 5, 2 | `core/test/{project,focus,nodes,callees,callers}` | 2, 2, 5, 6, 4 |
| `core/test/__goldens__` | 2 | | |
| `extension/src` | 4 | `extension/test` | 3 (plus `support/` 3) |
| `extension/src/{session,changes,settings}` | 6, 5, 3 | `extension/test/{session,changes,settings,panel,worker}` | 10, 5, 3, 3, 5 |
| `extension/src/{panel,vscode,worker}` | 4, 7, 6 | | |
| `webview/src` | 3 | `webview/test` | 2 (`core-types-entry.test.ts`, `tsconfig.json`; plus `support/` 10) |
| `webview/src/{app,host,settings}` | 10, 3, 2 | `webview/test/{app,host,settings,view,toolbar}` | 10, 1, 2, 13, 2 |
| `webview/src/graph` | 6 | `webview/test/graph` | 3 |
| `webview/src/graph/{layout,nodes,viewport}` | 9, 9, 5 | `webview/test/graph/{layout,nodes,viewport}` | 15, 6, 4 |
| `webview/src/{toolbar,view}` | 4, 7 | | |

**Replay totals** (all four tasks on a throwaway copy): 171 renames (37, 40, 43, 51) and 32 files edited in place; 203 files, 639
insertions, 538 deletions; lowest rename similarity 69%.

## Move tables

Paths are relative to the package named above each table. "Task" is the task that moves the file. A row that says "stays" is
not moved; if the Note says its import paths are edited, the task that edits it names it under "Edited in place". The
folders `extension/src/panel` (graph-panel.ts, html.ts, message-gate.ts, messages.ts), `extension/src/vscode` (documents.ts,
editor.ts, focus-request.ts, notifier.ts, settings.ts, status-bar.ts, watchers.ts), `extension/src/worker` (apply-changes.ts,
handler.ts, project-cache.ts, protocol.ts, spawn.ts, worker-client.ts), `webview/src/toolbar` (spacing-control.ts, toolbar.css,
Toolbar.tsx, use-spacing-control.ts) and `webview/src/view` (expansion.ts, graph-state.ts, persist.ts, refresh-order.ts,
refresh.ts, types.ts, view-state.ts) are unchanged; their files are edited only where an import changed.

Two `debounce.ts` and two `column-gap.ts` exist, one in the extension and one in the webview: they are different files with
different destinations (the extension's go to `changes/` and `settings/`, the webview's to `app/` and `settings/`), and the
tables name the package each time. The names `protocol.ts` and `messages.ts` are also used twice, but the extension's are
`src/worker/protocol.ts` and `src/panel/messages.ts`, which do not move; only the webview's `protocol.ts` and `messages.ts` move
(to `host/`).

### packages/core, source

| Old path | New path | Task | Note |
|---|---|---|---|
| `src/analyze.ts` | stays | - | stays; its import paths are edited |
| `src/bound-functions.ts` | `src/focus/bound-functions.ts` | 1 |  |
| `src/callable-names.ts` | `src/focus/callable-names.ts` | 1 |  |
| `src/callees.ts` | `src/callees/callees.ts` | 1 |  |
| `src/callers.ts` | `src/callers/callers.ts` | 1 |  |
| `src/classify.ts` | `src/nodes/classify.ts` | 1 |  |
| `src/errors.ts` | stays | - |  |
| `src/externals.ts` | `src/nodes/externals.ts` | 1 |  |
| `src/focus.ts` | `src/focus/focus.ts` | 1 |  |
| `src/graph-helpers.ts` | `src/callees/graph-helpers.ts` | 1 |  |
| `src/index.ts` | stays | - | stays; its re-export paths are edited |
| `src/jsx-edges.ts` | `src/callees/jsx-edges.ts` | 1 |  |
| `src/labels.ts` | `src/nodes/labels.ts` | 1 |  |
| `src/node-builder.ts` | `src/nodes/node-builder.ts` | 1 |  |
| `src/node-id.ts` | `src/nodes/node-id.ts` | 1 |  |
| `src/pass-edges.ts` | `src/callees/pass-edges.ts` | 1 |  |
| `src/passing.ts` | `src/callees/passing.ts` | 1 |  |
| `src/position.ts` | `src/focus/position.ts` | 1 |  |
| `src/project.ts` | `src/project/project.ts` | 1 |  |
| `src/references.ts` | `src/callers/references.ts` | 1 |  |
| `src/ts-morph-paths.ts` | `src/project/ts-morph-paths.ts` | 1 |  |
| `src/types.ts` | stays | - |  |

### packages/core, tests

| Old path | New path | Task | Note |
|---|---|---|---|
| `test/aliases.test.ts` | stays | - |  |
| `test/analyze-at.test.ts` | stays | - | stays; its import paths are edited |
| `test/analyze.test.ts` | stays | - | stays; holds the two `toMatchFileSnapshot` paths, which must not change |
| `test/arrow-consts.test.ts` | `test/callees/arrow-consts.test.ts` | 1 |  |
| `test/barrel.test.ts` | stays | - |  |
| `test/callees-order.test.ts` | `test/callees/callees-order.test.ts` | 1 |  |
| `test/callees.test.ts` | `test/callees/callees.test.ts` | 1 |  |
| `test/callers-jsx.test.ts` | `test/callers/callers-jsx.test.ts` | 1 |  |
| `test/callers-shapes.test.ts` | `test/callers/callers-shapes.test.ts` | 1 |  |
| `test/callers.test.ts` | `test/callers/callers.test.ts` | 1 |  |
| `test/classify.test.ts` | `test/nodes/classify.test.ts` | 1 |  |
| `test/constructors.test.ts` | stays | - |  |
| `test/default-exports.test.ts` | stays | - |  |
| `test/edge-ids.test.ts` | stays | - | stays; its import paths are edited |
| `test/expand-resolution.test.ts` | stays | - |  |
| `test/expand.test.ts` | stays | - |  |
| `test/externals.test.ts` | `test/nodes/externals.test.ts` | 1 |  |
| `test/focus.test.ts` | `test/focus/focus.test.ts` | 1 |  |
| `test/helpers.ts` | stays | - | stays; shared by every folder; its import paths are edited, its `test-code` path is not |
| `test/jsx-edges.test.ts` | `test/callees/jsx-edges.test.ts` | 1 |  |
| `test/jsx-external.test.ts` | `test/callees/jsx-external.test.ts` | 1 |  |
| `test/jsx.test.ts` | `test/callees/jsx.test.ts` | 1 |  |
| `test/labels.test.ts` | `test/nodes/labels.test.ts` | 1 |  |
| `test/module-callers.test.ts` | stays | - |  |
| `test/node-builder.test.ts` | `test/nodes/node-builder.test.ts` | 1 |  |
| `test/node-id.test.ts` | `test/nodes/node-id.test.ts` | 1 |  |
| `test/node-not-found.test.ts` | stays | - |  |
| `test/passes.test.ts` | stays | - |  |
| `test/position.test.ts` | `test/focus/position.test.ts` | 1 |  |
| `test/project.test.ts` | `test/project/project.test.ts` | 1 | golden URL edited: `./__goldens__/` becomes `../__goldens__/` |
| `test/qualified-ids.test.ts` | stays | - |  |
| `test/references.test.ts` | `test/callers/references.test.ts` | 1 |  |
| `test/smoke.test.ts` | stays | - |  |
| `test/ts-morph-paths.test.ts` | `test/project/ts-morph-paths.test.ts` | 1 |  |
| `test/unknown-nodes.test.ts` | stays | - |  |
| `test/wrapped-consts.test.ts` | stays | - |  |

### packages/core, goldens (do not move)

| Old path | New path | Task | Note |
|---|---|---|---|
| `test/__goldens__/basic-handleSignup.json` | stays | - | stays; read by the CLI tests, the extension fixtures and the webview support by relative paths |
| `test/__goldens__/jsx-Page.json` | stays | - | stays; written and read through `toMatchFileSnapshot` in `analyze.test.ts` |

### packages/extension, source (top level only)

| Old path | New path | Task | Note |
|---|---|---|---|
| `src/changes.ts` | `src/changes/changes.ts` | 2 |  |
| `src/column-gap.ts` | `src/settings/column-gap.ts` | 2 |  |
| `src/debounce.ts` | `src/changes/debounce.ts` | 2 |  |
| `src/dispatch.ts` | `src/session/dispatch.ts` | 2 |  |
| `src/edge-style-store.ts` | `src/settings/edge-style-store.ts` | 2 |  |
| `src/extension.ts` | stays | - | stays; esbuild entry; its import paths are edited |
| `src/ids.ts` | stays | - |  |
| `src/jump-table.ts` | `src/session/jump-table.ts` | 2 |  |
| `src/navigation.ts` | `src/session/navigation.ts` | 2 |  |
| `src/ports.ts` | stays | - | stays; used from session, vscode and the top |
| `src/ranges.ts` | `src/session/ranges.ts` | 2 |  |
| `src/session-refresh.ts` | `src/session/session-refresh.ts` | 2 |  |
| `src/session.ts` | `src/session/session.ts` | 2 |  |
| `src/settings-values.ts` | `src/settings/settings-values.ts` | 2 |  |
| `src/source-changes.ts` | `src/changes/source-changes.ts` | 2 |  |
| `src/warm-once.ts` | `src/changes/warm-once.ts` | 2 |  |
| `src/watched-paths.ts` | `src/changes/watched-paths.ts` | 2 |  |
| `src/worker.ts` | stays | - | stays; esbuild entry |

### packages/extension, tests

| Old path | New path | Task | Note |
|---|---|---|---|
| `test/changes.test.ts` | `test/changes/changes.test.ts` | 2 |  |
| `test/column-gap.test.ts` | `test/settings/column-gap.test.ts` | 2 |  |
| `test/debounce.test.ts` | `test/changes/debounce.test.ts` | 2 |  |
| `test/dispatch.test.ts` | `test/session/dispatch.test.ts` | 2 |  |
| `test/edge-style-store.test.ts` | `test/settings/edge-style-store.test.ts` | 2 |  |
| `test/html.test.ts` | `test/panel/html.test.ts` | 2 |  |
| `test/jump-table.test.ts` | `test/session/jump-table.test.ts` | 2 |  |
| `test/manifest.test.ts` | stays | - | stays; covers the manifest, `ids`, `changes` and `settings-values`; its import paths are edited, its root `package.json` path is not |
| `test/message-gate.test.ts` | `test/panel/message-gate.test.ts` | 2 |  |
| `test/navigation.test.ts` | `test/session/navigation.test.ts` | 2 |  |
| `test/ranges.test.ts` | `test/session/ranges.test.ts` | 2 |  |
| `test/readme.test.ts` | stays | - | stays; reads the root README by a path from its own place, which must not change |
| `test/session-closed.test.ts` | `test/session/session-closed.test.ts` | 2 |  |
| `test/session-crash.test.ts` | `test/session/session-crash.test.ts` | 2 |  |
| `test/session-nodes.test.ts` | `test/session/session-nodes.test.ts` | 2 |  |
| `test/session-refresh-unsaved.test.ts` | `test/session/session-refresh-unsaved.test.ts` | 2 |  |
| `test/session-refresh.test.ts` | `test/session/session-refresh.test.ts` | 2 |  |
| `test/session.test.ts` | `test/session/session.test.ts` | 2 |  |
| `test/settings-values.test.ts` | `test/settings/settings-values.test.ts` | 2 |  |
| `test/source-changes.test.ts` | `test/changes/source-changes.test.ts` | 2 |  |
| `test/vsix-files.test.ts` | stays | - | stays; covers `scripts/vsix-files.mjs`, not `src` |
| `test/warm-once.test.ts` | `test/changes/warm-once.test.ts` | 2 |  |
| `test/watched-paths.test.ts` | `test/changes/watched-paths.test.ts` | 2 |  |
| `test/webview-messages.test.ts` | `test/panel/webview-messages.test.ts` | 2 |  |
| `test/worker-changes.test.ts` | `test/worker/worker-changes.test.ts` | 2 |  |
| `test/worker-client.test.ts` | `test/worker/worker-client.test.ts` | 2 |  |
| `test/worker-handler.test.ts` | `test/worker/worker-handler.test.ts` | 2 |  |
| `test/worker-integration.test.ts` | `test/worker/worker-integration.test.ts` | 2 | `packageDir` edited: `".."` becomes `"../.."` |
| `test/worker-refresh.test.ts` | `test/worker/worker-refresh.test.ts` | 2 |  |

### packages/extension, test support (do not move)

| Old path | New path | Task | Note |
|---|---|---|---|
| `test/support/fixtures.ts` | stays | - | stays; paths to `test-code` and to core's goldens are from its own place |
| `test/support/manifest.ts` | stays | - | stays; the path to `package.json` is from its own place |
| `test/support/session-setup.ts` | stays | - | stays; its import paths are edited |

### packages/webview, source (top level)

| Old path | New path | Task | Note |
|---|---|---|---|
| `src/app-refresh.ts` | `src/app/app-refresh.ts` | 3 |  |
| `src/app-settings.ts` | `src/app/app-settings.ts` | 3 |  |
| `src/app-state.ts` | `src/app/app-state.ts` | 3 |  |
| `src/app-walk.ts` | `src/app/app-walk.ts` | 3 |  |
| `src/app-working.ts` | `src/app/app-working.ts` | 3 |  |
| `src/App.tsx` | stays | - | stays; its import paths are edited |
| `src/column-gap.ts` | `src/settings/column-gap.ts` | 3 |  |
| `src/debounce.ts` | `src/app/debounce.ts` | 3 |  |
| `src/delayed-flag.ts` | `src/app/delayed-flag.ts` | 3 |  |
| `src/edge-style.ts` | `src/settings/edge-style.ts` | 3 |  |
| `src/main.tsx` | stays | - | stays; esbuild entry |
| `src/messages.ts` | `src/host/messages.ts` | 3 |  |
| `src/protocol.ts` | `src/host/protocol.ts` | 3 |  |
| `src/styles.css` | stays | - |  |
| `src/use-delayed-flag.ts` | `src/app/use-delayed-flag.ts` | 3 |  |
| `src/use-persisted-view.ts` | `src/app/use-persisted-view.ts` | 3 |  |
| `src/use-walk-timers.ts` | `src/app/use-walk-timers.ts` | 3 |  |
| `src/vscode-api.ts` | `src/host/vscode-api.ts` | 3 |  |

### packages/webview, source `graph/`

| Old path | New path | Task | Note |
|---|---|---|---|
| `src/graph/call-order.ts` | `src/graph/layout/call-order.ts` | 4 |  |
| `src/graph/code-lines.ts` | `src/graph/nodes/code-lines.ts` | 4 |  |
| `src/graph/compare-ids.ts` | `src/graph/layout/compare-ids.ts` | 4 |  |
| `src/graph/constants.ts` | stays | - |  |
| `src/graph/edge-appearance.ts` | stays | - |  |
| `src/graph/graph.css` | stays | - |  |
| `src/graph/GraphView.tsx` | stays | - | stays; its import paths are edited |
| `src/graph/jump.ts` | stays | - | stays; its import paths are edited |
| `src/graph/layout.ts` | `src/graph/layout/layout.ts` | 4 |  |
| `src/graph/live-positions.ts` | `src/graph/viewport/live-positions.ts` | 4 |  |
| `src/graph/lod.ts` | `src/graph/viewport/lod.ts` | 4 |  |
| `src/graph/make-room.ts` | `src/graph/layout/make-room.ts` | 4 |  |
| `src/graph/node-context.ts` | `src/graph/nodes/node-context.ts` | 4 |  |
| `src/graph/node-controls.ts` | `src/graph/nodes/node-controls.ts` | 4 |  |
| `src/graph/node-labels.css` | `src/graph/nodes/node-labels.css` | 4 |  |
| `src/graph/node-size.ts` | `src/graph/nodes/node-size.ts` | 4 |  |
| `src/graph/NodeBox.tsx` | `src/graph/nodes/NodeBox.tsx` | 4 |  |
| `src/graph/NodeLabels.tsx` | `src/graph/nodes/NodeLabels.tsx` | 4 |  |
| `src/graph/order-columns.ts` | `src/graph/layout/order-columns.ts` | 4 |  |
| `src/graph/pan-to-reveal.ts` | `src/graph/viewport/pan-to-reveal.ts` | 4 |  |
| `src/graph/placement.ts` | `src/graph/layout/placement.ts` | 4 |  |
| `src/graph/reveal.ts` | `src/graph/viewport/reveal.ts` | 4 |  |
| `src/graph/SpiderNode.tsx` | `src/graph/nodes/SpiderNode.tsx` | 4 |  |
| `src/graph/supplier-labels.ts` | `src/graph/nodes/supplier-labels.ts` | 4 |  |
| `src/graph/tidy-graph.ts` | `src/graph/layout/tidy-graph.ts` | 4 |  |
| `src/graph/tidy.ts` | `src/graph/layout/tidy.ts` | 4 |  |
| `src/graph/to-flow.ts` | stays | - | stays; its import paths are edited |
| `src/graph/use-layout.ts` | `src/graph/layout/use-layout.ts` | 4 |  |
| `src/graph/viewport-requests.tsx` | `src/graph/viewport/viewport-requests.tsx` | 4 |  |

### packages/webview, tests

| Old path | New path | Task | Note |
|---|---|---|---|
| `test/app-refresh-view.test.ts` | `test/app/app-refresh-view.test.ts` | 3 |  |
| `test/app-refresh.test.ts` | `test/app/app-refresh.test.ts` | 3 |  |
| `test/app-settings.test.ts` | `test/app/app-settings.test.ts` | 3 |  |
| `test/app-source-version.test.ts` | `test/app/app-source-version.test.ts` | 3 |  |
| `test/app-state.test.ts` | `test/app/app-state.test.ts` | 3 |  |
| `test/app-toolbar.test.ts` | `test/app/app-toolbar.test.ts` | 3 |  |
| `test/app-walk-batches.test.ts` | `test/app/app-walk-batches.test.ts` | 3 |  |
| `test/app-walk.test.ts` | `test/app/app-walk.test.ts` | 3 |  |
| `test/call-order.test.ts` | `test/graph/layout/call-order.test.ts` | 4 |  |
| `test/code-lines.test.ts` | `test/graph/nodes/code-lines.test.ts` | 4 |  |
| `test/column-gap.test.ts` | `test/settings/column-gap.test.ts` | 3 |  |
| `test/core-types-entry.test.ts` | stays | - | stays; scans all of `src` by a path from its own place, which must not change |
| `test/debounce.test.ts` | `test/app/debounce.test.ts` | 3 |  |
| `test/delayed-flag.test.ts` | `test/app/delayed-flag.test.ts` | 3 |  |
| `test/edge-appearance.test.ts` | `test/graph/edge-appearance.test.ts` | 4 |  |
| `test/edge-style.test.ts` | `test/settings/edge-style.test.ts` | 3 |  |
| `test/expansion.test.ts` | `test/view/expansion.test.ts` | 3 |  |
| `test/graph-column-gap.test.ts` | `test/view/graph-column-gap.test.ts` | 3 |  |
| `test/graph-state-dangling.test.ts` | `test/view/graph-state-dangling.test.ts` | 3 |  |
| `test/graph-state.test.ts` | `test/view/graph-state.test.ts` | 3 |  |
| `test/history.test.ts` | `test/view/history.test.ts` | 3 |  |
| `test/jump.test.ts` | `test/graph/jump.test.ts` | 4 |  |
| `test/layout-browser.test.ts` | `test/graph/layout/layout-browser.test.ts` | 4 | `packageDir` edited: `".."` becomes `"../../.."`; the entry text names `./src/graph/layout/layout.ts` |
| `test/layout-graph.test.ts` | `test/graph/layout/layout-graph.test.ts` | 4 |  |
| `test/layout-order-property.test.ts` | `test/graph/layout/layout-order-property.test.ts` | 4 |  |
| `test/layout.test.ts` | `test/graph/layout/layout.test.ts` | 4 |  |
| `test/live-positions.test.ts` | `test/graph/viewport/live-positions.test.ts` | 4 |  |
| `test/lod.test.ts` | `test/graph/viewport/lod.test.ts` | 4 |  |
| `test/make-room.test.ts` | `test/graph/layout/make-room.test.ts` | 4 |  |
| `test/messages.test.ts` | `test/host/messages.test.ts` | 3 |  |
| `test/node-box.test.tsx` | `test/graph/nodes/node-box.test.tsx` | 4 |  |
| `test/node-controls.test.ts` | `test/graph/nodes/node-controls.test.ts` | 4 |  |
| `test/node-labels.test.tsx` | `test/graph/nodes/node-labels.test.tsx` | 4 |  |
| `test/node-size.test.ts` | `test/graph/nodes/node-size.test.ts` | 4 |  |
| `test/order-columns.test.ts` | `test/graph/layout/order-columns.test.ts` | 4 |  |
| `test/order-paths.test.ts` | `test/view/order-paths.test.ts` | 3 |  |
| `test/pan-to-reveal.test.ts` | `test/graph/viewport/pan-to-reveal.test.ts` | 4 |  |
| `test/persist.test.ts` | `test/view/persist.test.ts` | 3 |  |
| `test/placement-order-property.test.ts` | `test/graph/layout/placement-order-property.test.ts` | 4 |  |
| `test/placement-order.test.ts` | `test/graph/layout/placement-order.test.ts` | 4 |  |
| `test/placement-property.test.ts` | `test/graph/layout/placement-property.test.ts` | 4 |  |
| `test/placement.test.ts` | `test/graph/layout/placement.test.ts` | 4 |  |
| `test/rebuild-graph-order-edges.test.ts` | `test/view/rebuild-graph-order-edges.test.ts` | 3 |  |
| `test/rebuild-graph-order-property.test.ts` | `test/view/rebuild-graph-order-property.test.ts` | 3 |  |
| `test/rebuild-graph-order.test.ts` | `test/view/rebuild-graph-order.test.ts` | 3 |  |
| `test/rebuild-graph-placement.test.ts` | `test/view/rebuild-graph-placement.test.ts` | 3 |  |
| `test/rebuild-graph-property.test.ts` | `test/view/rebuild-graph-property.test.ts` | 3 |  |
| `test/rebuild-graph.test.ts` | `test/view/rebuild-graph.test.ts` | 3 |  |
| `test/reveal.test.ts` | `test/graph/viewport/reveal.test.ts` | 4 |  |
| `test/spacing-control.test.ts` | `test/toolbar/spacing-control.test.ts` | 3 |  |
| `test/supplier-labels.test.ts` | `test/graph/nodes/supplier-labels.test.ts` | 4 |  |
| `test/tidy-graph-order.test.ts` | `test/graph/layout/tidy-graph-order.test.ts` | 4 |  |
| `test/tidy-graph.test.ts` | `test/graph/layout/tidy-graph.test.ts` | 4 |  |
| `test/tidy-pinned-order.test.ts` | `test/graph/layout/tidy-pinned-order.test.ts` | 4 |  |
| `test/tidy.test.ts` | `test/graph/layout/tidy.test.ts` | 4 |  |
| `test/to-flow.test.ts` | `test/graph/to-flow.test.ts` | 4 |  |
| `test/toolbar.test.tsx` | `test/toolbar/toolbar.test.tsx` | 3 |  |
| `test/tsconfig.json` | stays | - | includes `.`, so every nested folder is covered |

### packages/webview, test support (do not move)

| Old path | New path | Task | Note |
|---|---|---|---|
| `test/support/flow.ts` | stays | - |  |
| `test/support/geometry.ts` | stays | - | stays; its import paths are edited |
| `test/support/graph-states.ts` | stays | - |  |
| `test/support/main-shape.ts` | stays | - |  |
| `test/support/order-graphs.ts` | stays | - | stays; its import paths are edited |
| `test/support/pinned-column.ts` | stays | - | stays; its import paths are edited |
| `test/support/random-specs.ts` | stays | - |  |
| `test/support/random.ts` | stays | - |  |
| `test/support/refresh-order.ts` | stays | - | stays; its import paths are edited |
| `test/support/slices.ts` | stays | - | stays; the path to core's goldens is from its own place |

## Proof kit

Every task uses these. `<pkg>` is `core`, `cli`, `webview` or `extension`; `<name>` is its pnpm name (`@code-spider/core`,
`@code-spider/cli`, `@code-spider/webview`, `code-spider-vscode`).

**P1 Before-snapshot.** Taken on the clean tree, at the task's start, before the first `git mv`.
```
cd /home/motodox/code/AlekP141/code-spider && pnpm build && mkdir -p <scratch>/before && command cp -f packages/extension/dist/extension.cjs packages/extension/dist/worker.cjs packages/extension/dist/webview/index.js packages/extension/dist/webview/index.css <scratch>/before/
cd /home/motodox/code/AlekP141/code-spider && pnpm --filter <name> exec vitest run --reporter=json --outputFile=<scratch>/before/<pkg>.json
cd /home/motodox/code/AlekP141/code-spider && node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));for(const f of r.testResults)for(const t of f.assertionResults)console.log(f.name.split("/").pop()+" :: "+t.fullName+" :: "+t.status)' <scratch>/before/<pkg>.json | LC_ALL=C sort > <scratch>/before/<pkg>.names
```
The `.names` file has one line per test: file name, full test name, status. Check it first: `wc -l` is 250 / 39 / 507 / 216, and
`cut -d' ' -f1 <file> | sort -u | wc -l` is 35 / 3 / 57 / 29 files, all `passed`. The extension run rebuilds `dist/` as a
side effect (its integration test runs `build.mjs`); that is harmless.

**P2 After-snapshot and name comparison.** The same three commands with `after` in place of `before`, then
`diff <scratch>/before/<pkg>.names <scratch>/after/<pkg>.names`. Expected: no output. A test file that no longer loads, a
dropped file, a renamed test and a test that became `skipped` all show up as lines. Task 4 compares against the
`<scratch>/before/webview.names` that Task 3 saved (Task 3 changes no test name, which P2 proved).

**P3 Shape of the delta.**
```
cd /home/motodox/code/AlekP141/code-spider && git diff HEAD -M --name-status | cut -c1 | sort | uniq -c
cd /home/motodox/code/AlekP141/code-spider && git diff HEAD -M --shortstat
cd /home/motodox/code/AlekP141/code-spider && git status --short | grep -v -E '^(R |RM| M)'
cd /home/motodox/code/AlekP141/code-spider && git status --short | awk '{print $NF}' | grep -v -E '^<allowed paths of the task>'
```
Expected: only the letters `R` and `M`, with the task's counts; the shortstat the task gives; the last two commands print
nothing (no added, deleted or untracked file, nothing outside the task's folders). In the replay every rename was detected at
69% similarity or more, so `R` is reliable; a `D` plus an `A` means a file changed too much and must be looked at.

**P4 Content check: nothing in a moved or edited file changed except import paths.** Strips every import and export-from
statement from the old and the new version of each file and compares the rest.
```
cd /home/motodox/code/AlekP141/code-spider && strip() { perl -0pe 's/^(?:import|export)\b[^;]*?\bfrom\s+"[^"]*";\n//mg; s/^import\s+"[^"]*";\n//mg'; }; git diff HEAD -M --name-status | while IFS=$'\t' read -r st old new; do case "$st" in R*) ;; M) new=$old ;; *) echo "UNEXPECTED $st $old"; continue ;; esac; d=$(diff <(git show "HEAD:$old" | strip) <(strip < "$new")); if [ -n "$d" ]; then echo "--- $new"; echo "$d"; fi; done
```
Expected output: exactly the path-string edits the task lists, and nothing else. Two limits, both covered by explicit
steps: a template-literal line that starts in column 0 with `import ... from "...";` is stripped from both sides (so
`layout-browser.test.ts:10` is checked separately in Task 4), and the filter says nothing about the import lines themselves
(TypeScript and the tests check those).

**P5 Bundles.** The four files that ship. esbuild writes each module's path as a comment line, so a move changes those lines
and nothing else; the check removes them.
```
cd /home/motodox/code/AlekP141/code-spider && pnpm build && for f in packages/extension/dist/extension.cjs packages/extension/dist/worker.cjs packages/extension/dist/webview/index.js packages/extension/dist/webview/index.css; do printf '%s bytes, hash without path comments ' "$(stat -c%s $f)"; grep -v -E '^\s*// [^ ]+\.(ts|tsx|js|mjs|cjs|css|json)$' $f | sha256sum | cut -c1-12; done
```
Run the same loop over the saved files, with `for f in <scratch>/before/extension.cjs <scratch>/before/worker.cjs
<scratch>/before/index.js <scratch>/before/index.css` (nothing else in the loop changes). Expected: the hash without path
comments is the same before and after for all four files. Measured in the replay at HEAD `18c3bb9`: builds are deterministic (two builds gave the
same hash), and the hashes without path comments are `extension.cjs` `8f1a21977fbf`, `worker.cjs` `7390324b6d10`,
`webview/index.js` `a4a160a1c352`, `webview/index.css` `5e43d56628b7`, at every stage. If HEAD is no longer `18c3bb9`, use
your own P1 build as the reference and ignore these values. The plain sizes change only through the length of the path
comments, and these are the sizes measured:

| Stage | `extension.cjs` | `worker.cjs` | `webview/index.js` | `webview/index.css` |
|---|---|---|---|---|
| HEAD `18c3bb9` | 33967 | 12816867 | 1917782 | 23992 |
| after Task 1 | 33967 | 12817045 | 1917782 | 23992 |
| after Task 2 | 34106 | 12817053 | 1917782 | 23992 |
| after Task 3 | 34124 | 12817053 | 1917782 | 23992 |
| after Task 4 | 34124 | 12817053 | 1917782 | 23992 |

`webview/index.js` and `index.css` are minified and carry no path comments, so they are byte for byte identical, with the same
plain hash, at every stage. A different size with the same hash-without-comments is path-length noise; a different
hash-without-comments is a real difference and must be found, not explained away.

**P6 Hygiene.**
```
cd /home/motodox/code/AlekP141/code-spider && git diff HEAD --check
cd /home/motodox/code/AlekP141/code-spider && git diff HEAD -M -U0 | grep -E '^\+[^+]' | awk 'length>81'
cd /home/motodox/code/AlekP141/code-spider && git status --short | grep '^??'
```
Expected: nothing from all three. The last one catches a stray new file, for example a golden that vitest wrote.

**P7 End to end** (needs a display).
```
cd /home/motodox/code/AlekP141/code-spider && DISPLAY=:0 pnpm --filter code-spider-vscode test:smoke
cd /home/motodox/code/AlekP141/code-spider && DISPLAY=:0 pnpm probe
cd /home/motodox/code/AlekP141/code-spider && DISPLAY=:0 pnpm check:vsix
cd /home/motodox/code/AlekP141/code-spider && ls "${TMPDIR:-/tmp}" | grep code-spider-vsix
```
Expected: 7 passing; 10 checks passed; 7 passing and exit 0; nothing from the last line.

**Reviewer's claim to attack, for every task:** "Nothing but locations and import paths changed, and no test was lost or
neutered." The reviewer repeats P2 to P6 on the implementer's tree, reads the P4 output, and tries to break the claim: a test
that moved but no longer runs, a path string that still points at the old place and happens to pass, a file that changed
beyond its import lines.


---

## Tasks

### Task 1: core

The 18 source files and 19 test files of the table "packages/core" with Task 1 move into `project/`, `focus/`, `nodes/`,
`callees/` and `callers/`; `analyze.ts`, `index.ts`, `types.ts` and `errors.ts` and the 16 top-level tests stay.

**Files:**
- Move: every row with Task 1 in "packages/core, source" (18) and "packages/core, tests" (19). 37 renames.
- Edited in place, imports only (5): `packages/core/src/analyze.ts`, `packages/core/src/index.ts`,
  `packages/core/test/analyze-at.test.ts`, `packages/core/test/edge-ids.test.ts`, `packages/core/test/helpers.ts`.
- Edited after moving, imports plus one path string: `packages/core/test/project/project.test.ts` (the golden URL).
- Not touched: `packages/core/package.json`, `tsconfig.json`, `vitest.config.ts`, `test/__goldens__/*`, `test/analyze.test.ts`,
  and everything outside `packages/core`.
- Paths the task may touch (P3): `packages/core/(src|test)/`.

**Interfaces:**
- Consumes: nothing from another task.
- Produces: the package entries do not change: `@code-spider/core` is still `src/index.ts` and `@code-spider/core/types` still
  `src/types.ts`, so the CLI, extension and webview need no edit. `index.ts` re-exports the same names from
  `./nodes/node-id.js`, `./focus/position.js`, `./project/project.js`, `./nodes/node-builder.js` and `./callers/callers.js`
  (and still from `./types.js`, `./analyze.js`, `./errors.js`). `test/helpers.ts` stays and is imported as `../helpers.js` from
  every moved test.

**Behaviour:**
- Every file goes where the table says. `passing.ts` is in `callees/`, so `callers/callers.ts` imports `../callees/passing.js`.
  No `index.ts` is added in any folder. Do not move `helpers.ts` or `__goldens__`.
- `test/node-id.test.ts` imports `../../src/nodes/node-id` without `.js`, as before; `test/smoke.test.ts` is not edited.
- `test/analyze.test.ts` is not edited at all. Its two `toMatchFileSnapshot("./__goldens__/...")` paths are right where they are.
- The only non-import edit is `project/project.test.ts`: `"./__goldens__/basic-handleSignup.json"` becomes
  `"../__goldens__/basic-handleSignup.json"`.

**Approach and traps:**
- Facts-table rows 1, 2, 3 and 4 are this task's. Row 4: `callees/arrow-consts.test.ts` line 64 contains
  `` `import { helper, legacy } from "./helpers";` `` inside a template; it must come out byte for byte as it went in.
- Row 2 is the one silent trap: a wrong golden path in `toMatchFileSnapshot` writes a new file and passes. The file does not
  move, so the guard is P6's untracked-file check, plus the proof in the steps.
- Moved tests import `../helpers.js` (and `../../src/<folder>/<file>.js`); tests that stay import `./helpers.js`. `helpers.ts` is
  edited for its three imports only (`../src/callees/callees.js`, `../src/focus/focus.js`, `../src/project/project.js`); its
  `here` and `resolve(here, "../../../test-code", ...)` lines stay.
- `core/test/ts-morph-paths.test.ts` and `src/project/ts-morph-paths.ts` call `createRequire(import.meta.url)` to find
  `ts-morph`; node resolution climbs to `packages/core/node_modules` from any depth, so nothing is edited there.
- Re-wrapped imports in the replay: 5.
- Rewrite the import paths with a throwaway script or by hand, as described under "Move-only rules"; `pnpm -r typecheck` finds
  anything missed.

**Tests (the before and after comparison; no test is added):**
- P2 for core: 250 tests in 35 files, all `passed`, the name list identical to P1's.
- P3: `37 R` and `5 M`; `42 files changed, 118 insertions(+), 99 deletions(-)`.
- P4: exactly one hit, `packages/core/test/project/project.test.ts`, the `__goldens__` line.
- P5: `extension.cjs` unchanged in size (33967) and hash; `worker.cjs` 12817045 bytes (core is bundled into the worker); all four hashes
  without path comments as in the table.
- P6 prints nothing.

**Steps:**
- [ ] P1 for core, on the clean tree at HEAD (`git status` prints nothing).
- [ ] `mkdir -p` the five folders under `src` and `test`, `git mv` the 37 rows, rewrite every import path in `packages/core`,
  make the one string edit, re-wrap per the formatting rule; `pnpm --filter @code-spider/core typecheck` is clean.
- [ ] P2 (core), P3, P4, P5, P6 with the expected results above.
- [ ] Prove the checks can fail, restoring each by hand from a copy in `<scratch>`: (a) put `./__goldens__/` back in
  `project/project.test.ts`: the test "leaves analysis unchanged and keeps the program" fails with ENOENT; (b) rename
  `test/focus/position.test.ts` to `position.test.ts.off`: the P2 diff lists its tests as missing; (c) in `analyze.test.ts` change the
  path on line 71 to `./__goldens__/moved/basic-handleSignup.json` and run
  `pnpm --filter @code-spider/core exec vitest run test/analyze.test.ts`: it passes and says "1 written", and
  `git status --short | grep '^??'` shows `packages/core/test/__goldens__/moved/`; delete that new folder and restore the line;
  (d) change `MAX_CALLERS = 50` to `51` in `callers/callers.ts`, run `pnpm build`: the hash of `worker.cjs` without path comments
  differs; restore and rebuild
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test` (core 250, CLI 39, webview 507, extension 216), `pnpm build`, and P7's smoke
  line (core is bundled into the worker; 7 passing)
- [ ] Inspect the task delta (P3, P4, P6, `git status`) and propose the commit

Proposed commit message: `group the core source and tests into project, focus, nodes, callees and callers folders`

### Task 2: extension

The 14 source files and 26 test files of the "packages/extension" tables with Task 2 move into `session/`, `changes/`,
`settings/` and (tests only) `panel/` and `worker/`; the four top-level source files, `panel/`, `vscode/`, `worker/` (source),
`test/support/` and the three package-level tests stay.

**Files:**
- Move: every row with Task 2 in "packages/extension, source" (14) and "packages/extension, tests" (26). 40 renames.
- Edited in place, imports only (8): `packages/extension/src/extension.ts`, `src/vscode/editor.ts`, `src/vscode/focus-request.ts`,
  `src/vscode/settings.ts`, `src/vscode/watchers.ts`, `src/worker/project-cache.ts`, `test/manifest.test.ts`,
  `test/support/session-setup.ts`.
- Edited after moving, imports plus one path string: `packages/extension/test/worker/worker-integration.test.ts` (line 14).
- Not touched: `package.json`, `build.mjs`, `build-smoke.mjs`, `smoke/*`, `scripts/*`, `test/readme.test.ts`,
  `test/vsix-files.test.ts`, `test/support/fixtures.ts`, `test/support/manifest.ts`, and everything outside `packages/extension`.
- Paths the task may touch (P3): `packages/extension/(src|test)/`.

**Interfaces:**
- Consumes: `@code-spider/core` and the three webview export keys, unchanged by this task (the webview still has its old files
  and `exports` at this point).
- Produces: the esbuild entries `src/extension.ts` and `src/worker.ts` stay; `smoke/suite/extension.smoke.ts` still imports
  `../../src/extension.js`; `src/panel/html.ts` stays where `packages/webview/probe/run.mjs:51` bundles it. New imports a later
  reader will see: `session/session.ts` imports `../changes/changes.js`, `../ports.js`, `./session-refresh.js`,
  `../worker/protocol.js`, `../worker/worker-client.js`; `session/dispatch.ts` imports `../settings/column-gap.js`,
  `../settings/edge-style-store.js`, `./navigation.js`, `./session.js`; `vscode/focus-request.ts` imports `../changes/changes.js`
  and `../session/session.js`; `worker/project-cache.ts` imports `../changes/watched-paths.js`; `settings/*` import `../ids.js`.

**Behaviour:**
- `ports.ts`, `ids.ts`, `extension.ts` and `worker.ts` stay at the top of `src`; `test/support/` stays; moved tests import
  `../support/<file>.js` (`../../src/...` becomes `../../src/<folder>/<file>.js`).
- The only non-import edit is `worker/worker-integration.test.ts` line 14: `"..",` becomes `"../.."`, so
  `resolve(dirname(fileURLToPath(import.meta.url)), "../..")` is again the package folder.
- `manifest.test.ts`, `readme.test.ts` and `vsix-files.test.ts` stay at the top and keep their `here`-relative paths.

**Approach and traps:**
- Facts-table row 5 is this task's. The test is loud when wrong, but note what loud looks like: the file fails in `beforeAll`
  and its four tests are `skipped`, so only P2's name comparison, or the run's non-zero exit, tells the count dropped.
- The integration test runs `node build.mjs` in the package folder as part of the suite, so a test run rebuilds
  `packages/extension/dist`; take P5 after a fresh `pnpm build` as the proof says, and never compare a bundle from before a
  test run to one after without rebuilding.
- `vscode/*` and `worker/project-cache.ts` are in the "edited in place" list because they import files that move; nothing else
  in `panel/`, `vscode/` and `worker/` changes. `panel/graph-panel.ts` imports `../ids.js`, which does not move.
- Nothing in `packages/extension` imports the webview by a relative path; the three webview imports are by key and are not edited.
- Re-wrapped imports in the replay: 3.

**Tests (the before and after comparison):**
- P2 for extension: 216 tests in 29 files, all `passed`, the name list identical to P1's.
- P3: `40 R` and `8 M`; `48 files changed, 98 insertions(+), 89 deletions(-)`.
- P4: exactly one hit, `packages/extension/test/worker/worker-integration.test.ts`, the `packageDir` line.
- P5: `extension.cjs` 34106 bytes, `worker.cjs` 12817053, `index.js` and `index.css` unchanged; all four hashes without path comments
  as in the table.
- P6 prints nothing. P7: smoke 7 passing, probe 10 checks, `check:vsix` 7 passing, no temp folder left.

**Steps:**
- [ ] P1 for extension, on the clean tree at the commit of Task 1.
- [ ] `mkdir -p` the folders, `git mv` the 40 rows, rewrite every import path in `packages/extension` (`src`, `test`; the smoke
  and scripts folders need none), make the one string edit, re-wrap; `pnpm --filter code-spider-vscode typecheck` is clean
  (it also checks `smoke`).
- [ ] P2 (extension), P3, P4, P5, P6 with the expected results above.
- [ ] Prove the checks can fail, restoring each by hand: (a) set line 14 of `worker/worker-integration.test.ts` back to `".."`:
  the file fails with "Cannot find module .../test/build.mjs" and the P2 diff shows its four tests as `skipped`; (b) rename
  `test/session/ranges.test.ts` to `ranges.test.ts.off`: the P2 diff lists its tests as missing; (c) change
  `DEFAULT_MAX_HEAP_MB = 8192` to `8193` in `settings/settings-values.ts` and run `pnpm build`: the hash of `extension.cjs` without
  path comments differs; restore and rebuild
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test`, `pnpm build`, and all of P7
- [ ] Inspect the task delta (P3, P4, P6, `git status`) and propose the commit

Proposed commit message: `group the extension source and tests into session, changes and settings folders`

### Task 3: webview app, host, settings, view and toolbar

The 15 source files of `app/`, `host/` and `settings/`, and 28 tests (those of `app/`, `host/`, `settings/`, `view/` and
`toolbar/`) move, and the `exports` targets follow. The files of `graph/` stay where they are and only have their imports
edited; they move in Task 4.

**Files:**
- Move: every row with Task 3 in "packages/webview, source (top level)" (15) and "packages/webview, tests" (28). 43 renames.
- Edited in place, imports only (31): `src/App.tsx`; `src/graph/GraphView.tsx`, `jump.ts`, `layout.ts`, `make-room.ts`,
  `node-context.ts`, `placement.ts`, `tidy-graph.ts`, `to-flow.ts`, `use-layout.ts`, `viewport-requests.tsx`;
  `src/toolbar/Toolbar.tsx`, `spacing-control.ts`, `use-spacing-control.ts`; `src/view/expansion.ts`, `persist.ts`,
  `refresh-order.ts`, `refresh.ts`, `types.ts`, `view-state.ts`; `test/layout.test.ts`, `make-room.test.ts`,
  `placement-order-property.test.ts`, `placement-order.test.ts`, `placement-property.test.ts`, `placement.test.ts`,
  `tidy-graph-order.test.ts`, `tidy-pinned-order.test.ts`, `tidy.test.ts`; `test/support/order-graphs.ts`,
  `test/support/refresh-order.ts` (all under `packages/webview/`).
- Edited, a setting: `packages/webview/package.json`, `exports` block, lines 7 to 9.
- Not touched: `src/main.tsx` (it imports `./App.js` and four stylesheets, none of which moves in this task), `build.mjs`,
  `probe/*`, `tsconfig*.json`, `test/tsconfig.json`, `test/core-types-entry.test.ts`, `test/support/slices.ts`,
  `test/support/graph-states.ts`, `flow.ts`, `geometry.ts`, `main-shape.ts`, `pinned-column.ts`, `random.ts`,
  `random-specs.ts`, and everything outside `packages/webview`.
- Paths the task may touch (P3): `packages/webview/(src/|test/|package\.json$)`.

**Interfaces:**
- Consumes: nothing from Tasks 1 and 2.
- Produces:
  - `packages/webview/package.json` `exports`, keys unchanged:

    ```json
    "exports": {
      "./protocol": "./src/host/protocol.ts",
      "./column-gap": "./src/settings/column-gap.ts",
      "./edge-style": "./src/settings/edge-style.ts"
    }
    ```

  - The new homes Task 4 imports from: `app/app-state.js`, `app/app-walk.js`, `app/debounce.js`, `host/protocol.js`,
    `settings/column-gap.js`, `settings/edge-style.js` (all under `src/`), and the tests of `view/` and `toolbar/` now live in
    `test/view/` and `test/toolbar/`, importing graph files at their still-old paths.
  - The extension keeps compiling and passing without an edit, because it imports the three keys.

**Behaviour:**
- Export keys do not change. `core-types-entry.test.ts` and `test/support/` stay. `main.tsx` is not edited here.
- Within `app/` the five-file cycle (`app-state`, `app-refresh`, `app-settings`, `app-walk`, `app-working`) moves together.
- The graph files keep their position in `src/graph/` and change only the paths they use to reach `app/`, `host/` and
  `settings/` (for example `../column-gap.js` becomes `../settings/column-gap.js`, `../app-state.js` becomes `../app/app-state.js`).
  Task 4 edits the same lines again when they move one level deeper.
- Tests of `view/` and `toolbar/` move although their source does not; they import `../../src/view/...` and `../support/...`.

**Approach and traps:**
- Facts-table row 7 is this task's: a stale `exports` target does not fail the webview's own typecheck, it fails the extension's
  (TS2307), which is why the extension's typecheck, tests, smoke and `check:vsix` are part of this task's proof. The three
  consumers of the keys are listed under "Facts verified"; none is edited.
- `webview/src/debounce.ts` and `extension/src/debounce.ts`, and the two `column-gap.ts`, are different files; here only the
  webview's move: `debounce.ts` to `app/`, `column-gap.ts` to `settings/`, `protocol.ts` and `messages.ts` to `host/`. The
  extension's `worker/protocol.ts` and `panel/messages.ts` are not these files and do not move.
- The tests of `view/` import `../../src/view/...` and sometimes graph files; `test/support/*.ts` stays and is imported as
  `../support/<file>.js` from the moved tests. `support/graph-states.ts` and `support/slices.ts` need no edit in this task.
- `webview/probe/run.mjs` names `../extension/src/panel/html.ts` only; no edit.
- Re-wrapped imports in the replay: 4.

**Tests (the before and after comparison):**
- P2 for webview: 507 tests in 57 files, all `passed`, the name list identical to P1's. Also run the extension's tests (216) and
  typecheck: its consumers of the exports must stay green.
- P3: `43 R` and `32 M`; `75 files changed, 200 insertions(+), 186 deletions(-)`.
- P4: exactly the three `exports` lines of `packages/webview/package.json` (old and new), and nothing else.
- P5: `extension.cjs` 34124 bytes (the webview's `edge-style` and `column-gap` modules are inside it), `worker.cjs` 12817053,
  `index.js` and `index.css` byte for byte unchanged; all four hashes without path comments as in the table.
- P6 prints nothing. P7: smoke 7 passing, probe 10 checks, `check:vsix` 7 passing.

**Steps:**
- [ ] P1 for webview, on the clean tree at the commit of Task 2; keep `<scratch>/before/webview.names` for Task 4 too.
- [ ] `mkdir -p` the folders, `git mv` the 43 rows, rewrite every import path in `packages/webview` (`src`, `test`, including the
  files of `graph/`, `toolbar/` and `view/` that stay), edit the `exports` targets, re-wrap;
  `pnpm --filter @code-spider/webview typecheck` and `pnpm --filter code-spider-vscode typecheck` are clean.
- [ ] P2 (webview, plus the extension's counts), P3, P4, P5, P6 with the expected results above.
- [ ] Prove the checks can fail, restoring each by hand: (a) set `"./protocol"` in `package.json` back to `./src/protocol.ts`:
  `pnpm --filter code-spider-vscode typecheck` fails with TS2307 for `@code-spider/webview/protocol`; (b) rename
  `test/view/history.test.ts` to `history.test.ts.off`: the P2 diff lists its tests as missing; (c) change `HISTORY_LIMIT = 20` to
  `21` in `view/view-state.ts` and run `pnpm build`: the hash of `webview/index.js` differs; restore and rebuild
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test` (core 250, CLI 39, webview 507, extension 216), `pnpm build`, and all of P7
- [ ] Inspect the task delta (P3, P4, P6, `git status`) and propose the commit

Proposed commit message: `group the webview app, host and settings files and the view and toolbar tests into folders, and point the package exports at them`

### Task 4: webview graph

The 23 source files of `graph/` that go into `layout/`, `nodes/` and `viewport/`, and the 28 tests of `graph/` move; the six
files at the top of `graph/` stay.

**Files:**
- Move: every row with Task 4 in "packages/webview, source `graph/`" (23) and "packages/webview, tests" (28). 51 renames.
- Edited in place, imports only (19): `src/App.tsx`, `src/app/app-state.ts`, `src/app/app-walk.ts`, `src/graph/GraphView.tsx`,
  `src/graph/to-flow.ts`, `src/main.tsx`, `src/view/expansion.ts`, `src/view/refresh-order.ts`, `src/view/refresh.ts`;
  `test/support/geometry.ts`, `test/support/order-graphs.ts`, `test/support/pinned-column.ts`, `test/support/refresh-order.ts`;
  `test/view/expansion.test.ts`, `test/view/graph-column-gap.test.ts`, `test/view/order-paths.test.ts`,
  `test/view/rebuild-graph-order-property.test.ts`, `test/view/rebuild-graph-placement.test.ts`,
  `test/view/rebuild-graph-property.test.ts` (all under `packages/webview/`).
- Edited after moving, imports plus path strings: `packages/webview/test/graph/layout/layout-browser.test.ts` (lines 7 and 10).
- Not touched: `package.json`, `build.mjs`, `probe/*`, `tsconfig*.json`, `test/core-types-entry.test.ts`, and everything outside
  `packages/webview`.
- Paths the task may touch (P3): `packages/webview/(src|test)/`.

**Interfaces:**
- Consumes: the `app/`, `host/` and `settings/` homes from Task 3.
- Produces: the esbuild entry `src/main.tsx` stays, and now imports `./graph/graph.css` (stays), `./graph/nodes/node-labels.css`
  (moved), `./styles.css`, `./toolbar/toolbar.css`, in that order; `App.tsx` imports `./graph/GraphView.js`, `./graph/jump.js`,
  `./graph/nodes/node-context.js` and `./graph/layout/use-layout.js`. The probe and the extension need nothing from this task.

**Behaviour:**
- The six files at the top of `graph/` (`GraphView.tsx`, `to-flow.ts`, `edge-appearance.ts`, `jump.ts`, `constants.ts`,
  `graph.css`) stay. `compare-ids.ts` goes to `layout/` and `live-positions.ts` to `viewport/`, as the table says, even though the
  placement notes call both weak.
- The order of the four CSS imports in `main.tsx` does not change, so `dist/index.css` stays byte for byte the same.
- Tests keep their names; the folder under `test/graph/` is the source folder's name.
- Non-import edits: `layout-browser.test.ts` line 7 `"..",` becomes `"../../.."` so `packageDir` is again the package folder, and
  line 10, inside the `entry` template, `"./src/graph/layout.ts"` becomes `"./src/graph/layout/layout.ts"`.

**Approach and traps:**
- Facts-table rows 6 and 8 are this task's. Row 6 line 10 is invisible to P4 (the strip removes a column-0 `import` line from
  both sides), so check it by name: `grep -n 'from "./src/graph/layout/layout.ts"'
  packages/webview/test/graph/layout/layout-browser.test.ts` prints exactly one line.
- `test/support/*` stays and is edited for its `../../src/graph/...` imports (depth stays `../../`, the folder names change).
- Folders import each other as the placement notes say: `layout/tidy-graph.ts` imports `../nodes/node-size.js`,
  `nodes/supplier-labels.ts` imports `../layout/compare-ids.js`, `viewport/reveal.ts` imports `../nodes/node-size.js` and
  `../layout/placement.js`; files at the top of `graph/` (`GraphView`, `to-flow`) import from all three. Do not move a file to
  shorten one of these.
- Re-wrapped imports in the replay: 16.

**Tests (the before and after comparison):**
- P2 for webview: 507 tests in 57 files, all `passed`, the name list identical to the one Task 3 saved.
- P3: `51 R` and `19 M`; `70 files changed, 251 insertions(+), 192 deletions(-)`.
- P4: exactly one hit, `layout-browser.test.ts`, the `packageDir` line; plus the grep above.
- P5: `extension.cjs` 34124 bytes, `worker.cjs` 12817053, `index.js` and `index.css` byte for byte unchanged (the graph is only in the
  webview bundle); all four hashes without path comments as in the table.
- P6 prints nothing. P7: smoke 7 passing, probe 10 checks, `check:vsix` 7 passing.

**Steps:**
- [ ] P1's bundle snapshot on the clean tree at the commit of Task 3 (the names reference is Task 3's `webview.names`).
- [ ] `mkdir -p` the folders under `src/graph` and `test/graph`, `git mv` the 51 rows, rewrite every import path in
  `packages/webview`, make the two string edits, re-wrap; `pnpm --filter @code-spider/webview typecheck` is clean (it checks `src`
  and `test`).
- [ ] P2 (webview), P3, P4 plus the grep, P5, P6 with the expected results above.
- [ ] Prove the checks can fail, restoring each by hand: (a) set line 7 of `layout-browser.test.ts` back to `".."`: the test fails
  with "Build failed with 1 error"; (b) set line 10 back to `./src/graph/layout.ts`: the same failure; (c) rename
  `test/graph/viewport/lod.test.ts` to `lod.test.ts.off`: the P2 diff lists its tests as missing; (d) set `main.tsx` line 5 back
  to `./graph/node-labels.css`: `pnpm --filter @code-spider/webview build` fails; (e) change `REVEAL_PADDING = 24` to `25` in
  `viewport/pan-to-reveal.ts` and run `pnpm build`: the hash of `webview/index.js` differs; restore and rebuild
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test` (core 250, CLI 39, webview 507, extension 216), `pnpm build`, and all of P7
- [ ] Inspect the task delta (P3, P4, P6, `git status`) and propose the commit

Proposed commit message: `group the webview graph files into layout, nodes and viewport folders`

### Integration review

One fresh `workflow-reviewer`, read-only apart from commands, reads the whole delta of the four commits (`git diff -M <base>
HEAD`, where `<base>` is the commit before Task 1's: `18c3bb9`, or the commit that adds this plan if it was committed first;
the plan commit changes no code, so every number below holds either way) and runs, from the repo root:
1. `pnpm -r typecheck`; `pnpm -r test` (core 250, CLI 39, webview 507, extension 216); `pnpm build`; `pnpm package` (exit 0, no
   `WARNING`, the eight entries of the `.vsix`); `DISPLAY=:0` with `pnpm --filter code-spider-vscode test:smoke` (7 passing),
   `pnpm probe` (10 checks) and `pnpm check:vsix` (7 passing, no `code-spider-vsix-*` folder left).
2. The shape of the whole delta: `git diff -M <base> HEAD --name-status | cut -c1 | sort | uniq -c` gives `171 R` and `32 M` (no
   `A`, no `D`), and `--shortstat` gives `203 files changed, 639 insertions(+), 538 deletions(-)`. Every one of the 171 renames
   is a row of the move tables with the same old and new path, and no file outside `packages/core`, `packages/extension` and
   `packages/webview` changed: `git diff --stat <base> HEAD -- docs local-agent-docs README.md packages/cli test-code
   pnpm-lock.yaml pnpm-workspace.yaml packages/core/package.json packages/extension/package.json` prints nothing.
3. The content check over the whole range, which needs no working tree:
   ```
   cd /home/motodox/code/AlekP141/code-spider && strip() { perl -0pe 's/^(?:import|export)\b[^;]*?\bfrom\s+"[^"]*";\n//mg; s/^import\s+"[^"]*";\n//mg'; }; git diff -M <base> HEAD --name-status | while IFS=$'\t' read -r st old new; do case "$st" in R*) ;; M) new=$old ;; *) echo "UNEXPECTED $st $old"; continue ;; esac; d=$(diff <(git show "<base>:$old" | strip) <(git show "HEAD:$new" | strip)); if [ -n "$d" ]; then echo "--- $new"; echo "$d"; fi; done
   ```
   Expected: exactly four hits and nothing else: `core/test/project/project.test.ts` (the golden line),
   `extension/test/worker/worker-integration.test.ts` (line 14), `webview/package.json` (the three `exports` lines) and
   `webview/test/graph/layout/layout-browser.test.ts` (line 7); plus `grep -n 'from "./src/graph/layout/layout.ts"'
   packages/webview/test/graph/layout/layout-browser.test.ts` printing one line, and
   `grep -n 'from "./helpers"' packages/core/test/callees/arrow-consts.test.ts` printing the one unchanged template line.
4. Tests: the name lists of core (Task 1), extension (Task 2) and webview (Task 3), taken before each package was touched, equal
   the lists from a fresh run of the final tree (`diff` prints nothing; `<scratch>/before/` holds them; if they are gone, the
   P4 result above and the equal counts and file counts stand in). `grep -v ':: passed$'` over the final lists prints nothing
   (no `skipped`, no `todo`).
5. Bundles: P5 on the final tree gives the "after Task 4" row of the table, and the hashes without path comments equal the HEAD
   `18c3bb9` values.
6. The layout is the design: the "Folder files after the moves" table holds for every folder (count the files with
   `find <folder> -maxdepth 1 -type f | wc -l`), the top of each `src` holds exactly the files D1 names, and no old flat path is
   left (`git ls-files packages | grep -E 'packages/(core|extension|webview)/(src|test)/[^/]+$'` lists only the top-level files of
   the tables).
7. History follows the files: `git log --follow --oneline -- <new path>` for one file per package
   (`packages/core/src/focus/focus.ts`, `packages/extension/src/session/session.ts`, `packages/webview/src/host/protocol.ts`,
   `packages/webview/src/graph/layout/placement.ts`) shows commits older than the four of this plan.
8. Stale paths: nothing in `packages` (not under `node_modules` or `dist`) still names an old path:
   `grep -rnE '/src/(protocol|column-gap|edge-style)\.ts|src/graph/(layout|placement|tidy|reveal)\.ts' packages --include='*.json'
   --include='*.mjs' --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist
   --exclude-dir=.vscode-test` prints nothing. Old plans and specs under `docs/` still name old paths on purpose.
9. Size and rules: no code file over 500 lines (the largest was 292 and stays 292), no comment added
   (`git diff -M <base> HEAD -U0 | grep -E '^\+[^+]' | grep -E '^\+\s*(//|/\*)'` prints nothing), `git status` clean.
The coordinator fixes what it finds and has it rechecked by the same reviewer.

---

## As built: departures from the plan

The task text above is the approved plan and stays as written, including its forecast numbers. The build differs as follows.

**Commits.** `41c95f3` is this plan, `07669f1` is Task 1 (core), `d1c60cc` is Task 2 (extension), `e6c1b49` is Task 3 (webview
app, host, settings and exports) and `e8a14fc` is Task 4 (webview graph). All four tasks passed review with no findings and no
fix round. Before the build the owner answered the question the plan left open: a strict mirror for tests, with no
`core/test/analyze/` folder ("lets try that first and then see"). So the build follows the plan on that point, and the 16 tests
at the top of `core/test` are a decision, not an oversight.

### Measured at the end of the build

HEAD `e8a14fc`, by the coordinator and again by the integration reviewer.
- `pnpm -r typecheck` clean. Tests: core 250 in 35 files, CLI 39, webview 507 in 57 files, extension 216 in 29 files. The
  sorted test-name lists are identical to the lists taken before each package was touched.
- Smoke 7 passing, probe 10 checks, `pnpm check:vsix` 7 passing with the same eight entries.
- The four bundle hashes without path comments are unchanged: `extension.cjs` `8f1a21977fbf`, `worker.cjs` `7390324b6d10`,
  `webview/index.js` `a4a160a1c352`, `webview/index.css` `5e43d56628b7`. `index.js` and `index.css` are byte for byte the same as
  a build of `41c95f3`. The sizes are the plan's: `extension.cjs` 34124, `worker.cjs` 12817053.
- A fresh clone of HEAD installs, typechecks, tests, builds and packages. `git log --follow` reaches each moved file's older
  history.
- Whole delta against `41c95f3`: 171 renames and 32 files edited in place, `203 files changed, 635 insertions(+), 537
  deletions(-)`. Per task: Task 1 `42 files changed, 118 insertions(+), 99 deletions(-)`; Task 2 `48 files changed, 98
  insertions(+), 89 deletions(-)`; Task 3 `75 files changed, 196 insertions(+), 185 deletions(-)`; Task 4 `70 files changed, 251
  insertions(+), 192 deletions(-)`. The lowest rename similarity is 69%.
- Files directly in each folder, before and after (each checked with `find <folder> -maxdepth 1 -type f | wc -l`):

| Folder | Before | After |
|---|---|---|
| `packages/core/src` | 22 | 4 |
| `packages/core/test` | 36 | 17 |
| `packages/extension/src` | 18 | 4 |
| `packages/extension/test` | 29 | 3 |
| `packages/webview/src` | 18 | 3 |
| `packages/webview/src/graph` | 29 | 6 |
| `packages/webview/test` | 58 | 2 |

### Built differently from the plan text

- **Task 3 came out at `196 insertions(+), 185 deletions(-)` with 3 re-wrapped imports, where the plan forecasts `200` and
  `186` and 4.** The whole delta is therefore 635 insertions and 537 deletions where "Replay totals" and Integration review
  step 2 say 639 and 538. Tasks 1, 2 and 4 match their forecasts exactly. The cause is in the plan author's trial run, not in
  the build: its wrapping script re-wrapped every over-long import in each file it touched, and that included one the plan
  does not change, `packages/webview/src/toolbar/use-spacing-control.ts` line 4, which is 81 columns wide before the plan and
  still. It was left alone on purpose because the plan is move-only. The Task 3 reviewer reproduced `200` and `186` exactly by
  wrapping only that statement in a scratch clone, and Prettier 3 agreed with every import the plan changed.
- **Integration review, the `<base>` sentence.** It says the plan commit changes no code, so every number holds with either
  base. That is wrong for the whole-delta numbers in step 2: they hold only with `41c95f3` as `<base>`. Against `18c3bb9` the
  plan file itself is in the diff, so `git diff -M 18c3bb9 HEAD` shows one `A` as well, and `204 files changed, 1725
  insertions(+), 537 deletions(-)`. The bundle hashes and sizes hold with either base.

### Left for the owner

None of this is a defect. The integration review found nothing to fix.
- `core/test` still has 16 tests and `helpers.ts` at its top: `analyze.test.ts`, `analyze-at.test.ts`, `smoke.test.ts` and the
  13 scenario tests named for behaviours (`aliases`, `barrel`, `constructors`, `default-exports`, `edge-ids`,
  `expand-resolution`, `expand`, `module-callers`, `node-not-found`, `passes`, `qualified-ids`, `unknown-nodes`,
  `wrapped-consts`). This is the consequence of the strict mirror. The largest new folders are `webview/test/graph/layout` with
  15 files and `webview/test/view` with 13.
- The integration reviewer would move `graph/layout/compare-ids.ts` up beside `graph/constants.ts`: 8 source files in three
  folders (`layout`, `nodes`, `view`) and 3 tests import it, so it would be one rename and about 11 import edits. The reviewer
  would keep `callees/passing.ts`, `viewport/live-positions.ts` and `viewport/lod.ts` where they are.
- `webview/src/app/` sits beside `App.tsx`. The reviewer thinks `state/` is the clearer name; 29 import lines in 18 files name
  the folder today.
- `extension/src/vscode/settings.ts` and the new `extension/src/settings/` share a word, which can confuse a reader.
- `core/test/edge-ids.test.ts` mixes a unit block for `nodes/node-id` (`edgeId`) with an `analyzeFocus` scenario, so it has no
  single home; it stays at the top.
- Import statements that are not what Prettier would print. Checked after the build with Prettier 3.5.3 (installed in a scratch
  folder outside the repo): nine statements were off before the plan and three are off now. Six became right only because
  the moves made their paths longer, so the multi-line form is now the one Prettier prints: the imports in `core/src/index.ts`,
  `core/test/project.test.ts`, `webview/src/graph/layout.ts` and the webview tests `app-settings`, `graph-column-gap` and `tidy`.
  The three still off are old and were left on purpose, because the plan is move-only: `packages/webview/src/toolbar/use-spacing-control.ts`
  line 4 (81 columns on one line), the `./to-flow.js` import in `packages/webview/src/graph/GraphView.tsx` (wrapped, but it fits
  in 80 columns) and the `../src/index.js` import in `packages/cli/test/cli.test.ts` (wrapped, but it fits in 80 columns; the CLI
  package is not part of this plan).
- Old plans and specs under `docs/` and everything under `local-agent-docs/` still name the old paths, on purpose.

---

## Manual checks (for the owner; NOT RUN by anyone)

Setup: the four commits are on `main`. A terminal at the repo root.

1. Open the repo in your editor and expand `packages/core/src`, `packages/extension/src`, `packages/webview/src` and
   `packages/webview/src/graph`, then the three `test` folders. Judge whether you can tell from the folder names where a file
   lives and whether the folders are easier to navigate than before. Write down any file you would put elsewhere. The ones the
   plan flagged as borderline: `callees/passing.ts`, `graph/layout/compare-ids.ts`, `graph/viewport/live-positions.ts`,
   `session/dispatch.ts`, and the 16 end-to-end tests left at the top of `packages/core/test`.
2. Press F5 ("Run Code Spider"; it runs `pnpm build` first). In the window that opens, open `test-code/basic/src/signup.ts`,
   put the cursor in `handleSignup` and press `Shift+Alt+Q` (`Cmd+Option+Q` on a Mac). The graph opens. Click a box (the editor
   jumps), double-click a function's box (it expands), drag a box, press Tidy, Refresh, Stepped and Curved, and move the
   Spacing slider. Everything behaves as before this plan.
3. Run `pnpm package`, install the new `code-spider-vscode-0.1.0.vsix` in your normal VS Code as the README describes, and open a
   graph in a real project.
4. In your git tool, open the history of a moved file, for example
   `packages/webview/src/graph/layout/placement.ts`, and see that it continues back before the move.
