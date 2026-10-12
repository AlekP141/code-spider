import { existsSync } from "node:fs";
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

function parseExtensionPath(args: string[]): string | undefined {
  if (args.length === 0) return undefined;
  const [flag, value, ...rest] = args;
  if (flag !== "--extension-path" || !value || rest.length > 0) {
    throw new Error(
      `Usage: run.cjs [--extension-path <dir>]; got: ${args.join(" ")}`,
    );
  }
  const extensionPath = resolve(value);
  if (!existsSync(join(extensionPath, "package.json"))) {
    throw new Error(
      `--extension-path ${extensionPath} is not a folder with a package.json`,
    );
  }
  return extensionPath;
}

async function main(): Promise<void> {
  const extensionPath = parseExtensionPath(process.argv.slice(2));
  scrubEditorEnvironment();
  const packageDir = resolve(__dirname, "../..");
  const workspace = resolve(packageDir, "../../test-code/basic");
  await runTests({
    version: pinned.version,
    cachePath: join(packageDir, ".vscode-test"),
    extensionDevelopmentPath: extensionPath ?? packageDir,
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
