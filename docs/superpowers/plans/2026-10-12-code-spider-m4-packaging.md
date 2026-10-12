# Code Spider M4: Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to
> validate this plan and hand it to `subagent-driven-development` for
> task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command, `pnpm package`, builds Code Spider and writes `code-spider-vscode-0.1.0.vsix` at the repo root, and a
second command, `pnpm check:vsix`, proves that file works by itself, so the owner can install it on this computer and on a
second one.

**Architecture:** `@vscode/vsce` runs from `packages/extension` with `--no-dependencies` and an allow-list in the manifest's
`files` field; a root `package` script runs `pnpm build` first. The root `README.md` is the single source: a generated,
git-ignored copy is packaged beside the manifest. The check unpacks the `.vsix` into a fresh folder outside the repo,
compares its file list with a fixed list, then runs the existing real-VS-Code smoke suite against the unpacked extension
through the existing runner.

**Tech Stack:** As M3c (TypeScript 5.6+ strict, pnpm workspaces, esbuild, Vitest 2, `@vscode/test-electron` 3.1). **Two new
devDependencies of `packages/extension`:** `@vscode/vsce` ^4.0.0 (Task 1) and `fflate` ^0.8.3 (Task 2). The lockfile and
`pnpm-workspace.yaml` change.

**Spec:** none; the approved design is in this plan. Background: docs/superpowers/specs/2026-08-22-code-spider-design.md §10
(roadmap, M4 "Polish and package"). This plan builds only the `.vsix` part of M4; theming, truncation and error handling are
not in it, so §10 is not edited.

## Global Constraints

Every task's requirements include these.

**Scope.** A `.vsix` for local install only. Not published to the Marketplace; no publisher account. Out of scope (D8): an
icon, a LICENSE file, a changelog, and the known issue in `memoiseTsMorphPaths`. No smoke case is added.

**Baseline (HEAD `b1d60d2`, tree clean, measured 2026-10-12).** `pnpm -r typecheck` clean. `pnpm -r test`: core 250, CLI 39,
webview 507, extension 206. `pnpm build` passes. `pnpm --filter code-spider-vscode test:smoke`: 7 passing. Tools: Node
v23.9.0, pnpm 11.24.0, test VS Code 1.141.0 (`packages/extension/vscode-version.json`). The extension count after each task is
given in the task; core, CLI and webview do not change in this plan.

**TDD, once for every task.** Where a unit test is sensible, write the listed tests, see them fail for the right reason,
implement, see them pass. Parts that only an end-to-end run can show (a build, a package, a VS Code launch) are proven by the
steps instead. All existing tests must still pass.

**Every new check is proven able to fail.** Break what it guards, watch it fail and name the culprit, restore. Each task's
steps say which break to make. A check that was only ever seen passing is not done. For the `.vsix` check: let a `.map` file
into the package, and take `dist/webview/index.css` out of it.

