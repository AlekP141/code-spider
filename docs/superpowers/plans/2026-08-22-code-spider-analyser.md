# Code Spider — Analyser Core Implementation Plan (M0 + M1)

> **For the implementer:** this plan is written to be built by hand by someone
> who has not written a VS Code extension or used `ts-morph` before. Each task
> carries a **Background** block explaining what the API does and why the
> approach was chosen. Steps use checkbox (`- [ ]`) syntax so you can track
> progress. Work them in order; each ends with a commit and a green test run.

**Goal:** A `@code-spider/core` package that, given a TypeScript file and a
cursor offset, returns a `GraphSlice` describing that function's immediate
callers and callees with real types on the edges — plus a CLI that prints one.

**Architecture:** A pure-TypeScript analysis package with no `vscode` import,
driven by `ts-morph` (an ergonomic wrapper over the TypeScript compiler API).
Analysis is lazy and per-focus: nothing builds a whole-project graph. Callees
come from walking the focus declaration's body; callers come from the
TypeScript language service's reference index rather than an index we maintain.

**Tech Stack:** TypeScript 5.6+, `ts-morph` 23+, Vitest 2+, pnpm 9+, Node 20+.

**Spec:** `docs/superpowers/specs/2026-08-22-code-spider-design.md`

**Scope:** Milestones M0 (skeleton) and M1 (analyser, CLI only, no UI) from
spec §10. The VS Code extension and webview (M2–M4) are a separate plan, to be
written once this one is green.

## Global Constraints

Copied from the spec. Every task's requirements implicitly include these.

- **`packages/core` must never import `vscode`.** It takes a `Project` and plain
  positions. This is what makes the CLI and the tests possible (spec §6).
- **Node identity is `<repo-relative-path>#<symbol-name>`**, path-based, with a
  disambiguating index for duplicate names in one file (spec §5.2).
- **Edge direction is callee → caller** (`from` = supplier, `to` = consumer).
  Edge labels carry the **source node's return type** (spec §4.4, §5.4).
- **Caller lists cap at 50**, and the slice sets `truncated: true` (spec §6).
- **Excerpts cap at 25 lines** (spec §5.3, §7.6).
- **`Promise<T>` displays as `T`** with the node flagged `isAsync` (spec §5.4).
- **Unresolved call targets are kept**, emitted with `resolved: false` pointing
  at an `unknown` node. Never silently dropped (spec §5.5).
- **JSX edges override `supplies` with the props type**, not `JSX.Element`
  (spec §5.4).
- Paths in `NodeId` use forward slashes on every platform.

---

## File Structure

```
pnpm-workspace.yaml
package.json                        workspace root, scripts
tsconfig.base.json                  shared compiler options

packages/core/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                        public API surface (re-exports only)
    types.ts                        GraphNode, GraphEdge, GraphSlice, Range
    node-id.ts                      NodeId construction and parsing
    project.ts                      tsconfig discovery, Project loading
    focus.ts                        file+offset -> focus declaration
    classify.ts                     declaration -> node kind; external detection
    labels.ts                       type formatting, Promise unwrapping
    node-builder.ts                 declaration -> GraphNode
    callees.ts                      call and JSX edges out of a declaration body
    callers.ts                      caller edges via the reference index
    analyze.ts                      analyzeFocus / expandNode orchestration
  test/
    node-id.test.ts
    project.test.ts
    focus.test.ts
    labels.test.ts
    node-builder.test.ts
    classify.test.ts
    callees.test.ts
    callers.test.ts
    jsx.test.ts
    analyze.test.ts
    expand.test.ts
    barrel.test.ts
    __goldens__/                    checked-in GraphSlice JSON snapshots

packages/cli/
  package.json
  src/index.ts                      line:col -> offset, prints a slice

fixtures/
  basic/                            plain call chain, async, a lib.d.ts call
  jsx/                              React component tree with a local type shim
  externals/                        a checked-in node_modules package
  hub/                              one function with many callers
  barrel/                           re-export through an index file
```

Each `src` file has one responsibility, and every one is unit-testable without
touching the others. That separation is the entire reason the `core` boundary
exists — see spec §9.

---

### Task 1: Workspace skeleton

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `pnpm test` at the repo root; `@code-spider/core`
  importable from other workspace packages.

**Background.** pnpm workspaces let several packages live in one repo and
import each other by name without publishing. `packages/core` will be consumed
by `packages/cli` now and by the extension later. Note that `core`'s
`package.json` points `main` straight at `src/index.ts` rather than a compiled
`dist` — Vitest, `tsx` and esbuild all consume TypeScript directly, so a build
step in the middle of the dev loop would be pure friction. The `.vsix` build
later bundles from source too.

- [ ] **Step 1: Write the failing smoke test**

`packages/core/test/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { VERSION } from '../src/index.js'

describe('core package', () => {
  it('is importable and reports its version', () => {
    expect(VERSION).toBe('0.0.0')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @code-spider/core test`
Expected: FAIL — pnpm does not yet know about the package.

- [ ] **Step 3: Create the workspace files**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

`package.json`:

```json
{
  "name": "code-spider",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`noUncheckedIndexedAccess` is on deliberately. Almost every function in this
package indexes into arrays returned by the compiler (`getDeclarations()[0]`),
and those really can be empty. The flag forces you to handle it.

- [ ] **Step 4: Create the core package**

`packages/core/package.json`:

```json
{
  "name": "@code-spider/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "ts-morph": "^23.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/core/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // ts-morph loads and type-checks a whole tsconfig project on first use.
    // The default 5s timeout is not enough on a cold run.
    testTimeout: 30_000,
  },
})
```

`packages/core/src/index.ts`:

```ts
export const VERSION = '0.0.0'
```

- [ ] **Step 5: Install and run the test**

Run: `pnpm install && pnpm --filter @code-spider/core test`
Expected: PASS — 1 test.

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json packages/
git commit -m "chore: pnpm workspace skeleton with core package"
```

---

### Task 2: Graph types and node identity

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/node-id.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/node-id.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type NodeId = string`
  - `type Range = { startLine: number; startCol: number; endLine: number; endCol: number }`
  - `type GraphNode`, `type GraphEdge`, `type GraphSlice` (spec §5.3)
  - `makeNodeId(relPath: string, name: string, index?: number): NodeId`
  - `parseNodeId(id: NodeId): { file: string; name: string; index: number }`
  - `toPosixPath(p: string): string`

**Background.** Node identity is the one piece of this design that everything
else depends on, so it gets its own module and its own tests. It is path-based
rather than position-based so that adding an import at the top of a file does
not change every node's ID (spec §5.2). Windows path separators are normalised
at the boundary — if backslashes leak into IDs, goldens fail on one platform
and pass on the other, which is a miserable bug to chase.

The disambiguator uses `~` rather than `#` or `:` because `~` cannot appear in
a TypeScript identifier or a sane file path, so parsing stays unambiguous.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/node-id.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeNodeId, parseNodeId, toPosixPath } from '../src/node-id.js'

describe('toPosixPath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(toPosixPath('src\\app\\route.ts')).toBe('src/app/route.ts')
  })

  it('strips a leading ./', () => {
    expect(toPosixPath('./src/a.ts')).toBe('src/a.ts')
  })
})

describe('makeNodeId', () => {
  it('joins path and name with #', () => {
    expect(makeNodeId('src/signup.ts', 'validateUser')).toBe('src/signup.ts#validateUser')
  })

  it('omits the disambiguator for index 0', () => {
    expect(makeNodeId('src/a.ts', 'f', 0)).toBe('src/a.ts#f')
  })

  it('appends a disambiguator for index > 0', () => {
    expect(makeNodeId('src/a.ts', 'f', 2)).toBe('src/a.ts#f~2')
  })

  it('normalises the path', () => {
    expect(makeNodeId('.\\src\\a.ts', 'f')).toBe('src/a.ts#f')
  })
})

