import { join, resolve } from "node:path";
import { runTests } from "@vscode/test-electron";
import pinned from "../vscode-version.json";

/**
 * Started from VS Code's terminal (or an agent running inside VS Code), the
 * environment makes Electron behave as plain Node and attach to the outer
 * VS Code. The test instance must not inherit any of that.
 */
function scrubEditorEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    if (key === "ELECTRON_RUN_AS_NODE" || key.startsWith("VSCODE_")) {
      delete process.env[key];
    }
  }
}

async function main(): Promise<void> {
  scrubEditorEnvironment();
  const packageDir = resolve(__dirname, "../..");
  const workspace = resolve(packageDir, "../../test-code/basic");
  await runTests({
    version: pinned.version,
    cachePath: join(packageDir, ".vscode-test"),
    extensionDevelopmentPath: packageDir,
    extensionTestsPath: join(packageDir, "dist/smoke/suite/index.cjs"),
    launchArgs: [
      workspace,
      "--disable-extensions",
      "--disable-workspace-trust",
    ],
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
