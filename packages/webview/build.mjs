import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: { index: "src/main.tsx" },
  outdir: "dist",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  minify: !watch,
  sourcemap: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      watch ? "development" : "production",
    ),
  },
  logLevel: "info",
};

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

const syncToExtension = {
  name: "sync-to-extension",
  setup(api) {
    api.onEnd((result) => {
      if (result.errors.length > 0) return;
      const target = here("../extension/dist/webview");
      mkdirSync(target, { recursive: true });
      for (const name of ["index.js", "index.css"]) {
        for (const file of [name, `${name}.map`]) {
          cpSync(here(`dist/${file}`), `${target}/${file}`);
        }
      }
    });
  },
};

if (watch) {
  const watcher = await context({ ...options, plugins: [syncToExtension] });
  await watcher.watch();
} else {
  await build(options);
}
