import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import { expect, it, vi } from "vitest";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const entry = `
import { layoutGraph } from "./src/graph/layout.ts";
const node = (id) => ({ id, kind: "function", name: id, file: "a.ts", range: { startLine: 1, startColumn: 1, endLine: 3, endColumn: 2 }, inputType: "", returnType: "", isAsync: false, lineCount: 3, codePreview: "function f() {}" });
const site = { startLine: 2, startColumn: 3, endLine: 2, endColumn: 9 };
const graph = {
  generation: 0,
  project: "/repo/tsconfig.json",
  focusId: "b",
  nodes: { a: node("a"), b: node("b") },
  edges: { "a->b": { id: "a->b", from: "a", to: "b", kind: "call", supplies: "", callSite: site, resolved: true } },
  slices: { b: { members: ["a"], edgeIds: ["a->b"] } },
  positions: {},
  pinned: [],
  revision: 0,
};
layoutGraph(graph, 96).then(
  (positions) => { globalThis.result = JSON.stringify(positions); },
  (error) => { globalThis.failure = String(error); },
);
`;

it("lays out in a browser-like context that forbids string evaluation", async () => {
  const bundled = await build({
    stdin: { contents: entry, resolveDir: packageDir, loader: "ts" },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
  });

  // `document` makes ELK take its in-browser path; the webview CSP has no
  // 'unsafe-eval', so string-to-code evaluation is switched off here too.
  const sandbox: Record<string, unknown> = {
    document: {},
    setTimeout,
    clearTimeout,
    console,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
  vm.runInContext(bundled.outputFiles[0]?.text ?? "", context);

  await vi.waitFor(() =>
    expect(sandbox.result ?? sandbox.failure).toBeDefined(),
  );
  expect(sandbox.failure).toBeUndefined();
  const positions = JSON.parse(String(sandbox.result)) as Record<
    string,
    { x: number; y: number }
  >;
  expect(positions.a?.x).toBeLessThan(positions.b?.x ?? 0);
});
