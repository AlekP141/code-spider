import ts from "typescript";

export type CallableDeclaration = {
  /** The short name the graph shows; `default` for an anonymous default export. */
  name: string;
  /** Zero-based line the lens is drawn above. */
  lensLine: number;
  /** Zero-based position inside the callable, where the analyser focuses. */
  line: number;
  character: number;
};

type FunctionLike = ts.ArrowFunction | ts.FunctionExpression;

/** Wrappers the analyser already follows (`const X = memo(() => ...)`). */
const WRAPPER_CALLEES = new Set(["memo", "forwardRef", "useCallback"]);

/**
 * Top-level functions, components, classes and class methods in a file. It
 * uses the syntax-only parser: no type checker, no project, so it is fast
 * enough to run on every CodeLens request. Functions nested inside other
 * functions are not listed; the keybinding still reaches them.
 */
export function findCallableDeclarations(
  text: string,
  fileName: string,
): CallableDeclaration[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    false,
  );
  if (sourceFile.isDeclarationFile) return [];
  const found: CallableDeclaration[] = [];

  const add = (name: string, unit: ts.Node, callable: ts.Node) => {
    const lens = positionOf(sourceFile, unit);
    const focus = positionOf(sourceFile, callable);
    found.push({
      name,
      lensLine: lens.line,
      line: focus.line,
      character: focus.character,
    });
  };

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      const name = declaredName(statement);
      if (statement.body && name) add(name, statement, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const callable = declaration.initializer
          ? functionLike(declaration.initializer)
          : undefined;
        if (callable && ts.isIdentifier(declaration.name)) {
          add(declaration.name.text, statement, callable);
        }
      }
    } else if (ts.isExportAssignment(statement)) {
      const callable = functionLike(statement.expression);
      if (callable) add("default", statement, callable);
    } else if (ts.isClassDeclaration(statement)) {
      const name = declaredName(statement);
      if (name) add(name, statement, statement);
      for (const member of statement.members) addMember(member, add);
    }
  }
  return found;
}

function addMember(
  member: ts.ClassElement,
  add: (name: string, unit: ts.Node, callable: ts.Node) => void,
): void {
  if (!member.name || !ts.isIdentifier(member.name)) return;
  if (ts.isMethodDeclaration(member) && member.body) {
    add(member.name.text, member, member);
  } else if (ts.isPropertyDeclaration(member) && member.initializer) {
    const callable = functionLike(member.initializer);
    if (callable) add(member.name.text, member, callable);
  }
}

function positionOf(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): ts.LineAndCharacter {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
}

function declaredName(
  node: ts.FunctionDeclaration | ts.ClassDeclaration,
): string | undefined {
  if (node.name) return node.name.text;
  const isDefault = ts
    .getModifiers(node)
    ?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
  return isDefault ? "default" : undefined;
}

/** The function an initialiser holds, looking through `as`, parentheses and known wrappers. */
function functionLike(expression: ts.Expression): FunctionLike | undefined {
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return expression;
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return functionLike(expression.expression);
  }
  if (ts.isCallExpression(expression) && isWrapper(expression.expression)) {
    const first = expression.arguments[0];
    return first ? functionLike(first) : undefined;
  }
  return undefined;
}

function isWrapper(callee: ts.Expression): boolean {
  if (ts.isIdentifier(callee)) return WRAPPER_CALLEES.has(callee.text);
  if (ts.isPropertyAccessExpression(callee)) {
    return WRAPPER_CALLEES.has(callee.name.text);
  }
  return false;
}
