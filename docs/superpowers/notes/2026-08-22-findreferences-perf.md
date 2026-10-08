# findReferences performance — M1 measurement

Measures spec §11 risk 1: is the language-service reference lookup fast enough
to use as the caller index (spec §6), or is a cached reverse index needed?

**Date:** 2026-10-09
**Machine:** Intel Core i9-9900X (20 threads), 31 GB RAM, WSL2 Linux 5.15, Node 23.9.0, pnpm 11.24.0
**Tool:** `packages/cli` with `--timing --repeat 3`, one fresh process per target.
`load` is `loadProject` (ts-morph `Project` creation and parsing). `analyze[1]`
is the first `analyzeFocus` on that project (cold). `analyze[2..3]` are repeats
on the same loaded project (warm), which is what a long-lived extension worker
would see after the first focus.

## What was measured

| Repo | Commit | TS/TSX files | Notes |
|---|---|---|---|
| `shadcn-ui/taxonomy` | `298a8857` (2026-04-20) | 125 | Next.js 13 app router, one tsconfig, hub helper `cn()`. Lockfile too old for pnpm 11, so dependencies were re-resolved (versions float; `next` 13.3.2-canary, TypeScript 4.7.4). `contentlayer`/Prisma generated types do not exist, so some types resolve to `any`. |
| `lobehub/lobe-chat` | `d28985a7` (2026-10-09) | 15,312 | Large single Next.js app inside a pnpm monorepo. Root `tsconfig.json` used for `src/` files. Install used `--ignore-scripts --no-frozen-lockfile` (lockfile written by pnpm 12). |

Both repos were cloned shallow into a scratch directory outside this repo.
Neither was modified. There is **no data point between 125 and 15,312 files**.

## Results — taxonomy (125 files)

| Focus target | Callers found | Load | analyze[1] cold | analyze[2] | analyze[3] |
|---|---|---|---|---|---|
| `cn` (hub, `lib/utils.ts`) | 43 | 1727 ms | 1233 ms | 132 ms | 134 ms |
| `absoluteUrl` (leaf) | 4 | 1692 ms | 1286 ms | 20 ms | 16 ms |
| `MainNav` (mid-level component) | 0 (see finding 2) | 1678 ms | 1007 ms | 29 ms | 23 ms |
| `DashboardHeader` (component rendered 6 times) | 0 (see finding 2) | 1676 ms | 926 ms | 28 ms | 23 ms |
| `IndexPage` (largest page file) | 0 (a route, expected) | 1689 ms | 926 ms | 18 ms | 19 ms |

## Results — lobe-chat (15,312 files, Node heap raised to 16 GB)

| Focus target | Callers found | Load | analyze[1] cold | analyze[2] | analyze[3] | Peak RSS |
|---|---|---|---|---|---|---|
| `ensureElectronIpc` (hub, ~196 text references) | 50, truncated | 43971 ms | 27877 ms | 683 ms | 588 ms | 6.8 GB |
| `standardizeIdentifier` (leaf) | 3 | 43754 ms | 20095 ms | 551 ms | 574 ms | 6.7 GB |
| `executeHeterogeneousAgent` (function in the largest file, 229 nodes in slice) | 5 | 44343 ms | 42093 ms | 891 ms | 876 ms | 7.6 GB |

With Node's **default heap** (about 4 GB) the first lobe-chat run died with
`JavaScript heap out of memory` after 57 s, during load.

Not covered: a mid-size repo (200–1,000 files), a multi-tsconfig monorepo
focused through a package's own tsconfig, and a React component with many JSX
parents (none could be exercised, see finding 2).

## Verdict

**Marginal.** The reference-index approach does not need replacing yet, but the
numbers constrain the UI plan.

- **Typical-sized app (taxonomy, ~125 files):** acceptable. Warm focus is
  16–134 ms, well under the ~500 ms budget. The first focus costs about 1 s on
  top of a ~1.7 s load, once per session.
- **Very large project (15k files):** warm focus is 0.55–0.9 s, just over the
  budget, and the **first focus costs 20–42 s** after a ~44 s load, with 6.7–7.6
  GB resident and an out-of-memory failure at the default heap. This is not
  usable without mitigation, but the failure is dominated by building the
  program and checker, which a reverse index would also need.
- **What this does not show:** how the cold cost splits between type-checker
  creation and the reference search. Even slices with zero callers pay about
  1 s cold on taxonomy, which suggests a large fixed component. A direct
  split needs a profile and was not done.

Spec §11 risk 1 is therefore **not closed**: acceptable at small scale,
unproven at mid scale, and clearly needing mitigation at monorepo scale.

## Consequences for the UI plan (M2–M4)

1. Analysis must run in the worker thread the spec already calls for, and the
   panel needs a first-focus "indexing" state that can last tens of seconds on
   large projects. Warm focuses still need a spinner above ~500 ms.
2. The worker needs a raised heap (`resourceLimits.maxOldGenerationSizeMb`, or
   equivalent) or large projects will crash it. Report memory failures as a
   clear message, not a silent hang.
3. Consider warming the project on extension activation, before the first
   focus, so the user does not pay the cold cost on the first keystroke.
4. Measure a 200–1,000 file repo before deciding whether a reverse index is
   worth designing. If that size is comfortably warm, the index is not needed.

## Findings outside performance

1. **Nearest-tsconfig picks a sub-package config for monorepo files.** A file
   under `lobe-chat/packages/utils/src/` resolves to that package's own
   `tsconfig.json`, so callers in other packages would be invisible (spec §11
   risk 3 in practice). Targets under `src/` used the root config.
2. **Callers never include JSX renders.** Spec §6 says to keep references that
   are "a call target or a JSX tag name"; `packages/core/src/callers.ts` only
   handles calls. `DashboardHeader` (rendered in 6 places) and `MainNav` report
   0 callers. A component's parents are missing from its slice, which removes
   half of the frontend graph.
3. **`forwardRef`/`memo`-wrapped components lose their callers and callees.**
   `cn` has about 181 textual call sites but 43 callers were found. 115 of those
   lines are in files using `React.forwardRef`, whose body is an anonymous
   callback inside a call-expression initializer, so no enclosing named
   function is found. This is the "const initialised by a call expression"
   limitation already recorded, but shadcn-style code makes it the norm.

## Reproducing

```bash
# from the repo root; node heap raised for large projects
NODE_OPTIONS=--max-old-space-size=16384 \
  pnpm --filter @code-spider/cli exec tsx src/index.ts \
  <absolute path to file>:<line>:<col> --timing --repeat 3
```

Cursor positions used (1-based, inside the function body): taxonomy
`lib/utils.ts:7:3` (`cn`), `lib/utils.ts:20:3` (`absoluteUrl`),
`components/main-nav.tsx:19:3`, `components/header.tsx:8:3`,
`app/(marketing)/page.tsx:36:3`; lobe-chat `src/utils/electron/ipc.ts:5:3`,
`src/utils/identifier.ts:8:3`,
`src/store/chat/slices/agentRun/actions/transports/hetero/heterogeneousAgentExecutor.ts:492:3`.
