import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import { expect, it, vi } from "vitest";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const entry = `
import { layoutPositions } from "./src/graph/layout.ts";
const node = (id) => ({ id, width: 100, height: 50, position: { x: 0, y: 0 }, data: {} });
layoutPositions([node("a"), node("b")], [{ id: "e", source: "a", target: "b" }]).then(
  (positions) => { globalThis.result = JSON.stringify([...positions.entries()]); },
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
  const positions = new Map<string, { x: number; y: number }>(
    JSON.parse(String(sandbox.result)),
  );
  expect(positions.get("a")?.x).toBeLessThan(positions.get("b")?.x ?? 0);
});
