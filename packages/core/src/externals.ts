import type { SourceFile } from "ts-morph";
import { toPosixPath } from "./node-id.js";

const NODE_MODULES = "/node_modules/";

export function isExternalFile(sourceFile: SourceFile): boolean {
  return (
    isDefaultLibFile(sourceFile) ||
    toPosixPath(sourceFile.getFilePath()).includes(NODE_MODULES)
  );
}

/** The compiler's own lib files: lib.dom.d.ts, lib.es2022.d.ts, ... */
export function isDefaultLibFile(sourceFile: SourceFile): boolean {
  const program = sourceFile.getProject().getProgram().compilerObject;
  return program.isSourceFileDefaultLibrary(sourceFile.compilerNode);
}

export function externalModuleOf(sourceFile: SourceFile): string {
  if (isDefaultLibFile(sourceFile)) return "lib";
  const posix = toPosixPath(sourceFile.getFilePath());
  const at = posix.lastIndexOf(NODE_MODULES);
  if (at === -1) return "lib";

  const [first = "", second] = posix.slice(at + NODE_MODULES.length).split("/");
  return first.startsWith("@") && second ? `${first}/${second}` : first;
}
