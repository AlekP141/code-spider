import { describe, expect, it } from "vitest";
import {
  EXPECTED_VSIX_FILES,
  compareFileLists,
} from "../scripts/vsix-files.mjs";

describe("compareFileLists", () => {
  it("finds nothing missing or unexpected for an exact match in any order", () => {
    const shuffled = [...EXPECTED_VSIX_FILES].reverse();

    expect(compareFileLists(shuffled)).toEqual({ missing: [], unexpected: [] });
  });

  it("names a file that is expected but not in the package under missing", () => {
    const actual = EXPECTED_VSIX_FILES.filter(
      (name) => name !== "extension/dist/webview/index.css",
    );

    expect(compareFileLists(actual)).toEqual({
      missing: ["extension/dist/webview/index.css"],
      unexpected: [],
    });
  });

  it("names a source map in the package under unexpected", () => {
    const actual = [...EXPECTED_VSIX_FILES, "extension/dist/extension.cjs.map"];

    expect(compareFileLists(actual)).toEqual({
      missing: [],
      unexpected: ["extension/dist/extension.cjs.map"],
    });
  });

  it("reports missing and unexpected together, each sorted", () => {
    const actual = [
      ...EXPECTED_VSIX_FILES.filter(
        (name) =>
          name !== "extension/dist/worker.cjs" &&
          name !== "extension/package.json",
      ),
      "extension/src/b.ts",
      "extension/dist/worker.cjs.map",
      "extension/src/b.ts",
    ];

    expect(compareFileLists(actual)).toEqual({
      missing: ["extension/dist/worker.cjs", "extension/package.json"],
      unexpected: ["extension/dist/worker.cjs.map", "extension/src/b.ts"],
    });
  });
});
