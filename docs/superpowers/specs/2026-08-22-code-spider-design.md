# Code Spider — Design

**Date:** 2026-08-22
**Status:** Approved, ready for implementation planning

## 1. Problem

When an AI assistant builds a project, you end up with hundreds of functions
across dozens of files without a mental model of how they connect. Reading every
file to answer "what calls this, and what does it call?" is slow, and the
existing tools don't help much: the file tree shows structure but not behaviour,
and Go-to-Definition answers one hop at a time with no picture.

Code Spider answers that question visually. You put your cursor in a function,
press a key, and get a diagram of that function's immediate neighbourhood —
what supplies it, what it supplies — with real TypeScript types on the edges.
From there you expand outward one node at a time to follow the architecture.

This is deliberately not a whole-project dependency graph. A 300-node hairball
is the problem restated, not solved.

## 2. Goals

- Understand an unfamiliar TypeScript/Next.js codebase without reading every file.
- See the actual types flowing between functions, not just that a call exists.
- Navigate from the diagram into the code in one click.
- Work on real codebases (hundreds of files) without becoming unusable.
- Be a learning vehicle: VS Code extension APIs, the TypeScript compiler API,
  React Flow, and ELK.

## 3. Non-goals for v1

Recorded explicitly so they do not creep back in:

- Live file watching or auto-refresh as code changes.
- LLM-assisted analysis or annotation.
- The def-use overlay (intra-body value chaining).
- Rename tracking across edits.
- Any language other than TypeScript, TSX, JavaScript, JSX.
- Graph-to-code editing (the bidirectional vision).
- Syntax highlighting inside node code regions.
- Types and schemas as nodes.
- Class methods as nodes.
- An entry-point-rooted trace mode.
- Publishing to the VS Code Marketplace.

## 4. Key decisions

### 4.1 Language: TypeScript throughout

The core of this tool is resolving TypeScript types and symbols. The only
production-grade implementation of TypeScript's type system is the TypeScript
compiler itself, which is written in TypeScript. Writing the analyser in another
language would mean either reimplementing type inference (a multi-year compiler
project) or shelling out to `tsserver` and marshalling JSON — in which case the
second language does no analysis and only adds a process boundary, a
serialisation format, and a second toolchain.

Go was considered and rejected for this reason. It would be defensible for
analysing *Go* code, where `go/ast`, `go/types` and `go/ssa` are first-party and
excellent. The analyser boundary defined in section 6 is a clean seam, so a
second-language analyser could be added later without the choice being
retroactively dishonest.

Microsoft's native Go port of the TypeScript compiler (the TS 7 work) may
eventually expose a stable third-party API, which would change this analysis. It
was not mature enough to build on at the time of this design. Worth re-checking
before any future rewrite; not worth blocking v1 on.

The engineering worth defending in this project is the lazy per-focus analysis
strategy, the language-service-borrowing approach to finding callers, and the
incremental layout — none of which depend on the implementation language.

### 4.2 Surface: VS Code extension with a webview panel

A webview is an embedded browser panel inside a VS Code tab, and it is the only
mechanism VS Code offers for custom graphical UI. The HTML/CSS/JS ships inside
the `.vsix`, loads from disk, has no network access, and communicates with the
extension over an in-process message channel. GitLens's commit graph, the
Markdown preview, and Jupyter notebooks are all webviews.

Nothing is hosted externally. The user installs one extension.

### 4.3 View model: focused ego view, radius 1, expandable

The user selects a focus node. The graph shows its immediate callers and callees
only. Any neighbour can be expanded in place to pull in *its* neighbours,
growing the picture without losing what has already been uncovered.

Re-focusing on a different node produces a fresh graph and discards prior
expansions.

### 4.4 Edge direction: supplier to consumer

Arrows point from callee to caller — the direction returned data travels.
`validateUser` supplies `ValidUserData` to `handleSignup`, which supplies its
result to `SignupForm`:

