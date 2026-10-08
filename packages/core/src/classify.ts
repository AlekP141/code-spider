import type { Node } from "ts-morph";
import { isExternalFile } from "./externals.js";
import { isCallable } from "./focus.js";
import { returnTypeLabel } from "./labels.js";
import type { NodeKind } from "./types.js";

const JSX_RETURN = /\bJSX\.Element\b|\bReactElement\b/;

export function classifyDeclaration(decl: Node): NodeKind {
  if (isExternalFile(decl.getSourceFile())) return "external";
  if (!isCallable(decl)) return "unknown";
  return JSX_RETURN.test(returnTypeLabel(decl).text) ? "component" : "function";
}
