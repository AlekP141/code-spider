import { basename } from "node:path";
import type { Node } from "ts-morph";
import { isCallable } from "./focus.js";
import { returnTypeLabel } from "./labels.js";
import { toPosixPath } from "./node-id.js";
import type { NodeKind } from "./types.js";

// TypeScript's own lib files: lib.dom.d.ts, lib.es2022.d.ts, ...
const LIB_FILE = /^lib\..*\.d\.ts$/;

export function isExternalPath(filePath: string): boolean {
  const posix = toPosixPath(filePath);
  if (posix.includes("/node_modules/")) return true;
  return LIB_FILE.test(basename(posix));
}

export function externalModuleOf(filePath: string): string {
  const posix = toPosixPath(filePath);
  // ts-morph serves lib files from a virtual /node_modules/typescript/lib/
  // path, so the lib file name must be checked before the package lookup.
  if (LIB_FILE.test(basename(posix))) return "lib";
  const marker = "/node_modules/";
  const at = posix.lastIndexOf(marker);
  if (at === -1) return "lib";

  const rest = posix.slice(at + marker.length).split("/");
  const first = rest[0] ?? "";
  if (first.startsWith("@")) return `${first}/${rest[1] ?? ""}`;
  return first;
}

const JSX_RETURN = /\bJSX\.Element\b|\bReactElement\b/;

export function classifyDeclaration(decl: Node): NodeKind {
  if (isExternalPath(decl.getSourceFile().getFilePath())) return "external";
  if (!isCallable(decl)) return "unknown";
  return JSX_RETURN.test(returnTypeLabel(decl).text) ? "component" : "function";
}