```
   validateUser  ─┐
   createUser   ──┼──▶  handleSignup  ──▶  SignupForm
   sendWelcome  ─┘
```

A consequence: arguments travel *against* the arrow. `handleSignup` passes its
input down into `validateUser`, but the arrow points up. Therefore edge labels
carry the **return type of the source node**, and argument types live on the
node's own displayed signature. Putting both on one edge would give a single
arrow two contradictory labels.

## 5. Graph model

### 5.1 Node kinds

| Kind | Meaning | Expandable |
|---|---|---|
| `function` | A callable declared in the repo: function declaration, arrow-function const, method, exported or local. A class counts too, as the code that runs on `new`: its constructor and field initializers (`new Store()` gives `Store → caller`) | Yes |
| `component` | A function returning JSX, or one used as `<Foo/>` | Yes |
| `module` | A file's top-level code, as the caller of anything called, rendered or passed outside every named function: `root.render(<App/>)`, route tables, `memo(Inner)`. ID `<path>#<module>`, named after the file | No |
| `external` | Anything resolving into `node_modules` or a `lib.*.d.ts` builtin: `db.insert`, `fetch`, `stripe.charges.create` | No — the graph stops here by design |
| `unknown` | A call site whose target could not be statically resolved | No |

### 5.2 Node identity

A node's ID is `<repo-relative-path>#<qualified-name>`. The qualified name is
the symbol's name behind each named class and function that holds it:
`src/repo.ts#Repo.save`, `src/page.tsx#Shell.onClick`. Anonymous callbacks add
nothing. An anonymous default export reads as `default`, whether it is a class,
a function or a component (`export default () => <div/>` is
`src/page.tsx#default`). The node's
`name` field stays the short name.

Path-based rather than position-based, so a node survives edits made above it in
the file and the view does not reset when an import is added. Where callables in
one file still share a qualified name (a static and an instance method, say),
`~N` from declaration order is appended.

Known limitation: because identity includes the symbol name, renaming a function
reads as a delete plus an add rather than a rename. Tracking symbol identity
across edits is real work for a cosmetic gain and is deferred.

### 5.3 Shapes

```ts
type NodeId = string   // "src/app/api/users/route.ts#POST"

type Range = {
  startLine: number; startColumn: number
  endLine:   number; endColumn:   number
}

type GraphNode = {
  id:         NodeId
  kind:       'function' | 'component' | 'module' | 'external' | 'unknown'
  name:       string
  file:       string          // repo-relative; empty for external/unknown
  range:      Range           // declaration range, for click-to-jump
  inputType:  string          // header right slot; '' when there are no params
  returnType: string          // promise-unwrapped; edge labels read this
  isAsync:    boolean
  lineCount:  number          // pre-clamp source line count, for analytic sizing
  codePreview:    string          // source text shown in the node, capped at 25 lines
}

type GraphEdge = {
  id:       string
  from:     NodeId           // supplier (the callee)
  to:       NodeId           // consumer (the caller)
  kind:     'call' | 'jsx' | 'external' | 'passes'
  supplies: string           // payload label — see 5.4
  callSite: Range            // for click-to-jump onto the exact call
  resolved: boolean          // false renders dashed to an `unknown` node
}

type GraphSlice = {
  focusId:   NodeId
  nodes:     GraphNode[]
  edges:     GraphEdge[]
  truncated: boolean         // caller list was capped
}
```

### 5.4 Edge labels

`supplies` is the `returnType` of the `from` node, resolved by the type checker
and formatted for humans. For a class, that is the instance `new` constructs. `Promise<User>` displays as `User` with the source
node flagged `isAsync` — the promise wrapper is noise on every edge in an async
codebase.

**JSX is the one place the convention strains.** `<SignupForm onSubmit={handleSignup}/>`
inside `Page` produces the edge `SignupForm → Page`, and `SignupForm`'s return
type is `JSX.Element` — technically correct and completely uninformative. So for
`kind: 'jsx'`, `supplies` is overridden with the **props type** instead, since
that is the payload anyone cares about. JSX edges are styled distinctly so the
override is visible rather than silent.

