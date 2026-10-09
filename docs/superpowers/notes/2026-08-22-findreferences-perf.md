# findReferences performance — M1 measurement

Measures spec §11 risk 1: is the language-service reference lookup fast enough
to use as the caller index (spec §6), or is a cached reverse index needed?

**Date:** 2026-10-09 (first pass), 2026-10-09 (follow-up: mid-size repos and
cold-cost split)
**Machine:** Intel Core i9-9900X (20 threads), 31 GB RAM, WSL2 Linux 5.15,
Node 23.9.0. The analyser runs the TypeScript 5.5.2 bundled with ts-morph 23,
whatever version a measured repo pins.

## Summary

- **Risk 1 is closed for repos up to ~1,500 files.** Warm focuses take 42–436
  ms on excalidraw (670 files) and umami (1,341 files), under the ~500 ms budget.
  The first focus costs 1.6–4.3 s after a 2.7–5.5 s load.
- **A reverse index is not worth designing.** Even at 15k files the cold cost is
  dominated by loading, binding and a duplicated program, all of which a reverse
  index would still need. The reference search itself is a minority of it.
- **ts-morph builds two programs.** Type queries use ts-morph's own program, and
  `findReferences` uses a separate one inside the language service. Running the
  reference search on ts-morph's program finds the same references and removes
  0.4 s (taxonomy) to 8.6 s (lobe-chat) of cold time, plus 40–680 MB. This is the
  cheapest large win available.
- **Nearest-tsconfig hides half the callers in a monorepo package.** On
  excalidraw, `pointFrom` has 1,571 references through the root config but 785
  through its package's own config.

## Method

Each row is one fresh process. Phases run in this order:

| Phase | What it builds |
|---|---|
| `load` | `loadProject`: ts-morph `Project`, parsing, module resolution and ts-morph's own program |
| `checker` | ts-morph's type checker, which binds every file |
| `LS program` | the language service's separate program, which `findReferences` uses |
| `findRefs` | cold `findReferencesAsNodes` on the focus name |
| `analyze[1]` | first `analyzeFocus`: a warm reference search plus first-time type checking of every file in the slice, for labels |
| `analyze[2..3]` | repeats on the same project: what a long-lived worker sees on later focuses |

`checker` plus `LS program` is what the CLI now reports as `warm:` (see
`warmProject` in `packages/core/src/project.ts`). The finer split and the
single-program comparison came from a scratch harness that times the same calls.
Its single-program mode never touches the language service and calls TypeScript's
internal reference finder on ts-morph's program:

```ts
ts.FindAllReferences.findReferencedSymbols(
  program, cancellationToken, program.getSourceFiles(), sourceFile, position,
);
```

Memory is peak RSS in MiB from `process.resourceUsage().maxRSS`.

## Repos

| Repo | Commit | Files in program | Notes |
|---|---|---|---|
| `shadcn-ui/taxonomy` | `298a8857` (2026-04-20) | 126 | Next.js 13 app, one tsconfig, hub helper `cn()`. Old lockfile, so dependencies were re-resolved, and generated types are missing. |
| `excalidraw/excalidraw` | `4c00f31` (2026-10-08) | 670 | Root tsconfig spans all packages plus `excalidraw-app`; each package also has its own. `yarn@1.22.22 install --frozen-lockfile --ignore-scripts`. |
| `umami-software/umami` | `ec0ff50` (2026-09-16) | 1,341 | Next.js app, root tsconfig covers `src/`. `pnpm@12.3.4 install --frozen-lockfile --ignore-scripts`. |
| `lobehub/lobe-chat` | `d28985a7` (2026-10-09) | 14,297 | Large Next.js app in a pnpm monorepo, root tsconfig. Needs a 16 GB heap; the default heap runs out of memory during load. |

All were shallow clones outside this repo, unmodified.

## Results — mid-size

All times in ms. Callers are capped at 50 (`MAX_CALLERS`).

