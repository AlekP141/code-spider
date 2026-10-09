import {
  ArrowFunction,
  FunctionDeclaration,
  FunctionExpression,
  MethodDeclaration,
  Identifier,
  Node,
  SourceFile,
  Project,
} from "ts-morph";
import { bindingOf } from "./bound-functions.js";

export type CallableDeclaration =
  | FunctionDeclaration
  | ArrowFunction
  | FunctionExpression
  | MethodDeclaration;

export type FocusTarget = {
  /** The callable itself — used for walking the body and reading types. */
  declaration: CallableDeclaration;
  /** The node whose text becomes the excerpt and whose range is jumped to. */
  textNode: Node;
  /** The identifier whose references are the callers. */
  nameNode: Identifier;
  name: string;
  sourceFile: SourceFile;
};

export const isCallable = (node: Node): node is CallableDeclaration => {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node) ||
    Node.isMethodDeclaration(node)
  );
};

export const resolveFocus = (
  project: Project,
  filePath: string,
  offset: number,
): FocusTarget => {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) throw new Error(`File is not in project: ${filePath}`);

  const at = sourceFile.getDescendantAtPos(offset);
  const enclosing = at && nearestNameableTarget(at);
  if (enclosing) return enclosing;

  // Spec §6 step 1: with no enclosing callable, fall back to the default export.
  const fallback = findDefaultExportCallable(sourceFile);
  if (fallback) return toFocusTarget(fallback, sourceFile);

  throw new Error(
    `No callable found at ${filePath}:${offset}, and no default export`,
  );
};

/**
 * The innermost callable around `node` that can be named in the graph.
 * Anonymous callbacks are skipped, so they belong to the function holding them.
 */
export function nearestNameableTarget(node: Node): FocusTarget | undefined {
  for (
    let fn = isCallable(node) ? node : node.getFirstAncestor(isCallable);
    fn;
    fn = fn.getFirstAncestor(isCallable)
  ) {
    const target = nameableTarget(fn);
    if (target) return target;
  }
  return undefined;
}

/**
 * toFocusTarget throws for callables it cannot name (anonymous functions,
 * private `#names`, computed keys); this returns undefined instead.
 */
export function nameableTarget(
  declaration: CallableDeclaration,
): FocusTarget | undefined {
  try {
    return toFocusTarget(declaration, declaration.getSourceFile());
  } catch {
    return undefined;
  }
}

function findDefaultExportCallable(
  sourceFile: SourceFile,
): CallableDeclaration | undefined {
  const declaration = sourceFile.getDefaultExportSymbol()?.getDeclarations()[0];
  if (!declaration) return undefined;

  // `export default function entry() {}` — the declaration is the callable.
  if (isCallable(declaration)) return declaration;

  // `export default entry` — an ExportAssignment pointing at an identifier.
  if (Node.isExportAssignment(declaration)) {
    const target = declaration
      .getExpression()
      .getSymbol()
      ?.getDeclarations()[0];
    if (target && isCallable(target)) return target;
  }

  return undefined;
}

export function toFocusTarget(
  declaration: CallableDeclaration,
  sourceFile: SourceFile,
): FocusTarget {
  if (
    Node.isFunctionDeclaration(declaration) ||
    Node.isMethodDeclaration(declaration)
  ) {
    const nameNode = declaration.getNameNode();
    if (!nameNode || !Node.isIdentifier(nameNode)) {
      throw new Error(
        "Anonymous or computed-name declaration cannot be focused",
      );
    }
    return {
      declaration,
      textNode: declaration,
      nameNode,
      name: nameNode.getText(),
      sourceFile,
    };
  }
  // Arrow functions and function expressions are anonymous; the name (and the
  // text worth showing) lives on the const or class property holding them.
  const binding = bindingOf(declaration);
  if (binding) {
    const nameNode = binding.getNameNode();
    if (!Node.isIdentifier(nameNode)) {
      throw new Error("Destructured or private bindings cannot be focused");
    }
    return {
      declaration,
      // `const x = () => {}` — the arrow's own text omits `const x =`, so the
      // excerpt and jump range come from the enclosing statement.
      textNode: Node.isVariableDeclaration(binding)
        ? (binding.getVariableStatement() ?? binding)
        : binding,
      nameNode,
      name: nameNode.getText(),
      sourceFile,
    };
  }

  throw new Error("Anonymous function expression cannot be focused");
}