**A function handed over as a value gets a `passes` edge.** In the same example,
`handleSignup` is never called inside `Page`, so a call edge alone would leave it
unconnected; it is passed. `onSubmit={handleSignup}`, `items.map(format)`,
`useEffect(load)`, `{ handler: track }` and `save.bind(null, id)` all produce
`handleSignup → Page`-style edges of `kind: 'passes'`, labelled with the passed
function's own signature, since the function itself is the payload. Only repo
functions get one. Calls, renders and passes made inside a named function nested
in the focus belong to that nested function, so a component links to its
handlers and each handler to what it calls, from whichever side is focused.

### 5.5 Unresolved edges are kept

When a call target cannot be resolved statically — dynamic dispatch, a handler
pulled from a string-keyed map — the edge is emitted with `resolved: false` and
rendered dashed to an `unknown` node. A graph that silently omits what it could
not work out is worse than one that admits the gap. This is also the natural
insertion point for a future LLM-assisted resolution pass.

Each `unknown` node belongs to the function making the call
(`unknown:<caller id>#<call text>`), so two components that both call
`props.onPick()` get separate nodes rather than one shared node implying a
common callee.

## 6. Analysis pipeline

**Governing decision: never build a whole-project graph.** Analysis is lazy and
per-focus. This is what makes the tool viable on a large codebase and what keeps
a focus-to-render cycle fast.

The core package exposes exactly two functions:

```ts
analyzeFocus(project, { file, offset }): GraphSlice
expandNode(project, nodeId):             GraphSlice
```

Both return the same shape. The webview merges slices into whatever the user has
uncovered. That is the entire core API surface.

A slice is produced in five steps.

**1. Resolve the focus.** File plus offset to symbol, then to its enclosing
function or component declaration. If the cursor sits somewhere with no
enclosing callable, fall back to the file's default export.

**2. Callees (cheap).** Walk the focus declaration's body for `CallExpression`
and JSX elements. For each, ask the checker for the resolved signature's
declaration. A `const alias = fn` is followed to `fn` in both directions, so a
call through the alias connects to the real function.

**3. Callers (the expensive direction).** A naive design would force a
whole-project index. Instead, call `findReferencesAsNodes()` on the focus symbol,
keep only references that are a call target or a JSX tag name, and walk up from
each to its enclosing callable. The language service already maintains the index
this needs — the analyser borrows `tsserver`'s work rather than duplicating it.

Hub functions (a logger with 300 references) are capped at 50 callers, the slice
is marked `truncated: true`, and the UI shows a `+N more` affordance. One unlucky
focus must not hang the panel.

**4. Classify and label.** A declaration inside the repo becomes `function` or
`component`; inside `node_modules` or a `lib.*.d.ts` it becomes an `external`
chip; unresolvable becomes `unknown`. Labels come from `getReturnType()`,
formatted per section 5.4.

**5. Attach node metadata.** The input type for the header's right slot, the
promise-unwrapped return type, the declaration range for click-to-jump, the
pre-clamp line count that section 7.6 sizing needs, and a source excerpt capped
at 25 lines for the node's code region.

There is no combined `signature` field. The header renders `name` and
`inputType`; the outgoing edge renders `returnType`. A single concatenated
signature string would duplicate both and be rendered nowhere.

`findReferences` is the single performance risk in the design. Analysis therefore
runs in a worker thread, and every slice carries `truncated` rather than silently
misrepresenting completeness.

The core never imports `vscode`. It takes a `Project` and plain positions, which
is precisely what allows the CLI and the tests to drive it.

## 7. Extension architecture

### 7.1 Packages

| Package | Contents | Ships in `.vsix` |
|---|---|---|
| `core` | Analysis. No `vscode` import. | Yes, bundled |
| `extension` | Activation, worker host, webview host, editor integration | Yes |
| `webview` | React Flow + ELK UI bundle | Yes, as assets |
| `cli` | Development and test harness | No |

