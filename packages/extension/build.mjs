import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: {
    extension: here("src/extension.ts"),
    worker: here("src/worker.ts"),
  },
  outdir: here("dist"),
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

/** The webview bundle is built by its own package; ship it inside dist/. */
function copyWebviewAssets() {
  const source = here("../webview/dist");
  if (!existsSync(source)) {
    console.warn(
      "webview bundle missing: run `pnpm build` at the repo root so the panel has assets",
    );
    return;
  }
  const target = here("dist/webview");
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}

if (watch) {
  const watcher = await context(options);
  await watcher.watch();
} else {
  await build(options);
}
copyWebviewAssets();
