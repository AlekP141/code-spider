import { TypeFormatFlags, type Node, type Type } from "ts-morph";
import { isDefaultLibFile } from "./externals.js";
import type { CallableDeclaration } from "./focus.js";

const FORMAT_FLAGS =
  TypeFormatFlags.NoTruncation |
  TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

export function formatType(type: Type, context: Node): string {
  return type.getText(context, FORMAT_FLAGS);
}

/** Strip one Promise wrapper, per spec §5.4. */
export function unwrapPromise(type: Type): { type: Type; isAsync: boolean } {
  if (isLibPromise(type)) {
    const args = type.getTypeArguments();
    const inner = args[0];
    if (args.length === 1 && inner) return { type: inner, isAsync: true };
  }
  return { type, isAsync: false };
}

function isLibPromise(type: Type): boolean {
  const symbol = type.getSymbol() ?? type.getAliasSymbol();
  if (symbol?.getName() !== "Promise") return false;
  return symbol
    .getDeclarations()
    .some((d) => isDefaultLibFile(d.getSourceFile()));
}

export function returnTypeLabel(decl: CallableDeclaration): {
  text: string;
  isAsync: boolean;
} {
  const { type, isAsync } = unwrapPromise(decl.getReturnType());
  return { text: formatType(type, decl), isAsync };
}

export function inputTypeLabel(decl: CallableDeclaration): string {
  return decl
    .getParameters()
    .map((p) => formatType(p.getType(), p))
    .join(", ");
}

/** A function's own type, the payload when it is passed rather than called. */
export function signatureLabel(decl: CallableDeclaration): string {
  return formatType(decl.getType(), decl);
}

export function propsTypeLabel(decl: CallableDeclaration): string {
  const props = decl.getParameters()[0];
  return props ? formatType(props.getType(), props) : "";
}
