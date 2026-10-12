import {
  ArrowFunction,
  ClassDeclaration,
  FunctionDeclaration,
  FunctionExpression,
  MethodDeclaration,
  Node,
  SourceFile,
  Project,
  SyntaxKind,
} from "ts-morph";
import {
  bindingOf,
  defaultExportOf,
  exportedFunctionOf,
} from "./bound-functions.js";

/** A class counts as the code that runs on `new`: its constructor and fields. */
export type CallableDeclaration =
  | FunctionDeclaration
  | ArrowFunction
  | FunctionExpression
  | MethodDeclaration
  | ClassDeclaration;

export type FocusTarget = {
  /** The callable itself — used for walking the body and reading types. */
  declaration: CallableDeclaration;
  /** The node whose text becomes the excerpt and whose range is jumped to. */
  textNode: Node;
  /**
   * Where the caller search starts: the name, or the `default` keyword of an
   * anonymous default export.
   */
  nameNode: Node;
  name: string;
  sourceFile: SourceFile;
};

/** The name of an anonymous default export, as in `src/page.tsx#default`. */
export const DEFAULT_EXPORT_NAME = "default";

export const isCallable = (node: Node): node is CallableDeclaration => {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isClassDeclaration(node)
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
  const fallback = defaultExportCallable(sourceFile);
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
 * Whether `node` sits in `target` itself rather than inside a named function
 * nested in it, matching how callers attribute a reference.
 */
export function belongsTo(node: Node, target: FocusTarget): boolean {
  for (
    let fn = node.getFirstAncestor(isCallable);
    fn;
    fn = fn.getFirstAncestor(isCallable)
  ) {
    if (fn === target.declaration) return true;
    if (nameableTarget(fn)) return false;
  }
  return false;
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

export function defaultExportCallable(
  sourceFile: SourceFile,
): CallableDeclaration | undefined {
  const declaration = sourceFile.getDefaultExportSymbol()?.getDeclarations()[0];
  if (!declaration) return undefined;

  // `export default function entry() {}` — the declaration is the callable.
  if (isCallable(declaration)) return declaration;

  // `export default entry`, `export default () => …`, `export default memo(fn)`
  if (Node.isExportAssignment(declaration)) {
    const target = declaration
      .getExpression()
      .getSymbol()
      ?.getDeclarations()[0];
    if (target && isCallable(target)) return target;
    return exportedFunctionOf(declaration);
  }

  return undefined;
}

export function toFocusTarget(
  declaration: CallableDeclaration,
  sourceFile: SourceFile,
): FocusTarget {
  if (
    Node.isFunctionDeclaration(declaration) ||
    Node.isMethodDeclaration(declaration) ||
    Node.isClassDeclaration(declaration)
  ) {
    const nameNode = declaration.getNameNode();
    if (nameNode && Node.isIdentifier(nameNode)) {
      return {
        declaration,
        textNode: declaration,
        nameNode,
        name: nameNode.getText(),
        sourceFile,
      };
    }
    // `export default function () {}` or `export default class {}`
    const keyword = Node.isMethodDeclaration(declaration)
      ? undefined
      : declaration.getFirstModifierByKind(SyntaxKind.DefaultKeyword);
    if (keyword) return defaultTarget(declaration, declaration, keyword);
    throw new Error(
      "Anonymous or computed-name declaration cannot be focused",
    );
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

  // `export default () => {}` or `export default memo(() => {})`
  const assignment = defaultExportOf(declaration);
  const keyword = assignment?.getFirstChildByKind(SyntaxKind.DefaultKeyword);
  if (assignment && keyword) {
    return defaultTarget(declaration, assignment, keyword);
  }

  throw new Error("Anonymous function expression cannot be focused");
}

function defaultTarget(
  declaration: CallableDeclaration,
  textNode: Node,
  keyword: Node,
): FocusTarget {
  return {
    declaration,
    textNode,
    nameNode: keyword,
    name: DEFAULT_EXPORT_NAME,
    sourceFile: declaration.getSourceFile(),
  };
}