`pnpm` workspaces for development; `esbuild` bundles `core` and `extension` into
a single output file at package time. The monorepo is a development-time
structure and is invisible to users, who install one `.vsix`.

### 7.2 Panel

A `Code Spider: Show Graph` command opens a webview panel in `ViewColumn.Beside` —
a graph needs width, and beside-the-code is the intended ergonomic. The panel
sets `retainContextWhenHidden` so switching tabs does not wipe expansions.

### 7.3 Threading

The `ts-morph` project and all analysis live in a worker thread; the extension
host only marshals messages. A multi-second `findReferences` must never freeze
typing, even when the user initiated it. The panel shows a spinner meanwhile.

### 7.4 Message protocol

```
webview → ext:  focus(nodeId) | expand(nodeId) | refresh()
                | openInEditor(nodeId) | openCallSite(edgeId)

ext → webview:  slice(GraphSlice) | analysisError(message) | busy(boolean)
```

### 7.5 Rendering

**React Flow** handles pan/zoom, custom node components, and incremental node
addition — which maps directly onto expand-on-demand, and lets a node be real
DOM (signature line, async badge, external-chip styling) rather than a shape on a
canvas. **ELK**'s layered algorithm does layout, direction left-to-right so
suppliers sit left of consumers.

Cytoscape.js was considered. It scales to thousands of nodes, but node counts
here are in the tens and its custom-node story is much weaker. Wrong trade.

**Expansion must not reshuffle the canvas.** Naive re-layout on every expand
destroys the user's mental map. Already-placed nodes are pinned, ELK runs only
over the newly added subgraph, and insertions animate in. This is expected to
take a couple of iterations to feel right.

### 7.6 Node rendering

Every node renders as a box: a two-part header — name on the left, input type on
the right — above a code region.

```
┌──────────────────────────────────────────┐
│ validateUser                  UserInput  │
├──────────────────────────────────────────┤
│ export function validateUser(            │
│   input: UserInput                       │
│ ): ValidUserData {                       │
│   if (!input.email) throw new Error(…)   │
│   return { ...input, verified: false }   │
│ }                                        │
└──────────────────────────────────────────┘
                   │ ValidUserData
                   ▼
```

The header's right slot resolves the asymmetry noted in section 4.4. Arguments
travel against the arrow, so a node displays what it *received* while its
outgoing edge displays what it *returns*. Both directions are legible at once,
and a callee's header makes visible what the focus function passed down into it.

For a `component`, the input type is the props type. For an `external` chip there
is often no useful signature, so the right slot is left empty rather than showing
`any`. Long parameter lists truncate with an ellipsis and carry the full text in
a `title` attribute.

**Sizing.** Width is uniform across all nodes: the layered left-to-right layout
arranges nodes in columns, and ragged widths make those columns read as broken.
Height varies per node:

```
height = header + clamp(lineCount, 3, 25) × lineHeight
```

Functions longer than 25 lines clip with a fade at the bottom edge; the full
source is one click away in the editor. This is what sets the 25-line excerpt cap.

Dimensions are computed **analytically, never measured from the DOM**. The font
is monospace, the width is uniform, and the content is clipped, so height is pure
arithmetic and is available before ELK runs. Rendering offscreen to measure is
slower, asynchronous, and a well-known source of layout race conditions.

A side benefit: variable heights make a zoomed-out graph encode complexity
visually. A tall box is a long function, spotted without reading anything.

**Zoom as level of detail.** Below a zoom threshold the code region renders as
greyed placeholder lines; above it, as real monospace text. Two implementation
constraints:

- Subscribe to viewport zoom **once** at the canvas container and toggle a CSS
  class. Per-node zoom subscriptions re-render every node on every wheel tick,
  which is how these canvases become janky.
- Keep the code text in the DOM at all times and hide it with CSS. Mounting and
  unmounting dozens of code blocks at the threshold causes a visible hitch.

Because node dimensions never change on zoom, level-of-detail never triggers
re-layout.