describe('parseNodeId', () => {
  it('round-trips a plain id', () => {
    expect(parseNodeId('src/signup.ts#validateUser')).toEqual({
      file: 'src/signup.ts',
      name: 'validateUser',
      index: 0,
    })
  })

  it('round-trips a disambiguated id', () => {
    expect(parseNodeId('src/a.ts#f~2')).toEqual({ file: 'src/a.ts', name: 'f', index: 2 })
  })

  it('handles external ids that carry a colon in the file part', () => {
    expect(parseNodeId('external:fs#readFile')).toEqual({
      file: 'external:fs',
      name: 'readFile',
      index: 0,
    })
  })

  it('throws on a malformed id', () => {
    expect(() => parseNodeId('no-hash-here')).toThrow(/Malformed NodeId/)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm --filter @code-spider/core test`
Expected: FAIL — cannot resolve `../src/node-id.js`.

- [ ] **Step 3: Write `types.ts`**

```ts
export type NodeId = string

export type Range = {
  startLine: number
  startCol: number
  endLine: number
  endCol: number
}

export type NodeKind = 'function' | 'component' | 'external' | 'unknown'

export type GraphNode = {
  id: NodeId
  kind: NodeKind
  /** Display name. For externals this may be a dotted path, e.g. `console.log`. */
  name: string
  /** Repo-relative POSIX path. Empty string for external and unknown nodes. */
  file: string
  /** Declaration range, used for click-to-jump. Zeroed for external/unknown. */
  range: Range
  /** Header right slot. Comma-joined parameter types; '' when there are none. */
  inputType: string
  /** Promise-unwrapped return type. Edge labels read this. */
  returnType: string
  isAsync: boolean
  /** Pre-clamp source line count, used for analytic node sizing. */
  lineCount: number
  /** Source text for the node's code region, capped at EXCERPT_MAX_LINES. */
  excerpt: string
}

export type EdgeKind = 'call' | 'jsx' | 'external'

export type GraphEdge = {
  id: string
  /** Supplier — the callee. */
  from: NodeId
  /** Consumer — the caller. */
  to: NodeId
  kind: EdgeKind
  /** Payload label: the `from` node's returnType, or props type for JSX edges. */
  supplies: string
  callSite: Range
  resolved: boolean
}

export type GraphSlice = {
  focusId: NodeId
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** True when the caller list was capped at MAX_CALLERS. */
  truncated: boolean
}
```

- [ ] **Step 4: Write `node-id.ts`**

```ts
import type { NodeId } from './types.js'

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

export function makeNodeId(relPath: string, name: string, index = 0): NodeId {
  const suffix = index > 0 ? `~${index}` : ''
  return `${toPosixPath(relPath)}#${name}${suffix}`
}

export function parseNodeId(id: NodeId): { file: string; name: string; index: number } {
  const hash = id.lastIndexOf('#')
  if (hash === -1) throw new Error(`Malformed NodeId (no '#'): ${id}`)

  const file = id.slice(0, hash)
  const rest = id.slice(hash + 1)
  if (rest.length === 0) throw new Error(`Malformed NodeId (empty name): ${id}`)

  const tilde = rest.lastIndexOf('~')
  if (tilde === -1) return { file, name: rest, index: 0 }

  const index = Number(rest.slice(tilde + 1))
  if (!Number.isInteger(index)) throw new Error(`Malformed NodeId (bad index): ${id}`)
  return { file, name: rest.slice(0, tilde), index }
}
```

- [ ] **Step 5: Re-export from `index.ts`**

```ts
export const VERSION = '0.0.0'

export type {
  NodeId, Range, NodeKind, GraphNode, EdgeKind, GraphEdge, GraphSlice,
} from './types.js'
export { makeNodeId, parseNodeId, toPosixPath } from './node-id.js'
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @code-spider/core test`
Expected: PASS — all node-id tests plus the smoke test.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): graph types and node identity"
```

---

### Task 3: Fixture project, tsconfig discovery, project loading

**Files:**
- Create: `fixtures/basic/tsconfig.json`
- Create: `fixtures/basic/src/types.ts`
- Create: `fixtures/basic/src/signup.ts`
- Create: `fixtures/basic/src/app.ts`
- Create: `packages/core/src/project.ts`
- Create: `packages/core/test/helpers.ts`
- Test: `packages/core/test/project.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `findNearestTsconfig(startFile: string): string`
  - `loadProject(tsConfigFilePath: string): Project` (re-exports ts-morph's `Project`)
  - test helper `loadFixture(name: string): { project: Project; root: string }`

**Background.** `ts-morph`'s `Project` is a wrapper around a TypeScript
*program* — the compiler's view of a set of files plus their resolved types.
Constructing one with `tsConfigFilePath` makes it read that tsconfig's
`include`/`paths`/`lib` settings, which is what gives you *real* type
resolution rather than guesses. This is why the fixtures are genuine TypeScript
projects with their own `tsconfig.json` (spec §9): mock ASTs would not exercise
the type checker at all, and the type checker is the whole product.

`findNearestTsconfig` walks up from the focused file. Spec §11 risk 3 records
that this is ambiguous in a monorepo with several tsconfigs, and that v1
accepts the nearest one.

- [ ] **Step 1: Create the basic fixture**

`fixtures/basic/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "types": []
  },
  "include": ["src"]
}
```

`"types": []` stops TypeScript from pulling in every `@types/*` package it can
find in the repo, which would make fixture behaviour depend on what happens to
be installed. `"DOM"` is in `lib` so that `console.log` resolves — that gives
you a `lib.*.d.ts` call to classify as external in Task 6.

`fixtures/basic/src/types.ts`:

```ts
export type UserInput = { email: string; name: string }
export type ValidUserData = UserInput & { verified: boolean }
export type User = ValidUserData & { id: string }
```

`fixtures/basic/src/signup.ts`:

```ts
import type { UserInput, ValidUserData, User } from './types.js'

export function validateUser(input: UserInput): ValidUserData {
  if (!input.email) throw new Error('email required')
  return { ...input, verified: false }
}

export async function createUser(valid: ValidUserData): Promise<User> {
  return { ...valid, id: 'u_1' }
}

export async function sendWelcome(user: User): Promise<void> {
  console.log(`welcome ${user.name}`)
}

export async function handleSignup(input: UserInput): Promise<User> {
  const valid = validateUser(input)
  const user = await createUser(valid)
  await sendWelcome(user)
  return user
}

export const auditSignup = async (user: User): Promise<void> => {
  console.log(`audit ${user.id}`)
}
```

`fixtures/basic/src/app.ts`:

```ts
import { handleSignup } from './signup.js'
import type { UserInput, User } from './types.js'

export async function main(input: UserInput): Promise<User> {
  return handleSignup(input)
}

export async function retry(input: UserInput): Promise<User> {
  return handleSignup(input)
}
```

`handleSignup` now has two callers and three callees, `auditSignup` is an
arrow-function const, and `createUser` returns a `Promise`. That covers most of
Task 4 and Task 5's cases in one fixture.

- [ ] **Step 2: Write the failing tests**

`packages/core/test/project.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { findNearestTsconfig, loadProject } from '../src/project.js'
import { fixturePath } from './helpers.js'

describe('findNearestTsconfig', () => {
  it('finds the tsconfig above a source file', () => {
    const found = findNearestTsconfig(fixturePath('basic', 'src/signup.ts'))
    expect(found.replace(/\\/g, '/')).toMatch(/fixtures\/basic\/tsconfig\.json$/)
  })

  it('throws when there is no tsconfig above the file', () => {
    expect(() => findNearestTsconfig('/nonexistent-root-dir/a.ts')).toThrow(/No tsconfig/)
  })
})

describe('loadProject', () => {
  it('loads the fixture source files', () => {
    const project = loadProject(findNearestTsconfig(fixturePath('basic', 'src/signup.ts')))
    const names = project.getSourceFiles().map((f) => f.getBaseName()).sort()
    expect(names).toEqual(['app.ts', 'signup.ts', 'types.ts'])
  })

  it('resolves real types across files', () => {
    const project = loadProject(findNearestTsconfig(fixturePath('basic', 'src/signup.ts')))
    const fn = project.getSourceFileOrThrow('signup.ts').getFunctionOrThrow('validateUser')
    expect(fn.getReturnType().getText()).toContain('ValidUserData')
  })
})
```

`packages/core/test/helpers.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { findNearestTsconfig, loadProject } from '../src/project.js'
import type { Project } from 'ts-morph'

const here = dirname(fileURLToPath(import.meta.url))

/** Absolute path to a file inside a fixture project. */
export function fixturePath(fixture: string, rel = ''): string {
  return resolve(here, '../../../fixtures', fixture, rel)
}

/** Load a fixture as a Project, plus its root directory (the repo root for IDs). */
export function loadFixture(fixture: string): { project: Project; root: string } {
  const root = fixturePath(fixture)
  const project = loadProject(join(root, 'tsconfig.json'))
  return { project, root }
}
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm --filter @code-spider/core test project`
Expected: FAIL — cannot resolve `../src/project.js`.

- [ ] **Step 4: Write `project.ts`**

```ts
import { existsSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { Project } from 'ts-morph'

export { Project }

/**
 * Walk up from `startFile` looking for the nearest tsconfig.json.
 * Spec §11 risk 3: in a monorepo with several tsconfigs this picks the nearest,
 * which is a documented v1 limitation.
 */
export function findNearestTsconfig(startFile: string): string {
  let dir = dirname(startFile)
  const root = parse(dir).root

  for (;;) {
    const candidate = join(dir, 'tsconfig.json')
    if (existsSync(candidate)) return candidate
    if (dir === root) break
    dir = dirname(dir)
  }

  throw new Error(`No tsconfig.json found above ${startFile}`)
}

export function loadProject(tsConfigFilePath: string): Project {
  return new Project({ tsConfigFilePath })
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @code-spider/core test`
Expected: PASS.

If `getSourceFiles()` returns more than the three files, check that
`"include": ["src"]` is present in the fixture tsconfig.

- [ ] **Step 6: Commit**

```bash
git add fixtures packages/core
git commit -m "feat(core): tsconfig discovery, project loading, basic fixture"
```

---

### Task 4: Focus resolution

**Files:**
- Create: `packages/core/src/focus.ts`
- Test: `packages/core/test/focus.test.ts`

**Interfaces:**
- Consumes: `loadProject` (Task 3).
- Produces:
  - `type CallableDeclaration = FunctionDeclaration | ArrowFunction | FunctionExpression | MethodDeclaration`
  - `type FocusTarget = { declaration: CallableDeclaration; textNode: Node; nameNode: Identifier; name: string; sourceFile: SourceFile }`
  - `resolveFocus(project: Project, filePath: string, offset: number): FocusTarget`

**Background.** A cursor offset lands on some token deep in the AST. To find
what function it is inside, you get the node at that position and walk up
ancestors until you hit a callable. `ts-morph` gives you
`getDescendantAtPos(offset)` and `getFirstAncestor(predicate)` for exactly this.

Two wrinkles worth understanding before you write it:

*Names live on the parent for arrow functions.* `const auditSignup = async () => {}`
is an `ArrowFunction` whose name is on the enclosing `VariableDeclaration`. The
`ArrowFunction` node itself is anonymous. So you resolve the name by checking
the parent.

*The text node is not the declaration node.* For a function declaration they
are the same. For `const auditSignup = ...` the `ArrowFunction`'s `getText()`
returns only `async () => {...}` — it omits `const auditSignup =`. Since Task 5
uses this text for the node excerpt and range, `FocusTarget` carries a separate
`textNode` pointing at the enclosing `VariableStatement` in that case.

`nameNode` is typed as `Identifier` specifically because Task 8 needs
`findReferencesAsNodes()`, which only exists on reference-findable nodes.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/focus.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveFocus } from '../src/focus.js'
import { fixturePath, loadFixture } from './helpers.js'

/** Offset of the first occurrence of `needle` in a fixture file. */
function offsetOf(project: ReturnType<typeof loadFixture>['project'], file: string, needle: string) {
  const text = project.getSourceFileOrThrow(file).getFullText()
  const at = text.indexOf(needle)
  if (at === -1) throw new Error(`needle not found: ${needle}`)
  return at
}

describe('resolveFocus', () => {
  const { project } = loadFixture('basic')
  const signup = fixturePath('basic', 'src/signup.ts')

  it('resolves a function declaration from a cursor inside its body', () => {
    const offset = offsetOf(project, 'signup.ts', 'const valid = validateUser')
    expect(resolveFocus(project, signup, offset).name).toBe('handleSignup')
  })

  it('resolves from a cursor on the function name itself', () => {
    const offset = offsetOf(project, 'signup.ts', 'handleSignup')
    expect(resolveFocus(project, signup, offset).name).toBe('handleSignup')
  })

  it('resolves an arrow-function const via its variable declaration', () => {
    const offset = offsetOf(project, 'signup.ts', 'audit ${user.id}')
    const target = resolveFocus(project, signup, offset)
    expect(target.name).toBe('auditSignup')
    expect(target.textNode.getText()).toMatch(/^export const auditSignup/)
  })

  it('reports the enclosing source file', () => {
    const offset = offsetOf(project, 'signup.ts', 'email required')
    expect(resolveFocus(project, signup, offset).sourceFile.getBaseName()).toBe('signup.ts')
  })

  it('throws for a file that is not part of the project', () => {
    expect(() => resolveFocus(project, '/nope/missing.ts', 0)).toThrow(/not in project/)
  })

  it('throws when the offset is not inside any callable and there is no default export', () => {
    const offset = offsetOf(project, 'signup.ts', 'import type')
    expect(() => resolveFocus(project, signup, offset)).toThrow(/No callable/)
  })

  it('falls back to the default export when the cursor is not in a callable', () => {
    const file = project.createSourceFile(
      'tmp-default.ts',
      'export default function entry(): number { return 1 }\n// trailing\n',
    )
    const offset = file.getFullText().indexOf('// trailing')
    expect(resolveFocus(project, file.getFilePath(), offset).name).toBe('entry')
  })

  it('falls back through an export-assignment default', () => {
    const file = project.createSourceFile(
      'tmp-default-assign.ts',
      'function entry2(): number { return 2 }\nexport default entry2\n// trailing\n',
    )
    const offset = file.getFullText().indexOf('// trailing')
    expect(resolveFocus(project, file.getFilePath(), offset).name).toBe('entry2')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @code-spider/core test focus`
Expected: FAIL — cannot resolve `../src/focus.js`.

- [ ] **Step 3: Write `focus.ts`**

```ts
import {
  Node,
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
  type Identifier,
  type MethodDeclaration,
  type Project,
  type SourceFile,
} from 'ts-morph'

export type CallableDeclaration =
  | FunctionDeclaration
  | ArrowFunction
  | FunctionExpression
  | MethodDeclaration

export type FocusTarget = {
  /** The callable itself — used for walking the body and reading types. */
  declaration: CallableDeclaration
  /** The node whose text becomes the excerpt and whose range is jumped to. */
  textNode: Node
  /** The identifier used for reference lookups in Task 8. */
  nameNode: Identifier
  name: string
  sourceFile: SourceFile
}

export function isCallable(node: Node): node is CallableDeclaration {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node) ||
    Node.isMethodDeclaration(node)
  )
}

export function resolveFocus(project: Project, filePath: string, offset: number): FocusTarget {
  const sourceFile = project.getSourceFile(filePath)
  if (!sourceFile) throw new Error(`File is not in project: ${filePath}`)

  const at = sourceFile.getDescendantAtPos(offset)
  const enclosing = at && (isCallable(at) ? at : at.getFirstAncestor(isCallable))
  if (enclosing) return toFocusTarget(enclosing, sourceFile)

  // Spec §6 step 1: with no enclosing callable, fall back to the default export.
  const fallback = findDefaultExportCallable(sourceFile)
  if (fallback) return toFocusTarget(fallback, sourceFile)

  throw new Error(`No callable found at ${filePath}:${offset}, and no default export`)
}

function findDefaultExportCallable(sourceFile: SourceFile): CallableDeclaration | undefined {
  const declaration = sourceFile.getDefaultExportSymbol()?.getDeclarations()[0]
  if (!declaration) return undefined

  // `export default function entry() {}` — the declaration is the callable.
  if (isCallable(declaration)) return declaration

  // `export default entry` — an ExportAssignment pointing at an identifier.
  if (Node.isExportAssignment(declaration)) {
    const target = declaration.getExpression().getSymbol()?.getDeclarations()[0]
    if (target && isCallable(target)) return target
  }

  return undefined
}

export function toFocusTarget(
  declaration: CallableDeclaration,
  sourceFile: SourceFile,
): FocusTarget {
  if (Node.isFunctionDeclaration(declaration) || Node.isMethodDeclaration(declaration)) {
    const nameNode = declaration.getNameNode()
    if (!nameNode || !Node.isIdentifier(nameNode)) {
      throw new Error('Anonymous or computed-name declaration cannot be focused')
    }
    return {
      declaration,
      textNode: declaration,
      nameNode,
      name: nameNode.getText(),
      sourceFile,
    }
  }

  // Arrow functions and function expressions are anonymous; the name (and the
  // text worth showing) lives on the enclosing variable declaration.
  const parent = declaration.getParent()
  if (Node.isVariableDeclaration(parent)) {
    const nameNode = parent.getNameNode()
    if (!Node.isIdentifier(nameNode)) {
      throw new Error('Destructured declarations cannot be focused')
    }
    return {
      declaration,
      // `const x = () => {}` — the arrow's own text omits `const x =`, so the
      // excerpt and jump range come from the enclosing statement.
      textNode: parent.getFirstAncestor(Node.isVariableStatement) ?? parent,
      nameNode,
      name: nameNode.getText(),
      sourceFile,
    }
  }

  throw new Error('Anonymous function expression cannot be focused')
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @code-spider/core test focus`
Expected: PASS — 6 tests.

If the "cursor on the function name" case fails, check whether
`getDescendantAtPos` returned the identifier or the whitespace before it;
offsets are zero-based and point *before* the character.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): resolve a focus target from file and offset"
```

---

### Task 5: Type labels and node building

**Files:**
- Create: `packages/core/src/labels.ts`
- Create: `packages/core/src/node-builder.ts`
- Test: `packages/core/test/labels.test.ts`
- Test: `packages/core/test/node-builder.test.ts`

**Interfaces:**
- Consumes: `FocusTarget`, `CallableDeclaration` (Task 4); `GraphNode`,
  `makeNodeId` (Task 2).
- Produces:
  - `formatType(type: Type, context: Node): string`
  - `unwrapPromise(type: Type): { type: Type; isAsync: boolean }`
  - `returnTypeLabel(decl: CallableDeclaration): { text: string; isAsync: boolean }`
  - `inputTypeLabel(decl: CallableDeclaration): string`
  - `EXCERPT_MAX_LINES = 25`
  - `type BuildContext = { repoRoot: string }`
  - `buildGraphNode(target: FocusTarget, kind: NodeKind, ctx: BuildContext): GraphNode`
  - `rangeOf(node: Node): Range`

**Background.** `Type.getText(contextNode, flags)` renders a type as source
text. Passing the context node matters: without it TypeScript renders fully
qualified names like `import("/abs/path/types").User` instead of `User`.
`TypeFormatFlags.NoTruncation` stops the compiler shortening long types to
`...`, which it does by default at around 160 characters.

Promise unwrapping (spec §5.4) is a display decision: in an async codebase
almost every edge would read `Promise<X>`, so the wrapper is stripped and the
node carries `isAsync` instead. You detect it by checking the type's symbol
name — an aliased type may report through `getAliasSymbol()` instead, so check
both.

`lineCount` is the *pre-clamp* count, because spec §7.6 sizes nodes from
`clamp(lineCount, 3, 25)` and the UI needs the raw number to decide whether to
draw the clipping fade.

- [ ] **Step 1: Write the failing label tests**

`packages/core/test/labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { inputTypeLabel, returnTypeLabel } from '../src/labels.js'
import { loadFixture } from './helpers.js'

describe('returnTypeLabel', () => {
  const { project } = loadFixture('basic')
  const signup = project.getSourceFileOrThrow('signup.ts')

  it('reads a plain return type', () => {
    const label = returnTypeLabel(signup.getFunctionOrThrow('validateUser'))
    expect(label).toEqual({ text: 'ValidUserData', isAsync: false })
  })

  it('unwraps Promise<User> to User and flags async', () => {
    const label = returnTypeLabel(signup.getFunctionOrThrow('createUser'))
    expect(label).toEqual({ text: 'User', isAsync: true })
  })

  it('unwraps Promise<void> to void', () => {
    const label = returnTypeLabel(signup.getFunctionOrThrow('sendWelcome'))
    expect(label).toEqual({ text: 'void', isAsync: true })
  })
})

describe('inputTypeLabel', () => {
  const { project } = loadFixture('basic')
  const signup = project.getSourceFileOrThrow('signup.ts')

  it('reads a single parameter type', () => {
    expect(inputTypeLabel(signup.getFunctionOrThrow('validateUser'))).toBe('UserInput')
  })

  it('returns an empty string when there are no parameters', () => {
    const noArgs = project.createSourceFile('tmp-noargs.ts', 'export function f() { return 1 }')
    expect(inputTypeLabel(noArgs.getFunctionOrThrow('f'))).toBe('')
  })

  it('comma-joins multiple parameter types', () => {
    const multi = project.createSourceFile(
      'tmp-multi.ts',
      'export function g(a: string, b: number) { return a + b }',
    )
    expect(inputTypeLabel(multi.getFunctionOrThrow('g'))).toBe('string, number')
  })
})
```

`project.createSourceFile` adds an in-memory file to the project — useful for
one-off type cases that do not deserve a fixture on disk.

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @code-spider/core test labels`
Expected: FAIL — cannot resolve `../src/labels.js`.

- [ ] **Step 3: Write `labels.ts`**

```ts
import { TypeFormatFlags, type Node, type Type } from 'ts-morph'
import type { CallableDeclaration } from './focus.js'

const FORMAT_FLAGS =
  TypeFormatFlags.NoTruncation | TypeFormatFlags.UseAliasDefinedOutsideCurrentScope

export function formatType(type: Type, context: Node): string {
  return type.getText(context, FORMAT_FLAGS)
}

/** Strip one Promise wrapper, per spec §5.4. */
export function unwrapPromise(type: Type): { type: Type; isAsync: boolean } {
  const symbolName = type.getSymbol()?.getName() ?? type.getAliasSymbol()?.getName()
  if (symbolName === 'Promise') {
    const args = type.getTypeArguments()
    const inner = args[0]
    if (args.length === 1 && inner) return { type: inner, isAsync: true }
  }
  return { type, isAsync: false }
}

export function returnTypeLabel(decl: CallableDeclaration): { text: string; isAsync: boolean } {
  const { type, isAsync } = unwrapPromise(decl.getReturnType())
  return { text: formatType(type, decl), isAsync }
}

export function inputTypeLabel(decl: CallableDeclaration): string {
  return decl
    .getParameters()
    .map((p) => formatType(p.getType(), p))
    .join(', ')
}
```

- [ ] **Step 4: Run the label tests**

Run: `pnpm --filter @code-spider/core test labels`
Expected: PASS — 6 tests.

If `returnTypeLabel` for `createUser` yields `Promise<User>`, the symbol check
failed; log `decl.getReturnType().getSymbol()?.getName()` to see what it
actually reports.

- [ ] **Step 5: Write the failing node-builder tests**

`packages/core/test/node-builder.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SyntaxKind } from 'ts-morph'
import { buildGraphNode, EXCERPT_MAX_LINES } from '../src/node-builder.js'
import { toFocusTarget } from '../src/focus.js'
import { fixturePath, loadFixture } from './helpers.js'

describe('buildGraphNode', () => {
  const { project, root } = loadFixture('basic')
  const signup = project.getSourceFileOrThrow('signup.ts')
  const ctx = { repoRoot: root }

  it('builds a function node with repo-relative id and file', () => {
    const target = toFocusTarget(signup.getFunctionOrThrow('validateUser'), signup)
    const node = buildGraphNode(target, 'function', ctx)

    expect(node.id).toBe('src/signup.ts#validateUser')
    expect(node.file).toBe('src/signup.ts')
    expect(node.kind).toBe('function')
    expect(node.name).toBe('validateUser')
  })

  it('carries input and return types and the async flag', () => {
    const target = toFocusTarget(signup.getFunctionOrThrow('createUser'), signup)
    const node = buildGraphNode(target, 'function', ctx)

    expect(node.inputType).toBe('ValidUserData')
    expect(node.returnType).toBe('User')
    expect(node.isAsync).toBe(true)
  })

  it('records a 1-based declaration range', () => {
    const target = toFocusTarget(signup.getFunctionOrThrow('validateUser'), signup)
    const node = buildGraphNode(target, 'function', ctx)

    expect(node.range.startLine).toBeGreaterThan(0)
    expect(node.range.startCol).toBe(1)
    expect(node.range.endLine).toBeGreaterThan(node.range.startLine)
  })

  it('uses the variable statement text for arrow-function consts', () => {
    const decl = signup
      .getVariableDeclarationOrThrow('auditSignup')
      .getInitializerIfKindOrThrow(SyntaxKind.ArrowFunction)
    const target = toFocusTarget(decl, signup)
    const node = buildGraphNode(target, 'function', ctx)

    expect(node.excerpt).toMatch(/^export const auditSignup/)
  })

  it('caps the excerpt at EXCERPT_MAX_LINES and reports the pre-clamp count', () => {
    const body = Array.from({ length: 40 }, (_, i) => `  const x${i} = ${i}`).join('\n')
    const long = project.createSourceFile('tmp-long.ts', `export function big() {\n${body}\n}`)
    const target = toFocusTarget(long.getFunctionOrThrow('big'), long)
    const node = buildGraphNode(target, 'function', { repoRoot: fixturePath('basic') })

    expect(node.lineCount).toBe(42)
    expect(node.excerpt.split('\n')).toHaveLength(EXCERPT_MAX_LINES)
  })
})
```

- [ ] **Step 6: Run to confirm failure**

Run: `pnpm --filter @code-spider/core test node-builder`
Expected: FAIL — cannot resolve `../src/node-builder.js`.

- [ ] **Step 7: Write `node-builder.ts`**

```ts
import { relative } from 'node:path'
import type { Node } from 'ts-morph'
import type { FocusTarget } from './focus.js'
import { inputTypeLabel, returnTypeLabel } from './labels.js'
import { makeNodeId, toPosixPath } from './node-id.js'
import type { GraphNode, NodeKind, Range } from './types.js'

export const EXCERPT_MAX_LINES = 25

export type BuildContext = {
  /** Absolute path that NodeIds and `file` fields are relative to. */
  repoRoot: string
}

export function rangeOf(node: Node): Range {
  const sourceFile = node.getSourceFile()
  const start = sourceFile.getLineAndColumnAtPos(node.getStart())
  const end = sourceFile.getLineAndColumnAtPos(node.getEnd())
  return {
    startLine: start.line,
    startCol: start.column,
    endLine: end.line,
    endCol: end.column,
  }
}

export function buildGraphNode(
  target: FocusTarget,
  kind: NodeKind,
  ctx: BuildContext,
): GraphNode {
  const absolute = target.sourceFile.getFilePath()
  const file = toPosixPath(relative(ctx.repoRoot, absolute))

  const text = target.textNode.getText()
  const lines = text.split('\n')
  const { text: returnType, isAsync } = returnTypeLabel(target.declaration)

  return {
    id: makeNodeId(file, target.name),
    kind,
    name: target.name,
    file,
    range: rangeOf(target.textNode),
    inputType: inputTypeLabel(target.declaration),
    returnType,
    isAsync,
    lineCount: lines.length,
    excerpt: lines.slice(0, EXCERPT_MAX_LINES).join('\n'),
  }
}
```

`getLineAndColumnAtPos` returns 1-based line and column, which is what VS Code's
`Position` expects minus one — the extension will subtract when it jumps. The
spec's `Range` is 1-based so that CLI output reads like editor line numbers.

- [ ] **Step 8: Run the tests**

Run: `pnpm --filter @code-spider/core test`
Expected: PASS — all suites.

- [ ] **Step 9: Commit**

```bash
git add packages/core
git commit -m "feat(core): type labels and GraphNode construction"
```

---

### Task 6: Declaration classification

**Files:**
- Create: `fixtures/externals/tsconfig.json`
- Create: `fixtures/externals/src/uses.ts`
- Create: `fixtures/externals/node_modules/tiny-lib/package.json`
- Create: `fixtures/externals/node_modules/tiny-lib/index.d.ts`
- Create: `packages/core/src/classify.ts`
- Test: `packages/core/test/classify.test.ts`

**Interfaces:**
- Consumes: `CallableDeclaration` (Task 4), `returnTypeLabel` (Task 5).
- Produces:
  - `isExternalPath(filePath: string): boolean`
  - `externalModuleOf(filePath: string): string`
  - `classifyDeclaration(decl: Node): NodeKind`

**Background.** Spec §5.1 says a declaration resolving into `node_modules` or a
`lib.*.d.ts` builtin becomes an `external` chip that the graph refuses to
expand. That is the mechanism by which the graph stops at your own code's edge
rather than wandering into React's internals.

Component detection is deliberately narrow in v1: a callable is a `component`
if its return type text mentions `JSX.Element` or `ReactElement`. Detecting
components by "is used as a JSX tag somewhere" would need caller-side
information the classifier does not have, and detecting by "starts with a
capital letter" would misfire on classes and factories.

Note that `fixtures/externals/node_modules` is checked into git deliberately.
The root `.gitignore` has `/node_modules` with a leading slash, which anchors it
to the repo root, so nested fixture copies are not ignored. Verify this with
`git check-ignore -v fixtures/externals/node_modules/tiny-lib/index.d.ts`
before committing — if it reports a match, add a `!` negation rule.

- [ ] **Step 1: Create the externals fixture**

`fixtures/externals/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "types": []
  },
  "include": ["src"]
}
```

`fixtures/externals/node_modules/tiny-lib/package.json`:

```json
{ "name": "tiny-lib", "version": "1.0.0", "types": "./index.d.ts" }
```

`fixtures/externals/node_modules/tiny-lib/index.d.ts`:

```ts
export declare function persist(value: string): Promise<void>
```

`fixtures/externals/src/uses.ts`:

```ts
import { persist } from 'tiny-lib'

export function local(value: string): string {
  return value.trim()
}

export async function usesExternals(value: string): Promise<void> {
  const trimmed = local(value)
  console.log(trimmed)
  await persist(trimmed)
}
```

- [ ] **Step 2: Write the failing tests**

`packages/core/test/classify.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classifyDeclaration, externalModuleOf, isExternalPath } from '../src/classify.js'
import { loadFixture } from './helpers.js'

describe('isExternalPath', () => {
  it('treats node_modules paths as external', () => {
    expect(isExternalPath('/repo/node_modules/tiny-lib/index.d.ts')).toBe(true)
  })

  it('treats lib.*.d.ts builtins as external', () => {
    expect(isExternalPath('/ts/lib/lib.dom.d.ts')).toBe(true)
  })

  it('treats repo source as internal', () => {
    expect(isExternalPath('/repo/src/signup.ts')).toBe(false)
  })

  it('does not treat a repo .d.ts as external', () => {
    expect(isExternalPath('/repo/src/shims.d.ts')).toBe(false)
  })
})

describe('externalModuleOf', () => {
  it('extracts a package name', () => {
    expect(externalModuleOf('/repo/node_modules/tiny-lib/index.d.ts')).toBe('tiny-lib')
  })

  it('extracts a scoped package name', () => {
    expect(externalModuleOf('/repo/node_modules/@scope/pkg/dist/i.d.ts')).toBe('@scope/pkg')
  })

  it('uses the nearest node_modules for nested dependencies', () => {
    expect(externalModuleOf('/repo/node_modules/a/node_modules/b/i.d.ts')).toBe('b')
  })

  it('labels compiler builtins as lib', () => {
    expect(externalModuleOf('/ts/lib/lib.dom.d.ts')).toBe('lib')
  })
})

describe('classifyDeclaration', () => {
  const { project } = loadFixture('externals')
  const uses = project.getSourceFileOrThrow('uses.ts')

  it('classifies a repo function as function', () => {
    expect(classifyDeclaration(uses.getFunctionOrThrow('local'))).toBe('function')
  })

  it('classifies a node_modules declaration as external', () => {
    const persist = uses
      .getImportDeclarationOrThrow('tiny-lib')
      .getNamedImports()[0]!
      .getNameNode()
      .getSymbolOrThrow()
      .getAliasedSymbolOrThrow()
      .getDeclarations()[0]!
    expect(classifyDeclaration(persist)).toBe('external')
  })
})
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm --filter @code-spider/core test classify`
Expected: FAIL — cannot resolve `../src/classify.js`.

- [ ] **Step 4: Write `classify.ts`**

```ts
import { basename } from 'node:path'
import { Node } from 'ts-morph'
import { isCallable } from './focus.js'
import { returnTypeLabel } from './labels.js'
import { toPosixPath } from './node-id.js'
import type { NodeKind } from './types.js'

export function isExternalPath(filePath: string): boolean {
  const posix = toPosixPath(filePath)
  if (posix.includes('/node_modules/')) return true
  // TypeScript's own lib files: lib.dom.d.ts, lib.es2022.d.ts, ...
  return /^lib\..*\.d\.ts$/.test(basename(posix))
}

export function externalModuleOf(filePath: string): string {
  const posix = toPosixPath(filePath)
  const marker = '/node_modules/'
  const at = posix.lastIndexOf(marker)
  if (at === -1) return 'lib'

  const rest = posix.slice(at + marker.length).split('/')
  const first = rest[0] ?? ''
  if (first.startsWith('@')) return `${first}/${rest[1] ?? ''}`
  return first
}

const JSX_RETURN = /\bJSX\.Element\b|\bReactElement\b/

export function classifyDeclaration(decl: Node): NodeKind {
  if (isExternalPath(decl.getSourceFile().getFilePath())) return 'external'
  if (!isCallable(decl)) return 'unknown'
  return JSX_RETURN.test(returnTypeLabel(decl).text) ? 'component' : 'function'
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @code-spider/core test classify`
Expected: PASS — 10 tests.

- [ ] **Step 6: Verify the fixture node_modules is tracked**

Run: `git check-ignore -v fixtures/externals/node_modules/tiny-lib/index.d.ts`
Expected: no output and exit code 1 — meaning the file is *not* ignored. If it
prints a rule, add `!fixtures/**/node_modules/**` to `.gitignore`.

- [ ] **Step 7: Commit**

```bash
git add fixtures packages/core .gitignore
git commit -m "feat(core): classify declarations as function, component or external"
```

---

### Task 7: Callee extraction (call edges)

**Files:**
- Create: `packages/core/src/callees.ts`
- Test: `packages/core/test/callees.test.ts`

**Interfaces:**
- Consumes: `FocusTarget`, `toFocusTarget`, `isCallable` (Task 4);
  `buildGraphNode`, `BuildContext`, `rangeOf` (Task 5); `classifyDeclaration`,
  `externalModuleOf` (Task 6).
- Produces:
  - `collectCalleeEdges(target: FocusTarget, focusId: NodeId, ctx: BuildContext): { nodes: GraphNode[]; edges: GraphEdge[] }`
  - `resolveCallTarget(call: CallExpression): Node | undefined`

**Background.** Every call in the focus function's body becomes an edge
*into* the focus node, because arrows run callee → caller (spec §4.4).

Resolving what a call actually points at goes through the *symbol*, not the
text. `call.getExpression().getSymbol()` gives the symbol of the thing being
called. When the call goes through an import, that symbol is an **alias** — it
represents the local import binding, not the real declaration — so you follow
`getAliasedSymbol()`. This one line is what makes barrel-file re-exports
resolve correctly in Task 12.

Three cases come out of resolution:

- Declaration in the repo → `function` or `component` node.
- Declaration in `node_modules` or a lib file → `external` chip node whose ID is
  `external:<module>#<display-name>`. It has no real file or range, so those are
  empty and zeroed.
- No symbol or no declarations → an `unknown` node with `resolved: false`
  (spec §5.5). This is the case that must never be silently dropped.

Edges are deduplicated on `(from, to, kind)`: calling the same helper three
times in one function should draw one arrow, not three overlapping ones.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/callees.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { collectCalleeEdges } from '../src/callees.js'
import { toFocusTarget } from '../src/focus.js'
import { loadFixture } from './helpers.js'

describe('collectCalleeEdges', () => {
  const { project, root } = loadFixture('basic')
  const signup = project.getSourceFileOrThrow('signup.ts')
  const ctx = { repoRoot: root }
  const focusId = 'src/signup.ts#handleSignup'
  const target = toFocusTarget(signup.getFunctionOrThrow('handleSignup'), signup)
  const { nodes, edges } = collectCalleeEdges(target, focusId, ctx)

  it('finds every repo callee', () => {
    const ids = edges.map((e) => e.from).sort()
    expect(ids).toEqual([
      'src/signup.ts#createUser',
      'src/signup.ts#sendWelcome',
      'src/signup.ts#validateUser',
    ])
  })

  it('points every edge at the focus node', () => {
    expect(edges.every((e) => e.to === focusId)).toBe(true)
  })

  it('labels edges with the callee return type, promise-unwrapped', () => {
    const edge = edges.find((e) => e.from === 'src/signup.ts#createUser')
    expect(edge?.supplies).toBe('User')
    expect(edge?.kind).toBe('call')
    expect(edge?.resolved).toBe(true)
  })

  it('records a call site range for click-to-jump', () => {
    const edge = edges.find((e) => e.from === 'src/signup.ts#validateUser')
    expect(edge?.callSite.startLine).toBeGreaterThan(0)
  })

  it('emits one node per callee', () => {
    expect(nodes.map((n) => n.id).sort()).toEqual([
      'src/signup.ts#createUser',
      'src/signup.ts#sendWelcome',
      'src/signup.ts#validateUser',
    ])
  })
})

describe('collectCalleeEdges — externals', () => {
  const { project, root } = loadFixture('externals')
  const uses = project.getSourceFileOrThrow('uses.ts')
  const ctx = { repoRoot: root }
  const focusId = 'src/uses.ts#usesExternals'
  const target = toFocusTarget(uses.getFunctionOrThrow('usesExternals'), uses)
  const { nodes, edges } = collectCalleeEdges(target, focusId, ctx)

  it('classifies a node_modules call as an external chip', () => {
    const node = nodes.find((n) => n.id === 'external:tiny-lib#persist')
    expect(node?.kind).toBe('external')
    expect(node?.file).toBe('')
  })

  it('classifies a lib builtin call as external', () => {
    expect(nodes.some((n) => n.id === 'external:lib#console.log')).toBe(true)
  })

  it('marks external edges with kind external', () => {
    const edge = edges.find((e) => e.from === 'external:tiny-lib#persist')
    expect(edge?.kind).toBe('external')
  })

  it('still finds the repo callee alongside the externals', () => {
    expect(edges.some((e) => e.from === 'src/uses.ts#local')).toBe(true)
  })
})

describe('collectCalleeEdges — unresolved', () => {
  const { project, root } = loadFixture('basic')
  const dynamic = project.createSourceFile(
    'tmp-dynamic.ts',
    `const handlers: Record<string, (x: number) => number> = {}
     export function dispatch(key: string) { return handlers[key]!(1) }`,
  )
  const target = toFocusTarget(dynamic.getFunctionOrThrow('dispatch'), dynamic)
  const { nodes, edges } = collectCalleeEdges(target, 'tmp-dynamic.ts#dispatch', {
    repoRoot: root,
  })

  it('keeps an unresolved call as an unknown node', () => {
    expect(nodes.some((n) => n.kind === 'unknown')).toBe(true)
    expect(edges.some((e) => e.resolved === false)).toBe(true)
  })
})

describe('collectCalleeEdges — deduplication', () => {
  const { project, root } = loadFixture('basic')
  const dupes = project.createSourceFile(
    'tmp-dupes.ts',
    `function helper(n: number): number { return n }
     export function twice(n: number): number { return helper(n) + helper(n) }`,
  )
  const target = toFocusTarget(dupes.getFunctionOrThrow('twice'), dupes)
  const { edges } = collectCalleeEdges(target, 'tmp-dupes.ts#twice', { repoRoot: root })

  it('emits one edge for a callee invoked twice', () => {
    expect(edges.filter((e) => e.from.endsWith('#helper'))).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @code-spider/core test callees`
Expected: FAIL — cannot resolve `../src/callees.js`.

- [ ] **Step 3: Write `callees.ts`**

```ts
import { Node, SyntaxKind, type CallExpression } from 'ts-morph'
import { classifyDeclaration, externalModuleOf, isExternalPath } from './classify.js'
import { isCallable, toFocusTarget, type FocusTarget } from './focus.js'
import { returnTypeLabel } from './labels.js'
import { buildGraphNode, rangeOf, type BuildContext } from './node-builder.js'
import type { GraphEdge, GraphNode, NodeId, Range } from './types.js'

const EMPTY_RANGE: Range = { startLine: 0, startCol: 0, endLine: 0, endCol: 0 }

/** Follow import aliases to the real declaration. Returns undefined when unresolvable. */
export function resolveCallTarget(call: CallExpression): Node | undefined {
  const symbol = call.getExpression().getSymbol()
  if (!symbol) return undefined
  const real = symbol.getAliasedSymbol() ?? symbol
  return real.getDeclarations()[0]
}

export function collectCalleeEdges(
  target: FocusTarget,
  focusId: NodeId,
  ctx: BuildContext,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<NodeId, GraphNode>()
  const edges = new Map<string, GraphEdge>()

  for (const call of target.declaration.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callSite = rangeOf(call)
    const declaration = resolveCallTarget(call)

    if (!declaration) {
      addUnknown(nodes, edges, call, focusId, callSite)
      continue
    }

    const filePath = declaration.getSourceFile().getFilePath()

    if (isExternalPath(filePath)) {
      const displayName = call.getExpression().getText()
      const id = `external:${externalModuleOf(filePath)}#${displayName}`
      putNode(nodes, {
        id,
        kind: 'external',
        name: displayName,
        file: '',
        range: EMPTY_RANGE,
        inputType: '',
        returnType: safeReturnType(declaration),
        isAsync: false,
        lineCount: 0,
        excerpt: '',
      })
      putEdge(edges, {
        id: `${id}->${focusId}`,
        from: id,
        to: focusId,
        kind: 'external',
        supplies: safeReturnType(declaration),
        callSite,
        resolved: true,
      })
      continue
    }

    if (!isCallable(declaration)) {
      addUnknown(nodes, edges, call, focusId, callSite)
      continue
    }

    const calleeTarget = toFocusTarget(declaration, declaration.getSourceFile())
    const node = buildGraphNode(calleeTarget, classifyDeclaration(declaration), ctx)
    putNode(nodes, node)
    putEdge(edges, {
      id: `${node.id}->${focusId}`,
      from: node.id,
      to: focusId,
      kind: 'call',
      supplies: node.returnType,
      callSite,
      resolved: true,
    })
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

function safeReturnType(declaration: Node): string {
  return isCallable(declaration) ? returnTypeLabel(declaration).text : 'unknown'
}

function addUnknown(
  nodes: Map<NodeId, GraphNode>,
  edges: Map<string, GraphEdge>,
  call: CallExpression,
  focusId: NodeId,
  callSite: Range,
): void {
  const displayName = call.getExpression().getText()
  const id = `unknown#${displayName}`
  putNode(nodes, {
    id,
    kind: 'unknown',
    name: displayName,
    file: '',
    range: EMPTY_RANGE,
    inputType: '',
    returnType: '',
    isAsync: false,
    lineCount: 0,
    excerpt: '',
  })
  putEdge(edges, {
    id: `${id}->${focusId}`,
    from: id,
    to: focusId,
    kind: 'call',
    supplies: '',
    callSite,
    resolved: false,
  })
}

function putNode(map: Map<NodeId, GraphNode>, node: GraphNode): void {
  if (!map.has(node.id)) map.set(node.id, node)
}

/** Dedupe on (from, to, kind) — the first call site wins. */
function putEdge(map: Map<string, GraphEdge>, edge: GraphEdge): void {
  const key = `${edge.from}|${edge.to}|${edge.kind}`
  if (!map.has(key)) map.set(key, edge)
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @code-spider/core test callees`
Expected: PASS — 11 tests.

Two failures are likely and both are informative. If `console.log` resolves to
a declaration whose path is not matched by `isExternalPath`, print
`declaration.getSourceFile().getFilePath()` to see where TypeScript's lib files
actually live in your install. If the dedupe test fails, check that the map key
uses all three of `from`, `to` and `kind`.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): extract callee edges with external and unknown handling"
```

---

### Task 8: Caller extraction

**Files:**
- Create: `fixtures/hub/tsconfig.json`
- Create: `fixtures/hub/src/log.ts`
- Create: `fixtures/hub/src/callers.ts`
- Create: `packages/core/src/callers.ts`
- Test: `packages/core/test/callers.test.ts`

**Interfaces:**
- Consumes: `FocusTarget`, `isCallable`, `toFocusTarget` (Task 4);
  `buildGraphNode`, `rangeOf`, `BuildContext` (Task 5); `classifyDeclaration`
  (Task 6).
- Produces:
  - `MAX_CALLERS = 50`
  - `collectCallerEdges(target: FocusTarget, focusId: NodeId, ctx: BuildContext): { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean }`

**Background.** This is the step that would normally force a whole-project
index. Instead, `nameNode.findReferencesAsNodes()` asks the TypeScript
*language service* — the same component that powers Find All References in your
editor — for every place the symbol is referenced. The language service already
maintains that index, so the analyser borrows it rather than duplicating it
(spec §6). This is the single most important design decision in the package and
the one most worth being able to explain.

References come back including the declaration itself, so you filter those out.
You also filter to references that are actually *calls*: a reference inside an
`import` statement or a type position is not a caller.

`MAX_CALLERS` exists because a logging helper can have hundreds of references,
and spec §6 requires the slice to admit truncation rather than hang or lie.

The hub fixture below has 60 callers deliberately — more than the cap — so the
truncation path is exercised rather than assumed.

- [ ] **Step 1: Create the hub fixture**

`fixtures/hub/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "types": []
  },
  "include": ["src"]
}
```

`fixtures/hub/src/log.ts`:

```ts
export function log(message: string): void {
  throw new Error(message)
}
```

`fixtures/hub/src/callers.ts` — generate it rather than typing it out:

```bash
mkdir -p fixtures/hub/src
{
  echo "import { log } from './log.js'"
  echo
  for i in $(seq 1 60); do
    echo "export function caller$i(): void { log('m$i') }"
  done
} > fixtures/hub/src/callers.ts
```

- [ ] **Step 2: Write the failing tests**

`packages/core/test/callers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { collectCallerEdges, MAX_CALLERS } from '../src/callers.js'
import { toFocusTarget } from '../src/focus.js'
import { loadFixture } from './helpers.js'

describe('collectCallerEdges', () => {
  const { project, root } = loadFixture('basic')
  const signup = project.getSourceFileOrThrow('signup.ts')
  const focusId = 'src/signup.ts#handleSignup'
  const target = toFocusTarget(signup.getFunctionOrThrow('handleSignup'), signup)
  const { nodes, edges, truncated } = collectCallerEdges(target, focusId, { repoRoot: root })

  it('finds both callers across files', () => {
    expect(edges.map((e) => e.to).sort()).toEqual(['src/app.ts#main', 'src/app.ts#retry'])
  })

  it('points every edge away from the focus node', () => {
    expect(edges.every((e) => e.from === focusId)).toBe(true)
  })

  it("labels edges with the focus node's return type", () => {
    expect(edges.every((e) => e.supplies === 'User')).toBe(true)
  })

  it('does not include the declaration itself as a caller', () => {
    expect(nodes.some((n) => n.id === focusId)).toBe(false)
  })

  it('is not truncated for a small caller list', () => {
    expect(truncated).toBe(false)
  })
})

describe('collectCallerEdges — hub', () => {
  const { project, root } = loadFixture('hub')
  const logFile = project.getSourceFileOrThrow('log.ts')
  const target = toFocusTarget(logFile.getFunctionOrThrow('log'), logFile)
  const { edges, truncated } = collectCallerEdges(target, 'src/log.ts#log', { repoRoot: root })

  it('caps the caller list at MAX_CALLERS', () => {
    expect(edges).toHaveLength(MAX_CALLERS)
  })

  it('reports truncation', () => {
    expect(truncated).toBe(true)
  })
})
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm --filter @code-spider/core test callers`
Expected: FAIL — cannot resolve `../src/callers.js`.

- [ ] **Step 4: Write `callers.ts`**

```ts
import { Node } from 'ts-morph'
import { classifyDeclaration } from './classify.js'
import { isCallable, toFocusTarget, type FocusTarget } from './focus.js'
import { returnTypeLabel } from './labels.js'
import { buildGraphNode, rangeOf, type BuildContext } from './node-builder.js'
import type { GraphEdge, GraphNode, NodeId } from './types.js'

export const MAX_CALLERS = 50

export function collectCallerEdges(
  target: FocusTarget,
  focusId: NodeId,
  ctx: BuildContext,
): { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean } {
  const supplies = returnTypeLabel(target.declaration).text

  const nodes = new Map<NodeId, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  let seen = 0
  let truncated = false

  for (const ref of target.nameNode.findReferencesAsNodes()) {
    // The declaration's own name node comes back as a reference.
    if (ref === target.nameNode) continue
    if (!isCallReference(ref)) continue

    const enclosing = ref.getFirstAncestor(isCallable)
    if (!enclosing) continue

    let callerTarget
    try {
      callerTarget = toFocusTarget(enclosing, enclosing.getSourceFile())
    } catch {
      // Anonymous callback with no name to display — not a useful graph node.
      continue
    }

    const node = buildGraphNode(callerTarget, classifyDeclaration(enclosing), ctx)
    if (node.id === focusId) continue

    const key = `${focusId}|${node.id}`
    if (edges.has(key)) continue

    if (seen >= MAX_CALLERS) {
      truncated = true
      break
    }
    seen += 1

    nodes.set(node.id, node)
    edges.set(key, {
      id: `${focusId}->${node.id}`,
      from: focusId,
      to: node.id,
      kind: 'call',
      supplies,
      callSite: rangeOf(ref),
      resolved: true,
    })
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()], truncated }
}

/** True when this reference is the thing being called, not an import or a type. */
function isCallReference(ref: Node): boolean {
  const parent = ref.getParent()
  if (!parent) return false
  if (Node.isCallExpression(parent)) return parent.getExpression() === ref
  if (Node.isPropertyAccessExpression(parent)) {
    const grand = parent.getParent()
    return Node.isCallExpression(grand) && grand.getExpression() === parent
  }
  return false
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @code-spider/core test callers`
Expected: PASS — 7 tests.

If the hub test reports 60 edges rather than 50, the cap is being applied after
insertion rather than before — check the ordering of the `seen >= MAX_CALLERS`
guard.

- [ ] **Step 6: Commit**

```bash
git add fixtures packages/core
git commit -m "feat(core): caller edges via the language service reference index"
```

---

### Task 9: JSX edges and props labels

**Files:**
- Create: `fixtures/jsx/tsconfig.json`
- Create: `fixtures/jsx/src/jsx-shim.d.ts`
- Create: `fixtures/jsx/src/components.tsx`
- Modify: `packages/core/src/callees.ts`
- Test: `packages/core/test/jsx.test.ts`

**Interfaces:**
- Consumes: everything from Task 7.
- Produces: `collectCalleeEdges` now also emits `kind: 'jsx'` edges whose
  `supplies` is the props type (spec §5.4).

**Background.** `<SignupForm onSubmit={...}/>` is not a `CallExpression`, so
Task 7's walk misses it entirely — without this task the whole frontend half of
a Next.js app is invisible. JSX elements appear in the AST as
`JsxSelfClosingElement` (`<Foo/>`) or `JsxOpeningElement` (`<Foo>...</Foo>`),
and `getTagNameNode()` gives you the identifier to resolve, exactly like a call
expression's callee.

The label override matters: a component's return type is `JSX.Element`, which
is true of every component and therefore tells you nothing. So JSX edges carry
the **props type** — the component's first parameter — instead (spec §5.4).

The fixture uses a local `jsx-shim.d.ts` rather than depending on React. That
keeps the fixture fast, hermetic, and free of an install step, while still
exercising real JSX type-checking.

- [ ] **Step 1: Create the JSX fixture**

`fixtures/jsx/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "jsx": "preserve",
    "strict": true,
    "types": []
  },
  "include": ["src"]
}
```

`fixtures/jsx/src/jsx-shim.d.ts`:

```ts
declare namespace JSX {
  interface Element {
    readonly __brand: 'JSX.Element'
  }
  interface ElementChildrenAttribute {
    children: object
  }
  interface IntrinsicElements {
    div: { children?: unknown }
    button: { onClick?: () => void; children?: unknown }
  }
}
```

`fixtures/jsx/src/components.tsx`:

```tsx
export type SignupFormProps = { onSubmit: (email: string) => void }

export function SignupForm(props: SignupFormProps): JSX.Element {
  return <button onClick={() => props.onSubmit('a@b.c')}>Sign up</button>
}

export function Page(): JSX.Element {
  return (
    <div>
      <SignupForm onSubmit={() => undefined} />
    </div>
  )
}
```

- [ ] **Step 2: Write the failing tests**

`packages/core/test/jsx.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { collectCalleeEdges } from '../src/callees.js'
import { toFocusTarget } from '../src/focus.js'
import { loadFixture } from './helpers.js'

describe('JSX edges', () => {
  const { project, root } = loadFixture('jsx')
  const file = project.getSourceFileOrThrow('components.tsx')
  const focusId = 'src/components.tsx#Page'
  const target = toFocusTarget(file.getFunctionOrThrow('Page'), file)
  const { nodes, edges } = collectCalleeEdges(target, focusId, { repoRoot: root })

  it('emits an edge for a rendered component', () => {
    expect(edges.some((e) => e.from === 'src/components.tsx#SignupForm')).toBe(true)
  })

  it('marks it as a jsx edge', () => {
    const edge = edges.find((e) => e.from === 'src/components.tsx#SignupForm')
    expect(edge?.kind).toBe('jsx')
  })

  it('labels the edge with the props type, not JSX.Element', () => {
    const edge = edges.find((e) => e.from === 'src/components.tsx#SignupForm')
    expect(edge?.supplies).toBe('SignupFormProps')
  })

  it('classifies the rendered component as a component node', () => {
    const node = nodes.find((n) => n.id === 'src/components.tsx#SignupForm')
    expect(node?.kind).toBe('component')
  })

  it('ignores intrinsic elements like div', () => {
    expect(nodes.some((n) => n.name === 'div')).toBe(false)
  })
})
```

- [ ] **Step 3: Run to confirm failure**

Run: `pnpm --filter @code-spider/core test jsx`
Expected: FAIL — no JSX edges are produced.

- [ ] **Step 4: Extend `callees.ts`**

Add these imports to the existing import block:

```ts
import { type JsxOpeningElement, type JsxSelfClosingElement } from 'ts-morph'
import { inputTypeLabel } from './labels.js'
```

Add this loop inside `collectCalleeEdges`, immediately after the existing
`for (const call of ...)` loop and before the `return`:

```ts
  const jsxElements = [
    ...target.declaration.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...target.declaration.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ] as (JsxSelfClosingElement | JsxOpeningElement)[]

  for (const element of jsxElements) {
    const tagName = element.getTagNameNode()

    // Intrinsic elements (<div>, <button>) start lowercase and have no
    // user-authored declaration worth graphing.
    if (!/^[A-Z]/.test(tagName.getText())) continue

    const symbol = tagName.getSymbol()
    const declaration = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations()[0]
    if (!declaration || !isCallable(declaration)) continue

    const componentTarget = toFocusTarget(declaration, declaration.getSourceFile())
    const node = buildGraphNode(componentTarget, classifyDeclaration(declaration), ctx)
    putNode(nodes, node)
    putEdge(edges, {
      id: `${node.id}->${focusId}`,
      from: node.id,
      to: focusId,
      kind: 'jsx',
      // Spec §5.4: the props type, because JSX.Element says nothing.
      supplies: inputTypeLabel(declaration),
      callSite: rangeOf(element),
      resolved: true,
    })
  }
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @code-spider/core test`
Expected: PASS — all suites, including the earlier ones.

If `supplies` comes back as `{ onSubmit: (email: string) => void; }` rather than
`SignupFormProps`, the type is being expanded structurally. Confirm
`TypeFormatFlags.UseAliasDefinedOutsideCurrentScope` is in `FORMAT_FLAGS` in
`labels.ts`.

- [ ] **Step 6: Commit**

```bash
git add fixtures packages/core
git commit -m "feat(core): JSX edges labelled with props types"
```

---

### Task 10: analyzeFocus and golden slices

**Files:**
- Create: `packages/core/src/analyze.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/analyze.test.ts`
- Test: `packages/core/test/__goldens__/` (generated)

**Interfaces:**
- Consumes: `resolveFocus` (Task 4), `buildGraphNode` (Task 5),
  `classifyDeclaration` (Task 6), `collectCalleeEdges` (Task 7),
  `collectCallerEdges` (Task 8).
- Produces:
  - `analyzeFocus(project: Project, req: { file: string; offset: number; repoRoot: string }): GraphSlice`

**Background.** This composes the previous four tasks into the public API from
spec §6. It also sorts nodes and edges by ID before returning. Sorting is not
cosmetic: without it, golden snapshots would churn whenever the compiler
happened to return references in a different order, and you would spend
afternoons chasing diffs that mean nothing.

Golden tests use Vitest's `toMatchFileSnapshot`, which writes the file on first
run and compares against it afterwards. Run with `-u` to accept intentional
changes. These are the spec §9 golden slices, and they are your regression net
for every later task.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/analyze.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { analyzeFocus } from '../src/analyze.js'
import { fixturePath, loadFixture } from './helpers.js'

function offsetOf(project: ReturnType<typeof loadFixture>['project'], file: string, needle: string) {
  const at = project.getSourceFileOrThrow(file).getFullText().indexOf(needle)
  if (at === -1) throw new Error(`needle not found: ${needle}`)
  return at
}

describe('analyzeFocus', () => {
  const { project, root } = loadFixture('basic')

  it('produces a slice focused on the enclosing function', () => {
    const slice = analyzeFocus(project, {
      file: fixturePath('basic', 'src/signup.ts'),
      offset: offsetOf(project, 'signup.ts', 'const valid = validateUser'),
      repoRoot: root,
    })

    expect(slice.focusId).toBe('src/signup.ts#handleSignup')
    expect(slice.truncated).toBe(false)
  })

  it('includes the focus node itself exactly once', () => {
    const slice = analyzeFocus(project, {
      file: fixturePath('basic', 'src/signup.ts'),
      offset: offsetOf(project, 'signup.ts', 'const valid = validateUser'),
      repoRoot: root,
    })

    expect(slice.nodes.filter((n) => n.id === slice.focusId)).toHaveLength(1)
  })

  it('includes both callers and all callees', () => {
    const slice = analyzeFocus(project, {
      file: fixturePath('basic', 'src/signup.ts'),
      offset: offsetOf(project, 'signup.ts', 'const valid = validateUser'),
      repoRoot: root,
    })

    expect(slice.nodes.map((n) => n.id).sort()).toEqual([
      'src/app.ts#main',
      'src/app.ts#retry',
      'src/signup.ts#createUser',
      'src/signup.ts#handleSignup',
      'src/signup.ts#sendWelcome',
      'src/signup.ts#validateUser',
    ])
  })

  it('returns nodes and edges in a stable order', () => {
    const req = {
      file: fixturePath('basic', 'src/signup.ts'),
      offset: offsetOf(project, 'signup.ts', 'const valid = validateUser'),
      repoRoot: root,
    }
    expect(analyzeFocus(project, req)).toEqual(analyzeFocus(project, req))
  })

  it('matches the golden slice', async () => {
    const slice = analyzeFocus(project, {
      file: fixturePath('basic', 'src/signup.ts'),
      offset: offsetOf(project, 'signup.ts', 'const valid = validateUser'),
      repoRoot: root,
    })

    await expect(JSON.stringify(slice, null, 2)).toMatchFileSnapshot(
      './__goldens__/basic-handleSignup.json',
    )
  })
})

describe('analyzeFocus — jsx golden', () => {
  const { project, root } = loadFixture('jsx')

  it('matches the golden slice', async () => {
    const slice = analyzeFocus(project, {
      file: fixturePath('jsx', 'src/components.tsx'),
      offset: offsetOf(project, 'components.tsx', '<SignupForm'),
      repoRoot: root,
    })

    await expect(JSON.stringify(slice, null, 2)).toMatchFileSnapshot(
      './__goldens__/jsx-Page.json',
    )
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @code-spider/core test analyze`
Expected: FAIL — cannot resolve `../src/analyze.js`.

- [ ] **Step 3: Write `analyze.ts`**

```ts
import type { Project } from 'ts-morph'
import { collectCalleeEdges } from './callees.js'
import { collectCallerEdges } from './callers.js'
import { classifyDeclaration } from './classify.js'
import { resolveFocus } from './focus.js'
import { buildGraphNode, type BuildContext } from './node-builder.js'
import type { GraphEdge, GraphNode, GraphSlice } from './types.js'

export type AnalyzeRequest = {
  /** Absolute path to the focused file. */
  file: string
  /** Zero-based character offset of the cursor. */
  offset: number
  /** Absolute path that NodeIds are relative to. */
  repoRoot: string
}

export function analyzeFocus(project: Project, req: AnalyzeRequest): GraphSlice {
  const target = resolveFocus(project, req.file, req.offset)
  const ctx: BuildContext = { repoRoot: req.repoRoot }

  const focusNode = buildGraphNode(target, classifyDeclaration(target.declaration), ctx)
  const callees = collectCalleeEdges(target, focusNode.id, ctx)
  const callers = collectCallerEdges(target, focusNode.id, ctx)

  return {
    focusId: focusNode.id,
    nodes: dedupeById([focusNode, ...callees.nodes, ...callers.nodes]),
    edges: sortById([...callees.edges, ...callers.edges]),
    truncated: callers.truncated,
  }
}

function dedupeById(nodes: GraphNode[]): GraphNode[] {
  const byId = new Map<string, GraphNode>()
  for (const node of nodes) if (!byId.has(node.id)) byId.set(node.id, node)
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

function sortById(edges: GraphEdge[]): GraphEdge[] {
  return [...edges].sort((a, b) => a.id.localeCompare(b.id))
}
```

- [ ] **Step 4: Re-export the public API**

Append to `packages/core/src/index.ts`:

```ts
export { analyzeFocus, type AnalyzeRequest } from './analyze.js'
export { findNearestTsconfig, loadProject, Project } from './project.js'
export { EXCERPT_MAX_LINES } from './node-builder.js'
export { MAX_CALLERS } from './callers.js'
```

- [ ] **Step 5: Generate and inspect the goldens**

Run: `pnpm --filter @code-spider/core test analyze`
Expected: PASS — the golden files are written on first run.

Now **read** `packages/core/test/__goldens__/basic-handleSignup.json` before
committing it. This is the first time you see the actual output of the whole
package. Check that the types read the way spec §4.4 describes: every edge into
`handleSignup` labelled with its source's return type, and the two `app.ts`
edges pointing outward labelled `User`.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): analyzeFocus with golden slice tests"
```

---

### Task 11: expandNode

**Files:**
- Modify: `packages/core/src/analyze.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/expand.test.ts`

**Interfaces:**
- Consumes: `analyzeFocus` internals (Task 10), `parseNodeId` (Task 2).
- Produces:
  - `expandNode(project: Project, nodeId: NodeId, repoRoot: string): GraphSlice`

**Background.** Expansion (spec §4.3) needs to go the other way: from a
`NodeId` back to a declaration. Since IDs are `path#name`, you resolve the file,
find the named callable in it, and then run the same slice logic. Refactoring
the shared part out of `analyzeFocus` first keeps the two entry points honest —
if they diverge, expansion and focus would draw different graphs for the same
node, which would be a confusing bug to notice.

External and unknown nodes are not expandable (spec §5.1), so `expandNode`
rejects them explicitly rather than failing obscurely somewhere downstream.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/expand.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { expandNode } from '../src/analyze.js'
import { loadFixture } from './helpers.js'

describe('expandNode', () => {
  const { project, root } = loadFixture('basic')

  it('produces a slice focused on the named node', () => {
    const slice = expandNode(project, 'src/signup.ts#createUser', root)
    expect(slice.focusId).toBe('src/signup.ts#createUser')
  })

  it('finds the expanded node\'s own caller', () => {
    const slice = expandNode(project, 'src/signup.ts#createUser', root)
    expect(slice.edges.some((e) => e.to === 'src/signup.ts#handleSignup')).toBe(true)
  })

  it('agrees with analyzeFocus for the same declaration', () => {
    const viaExpand = expandNode(project, 'src/signup.ts#handleSignup', root)
    expect(viaExpand.nodes.map((n) => n.id)).toEqual([
      'src/app.ts#main',
      'src/app.ts#retry',
      'src/signup.ts#createUser',
      'src/signup.ts#handleSignup',
      'src/signup.ts#sendWelcome',
      'src/signup.ts#validateUser',
    ])
  })

  it('refuses to expand an external node', () => {
    expect(() => expandNode(project, 'external:tiny-lib#persist', root)).toThrow(/not expandable/)
  })

  it('refuses to expand an unknown node', () => {
    expect(() => expandNode(project, 'unknown#handlers[key]', root)).toThrow(/not expandable/)
  })

  it('throws for a node that no longer exists', () => {
    expect(() => expandNode(project, 'src/signup.ts#deleted', root)).toThrow(/not found/)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @code-spider/core test expand`
Expected: FAIL — `expandNode` is not exported.

- [ ] **Step 3: Refactor the shared slice logic and add `expandNode`**

Replace the body of `analyzeFocus` and append the new function in
`packages/core/src/analyze.ts`:

```ts
import { join } from 'node:path'
import type { Project } from 'ts-morph'
import { collectCalleeEdges } from './callees.js'
import { collectCallerEdges } from './callers.js'
import { classifyDeclaration } from './classify.js'
import { isCallable, resolveFocus, toFocusTarget, type FocusTarget } from './focus.js'
import { buildGraphNode, type BuildContext } from './node-builder.js'
import { parseNodeId } from './node-id.js'
import type { GraphSlice, NodeId } from './types.js'

export function analyzeFocus(project: Project, req: AnalyzeRequest): GraphSlice {
  const target = resolveFocus(project, req.file, req.offset)
  return sliceFor(target, { repoRoot: req.repoRoot })
}

export function expandNode(project: Project, nodeId: NodeId, repoRoot: string): GraphSlice {
  if (nodeId.startsWith('external:') || nodeId.startsWith('unknown#')) {
    throw new Error(`Node is not expandable: ${nodeId}`)
  }

  const { file, name } = parseNodeId(nodeId)
  const sourceFile = project.getSourceFile(join(repoRoot, file))
  if (!sourceFile) throw new Error(`Node not found (missing file): ${nodeId}`)

  const declaration =
    sourceFile.getFunction(name) ??
    sourceFile.getVariableDeclaration(name)?.getInitializer()

  if (!declaration || !isCallable(declaration)) {
    throw new Error(`Node not found: ${nodeId}`)
  }

  return sliceFor(toFocusTarget(declaration, sourceFile), { repoRoot })
}

/** The shared body of analyzeFocus and expandNode — keep exactly one copy. */
function sliceFor(target: FocusTarget, ctx: BuildContext): GraphSlice {
  const focusNode = buildGraphNode(target, classifyDeclaration(target.declaration), ctx)
  const callees = collectCalleeEdges(target, focusNode.id, ctx)
  const callers = collectCallerEdges(target, focusNode.id, ctx)

  return {
    focusId: focusNode.id,
    nodes: dedupeById([focusNode, ...callees.nodes, ...callers.nodes]),
    edges: sortById([...callees.edges, ...callers.edges]),
    truncated: callers.truncated,
  }
}
```

Keep the existing `dedupeById`, `sortById` and `AnalyzeRequest` definitions.

- [ ] **Step 4: Export it**

Add to `packages/core/src/index.ts`:

```ts
export { expandNode } from './analyze.js'
```

- [ ] **Step 5: Run the full suite**

Run: `pnpm --filter @code-spider/core test`
Expected: PASS — including the Task 10 goldens, unchanged. If a golden changed,
the refactor altered behaviour; find out why rather than running `-u`.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): expandNode sharing analyzeFocus's slice logic"
```

---

### Task 12: Barrel-file re-export resolution

**Files:**
- Create: `fixtures/barrel/tsconfig.json`
- Create: `fixtures/barrel/src/inner/math.ts`
- Create: `fixtures/barrel/src/inner/index.ts`
- Create: `fixtures/barrel/src/consumer.ts`
- Test: `packages/core/test/barrel.test.ts`

**Interfaces:**
- Consumes: `analyzeFocus` (Task 10).
- Produces: no new API — this task proves an existing behaviour and fixes it if
  it is absent.

**Background.** Spec §9 lists aliased re-exports as a required golden case, and
it is the one most likely to be quietly broken. When you call `add(1, 2)` where
`add` came through `export * from './math.js'` in a barrel `index.ts`, the
symbol you get from `getExpression().getSymbol()` is an *alias* — a local stand-in
for the real declaration. Following `getAliasedSymbol()` is what turns it into
the real `math.ts` declaration, so the node lands on the file that actually
defines the function rather than on the barrel.

Task 7 already calls `getAliasedSymbol()`. This task's job is to prove it, and
to leave a regression test behind so a future refactor cannot silently drop it.
If the test passes on the first run, that is a valid outcome — commit it.

- [ ] **Step 1: Create the barrel fixture**

`fixtures/barrel/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "types": []
  },
  "include": ["src"]
}
```

`fixtures/barrel/src/inner/math.ts`:

```ts
export function add(a: number, b: number): number {
  return a + b
}
```

`fixtures/barrel/src/inner/index.ts`:

```ts
export * from './math.js'
```

`fixtures/barrel/src/consumer.ts`:

```ts
import { add } from './inner/index.js'

export function total(values: number[]): number {
  return values.reduce((acc, v) => add(acc, v), 0)
}
```

- [ ] **Step 2: Write the test**

`packages/core/test/barrel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { analyzeFocus } from '../src/analyze.js'
import { fixturePath, loadFixture } from './helpers.js'

describe('barrel re-exports', () => {
  const { project, root } = loadFixture('barrel')
  const text = project.getSourceFileOrThrow('consumer.ts').getFullText()

  const slice = analyzeFocus(project, {
    file: fixturePath('barrel', 'src/consumer.ts'),
    offset: text.indexOf('values.reduce'),
    repoRoot: root,
  })

  it('resolves the callee to its defining file, not the barrel', () => {
    expect(slice.nodes.some((n) => n.id === 'src/inner/math.ts#add')).toBe(true)
    expect(slice.nodes.some((n) => n.id === 'src/inner/index.ts#add')).toBe(false)
  })

  it('labels the edge with the real return type', () => {
    const edge = slice.edges.find((e) => e.from === 'src/inner/math.ts#add')
    expect(edge?.supplies).toBe('number')
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm --filter @code-spider/core test barrel`
Expected: PASS if `getAliasedSymbol()` is working. If it FAILS with the node ID
pointing at `index.ts`, the alias is not being followed — check
`resolveCallTarget` in `callees.ts`.

Note the `reduce` callback: `add` is called inside an arrow function nested in
`total`. Task 7 walks *all* descendants, so this also confirms that calls inside
nested callbacks are attributed to the enclosing focus function.

- [ ] **Step 4: Commit**

```bash
git add fixtures packages/core
git commit -m "test(core): barrel re-export resolution regression test"
```

---

### Task 13: CLI

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Test: `packages/cli/test/cli.test.ts`
- Create: `packages/cli/vitest.config.ts`

**Interfaces:**
- Consumes: `analyzeFocus`, `findNearestTsconfig`, `loadProject` (Task 10).
- Produces:
  - `lineColToOffset(text: string, line: number, col: number): number`
  - a `code-spider` binary: `code-spider <file>:<line>:<col> [--root <dir>]`

**Background.** Spec §9 makes the CLI the development loop and the golden
generator: sub-second, no extension host, no clicking. It accepts `line:col`
because that is what your editor's status bar shows, and converts to the
character offset `analyzeFocus` wants. Both are 1-based on the way in, matching
editor convention, and the conversion is its own tested function because
off-by-one errors here are easy to make and annoying to debug through the UI.

`--root` defaults to the directory containing the discovered `tsconfig.json`,
which makes NodeIds relative to the project the file belongs to.

- [ ] **Step 1: Write the failing tests**

`packages/cli/test/cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { lineColToOffset, parseTarget } from '../src/index.js'

describe('lineColToOffset', () => {
  const text = 'line one\nline two\nline three'

  it('returns 0 for 1:1', () => {
    expect(lineColToOffset(text, 1, 1)).toBe(0)
  })

  it('handles a later column on the first line', () => {
    expect(lineColToOffset(text, 1, 6)).toBe(5)
  })

  it('handles the start of the second line', () => {
    expect(lineColToOffset(text, 2, 1)).toBe(9)
  })

  it('handles CRLF line endings', () => {
    expect(lineColToOffset('a\r\nb', 2, 1)).toBe(3)
  })

  it('throws for a line past the end', () => {
    expect(() => lineColToOffset(text, 99, 1)).toThrow(/out of range/)
  })
})

describe('parseTarget', () => {
  it('splits file:line:col', () => {
    expect(parseTarget('src/a.ts:12:5')).toEqual({ file: 'src/a.ts', line: 12, col: 5 })
  })

  it('defaults the column to 1', () => {
    expect(parseTarget('src/a.ts:12')).toEqual({ file: 'src/a.ts', line: 12, col: 1 })
  })

  it('handles a Windows absolute path with a drive letter', () => {
    expect(parseTarget('C:\\repo\\a.ts:3:2')).toEqual({ file: 'C:\\repo\\a.ts', line: 3, col: 2 })
  })

  it('throws without a line number', () => {
    expect(() => parseTarget('src/a.ts')).toThrow(/Expected <file>:<line>/)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @code-spider/cli test`
Expected: FAIL — the package does not exist yet.

- [ ] **Step 3: Create the package**

`packages/cli/package.json`:

```json
{
  "name": "@code-spider/cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "code-spider": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@code-spider/core": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/cli/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 30_000 },
})
```

- [ ] **Step 4: Write `packages/cli/src/index.ts`**

```ts
#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeFocus, findNearestTsconfig, loadProject } from '@code-spider/core'

export function lineColToOffset(text: string, line: number, col: number): number {
  const lines = text.split('\n')
  if (line < 1 || line > lines.length) {
    throw new Error(`Line ${line} is out of range (file has ${lines.length} lines)`)
  }

  let offset = 0
  for (let i = 0; i < line - 1; i += 1) {
    // +1 restores the '\n' that split() removed. '\r' is still inside the line
    // for CRLF files, so it is already counted.
    offset += (lines[i] ?? '').length + 1
  }
  return offset + (col - 1)
}

export function parseTarget(arg: string): { file: string; line: number; col: number } {
  // Split from the right so Windows drive letters (C:\...) survive.
  const parts = arg.split(':')
  const maybeCol = Number(parts[parts.length - 1])
  const maybeLine = Number(parts[parts.length - 2])

  if (parts.length >= 3 && Number.isInteger(maybeCol) && Number.isInteger(maybeLine)) {
    return { file: parts.slice(0, -2).join(':'), line: maybeLine, col: maybeCol }
  }
  if (parts.length >= 2 && Number.isInteger(maybeCol)) {
    return { file: parts.slice(0, -1).join(':'), line: maybeCol, col: 1 }
  }
  throw new Error(`Expected <file>:<line>[:<col>], got: ${arg}`)
}

function main(argv: string[]): void {
  const target = argv.find((a) => !a.startsWith('--'))
  if (!target) {
    console.error('usage: code-spider <file>:<line>[:<col>] [--root <dir>]')
    process.exit(2)
  }

  const { file, line, col } = parseTarget(target)
  const absolute = resolve(file)
  const tsconfig = findNearestTsconfig(absolute)

  const rootFlag = argv.indexOf('--root')
  const repoRoot = rootFlag === -1 ? dirname(tsconfig) : resolve(argv[rootFlag + 1] ?? '.')

  const project = loadProject(tsconfig)
  const offset = lineColToOffset(readFileSync(absolute, 'utf8'), line, col)

  console.log(JSON.stringify(analyzeFocus(project, { file: absolute, offset, repoRoot }), null, 2))
}

// Only run when invoked directly, so the test file can import the helpers.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm install && pnpm --filter @code-spider/cli test`
Expected: PASS — 9 tests.

- [ ] **Step 6: Run it against a fixture by hand**

Run:

```bash
pnpm --filter @code-spider/cli exec tsx src/index.ts \
  ../../fixtures/basic/src/signup.ts:19:3
```

Expected: the `handleSignup` slice as JSON, matching the Task 10 golden.
Line 19 should fall inside `handleSignup` — adjust if you edited the fixture.

This is the moment the analyser becomes a usable tool. Try it on a real
TypeScript project of your own before moving on; that is also how you gather
the input for Task 14.

- [ ] **Step 7: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): print a graph slice for file:line:col"
```

---

### Task 14: Measure findReferences performance

**Files:**
- Create: `docs/superpowers/notes/2026-08-22-findreferences-perf.md`

**Interfaces:**
- Consumes: the CLI (Task 13).
- Produces: a written measurement, and a decision recorded against spec §11
  risk 1.

**Background.** Spec §11 names this the single largest technical risk: if
`findReferences` is too slow on a real repo, the fallback is a cached reverse
index, which is a significant design change. The spec says to measure during M1
"while reacting is still cheap" — that is now, before the UI is built on top of
this assumption.

You are measuring two distinct things, and they have different budgets. Cold
start is dominated by `loadProject` type-checking the whole program and happens
once per session; several seconds is acceptable. Per-focus time is what the
user feels on every `Shift+Alt+Q`; anything above roughly 500ms will feel slow
in the panel.

- [ ] **Step 1: Add timing to the CLI**

Wrap the two phases in `main()`:

```ts
  const t0 = performance.now()
  const project = loadProject(tsconfig)
  const t1 = performance.now()

  const offset = lineColToOffset(readFileSync(absolute, 'utf8'), line, col)
  const slice = analyzeFocus(project, { file: absolute, offset, repoRoot })
  const t2 = performance.now()

  if (argv.includes('--timing')) {
    console.error(`load: ${(t1 - t0).toFixed(0)}ms  analyze: ${(t2 - t1).toFixed(0)}ms`)
  }
  console.log(JSON.stringify(slice, null, 2))
```

- [ ] **Step 2: Measure against a real repo**

Pick the largest TypeScript project you have — ideally a Next.js app Claude
built, since that is the actual target. Run the CLI with `--timing` against at
least five focus targets:

- a leaf utility with one or two callers
- a mid-level function
- a React component rendered in several places
- the most-referenced helper you can find (a logger, a `cn()` classname helper,
  a shared `db` wrapper)
- a function in the largest file in the repo

- [ ] **Step 3: Write up the findings**

`docs/superpowers/notes/2026-08-22-findreferences-perf.md`:

```markdown
# findReferences performance — M1 measurement

**Repo measured:** <name, file count, LOC>
**Machine:** <CPU, RAM>
**Date:** 2026-08-22

| Focus target | Callers found | Load (ms) | Analyze (ms) |
|---|---|---|---|
| ... | ... | ... | ... |

## Verdict

<One of:>
- **Acceptable.** Worst per-focus analyze time is Xms, under the ~500ms budget.
  Spec §11 risk 1 is closed; no reverse index needed.
- **Marginal.** Worst case is Xms, driven by <cause>. Mitigations to try before
  redesigning: <e.g. lowering MAX_CALLERS, restricting the reference search
  scope>.
- **Unacceptable.** Worst case is Xms. A cached reverse index is required, which
  changes spec §6. Details: <what to change>.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes packages/cli
git commit -m "docs: measure findReferences performance against spec risk 1"
```

- [ ] **Step 5: Report back**

Bring the verdict to review before the M2–M4 UI plan is written. If it is
anything other than "Acceptable", the UI plan needs to account for asynchronous
or partial slices, and it is far cheaper to know that before the panel exists.

---

## Done criteria for M0 + M1

- [ ] `pnpm test` is green from the repo root.
- [ ] `pnpm typecheck` is green from the repo root.
- [ ] Five fixture projects exist: `basic`, `externals`, `jsx`, `hub`, `barrel`.
- [ ] Both golden slices are committed and have been read, not just generated.
- [ ] The CLI prints a correct slice for a file in a real project of your own.
- [ ] The performance note exists and carries a verdict.
- [ ] `packages/core` contains no import of `vscode` — verify with
      `grep -r "from 'vscode'" packages/core/src` returning nothing.

Spec §9 lists nine golden cases. All nine are covered: plain call chain
(Task 7), async unwrap (Task 5), JSX props (Task 9), node_modules external
(Task 7), dynamic unresolved (Task 7), hub cap (Task 8), aliased re-export
(Task 12), arrow-function const (Tasks 4 and 5), default export (Task 4).
