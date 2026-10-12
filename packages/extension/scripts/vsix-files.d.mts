export const EXPECTED_VSIX_FILES: readonly string[];

export function compareFileLists(
  actual: Iterable<string>,
  expected?: Iterable<string>,
): { missing: string[]; unexpected: string[] };
