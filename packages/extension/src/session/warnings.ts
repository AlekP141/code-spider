import { basename } from "node:path";

export function savedFirstWarning(file: string): string {
  return `Save ${basename(file)} first. Code Spider reads files from disk, so an unsaved edit would be analysed at the wrong position.`;
}

export const NO_FUNCTION_WARNING =
  "Code Spider: no function found at the cursor.";

export const MARK_FIRST_WARNING =
  "Code Spider: mark a start first. Put the cursor in a function and run Code Spider: Path from here.";

export function sameFunctionWarning(name: string): string {
  return `Code Spider: the start and the end are the same function (${name}). Pick a different function.`;
}

export function differentProjectsWarning(from: string, to: string): string {
  return `Code Spider: ${from} and ${to} belong to different TypeScript projects, so they cannot be searched together.`;
}

export function staleMarkWarning(name: string): string {
  return `Code Spider: the marked start (${name}) no longer exists.`;
}

export function endGoneMessage(name: string): string {
  return `Code Spider: the end (${name}) no longer exists.`;
}

export function noPathMessage(
  from: string,
  to: string,
  timedOut: boolean,
): string {
  return `No path found from ${from} to ${to}${timedOut ? " within the time limit" : ""}`;
}
