import { cpSync, existsSync, rmSync } from "node:fs";
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: { extension: "src/extension.ts", worker: "src/worker.ts" },
  outdir: "dist",
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
  const source = "../webview/dist";
  if (!existsSync(source)) {
    console.warn(
      "webview bundle missing: run `pnpm build` at the repo root so the panel has assets",
    );
    return;
  }
  rmSync("dist/webview", { recursive: true, force: true });
  cpSync(source, "dist/webview", { recursive: true });
}

if (watch) {
  const watcher = await context(options);
  await watcher.watch();
} else {
  await build(options);
}
copyWebviewAssets();