**No scrolling inside nodes.** In-node scrolling creates a wheel conflict —
scroll the code, or zoom the canvas? — with no comfortable resolution. The code
region clips instead.

**Sizing and refresh.** If a function grows, refreshing changes its node's height
and the layout shifts accordingly. That is correct: the code changed. Position
pinning still applies during expansion, where existing nodes do not change size.

### 7.7 Editor integration

Clicking a node calls `showTextDocument` and reveals its declaration range.
Clicking an edge jumps to the exact call site, which the edge already carries.
Theming derives from VS Code's CSS variables so the graph matches the active
theme.

There is no separate hover preview. The node's own code region does that job, so
a hover tooltip would duplicate it and add a positioning problem for no gain.

## 8. Interaction and refresh

### 8.1 Gestures

VS Code extensions **cannot** bind modifier-plus-left-click in the text editor.
There is no mouse event API for the editor: extensions observe selection
*changes*, not clicks, and cannot read modifier state. `Ctrl+Click`, `Alt+Click`
and `Shift+Click` are owned by the editor core. Three native gestures are
provided instead, all firing the same command:

- **`Shift+Alt+Q`** with the cursor inside a function or component. Primary
  gesture. (Verify this is unbound in VS Code's defaults before shipping;
  `Shift+Alt+F`, `O` and `A` are taken.)
- **A CodeLens** reading `⧉ Graph` above every function and component
  declaration. The one-click version, discoverable without knowing the shortcut.
  Toggleable via setting, since some users find CodeLens noisy.
- **Right-click → "Show in Code Spider"** in the editor context menu.

The command reads the cursor position, runs `analyzeFocus`, opens the panel
beside the code if it is not already open, and replaces its contents.

### 8.2 Refresh semantics

Analysis runs at exactly three moments: focus command, expand click, and the
panel's manual **Refresh** button. There is no file watching and no automatic
re-analysis.

| Action | Focus | Expansions | Analysis |
|---|---|---|---|
| Focus command | Changes | Discarded | Fresh slice |
| Expand `+` | Unchanged | Grows | Slice for expanded node |
| Refresh button | Unchanged | **Preserved** | Re-runs focus and all expansions |

The refresh button exists so that after changing code you do not have to click
back into the editor to update the panel.

If a refresh finds that an expanded node no longer exists, that node is dropped
along with anything reachable only through it.

The `ts-morph` project is kept warm between invocations, with changed files
refreshed from disk at the start of each run. This is the difference between a
multi-second cold start and a fast subsequent focus.

## 9. Testing strategy

The `core` boundary exists so that this section is possible.

**Fixture repos.** `test-code/` holds several small but *real* TypeScript
projects, each with its own `tsconfig.json`, because the type checker needs
genuine module resolution to produce genuine types. Mock ASTs would test nothing
worth testing.

**Golden slices.** Each test focuses a known symbol in a fixture and asserts the
resulting `GraphSlice` JSON against a checked-in golden file. The initial set,
which doubles as the TDD plan for the analyser:

1. A plain call chain — baseline nodes and edges.
2. An `async` function — does `Promise<User>` display as `User` with `isAsync`?
3. A JSX element — do props become the edge label?
4. A `node_modules` call — classified `external`, not expandable.
5. A dynamic call — dashed, `resolved: false`, `unknown` target.
6. A hub function — caller list capped, `truncated: true`.
7. An aliased re-export — does the callee resolve through a barrel file?
8. An arrow-function const.
9. A default export.

**The CLI is the test harness.** `code-spider test-code/basic/src/index.ts:12:5`
prints a slice as JSON. It accepts `line:col` for human convenience and converts
to the character offset that `analyzeFocus` expects. It generates the goldens and
provides the development loop: sub-second, no extension host, no clicking.

**Webview logic stays pure.** Slice merging, expansion bookkeeping, and the
drop-orphans-on-refresh rule are plain functions over plain data, unit-tested
directly. Only rendering touches React.

