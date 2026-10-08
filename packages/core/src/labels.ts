import { TypeFormatFlags, type Node, type Type } from "ts-morph";
import type { CallableDeclaration } from "./focus.js";

const FORMAT_FLAGS =
  TypeFormatFlags.NoTruncation |
  TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

export function formatType(type: Type, context: Node): string {
  return type.getText(context, FORMAT_FLAGS);
}

/** Strip one Promise wrapper, per spec §5.4. */
export function unwrapPromise(type: Type): { type: Type; isAsync: boolean } {
  const symbolName =
    type.getSymbol()?.getName() ?? type.getAliasSymbol()?.getName();
  if (symbolName === "Promise") {
    const args = type.getTypeArguments();
    const inner = args[0];
    if (args.length === 1 && inner) return { type: inner, isAsync: true };
  }
  return { type, isAsync: false };
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
