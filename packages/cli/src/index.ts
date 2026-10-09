#!/usr/bin/env tsx
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeFocus,
  findTsconfig,
  loadProject,
  warmProject,
  type GraphSlice,
} from "@code-spider/core";
import { parseRunOptions, ROOT_FLAG } from "./run-options.js";
import { formatTiming, type Timings } from "./timing.js";

const USAGE =
  "usage: code-spider <file>:<line>[:<col>] [--root <dir>] " +
  "[--timing] [--repeat <n>]";
const TARGET_PATTERN = /^(.*?[^:]):([1-9]\d*)(?::([1-9]\d*))?$/;

export type Target = { file: string; line: number; col: number };

export type CliArgs = { target: string; root: string | undefined };

export function lineColToOffset(
  text: string,
  line: number,
  col: number,
): number {
  const lines = text.split("\n");
  if (line < 1 || line > lines.length) {
    throw new Error(
      `Line ${line} is out of range (file has ${lines.length} lines)`,
    );
  }

  const lineLength = (lines[line - 1] ?? "").length;
  if (col < 1 || col > lineLength + 1) {
    throw new Error(`Column ${col} is out of range for line ${line}`);
  }

  let offset = 0;
  for (let i = 0; i < line - 1; i += 1) {
    // +1 restores the '\n' that split() removed. A CRLF '\r' stays in the
    // line text, so it is already counted.
    offset += (lines[i] ?? "").length + 1;
  }
  return offset + (col - 1);
}

function invalidTarget(arg: string): Error {
  return new Error(`Expected <file>:<line>[:<col>], got: ${arg}`);
}

export function parseTarget(arg: string): Target {
  const match = TARGET_PATTERN.exec(arg);
  if (!match) throw invalidTarget(arg);

  const [, file = "", lineText = "", colText = "1"] = match;
  const line = Number(lineText);
  const col = Number(colText);
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(col)) {
    throw invalidTarget(arg);
  }
  return { file, line, col };
}

export function parseArgs(argv: string[]): CliArgs {
  let target: string | undefined;
  let root: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === ROOT_FLAG || arg.startsWith(`${ROOT_FLAG}=`)) {
      const inline = arg.startsWith(`${ROOT_FLAG}=`)
        ? arg.slice(ROOT_FLAG.length + 1)
        : undefined;
      const value = inline ?? argv[i + 1];
      if (inline === undefined) i += 1;
      if (!value || value.startsWith("--")) {
        throw new Error("--root requires a directory");
      }
      root = value;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (target === undefined) {
      target = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (target === undefined) {
    throw new Error("Missing <file>:<line>[:<col>] argument");
  }
  return { target, root };
}

export type RunResult = Timings & { slice: GraphSlice };

export function runTarget(
  target: string,
  rootFlag: string | undefined,
  repeat: number,
): RunResult {
  const { file, line, col } = parseTarget(target);
  const absolute = resolve(file);
  if (!existsSync(absolute)) {
    throw new Error(`File not found: ${absolute}`);
  }

  const offset = lineColToOffset(readFileSync(absolute, "utf8"), line, col);
  const tsconfig = findTsconfig(absolute);
  const repoRoot =
    rootFlag === undefined ? dirname(tsconfig) : resolve(rootFlag);
  const input = { file: absolute, offset, repoRoot };

  const loadStart = performance.now();
  const project = loadProject(tsconfig);
  const loadMs = performance.now() - loadStart;

  const warmStart = performance.now();
  warmProject(project);
  const warmMs = performance.now() - warmStart;

  const timedAnalyze = () => {
    const start = performance.now();
    const slice = analyzeFocus(project, input);
    return { slice, ms: performance.now() - start };
  };
  const first = timedAnalyze();
  const rest = Array.from({ length: repeat - 1 }, timedAnalyze);

  return {
    slice: first.slice,
    loadMs,
    warmMs,
    analyzeMs: [first.ms, ...rest.map((run) => run.ms)],
  };
}

export function analyzeTarget(target: string, rootFlag?: string): GraphSlice {
  return runTarget(target, rootFlag, 1).slice;
}

export function main(argv: string[]): number {
  if (argv.length === 0) {
    console.error(USAGE);
    return 2;
  }

  try {
    const { timing, repeat, rest } = parseRunOptions(argv);
    const { target, root } = parseArgs(rest);
    const result = runTarget(target, root, repeat);
    if (timing) {
      for (const line of formatTiming(result)) {
        console.error(line);
      }
    }
    console.log(JSON.stringify(result.slice, null, 2));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`code-spider: ${message}`);
    return 1;
  }
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  return (
    entry !== undefined &&
    realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  );
}

// Only run when invoked directly, so the test file can import the helpers.
if (isEntryPoint()) {
  process.exitCode = main(process.argv.slice(2));
}
