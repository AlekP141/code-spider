import { build } from "esbuild";

await build({
  entryPoints: {
    run: "smoke/run.ts",
    "suite/index": "smoke/suite/index.ts",
    "suite/extension.smoke": "smoke/suite/extension.smoke.ts",
  },
  outdir: "dist/smoke",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode", "mocha", "@vscode/test-electron"],
  sourcemap: true,
  logLevel: "info",
});
