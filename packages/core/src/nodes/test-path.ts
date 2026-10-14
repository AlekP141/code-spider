const TEST_FOLDERS = new Set(["__tests__", "test", "tests"]);

/** Whether a repo-relative POSIX path is test code: a test file or a file in a test folder. */
export function isTestPath(repoRelativePath: string): boolean {
  const folders = repoRelativePath.split("/");
  const name = folders.pop() ?? "";
  return (
    name.includes(".test.") ||
    name.includes(".spec.") ||
    folders.some((folder) => TEST_FOLDERS.has(folder))
  );
}