**Repository rules (from the owner's instructions).**
- Work on `main`; never branch; never push.
- Code files aim for 300 lines, hard cap 500; split by responsibility. Comments are minimal: only logic that is hard to
  follow, never a label for the next line. Prefer simpler code to a comment. This is for code; documents have no length target.
- Style is Prettier defaults, matched by hand (Prettier is not installed and must not be added). Packages are `"type":
  "module"`; TypeScript imports use `.js` specifiers. Test literals contain no invisible characters; write them as escapes.
- `cp` is aliased to interactive on this machine and hangs: any shell copy must be `command cp -f`. Scripts use Node `fs`.
- Plain words in all text, including the README and the report.

**Commands** (begin every Bash command with `cd /home/motodox/code/AlekP141/code-spider && `).
- Every task leaves these passing: `pnpm -r typecheck`, `pnpm -r test`, `pnpm build`, plus the task's own verify commands.
- One package: `pnpm --filter code-spider-vscode test <name>`.
- Smoke and `pnpm check:vsix` start a real VS Code and need a display (`DISPLAY` set; WSLg gives `:0`).
  `pnpm --filter code-spider-vscode check:electron` says whether VS Code can start here; it exits 0 when it can.
- The check's temp folder comes from `os.tmpdir()`, so `TMPDIR=<dir> pnpm check:vsix` moves it. Use that if the session may
  not write to `/tmp`.
- `git diff` and `git diff --check` skip untracked files, so every task's last step also runs
  `for f in $(git ls-files --others --exclude-standard -- <paths>); do git diff --no-index --check -- /dev/null "$f"; done`
  (exit status 1 only means the file differs from `/dev/null`; whitespace warnings are what matter). The `.vsix` and the
  generated `packages/extension/README.md` are git-ignored and do not appear there or in `git status`.

**Commits.** The implementer never stages or commits. After a task's review is approved and the coordinator has re-run
`pnpm -r typecheck`, `pnpm -r test`, `pnpm build` and the task's verify step, the coordinator stages that task's exact paths
and commits them: one commit per task, one plain lowercase line saying what happened, no `feat:` or `chore:` prefix, no
`Co-Authored-By` or any other trailer. Each task ends with its proposed message.

**Manual checks** are the owner's (end of this plan). No one records them as run.

## Agent Execution Contract

- Each task uses exactly one isolated `workflow-implementer` and exactly one independent read-only `workflow-reviewer`, both
  Sonnet. The Task 2 reviewer also runs `pnpm check:vsix` and repeats one of the break proofs.
- Both are reused with `SendMessage` for every fix and re-review of that task.
- After two failed fix rounds on the same substantive issue, stop and ask the owner whether to replace that task's
  implementer with a `workflow-author`; keep the same reviewer. Never replace an unresumable agent silently.
- One fresh `workflow-reviewer` does the integration review after Task 3 (see the end of the task list) and is reused for its
  rechecks.
- Minor review findings are fixed, not parked, unless a later task rewrites the file.

## Design (agreed 2026-10-12, no separate spec)

**Request.** A `.vsix` the owner builds with one command and installs locally on this computer and on a second computer.
Local install only; not published to the Marketplace.

Facts marked "verified" were checked on 2026-10-12 in throwaway folders outside the repo with `@vscode/vsce` 4.0.0 (the newest
release; it needs Node 22 or newer), `pnpm` 11.24.0 and Node 23.9.0. Nothing in the repo was changed to check them.

1. **D1 One command.** `pnpm package` at the repo root runs `pnpm build` and then `pnpm --filter code-spider-vscode
   package:vsix`, which copies the root README into the package folder (D4) and runs `vsce package --no-dependencies
   --skip-license --out ../../`. `--no-dependencies` because this is a pnpm workspace and esbuild has bundled everything.
   `--skip-license` silences vsce's "LICENSE not found" warning; it exists in 4.0.0 (verified) and no licence file is added.
   **The file is `code-spider-vscode-0.1.0.vsix` at the repo root.** vsce builds the name from the manifest's `name` and
   `version`, so the script does not repeat the version; `--out` given an existing folder keeps that name (verified). This is
   the one place that is stated; the README, the check and the manual checks all use it. `*.vsix` is already in `.gitignore`.
2. **D2 Only the needed files go in.** The `.vsix` holds exactly these eight entries, and nothing else:

   ```
   [Content_Types].xml
   extension.vsixmanifest
   extension/package.json
   extension/readme.md
   extension/dist/extension.cjs
   extension/dist/worker.cjs
   extension/dist/webview/index.js
   extension/dist/webview/index.css
   ```

   No `.map` files, no `dist/smoke`, no `src`, `test`, `smoke`, `scripts`, `node_modules` or `.vscode-test`. vsce stores the
   README as `extension/readme.md` in lower case (verified), not `README.md`. The allow-list is the manifest's `files` field,
   not a `.vscodeignore`, because: it sits in the manifest beside `main`, so a unit test can pin the two together; vsce stops
   with an error when a listed path matches no file (verified: "include pattern ... does not match any file", exit 1), which
   catches a package built without the webview bundle, a case `build.mjs` only warns about; and vsce refuses to run when a
   `.vscodeignore` and `files` both exist (verified), so there must be only one. vsce adds `package.json` and the README
   itself; they are not listed in `files` (verified, including with the README git-ignored).
3. **D3 The manifest.** `version` goes from `0.0.0` to `0.1.0`. A `repository` field with the same `type` and `url` as the
   root `package.json` (`git+https://github.com/AlekP141/code-spider.git`) is added, which removes vsce's "repository
   missing" warning, so `--allow-missing-repository` is not used. `"private": true` stays; it does not block packaging
   (verified). With D1's flags and this field, a package run prints no `WARNING` line (verified). vsce also prints an
   information line that `dist/worker.cjs` is large (12 MB); it is a notice, not a warning, and exits 0.
4. **D4 One README.** The root `README.md` is the single source. `scripts/copy-readme.mjs` copies it byte for byte to
   `packages/extension/README.md` at the start of every `package:vsix`; that copy is git-ignored, never hand-edited and left
   in place afterwards (it is overwritten next time). vsce's `--readme-path` cannot replace the copy: it refuses a path outside
   the package folder (verified). **vsce rewrites the README as it packs it:** a relative link becomes a GitHub URL and `#12`
   becomes an issue link (verified). So the root README must use no relative links, no relative images and no `#<number>`
   text, and the check compares the packaged copy with the root README byte for byte, so a rewrite fails the check.
5. **D5 The check, `pnpm check:vsix`.** Builds the `.vsix` (through the root `package` script, so there is one build path),
   builds the smoke bundle, then `scripts/check-vsix.mjs`: reads the entry names from the `.vsix` and compares them with the
   fixed list in D2, failing on any extra or missing entry and naming each; only if the list is exact, unpacks the `.vsix`
   into a fresh folder under the system temp folder (outside the repo); compares the packaged README with the root README;
   runs the existing seven smoke tests against `<temp>/extension`; and removes the temp folder, also after a failure. This
   proves the package works with no repo `node_modules` beside it, which is the situation on the second computer: the extension
   finds its worker through `context.extensionPath` (`src/extension.ts`), so the code that runs is the unpacked copy. The
   file-list part also covers a package built without the webview bundle.
6. **D6 The runner is reused.** `smoke/run.ts` takes an optional `--extension-path <dir>` and uses it as
   `extensionDevelopmentPath` instead of the package folder. Everything else in the runner stays: the pinned VS Code build,
   the `.vscode-test` cache, the environment scrubbing, the launch arguments, the workspace `test-code/basic`, and the tests
   file `dist/smoke/suite/index.cjs`, which stays in the repo so `mocha` resolves from the repo. Only the extension under test
   is the unpacked copy. Measured by the owner with a throwaway runner: 7 passing against an unpacked `.vsix`.
7. **D7 Two new dependencies, and the pnpm build-script rule.** `@vscode/vsce` is the packaging tool. `fflate` (zero
   dependencies, MIT) reads the zip: Node has no zip reader, and the `unzip` program, though installed on this machine, would be
   an undeclared prerequisite. **pnpm 11 refuses to finish an install that has an unreviewed build script** (verified):
   `@vscode/vsce-sign` has a `postinstall`, so `pnpm install` ends with `ERR_PNPM_IGNORED_BUILDS`, pnpm writes the placeholder
   `'@vscode/vsce-sign': set this to true or false` into `pnpm-workspace.yaml`, and every later pnpm command fails. The
   package only signs and verifies for publishing; packaging works with its script switched off (verified). So
   `pnpm-workspace.yaml` gets `"@vscode/vsce-sign": false` under `allowBuilds`.
8. **D8 Out of scope.** An icon, a LICENSE file, a changelog, Marketplace publishing, a publisher account. Also the known issue
   that `memoiseTsMorphPaths` (`packages/core/src/ts-morph-paths.ts`) silently does nothing inside the esbuild bundle, so its
   speed-up for warm reference searches works only in the CLI and the unit tests. The F5 window runs the same bundle, so the
   packaged extension is no different from F5 here: it is handled separately after this plan, and this plan does not fix it.
   Not in the README: `pnpm check:vsix`, which needs a VS Code download and a display.

## Plan decisions

1. **Three tasks, each with its own gate:** the package (1), the works-by-itself check (2), the README (3).
2. **The expected file list does not change between tasks.** The README copy ships from Task 1, with today's two-line text;
   Task 3 changes its words only. Task 2's list therefore already holds `extension/readme.md`.
3. **The expected list is written out in full in `scripts/vsix-files.mjs`, not derived from `files`.** If it were derived, a
   stray entry added to `files` would make the check agree with the mistake. Task 1's manifest test and Task 2's list guard the
   same fact from two sides on purpose.
4. **`--extension-path` as an argument, not an environment variable.** The runner rejects any other argument, so a misspelt
   flag fails loudly instead of quietly testing the repo copy.
5. **`check:vsix` is one pnpm line, like `test:smoke`:** `pnpm --workspace-root package && node build-smoke.mjs && node
   scripts/check-vsix.mjs`. The smoke bundle must be rebuilt because `run.cjs` has to contain the new argument.
6. **The README copy is not cleaned up.** A leftover git-ignored copy is overwritten by the next package run; deleting it
   would need a step that does not run when vsce fails.
7. **No edit to the design spec or the milestone list.** M4 in the spec also lists theming and error handling, which stay open.

## File structure

| File | Change | Responsibility | Task |
|---|---|---|---|
| `packages/extension/package.json` | modify | version, `repository`, `files`, scripts `package:vsix` and `check:vsix`, devDependencies | 1, 2 |
| `package.json` (root) | modify | scripts `package` and `check:vsix` | 1, 2 |
| `pnpm-workspace.yaml` | modify | `allowBuilds` entry for `@vscode/vsce-sign` | 1 |
| `pnpm-lock.yaml` | modify | the lockfile follows the two dependencies | 1, 2 |
| `.gitignore` | modify | ignore the generated README copy | 1 |
| `packages/extension/scripts/copy-readme.mjs` | create | copy the root README into the package folder | 1 |
| `packages/extension/test/manifest.test.ts` | modify | pin `files` and `repository` | 1 |
| `packages/extension/test/support/manifest.ts` | modify | the `Manifest` type gains the fields the tests read | 1, 3 |
| `packages/extension/scripts/vsix-files.mjs`, `vsix-files.d.mts` | create | the fixed file list and the comparison | 2 |
| `packages/extension/scripts/check-vsix.mjs` | create | list check, unpack, README check, smoke run, clean-up | 2 |
| `packages/extension/smoke/run.ts` | modify | optional `--extension-path` | 2 |
| `packages/extension/test/vsix-files.test.ts` | create | unit cases for the comparison | 2 |
| `README.md` (root) | modify | what it does, how to build, install, update, uninstall | 3 |
| `packages/extension/test/readme.test.ts` | create | keep the README in step with the manifest | 3 |
| `packages/extension/README.md` | generated, git-ignored, never committed | the package's copy of the root README | 1 |

---

### Task 1: The package command

`pnpm package` writes a `.vsix` that holds exactly the eight files of D2 (D1, D2, D3, D4, D7).

**Files:**
- Create: `packages/extension/scripts/copy-readme.mjs`
- Modify: `packages/extension/package.json`, `package.json` (root), `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`
- Test: `packages/extension/test/manifest.test.ts` (two cases), `packages/extension/test/support/manifest.ts` (the `Manifest` type
  gains `files` and `repository`)

**Interfaces:**
- Consumes: `pnpm build` (root script, `pnpm -r build`); the root `README.md`; the built `dist/extension.cjs`,
  `dist/worker.cjs`, `dist/webview/index.js`, `dist/webview/index.css` in `packages/extension`.
- Produces:
  - Root script `package`: `pnpm build && pnpm --filter code-spider-vscode package:vsix`
  - Extension script `package:vsix`: `node scripts/copy-readme.mjs && vsce package --no-dependencies --skip-license --out ../../`
  - Manifest `files`, exactly:

    ```json
    "files": [
      "dist/extension.cjs",
      "dist/worker.cjs",
      "dist/webview/index.js",
      "dist/webview/index.css"
    ]
    ```

  - Manifest `"version": "0.1.0"`, and `repository` (`type` and `url` as in the root `package.json`)
  - `scripts/copy-readme.mjs` (no arguments): writes `packages/extension/README.md` as a byte-for-byte copy of the root `README.md`
  - The file `code-spider-vscode-0.1.0.vsix` at the repo root, with the eight entries of D2
  - `pnpm-workspace.yaml` `allowBuilds` entry `"@vscode/vsce-sign": false`

**Behaviour:**
- `version` changes only in `packages/extension/package.json`. The root's `1.0.0` and the other packages' `0.0.0` stay.
- The allow-list is `files`. No `.vscodeignore` is created.
- `copy-readme.mjs` has no error handling of its own: a missing root README makes `copyFileSync` throw and the script exits non-zero.
- `.gitignore` gets `/packages/extension/README.md` in the "build output" group, with a one-line comment that it is generated.
- A `pnpm package` run prints no `WARNING` line.

**Approach and traps:**
- Order of work for the dependency: edit `pnpm-workspace.yaml` first (double quotes, as the file already does), then run `pnpm
  --filter code-spider-vscode add -D @vscode/vsce` (verified: this order installs cleanly). If pnpm has already written the
  placeholder line `'@vscode/vsce-sign': set this to true or false`, replace it with the `false` entry. Keep the existing
  `esbuild` entries and the `onlyBuiltDependencies` block as they are.
- Run vsce from the devDependency (it is on `PATH` inside a pnpm script), not with `pnpm dlx`.
- Do not use `--readme-path`; vsce cannot reach a file outside the package folder (verified), which is why the copy exists.
- `--out ../../` is relative to `packages/extension`, the folder the script runs in. `--out ../..` works the same.
- The "worker.cjs is large" line is a notice and exit status stays 0; do not add a flag for it.
- A package that lists `files` and also has a `.vscodeignore` is refused by vsce (verified). Do not add one.
- `readManifest()` in `test/support/manifest.ts` is a type over `package.json`; add only the fields the new cases read.
- `pnpm build` builds the webview before the extension (the extension depends on `@code-spider/webview`), which is why
  `dist/webview` exists when vsce runs. vsce's own unused-path error is the second guard if it ever does not.

**Tests** (`manifest.test.ts`):
- ships only the four bundle outputs: `files` is exactly the four paths above and contains `main`
- names the repository, with the same url as the root `package.json` (vsce warns without it)

**Steps:**
- [ ] Write the two cases; see them fail (the manifest has neither `files` nor `repository`)
- [ ] Set `allowBuilds`, add `@vscode/vsce`, set the version, `repository`, `files` and the two scripts, write
  `copy-readme.mjs`, add the root script and the `.gitignore` line; see the two cases pass
- [ ] `pnpm package`: it exits 0, prints no `WARNING`, leaves `code-spider-vscode-0.1.0.vsix` at the repo root, and
  `unzip -Z1 code-spider-vscode-0.1.0.vsix | sort` lists exactly the eight entries of D2; `git status --short` shows neither the
  `.vsix` nor `packages/extension/README.md`
- [ ] Prove it can fail, restoring after each: (a) add `"dist/extension.cjs.map"` to `files`, run `pnpm --filter
  code-spider-vscode package:vsix`, see `extension/dist/extension.cjs.map` in the file list and the first manifest case fail;
  (b) move `packages/extension/dist/webview/index.js` aside, run the same script, see vsce stop with exit 1 naming
  `dist/webview/index.js`; put the file back
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test` (extension 208; core 250, CLI 39, webview 507), `pnpm build` pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `add pnpm package to build a .vsix holding only the bundle files and set the version to 0.1.0`

### Task 2: The check that the package works by itself

`pnpm check:vsix` unpacks the `.vsix` outside the repo, checks its files and runs the seven smoke tests against the unpacked
copy (D5, D6).

**Files:**
- Create: `packages/extension/scripts/vsix-files.mjs`, `packages/extension/scripts/vsix-files.d.mts`,
  `packages/extension/scripts/check-vsix.mjs`
- Modify: `packages/extension/smoke/run.ts`, `packages/extension/package.json` (script, `fflate`), `package.json` (root alias),
  `pnpm-lock.yaml`
- Test: `packages/extension/test/vsix-files.test.ts` (create)

**Interfaces:**
- Consumes (Task 1): root script `package`; the `.vsix` at `<repo root>/<name>-<version>.vsix` (`name` and `version` from
  `packages/extension/package.json`); the packaged README entry `extension/readme.md`. Existing: `build-smoke.mjs`, which writes
  `dist/smoke/run.cjs`; the `ExtensionApi`-driven smoke suite.
- Produces:
  - Extension script `check:vsix`: `pnpm --workspace-root package && node build-smoke.mjs && node scripts/check-vsix.mjs`
  - Root script `check:vsix`: `pnpm --filter code-spider-vscode check:vsix`
  - `scripts/vsix-files.mjs`:

    ```ts
    export const EXPECTED_VSIX_FILES: readonly string[]; // the eight entries of D2, written out in full
    export function compareFileLists(
      actual: Iterable<string>,
      expected?: Iterable<string>, // default EXPECTED_VSIX_FILES
    ): { missing: string[]; unexpected: string[] }; // both sorted
    ```

    `vsix-files.d.mts` holds these two declarations, so the TypeScript test can import the `.mjs` file under `strict`.
  - `smoke/run.ts`: `node dist/smoke/run.cjs [--extension-path <dir>]`. Without the argument it behaves as today.
  - `scripts/check-vsix.mjs` takes no arguments, honours `TMPDIR` through `os.tmpdir()`, exits 0 when everything passes and 1 on any
    failure.

**Behaviour:**
- `check-vsix.mjs`, in this order:
  1. Find the `.vsix` at the repo root from the manifest's `name` and `version`; if it is not there, fail naming the path.
  2. Read the entry names (`unzipSync` from `fflate`) and call `compareFileLists`. If either list has anything, print one line
     per entry (`missing: <name>`, `unexpected: <name>`) and fail. Nothing is written to disk before this passes.
  3. Create the temp folder with `mkdtempSync(join(tmpdir(), "code-spider-vsix-"))` and write every entry under it, making
     folders as needed.
  4. Compare `<temp>/extension/readme.md` with the root `README.md` byte for byte. On a difference, fail with a message that says
     vsce rewrites relative links and `#<number>` references (D4).
  5. Run `node dist/smoke/run.cjs --extension-path <temp>/extension` with inherited output, in the package folder. A non-zero
     exit fails the check.
  6. Remove the temp folder in a `finally`, after success and after failure. Do not call `process.exit` inside the `try`: set
     `process.exitCode` so the `finally` runs.
- `compareFileLists` compares as sets: order does not matter; duplicates count once.
- `smoke/run.ts`: the value is resolved against the current folder; it must be an existing folder that holds a `package.json`,
  otherwise the runner throws a message naming the path; the flag without a value, or any other argument, is an error. The
  arguments are checked before anything starts, so a bad one launches no VS Code. The workspace, launch arguments, scrubbing,
  cache path and tests file do not change.
- `EXPECTED_VSIX_FILES` is a literal, not read from the manifest (Plan decision 3).

**Approach and traps:**
- The unpacked folder must hold no `node_modules` above it: that is the point, and the system temp folder has none. Do not
  unpack under the repo, and do not point `TMPDIR` into it.
- Compare names first and write second, so an entry like `../x` in a doctored zip is reported and never extracted.
- vsce writes no folder entries (verified); do not special-case names that end in `/`. If a future vsce adds them, the check
  fails naming them, which is the right outcome.
- `unzipSync` wants a `Uint8Array`: wrap the `Buffer` from `readFileSync` (verified).
- Why the extension under test really is the copy: `src/extension.ts` finds the worker with `context.extensionPath` and the
  webview assets through `context.extensionUri`. Proof (d) in the steps shows the flag is not ignored.
- `dist/smoke/suite/index.cjs`, and `mocha` with it, stay in the repo; only `extensionDevelopmentPath` moves.
- Prerequisites are those of `test:smoke`: the pinned VS Code 1.141.0 in `.vscode-test` (already downloaded), the Electron
  libraries (`check:electron`) and a display.
- `vsix-files.test.ts` imports `../scripts/vsix-files.mjs`; with `moduleResolution: Bundler` TypeScript reads the `.d.mts` beside
  it. The `typecheck` script already covers `test` and `smoke` (`tsc --noEmit` and `tsc --noEmit -p smoke`).
- The parsing of `--extension-path` is not given a unit test: it is six lines inside a file that imports Electron's test runner,
  and proofs (d) and the argument errors in the steps exercise the real path.

**Tests** (`vsix-files.test.ts`):
- an exact match, in any order, has nothing missing and nothing unexpected
- a file that is in the expected list but not in the package is named under `missing`
- a source map in the package is named under `unexpected`
- missing and unexpected are both reported together, each sorted, not only the first difference

**Steps:**
- [ ] Write the four cases and `vsix-files.d.mts`; see them fail; write `vsix-files.mjs`; see them pass
- [ ] Add `--extension-path` to `smoke/run.ts` (typecheck covers the smoke project); add `fflate`; write `check-vsix.mjs`; add
  the extension and root scripts
- [ ] `pnpm check:vsix` at the repo root ends with 7 passing and exit 0, and no `code-spider-vsix-*` folder is left in the temp
  folder (`ls "${TMPDIR:-/tmp}" | grep code-spider-vsix` prints nothing). Also run `node dist/smoke/run.cjs --bogus` and
  `node dist/smoke/run.cjs --extension-path /nonexistent` from `packages/extension`: both exit 1 with a clear message and start
  no VS Code
- [ ] Prove the check can fail, restoring after each and rerunning `pnpm check:vsix`: (a) add `"dist/extension.cjs.map"` to
  `files`: exit 1, the output says `unexpected: extension/dist/extension.cjs.map`, and no VS Code window opens; (b) remove
  `"dist/webview/index.css"` from `files`: exit 1 with `missing: extension/dist/webview/index.css`; (c) put a relative link
  such as `[x](docs/y.md)` in the root `README.md`: exit 1 naming `extension/readme.md`, and the temp folder is gone afterwards
  (the clean-up runs after a failure); (d) unpack a fresh `.vsix` by hand into a scratch folder, delete
  `extension/dist/worker.cjs` there and run `node dist/smoke/run.cjs --extension-path <scratch>/extension` from
  `packages/extension`: the smoke tests fail. With the file back they pass (7 passing). If they pass with the file deleted, the
  flag is being ignored
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test` (extension 212; core 250, CLI 39, webview 507), `pnpm build` and `pnpm
  check:vsix` pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `add a check that unpacks the .vsix outside the repo and runs the smoke tests against it`

### Task 3: The README

The root README says what Code Spider does and how to build, install, update and uninstall it; the same text ships in the
package (D4).

**Files:**
- Modify: `README.md` (root)
- Create: `packages/extension/test/readme.test.ts`
- Modify: `packages/extension/test/support/manifest.ts` (the `Manifest` type gains `name` and `publisher`)

**Interfaces:**
- Consumes: `pnpm install`, `pnpm package` and the file `code-spider-vscode-<version>.vsix` at the repo root (Task 1); the
  manifest's `engines.vscode`, keybinding, command category and titles, `publisher` and `name`; `pnpm check:vsix` (Task 2),
  which fails if the packaged copy differs from this file.
- Produces: the README text. No new script, no new file in the package: `extension/readme.md` is already in the expected list.

**Behaviour:**
- The README is written for the owner and for anyone installing: plain words, short, no jargon, no emojis. It has these parts,
  under short headings:
  - **What it does.** Shows the functions that call the one under your cursor, and the functions it calls, as a graph of
    boxes. For TypeScript and JavaScript files (`.ts`, `.tsx`, `.js`, `.jsx`); the project needs a `tsconfig.json` above the
    file. A few lines on what you can do in the graph, each checked against the code (Approach and traps).
  - **Open a graph.** Three ways: `Shift+Alt+Q` in a TypeScript or JavaScript editor; right-click in the editor and choose
    "Show in Code Spider"; or the command palette entry "Code Spider: Show Graph".
  - **What you need.** VS Code 1.140 or newer (the manifest's `engines.vscode` is `^1.140.0`). Nothing else to run it: the
    analysis runs inside VS Code (a worker thread, `src/worker/spawn.ts`), so Node is not needed on the other computer.
  - **Build the file.** Needs Node.js 22 or newer (the packaging tool requires it) and pnpm 11. From the repo root: `pnpm install`,
    then `pnpm package`. The result is a single file at the repo root, named after the version in
    `packages/extension/package.json`, for example `code-spider-vscode-0.1.0.vsix`.
  - **Install on another computer.** Copy the file over, then either command palette "Extensions: Install from VSIX..." and pick
    the file, or `code --install-extension <the file>` in a terminal.
  - **Update.** Install the newer file the same way, over the old one, and reload the window if VS Code asks. Mention no flag:
    none is needed (measured with VS Code 1.141.0 on the command line, where installing the same version a second time
    succeeded).
  - **Uninstall.** Extensions view, Code Spider, Uninstall; or `code --uninstall-extension code-spider.code-spider-vscode`.
- No relative links, no images, no `#<number>` text anywhere in the file (D4). The title is `# Code Spider`. Nothing about the
  Marketplace, a licence, or `pnpm check:vsix`.

**Approach and traps:**
- Write each factual line from the code, and leave out a line you cannot confirm:
  - keys and command names: `packages/extension/package.json` (`shift+alt+q`; `editor/context` entry "Show in Code Spider";
    category "Code Spider" plus title "Show Graph" gives "Code Spider: Show Graph", which the palette shows only while a
    TypeScript or JavaScript editor is active);
  - what you can do in the graph: `packages/webview/src/toolbar/Toolbar.tsx` (Back, Tidy, Refresh, Lines with Stepped and
    Curved, Spacing slider) and the M3 bullets in the design spec §10 (a single click on a box jumps to the code; a
    double-click expands it in place and a second one collapses it; boxes can be dragged and stay where they are put;
    functions a box calls sit to its left, in the order of the calls in the code). Pick the few that matter; do not list
    everything;
  - the project needs a `tsconfig.json`: `packages/core/src/project.ts` throws "No tsconfig.json found above ..." without one.
- Do not write the version into a command (`code-spider-vscode-0.1.0.vsix` would go stale on the next bump); use
  `<the file>` in commands and the version once, as an example, in the sentence about the file name.
- The `...` in "Install from VSIX..." is three plain dots; the test matches on "Install from VSIX" only.
- The first lines are what the extension's details page shows first, so the first sentence says what the extension does.
- Because the packaged copy is compared byte for byte with this file, any change to the README after this task is also
  checked by `pnpm check:vsix`.
- The `readme.test.ts` cases read the repo's root README with a path relative to the test file (`../../../README.md`) and the
  manifest through `readManifest()`.

**Tests** (`readme.test.ts`):
- names the VS Code version the manifest requires (`engines.vscode` without the caret)
- gives the three ways to open a graph, with the key and the command names taken from the manifest (the key matched without
  regard to case)
- gives the build and install commands (`pnpm install`, `pnpm package`, `code --install-extension`, "Install from VSIX") and
  the extension id `<publisher>.<name>` from the manifest in the uninstall command
- has no relative links or images and no `#<number>` text, which vsce would rewrite

**Steps:**
- [ ] Write the four cases; see them fail against today's two-line README
- [ ] Write the README, checking every line against the files named above; see the cases pass
- [ ] Prove the cases can fail, restoring after each: change "1.140" in the README to "1.139" (case 1 fails), and add a relative
  link (case 4 fails)
- [ ] `pnpm check:vsix` passes (7 passing), so the README in the package is identical to this file. Then read
  `extension/readme.md` out of the `.vsix` and see it is the new text, and `git status --short` shows no
  `packages/extension/README.md`
- [ ] Verify: `pnpm -r typecheck`, `pnpm -r test` (extension 216; core 250, CLI 39, webview 507), `pnpm build` pass
- [ ] Inspect the task delta (`git diff --check`, `git diff`, the untracked-file loop) and propose the commit

Proposed commit message: `write the readme for building, installing, updating and uninstalling the extension`

### Integration review

One fresh `workflow-reviewer`, read-only apart from commands, reads the whole delta of the three commits and runs, from the
repo root: `pnpm -r typecheck`, `pnpm -r test` (core 250, CLI 39, webview 507, extension 216), `pnpm build`, `pnpm package`
(exit 0, no `WARNING`, the eight entries) and `pnpm check:vsix` (7 passing, no temp folder left). It also confirms: `files` and
`EXPECTED_VSIX_FILES` agree and each can be read without the other; there is no `.vscodeignore`, LICENSE, icon or changelog;
the only dependencies added are `@vscode/vsce` and `fflate`, and the only `allowBuilds` change is the one `@vscode/vsce-sign`
entry; `git status` is clean (the `.vsix` and the generated README are ignored); the file names and script names in the
README, the scripts and this plan are the same everywhere. The coordinator fixes what it finds and has it
rechecked by the same reviewer.

---

## As built: departures from the plan

The task text above is the approved plan and stays as written. The build differs as follows.

**Commits.** Task 1 is `0cb9bab`, Task 2 is `4cd4087`, Task 3 is `e338016`. A further small commit follows for two
integration-review fixes (it is "the commit after `e338016`"; it did not exist when this section was written). Task 1 passed
review with no changes. Tasks 2 and 3 each took two fix rounds. The integration review approved the build with three minor
findings; two were fixed and one was left (see Known limits). Its report is
`local-agent-docs/reviews/2026-10-12-m4-packaging-integration-review.md`.

### Measured at the end of the build

- `pnpm -r test`: core 250, CLI 39, webview 507, extension 216. `pnpm -r typecheck` and `pnpm build` clean.
- `pnpm package` writes `code-spider-vscode-0.1.0.vsix` at the repo root: 8 files, 2.53 MB, no `WARNING` line. The entries are
  exactly the eight of D2.
- `pnpm check:vsix`: 7 passing, no `code-spider-vsix-*` folder left behind. `pnpm --filter code-spider-vscode test:smoke` (no
  argument) still gives 7 passing, and `pnpm probe` 10 checks.
- A clean clone of the repo, running only the README's `pnpm install` and `pnpm package`, built the same package: the same
  eight entries and size, and the six content entries identical to the in-repo build (only the zip timestamps differ).
  `pnpm check:vsix` was not run in the clone, because it would download VS Code again.
- From the command line of the pinned test VS Code 1.141.0, in scratch folders: installing the file worked; installing the same
  version a second time worked with no flag; a 0.1.1 file installed over 0.1.0 (the list then showed `@0.1.1`); and the README's
  uninstall command, `code --uninstall-extension code-spider.code-spider-vscode`, worked. The palette route was not tried.

### Built differently from the task text

- **Task 2, `check-vsix.mjs` and Ctrl-C.** The script runs the smoke child with `spawn` and handles SIGINT and SIGTERM. The
  handlers are set up when the script loads, they pass the signal to the child, and no child is started after a signal; the
  `finally` that removes the temp folder still runs. The plan did not say this. A Ctrl-C used to end the script before the
  clean-up, leaving the temp folder behind, and so did a second Ctrl-C and a signal that arrived before the handlers existed.
- **Task 2, `--extension-path ""`.** The runner (`smoke/run.ts`) rejects an empty value as it rejects a missing one. An empty
  string resolved to the current folder, which holds a `package.json`, so it silently tested the repo copy instead of failing.
- **Task 2, `vsix-files.test.ts` case 4.** The data is out of order on purpose: the two missing names stand in the expected list
  in the opposite order to the sorted result, and the two unexpected names are given in the opposite order too, one of them
  twice. So the case fails if either list is left unsorted or a repeated name is reported twice. The first version did not pin
  the sort of the missing list.
- **Task 2, the README-mismatch message (integration fix, in the commit after `e338016`).** It now says the `.vsix` may be out
  of date (run `pnpm package`) as well as that vsce may have rewritten a relative link or a `#<number>` reference. The plan's
  wording blamed only vsce, which misleads when the script is run by hand without a fresh package.
- **Task 3, `readme.test.ts` case 1.** It looks for `VS Code <major>.<minor> or newer`, taken from `engines.vscode`. The plan
  said "without the caret", which would have asked for `1.140.0`; the README says `1.140`.
- **Task 3, `readme.test.ts` case 4.** It also rejects `<img` and `<a` tags. Measured with vsce 4.0.0: it rewrites the address
  in an `<img src="docs/a.png">` to a GitHub URL, which would fail the byte-for-byte check, and it leaves a relative
  `<a href="docs/b.md">` as it is, which would be a dead link on the details page. Either way the README must not use them.
- **Task 3, README: double-click.** The plan's list said a double-click expands a box. The README says it does not work on the
  box in the middle or on boxes that are not functions, such as a file's top-level code or code from outside the project. In
  `graph/node-controls.ts` only a box that is not the centre and is a function or a component can be expanded.
- **Task 3, README: keys.** It gives the keys for the command palette (`Ctrl+Shift+P`, `Cmd+Shift+P` on a Mac) and the Extensions
  view (`Ctrl+Shift+X`, `Cmd+Shift+X`), so a reader on the second computer need not know them.
- **Task 3, README: the Refresh dot.** It says the dot appears when a file has been saved since the graph was drawn. The
  extension marks a file on save and from its file watcher (`onDidSaveTextDocument` and `registerChangeWatchers` in
  `extension.ts`); unsaved edits do not light it.
- **Task 3, README: Spacing.** It says Spacing changes how far apart the boxes are, where the plan only named the slider.
- **Task 3, README: `tsconfig.json`.** It says the file is looked for in the file's folder or a folder above it, up to the top
  of the repository (`findTsconfig` in `packages/core/src/project.ts`).
- **Task 3, README: older files (integration fix, in the commit after `e338016`).** After a version bump the old `.vsix` stays
  beside the new one, so the README's "Build the file" part ends with "Files from earlier versions stay in that folder. Use the
  one with the highest version number."

### Known limits and things left

- A bad argument to `dist/smoke/run.cjs` (for example `--bogus`) prints its message and then a stack trace, because the runner
  keeps its existing error path (`main().catch` logs the error and exits 1). It exits 1 and starts no VS Code. Parked by ruling;
  the cost is noisy output only.
- Outside a git repository the `tsconfig.json` search is wider than the README sentence says: it takes the nearest one anywhere
  above the file (`tsconfigsAbove` in `project.ts`). Left by ruling, since it does not matter for a normal project.
- `memoiseTsMorphPaths` does nothing inside the esbuild bundle, under F5 and packaged alike. It is the next piece of work (D8).
- No icon, LICENSE or changelog (D8).

---

## Manual checks (for the owner; NOT RUN by anyone)

Setup: a terminal at the repo root on this computer. The file is `code-spider-vscode-0.1.0.vsix` at the repo root.

1. Run `pnpm package`. It builds, prints the list of files, and ends with the line `DONE Packaged:
   ../../code-spider-vscode-0.1.0.vsix (8 files, 2.53 MB)`, with no warning above it.
2. In your normal VS Code (not the F5 window), open the command palette, choose "Extensions: Install from VSIX...", pick the
   file, and reload if VS Code asks. Open a TypeScript file in a real project and press `Shift+Alt+Q`: the graph opens. Also try
   right-click, "Show in Code Spider", and the palette entry "Code Spider: Show Graph".
3. Copy the file to the second computer (VS Code 1.140 or newer, no Node needed), install it with the palette or with `code
   --install-extension <the file>`, open a real project that has a `tsconfig.json`, and open a graph. If graphs on a large
   project, finding callers feels slow, that is the known `memoiseTsMorphPaths` issue handled after this plan. It is the same
   under F5, so it is not a packaging fault.
4. Open the Extensions view, click Code Spider, and see that its details page shows the README text from the repo.
5. Update: build again (change `version` in `packages/extension/package.json` first if you like), install the new file over
   the old one, and see the graph still opens. A same-version reinstall and a 0.1.0 to 0.1.1 update were both measured from the
   command line with the test VS Code 1.141.0; the palette route is still untried, so note what it does.
6. Uninstall: Extensions view, Code Spider, Uninstall, then check the keybinding and the commands are gone. On the second
   computer try `code --uninstall-extension code-spider.code-spider-vscode`.
