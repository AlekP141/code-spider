import {
  Node,
  TypeFormatFlags,
  type ParameterDeclaration,
  type Type,
} from "ts-morph";
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
  const { type, isAsync } = unwrapPromise(returnTypeOf(decl));
  return { text: formatType(type, decl), isAsync };
}

/** What a call produces; for a class, the instance `new` constructs. */
export function returnTypeOf(decl: CallableDeclaration): Type {
  return Node.isClassDeclaration(decl) ? decl.getType() : decl.getReturnType();
}

export function inputTypeLabel(decl: CallableDeclaration): string {
  return parametersOf(decl)
    .map((p) => formatType(p.getType(), p))
    .join(", ");
}

/** A function's own type, the payload when it is passed rather than called. */
export function signatureLabel(decl: CallableDeclaration): string {
  const symbol = Node.isClassDeclaration(decl) ? decl.getSymbol() : undefined;
  const type = symbol ? symbol.getTypeAtLocation(decl) : decl.getType();
  return formatType(type, decl);
}

/** The first parameter, or for a class component the type of `this.props`. */
export function propsTypeLabel(decl: CallableDeclaration): string {
  const props = Node.isClassDeclaration(decl)
    ? decl.getType().getProperty("props")
    : undefined;
  if (props) return formatType(props.getTypeAtLocation(decl), decl);
  const first = parametersOf(decl)[0];
  return first ? formatType(first.getType(), first) : "";
}

function parametersOf(decl: CallableDeclaration): ParameterDeclaration[] {
  if (!Node.isClassDeclaration(decl)) return decl.getParameters();
  return decl.getConstructors()[0]?.getParameters() ?? [];
}