| Repo | Focus | Refs | Callers | load | checker | LS program | findRefs | analyze[1] | analyze[2] | analyze[3] | Peak RSS |
|---|---|---|---|---|---|---|---|---|---|---|---|
| excalidraw | `pointFrom` (hub) | 1,571 | 50 | 2,716 | 702 | 417 | 565 | 1,291 | 427 | 408 | 708 |
| excalidraw | `t` (i18n hub) | 770 | 50 | 2,881 | 762 | 535 | 748 | 1,051 | 436 | 391 | 700 |
| excalidraw | `DropdownMenu` (component) | 109 | 5 | 2,746 | 702 | 446 | 229 | 220 | 48 | 42 | 668 |
| excalidraw | `App.render` (12k-line file) | 9 | 0 | 2,748 | 715 | 448 | 440 | 790 | 296 | 307 | 683 |
| excalidraw | `ExcalidrawWrapper` (app) | 1 | 1 | 2,761 | 713 | 436 | 97 | 902 | 161 | 164 | 680 |
| umami | `useMessages` (hub) | 549 | 50 | 5,820 | 1,014 | 1,410 | 1,062 | 796 | 286 | 279 | 1,011 |
| umami | `parseRequest` (hub) | 369 | 50 | 5,472 | 1,004 | 1,407 | 406 | 453 | 196 | 170 | 986 |
| umami | `formatLongNumber` (leaf) | 79 | 17 | 5,446 | 1,000 | 1,361 | 173 | 632 | 159 | 151 | 978 |
| umami | `LoadingPanel` (component) | 173 | 50 | 5,481 | 968 | 1,343 | 492 | 758 | 290 | 285 | 987 |

`DropdownMenu` is rendered directly in exactly 5 files. Its other 38 tag uses are
`<DropdownMenu.Item>` and similar, which render different components.

## Results — two programs vs one

The same hub focus with the language service (today), and with the reference
search run on ts-morph's own program instead.

| Repo | Focus | Refs (LS / single) | LS program + findRefs | Single findRefs | Saved | RSS after search (LS / single) |
|---|---|---|---|---|---|---|
| taxonomy | `cn` | 240 / 241 | 711 | 279 | 432 ms | — |
| excalidraw | `pointFrom` | 1,571 / 1,572 | 982 | 459 | 523 ms | 712 / 675 MB |
| umami | `useMessages` | 549 / 550 | 2,472 | 1,287 | 1.2 s | 1,027 / 947 MB |
| lobe-chat | `ensureElectronIpc` | 177 / 178 | 14,460 | 5,823 | 8.6 s | 6,897 / 6,221 MB |

The single-program count is one higher in every case, which looks like the
declaration entry. On lobe-chat, `load` (44 s) and `checker` (8 s) are the same
in both modes.

## Results — first pass (taxonomy and lobe-chat)

These predate the cold split, so `analyze[1]` includes building the checker and
the language service program.

| Repo | Focus | Callers then | Load | analyze[1] | analyze[2] | analyze[3] | Peak RSS |
|---|---|---|---|---|---|---|---|
| taxonomy | `cn` | 43 | 1,727 | 1,233 | 132 | 134 | — |
| taxonomy | `absoluteUrl` | 4 | 1,692 | 1,286 | 20 | 16 | — |
| taxonomy | `DashboardHeader` | 0 | 1,676 | 926 | 28 | 23 | — |
| lobe-chat | `ensureElectronIpc` | 50 | 43,971 | 27,877 | 683 | 588 | 6.8 GB |
| lobe-chat | `standardizeIdentifier` | 3 | 43,754 | 20,095 | 551 | 574 | 6.7 GB |
| lobe-chat | `executeHeterogeneousAgent` | 5 | 44,343 | 42,093 | 891 | 876 | 7.6 GB |

The zero-caller and 43-caller results came from bugs since fixed (findings 2 and
3 below). With the fixes, `DashboardHeader` finds its JSX parents, and `cn`
reaches the 50-caller cap. A split re-run of `DashboardHeader` gives 793 ms of
warm-up, then 138 ms for the first focus and about 30 ms after that.

## Where the cold cost goes

- **Setup dominates.** `checker` plus `LS program` is 0.8 s on taxonomy, 1.1–1.3 s
  on excalidraw, 2.3–2.4 s on umami and 19.5 s on lobe-chat. A small slice pays
  it in full: `DashboardHeader`'s cold `findRefs` is only 86 ms.
- **The reference search follows the name's text, not the repo size.** Cold
  `findRefs` is 0.1–0.5 s for leaves and components and 0.4–1.1 s for hubs. The
  language service first finds every textual match of the name and then checks
  each one, so a common name costs more: `App.render` took 440 ms for 9 real
  references.
