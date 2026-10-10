import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(packageDir, "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const imports = sourceFiles(srcDir).flatMap((file) =>
  [
    ...readFileSync(file, "utf8").matchAll(
      /^import\b[^;]*?\bfrom\s+"([^"]+)";/gm,
    ),
  ].map(([statement, specifier]) => ({
    file: relative(packageDir, file),
    statement: statement ?? "",
    specifier: specifier ?? "",
  })),
);

describe("webview imports from core", () => {
  it("never reaches the core index, which pulls in ts-morph and node modules", () => {
    const offenders = imports
      .filter((entry) => entry.specifier === "@code-spider/core")
      .map((entry) => entry.file);
    expect(offenders).toEqual([]);
  });

  it("imports from the types entry as types only", () => {
    const offenders = imports
      .filter((entry) => entry.specifier === "@code-spider/core/types")
      .filter((entry) => !entry.statement.startsWith("import type "))
      .map((entry) => entry.file);
    expect(offenders).toEqual([]);
  });
});
