import { Node, type Type } from "ts-morph";
import { isExternalFile } from "./externals.js";
import {
  isCallable,
  nameableTarget,
  type CallableDeclaration,
} from "../focus/focus.js";
import {
  formatType,
  returnTypeLabel,
  returnTypeOf,
  unwrapPromise,
} from "./labels.js";
import type { NodeKind } from "../types.js";

const JSX_RETURN = /\bJSX\.Element\b|\bReactElement\b/;
const REACT_NODE_RETURN = /\bReact(Node|Portal)\b/;
const COMPONENT_NAME = /^[A-Z]/;

/**
 * The kind depends on the declaration alone, never on how it was reached, so
 * a node keeps one kind across every slice it appears in.
 */
export function classifyDeclaration(decl: Node): NodeKind {
  if (isExternalFile(decl.getSourceFile())) return "external";
  if (!isCallable(decl)) return "unknown";
  return isComponent(decl) ? "component" : "function";
}

/**
 * Spec §5.1: a function returning JSX, or one used as `<Foo/>`; a class
 * component is one whose `render` returns JSX. JSX treats
 * lowercase tags as intrinsic, so a usable component has a PascalCase name and
 * returns something React can render.
 */
function isComponent(decl: CallableDeclaration): boolean {
  if (Node.isClassDeclaration(decl)) {
    const render = decl.getInstanceMethod("render");
    const returns = render ? returnTypeLabel(render).text : "";
    return JSX_RETURN.test(returns) || REACT_NODE_RETURN.test(returns);
  }
  const returns = returnTypeLabel(decl).text;
  if (JSX_RETURN.test(returns)) return true;
  if (!COMPONENT_NAME.test(nameableTarget(decl)?.name ?? "")) return false;
  return (
    REACT_NODE_RETURN.test(returns) ||
    isRenderable(unwrapPromise(returnTypeOf(decl)).type, decl)
  );
}

function isRenderable(type: Type, context: Node): boolean {
  const parts = type.isUnion() ? type.getUnionTypes() : [type];
  return parts.every(
    (part) =>
      part.isString() ||
      part.isNumber() ||
      part.isBoolean() ||
      part.isLiteral() ||
      part.isNull() ||
      part.isUndefined() ||
      JSX_RETURN.test(formatType(part, context)),
  );
}
