import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: { extension: "src/extension.ts" },
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

if (watch) {
  const watcher = await context(options);
  await watcher.watch();
} else {
  await build(options);
}
