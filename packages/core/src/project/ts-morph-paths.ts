import { createRequire } from "node:module";

type GetStandardizedAbsolutePath = (
  fileSystem: unknown,
  fileOrDirPath: string,
  relativeBase?: string,
) => string;

type FileUtils = {
  getStandardizedAbsolutePath: GetStandardizedAbsolutePath;
  pathIsAbsolute(fileOrDirPath: string): boolean;
};

const MEMOISED = Symbol.for("code-spider.memoised-paths");

/**
 * ts-morph's compiler host canonicalises every path TypeScript looks up with
 * `path.normalize`, on every call, which made module resolution dominate warm
 * reference searches. For an absolute path the result depends on the string
 * alone, so it is cached. Returns false if ts-morph no longer exposes it.
 */
export function memoiseTsMorphPaths(): boolean {
  const fileUtils = loadFileUtils();
  if (!fileUtils) return false;
  const original = fileUtils.getStandardizedAbsolutePath;
  if (MEMOISED in original) return true;

  const cache = new Map<string, string>();
  const memoised: GetStandardizedAbsolutePath = (fs, path, base) => {
    if (!fileUtils.pathIsAbsolute(path)) {
      return original.call(fileUtils, fs, path, base);
    }
    let standardized = cache.get(path);
    if (standardized === undefined) {
      standardized = original.call(fileUtils, fs, path, base);
      cache.set(path, standardized);
    }
    return standardized;
  };
  fileUtils.getStandardizedAbsolutePath = Object.assign(memoised, {
    [MEMOISED]: true,
  });
  return true;
}

/** Resolved from ts-morph's own location, so it is the instance ts-morph uses. */
function loadFileUtils(): FileUtils | undefined {
  try {
    const require = createRequire(import.meta.url);
    const fromTsMorph = createRequire(require.resolve("ts-morph"));
    const { FileUtils } = fromTsMorph("@ts-morph/common") as {
      FileUtils?: Partial<FileUtils>;
    };
    const usable =
      typeof FileUtils?.getStandardizedAbsolutePath === "function" &&
      typeof FileUtils.pathIsAbsolute === "function";
    return usable ? (FileUtils as FileUtils) : undefined;
  } catch {
    return undefined;
  }
}