- **`analyze[1]` is first-time type checking of the slice's files.** A hub's 50
  callers live in many files, each checked for the first time to build labels
  (0.45–1.3 s here). Later focuses reuse those types.
- **`load` is the largest single phase at every size**, and grows faster than the
  file count: 1.7 s for 126 files, 2.7 s for 670, 5.5 s for 1,341, 44 s for 14,297.

## Verdict

**Risk 1 is closed for typical app sizes, and a reverse index is not needed.**

- **Up to ~1,500 files:** warm focus is within budget everywhere measured, and
  memory stays near 1 GB, inside Node's default heap.
- **~15k files:** warm focus (0.55–0.9 s) is just over budget, and the cold path
  is load, bind and the second program. A reverse index would still need the
  program for types and labels, so it would not remove those costs.

## Consequences for the UI plan (M2–M4)

1. Run analysis in the worker thread the spec calls for, with a raised heap
   (`resourceLimits.maxOldGenerationSizeMb`) so very large projects don't crash.
2. Call `warmProject` at activation, behind an "indexing" state. On a mid-size
   repo the first focus then takes 0.5–2 s instead of 1.6–4.3 s.
3. Keep a spinner for focuses over ~500 ms. Hub focuses on large repos will hit it.

## Recommended follow-ups

1. **One program instead of two.** Run the reference search on ts-morph's own
   program, as the single-program mode above does, and stop building the
   language service. This saves 0.4–8.6 s of cold time and 40–680 MB in the
   repos measured. It relies on an internal TypeScript API, which should be
   wrapped in one place and covered by the existing caller tests.
2. **Monorepo tsconfig selection** (spec §11 risk 3) needs a design decision; see
   finding 1.
3. **Loading at 15k files** (44 s) is the remaining scale problem. It is out of
   scope until a target user actually needs a project that size.

## Findings outside performance

1. **Nearest-tsconfig picks a package's config for files under a package.**
   excalidraw's `pointFrom` (`packages/math`) has 1,571 references through the
   root config but 785 through `packages/math/tsconfig.json`, so half its callers
   are invisible. lobe-chat's `packages/utils` showed the same pattern (spec §11
   risk 3). *Open.*
2. **Callers did not include JSX renders.** `DashboardHeader` (rendered in 6
   places) showed 0 callers. *Fixed in `ea4d3b2`.*
3. **`forwardRef`/`memo` components lost their callers and callees.** `cn` found
   43 callers of about 181 call sites. *Fixed in `470e6b8`; it now reaches the cap.*
4. **Component kind depends on the slice.** umami's `LoadingPanel` returns
   `ReactNode`, which `classifyDeclaration` does not recognise as JSX. It is
   `function` when focused, but `component` in each of its 50 parents' slices,
   where it arrives through a JSX edge. The same node id therefore gets a
   different kind depending on which slice the webview merges last. *Open.*

## Reproducing

```bash
# from the repo root; raise the heap for very large projects
NODE_OPTIONS=--max-old-space-size=16384 \
  pnpm --filter @code-spider/cli exec tsx src/index.ts \
  <absolute path to file>:<line>:<col> --timing --repeat 3
```

The CLI prints `load`, `warm` (checker plus language service program) and
`analyze[n]`, and always uses the nearest tsconfig. The rows that use excalidraw's
root config for files under `packages/` came from the scratch harness, which
takes the tsconfig as an argument.

Focus targets, by cursor line inside each body: taxonomy `lib/utils.ts:7`,
`lib/utils.ts:20`, `components/header.tsx:8`; excalidraw
`packages/math/src/point.ts:39`, `packages/excalidraw/i18n.ts:132`,
`packages/excalidraw/components/dropdownMenu/DropdownMenu.tsx:30`, the first
`!this.isInteractionEnabled() &&` in `packages/excalidraw/components/App.tsx`
(inside `render`), `excalidraw-app/App.tsx:376`; umami
`src/components/hooks/useMessages.ts:6`, `src/lib/request.ts:16`,
`src/lib/format.ts:51`, `src/components/common/LoadingPanel.tsx:30`; lobe-chat
`src/utils/electron/ipc.ts:5`, `src/utils/identifier.ts:8`,
`src/store/chat/slices/agentRun/actions/transports/hetero/heterogeneousAgentExecutor.ts:492`.
