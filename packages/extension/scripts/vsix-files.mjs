export const EXPECTED_VSIX_FILES = [
  "[Content_Types].xml",
  "extension.vsixmanifest",
  "extension/package.json",
  "extension/readme.md",
  "extension/dist/extension.cjs",
  "extension/dist/worker.cjs",
  "extension/dist/webview/index.js",
  "extension/dist/webview/index.css",
];

export function compareFileLists(actual, expected = EXPECTED_VSIX_FILES) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return {
    missing: [...expectedSet].filter((name) => !actualSet.has(name)).sort(),
    unexpected: [...actualSet].filter((name) => !expectedSet.has(name)).sort(),
  };
}
