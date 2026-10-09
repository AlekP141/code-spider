import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GraphSlice } from "@code-spider/core";

const here = dirname(fileURLToPath(import.meta.url));

export const testCodeRoot = resolve(here, "../../../../test-code");

/** Absolute path to a file inside a test-code project. */
export function fixturePath(name: string, rel = ""): string {
  return join(testCodeRoot, name, rel);
}

/** Zero-based offset of the first `needle` in `file`, plus `delta`. */
export function offsetOf(file: string, needle: string, delta = 0): number {
  const index = readFileSync(file, "utf8").indexOf(needle);
  if (index < 0) throw new Error(`"${needle}" not found in ${file}`);
  return index + delta;
}

/** A real slice produced by the analyser, checked in under core's tests. */
export function readGolden(name: string): GraphSlice {
  const path = resolve(here, "../../../core/test/__goldens__", name);
  return JSON.parse(readFileSync(path, "utf8")) as GraphSlice;
}
