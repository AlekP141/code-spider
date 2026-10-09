import type { Range } from "@code-spider/core";

export type ZeroBasedRange = {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
};

/**
 * The analyser reports one-based lines and columns (ts-morph's
 * `getLineAndColumnAtPos`); VS Code positions are zero-based. The end stays
 * exclusive in both.
 */
export function toZeroBasedRange(range: Range): ZeroBasedRange {
  return {
    startLine: Math.max(0, range.startLine - 1),
    startCharacter: Math.max(0, range.startColumn - 1),
    endLine: Math.max(0, range.endLine - 1),
    endCharacter: Math.max(0, range.endColumn - 1),
  };
}