**The extension gets smoke tests, not thorough ones.** Two or three
`@vscode/test-electron` cases: the command registers, the panel opens,
click-to-jump lands on the right line. Integration tests there are slow and
brittle, and the thin shell is deliberately not where the logic lives.

## 10. Milestones

**M0 — Skeleton.** `pnpm` workspaces, four packages, `esbuild` build, a
do-nothing extension that opens an empty webview. Boring plumbing first so
nothing is blocked on it later.

**M1 — Analyser, CLI only, no UI.** `analyzeFocus` produces correct slices for
the whole fixture set; goldens green. Most of the value and all of the risk,
testable before a single pixel exists.

**M2 — First graph on screen.** React Flow and ELK render a radius-1 slice.
Command, `Shift+Alt+Q`, CodeLens and context menu wired. Click-to-jump works.

**M3 — Interaction.** Expand-on-demand with position pinning, the refresh
button, and zoom-based level of detail in node code regions. Added after M2:

- Re-centre from inside the graph: a gesture on a node (double-click or a
  button) makes it the new focus, so the tree can be walked without returning
  to the editor. A plain click still jumps to the code.
- Draggable nodes. A node the user has moved stays pinned where it was put;
  expansion never moves it.
- Add the ability to increase the distance between nodes on the x-axis to spread out nodes more and add legibility to longer labels. Preferably with a slider in the code-spider panel.
- No overlap, ever: nodes placed by an expansion must not land on existing or
  dragged nodes, and edge labels must not stack on top of each other.
- Saved-file tracking also picks up changes made outside VS Code (a file
  watcher that only tells the worker which files changed; it never triggers
  analysis or redraws by itself), so a `git switch` doesn't leave the warm
  project reading stale files.

**M4 — Polish and package.** Theming, truncation and unknown-node states, error
handling, `.vsix`.

## 11. Risks

1. **`findReferences` performance** on a large repo is unmeasured. If it proves
   unusably slow, the fallback is a cached reverse index, which is a significant
   design change. Measure during M1, while reacting is still cheap.
2. **Incremental ELK layout** feeling good on expand is an iteration problem
   rather than a feasibility problem, but it is the difference between the tool
   feeling solid and feeling janky.
3. **Which `tsconfig.json`?** Unambiguous for a single Next.js app, ambiguous in
   a monorepo with several. v1 uses the largest `tsconfig.json` between the
   focused file and the git repository root that actually includes the file, so
   a package file in a repo with an all-covering root config sees callers across
   the repo. Repos without such a root (a root that only lists project
   references, or packages linked only through the workspace) still get the
   nearest config, and cross-package callers stay invisible there.

## 12. Deferred

Ordered roughly by expected value:

- **Def-use overlay.** Faint secondary arrows between a focus node's own callees,
  showing which callee's output feeds which other callee — the intra-body value
  chaining. The graph model already accommodates a second edge kind. This is the
  most interesting remaining problem.
- **LLM enrichment.** A pass consuming a finished `GraphSlice` and returning
  annotations: resolving indirection static analysis cannot follow, grouping long
  traces into phases, naming poorly-named nodes. Attaches at the `unknown` node
  and never blocks correctness.
- **Live updates.** File watching with debounce and graph diffing.
- **A second-language analyser** behind the same `GraphSlice` contract.
- **Graph-to-code editing** — the bidirectional vision.

## 13. Working agreement

Agents build the implementation. Each plan task gets one implementer agent and
one independent reviewer agent; the repository owner reviews the result and
makes every commit, one task at a time. Nothing is staged, committed or pushed
without the owner asking.

Plans are therefore written **for an agent with no context on this codebase**:
exact files, interfaces between tasks, test code, commands and expected output
for every step. The analyser plan (M0 + M1) predates this and was written for a
human learner; plans from M2 onward follow this agreement.

Claude coordinates: it writes each plan through an author agent, checks it
against this spec, dispatches the per-task agents, and stops after every task so
the owner can commit.
