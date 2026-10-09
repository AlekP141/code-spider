import {
  Node,
  SyntaxKind,
  type ClassDeclaration,
  type ClassExpression,
  type FunctionDeclaration,
  type MethodDeclaration,
  type SourceFile,
  ts,
} from "ts-morph";
import { boundFunctionOf, isBinding } from "./bound-functions.js";
import {
  DEFAULT_EXPORT_NAME,
  defaultExportCallable,
  isCallable,
  nameableTarget,
  type CallableDeclaration,
  type FocusTarget,
} from "./focus.js";

/**
 * The NodeId name of a target: its qualified name, plus its position among
 * callables in the file that share that qualified name.
 */
export function nodeNameOf(target: FocusTarget): {
  name: string;
  index: number;
} {
  const name = qualifiedNameOf(target);
  const index = targetsQualifiedAs(target.sourceFile, name).findIndex(
    (t) => t.declaration === target.declaration,
  );
  return { name, index: Math.max(index, 0) };
}

/**
 * Every callable in the file with this qualified name, in document order.
 * Overload signatures are skipped, since analyzeFocus focuses the
 * implementation.
 */
export function targetsQualifiedAs(
  sourceFile: SourceFile,
  qualifiedName: string,
): FocusTarget[] {
  const name = qualifiedName.slice(qualifiedName.lastIndexOf(".") + 1);
  return callablesNamed(sourceFile, name)
    .map(nameableTarget)
    .filter(
      (t): t is FocusTarget =>
        t !== undefined && qualifiedNameOf(t) === qualifiedName,
    );
}

/**
 * The short name behind each named class and function holding the target,
 * as in `Worker.run` or `Shell.onClick`. Anonymous callbacks add nothing.
 */
function qualifiedNameOf(target: FocusTarget): string {
  const names = [target.name];
  let at: Node | undefined = target.declaration.getParent();
  for (; at; at = at.getParent()) {
    const name = containerName(at);
    if (name) names.unshift(name);
  }
  return names.join(".");
}

function containerName(node: Node): string | undefined {
  if (Node.isClassDeclaration(node) || Node.isClassExpression(node)) {
    return className(node);
  }
  if (isCallable(node)) return nameableTarget(node)?.name;
  return undefined;
}

function className(
  node: ClassDeclaration | ClassExpression,
): string | undefined {
  const name = node.getName();
  if (name) return name;
  if (Node.isClassDeclaration(node) && node.isDefaultExport()) return "default";
  const parent = node.getParent();
  return Node.isVariableDeclaration(parent) ? parent.getName() : undefined;
}

function callablesNamed(
  sourceFile: SourceFile,
  name: string,
): CallableDeclaration[] {
  if (name === DEFAULT_EXPORT_NAME) {
    const exported = defaultExportCallable(sourceFile);
    return exported ? [exported] : [];
  }
  return declarationsNamed(sourceFile, name).flatMap((declaration) => {
    if (isBinding(declaration)) return boundFunctionOf(declaration) ?? [];
    if (Node.isClassDeclaration(declaration)) return declaration;
    const isDeclared =
      Node.isFunctionDeclaration(declaration) ||
      Node.isMethodDeclaration(declaration);
    return isDeclared && !isOverloadSignature(declaration) ? declaration : [];
  });
}

const DECLARATION_KINDS = new Set([
  SyntaxKind.ClassDeclaration,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.VariableDeclaration,
  SyntaxKind.PropertyDeclaration,
]);

/**
 * Walks the raw syntax tree, which is far cheaper than ts-morph's wrapped
 * nodes, and wraps only the declarations whose identifier matches.
 */
function declarationsNamed(sourceFile: SourceFile, name: string): Node[] {
  const file = sourceFile.compilerNode;
  const starts: number[] = [];
  const visit = (node: ts.Node): void => {
    if (DECLARATION_KINDS.has(node.kind)) {
      const nameNode = (node as ts.NamedDeclaration).name;
      if (nameNode && ts.isIdentifier(nameNode) && nameNode.text === name) {
        starts.push(nameNode.getStart(file));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return starts.flatMap(
    (pos) => sourceFile.getDescendantAtPos(pos)?.getParent() ?? [],
  );
}

/** Bodiless, with an implementation alongside; a lone `declare` is not one. */
function isOverloadSignature(
  callable: FunctionDeclaration | MethodDeclaration,
): boolean {
  return callable.isOverload() && callable.getImplementation() !== undefined;
}
