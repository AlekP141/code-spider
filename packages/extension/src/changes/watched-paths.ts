export const SOURCE_EXTENSIONS: readonly string[] = [
  "ts",
  "tsx",
  "mts",
  "cts",
  "js",
  "jsx",
  "mjs",
  "cjs",
];

export const SOURCE_WATCH_GLOB = `**/*.{${SOURCE_EXTENSIONS.join(",")}}`;
export const CONFIG_WATCH_GLOB = "**/{tsconfig,jsconfig}*.json";

const CONFIG_NAME = /^(?:ts|js)config.*\.json$/;

function segmentsOf(path: string): string[] {
  return path.split(/[\\/]/);
}

export function isConfigFile(path: string): boolean {
  return CONFIG_NAME.test(segmentsOf(path).pop() ?? "");
}

export function isTrackedPath(path: string): boolean {
  const segments = segmentsOf(path);
  if (segments.includes("node_modules")) return false;
  if (isConfigFile(path)) return true;
  const name = segments.pop() ?? "";
  const dot = name.lastIndexOf(".");
  const extension = name.slice(dot + 1).toLowerCase();
  return dot >= 0 && SOURCE_EXTENSIONS.includes(extension);
}
