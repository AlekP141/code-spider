import {
  Node,
  type ArrowFunction,
  type FunctionExpression,
  type VariableDeclaration,
} from "ts-morph";

export type FunctionValue = ArrowFunction | FunctionExpression;

/**
 * The function a const is bound to: `const f = () => …`, behind parentheses,
 * `as` or `satisfies`, or wrapped as in `memo(forwardRef(fn))`. A wrapped
 * function counts only when the const itself is callable, so
 * `const xs = arr.map(cb)` is not bound to `cb`.
 */
export function boundFunctionOf(
  variable: VariableDeclaration,
): FunctionValue | undefined {
  const initializer = variable.getInitializer();
  if (!initializer) return undefined;
  const value = skipTypeOnly(initializer);
  if (isFunctionValue(value)) return value;
  const wrapped = wrappedFunctionOf(value);
  return wrapped && isCallableValue(variable) ? wrapped : undefined;
}

/** The const that `fn` is bound to, per boundFunctionOf. */
export function bindingOf(fn: FunctionValue): VariableDeclaration | undefined {
  let node: Node = fn;
  let parent = node.getParent();
  while (parent && (isTypeOnly(parent) || isArgumentOf(parent, node))) {
    node = parent;
    parent = node.getParent();
  }
  return Node.isVariableDeclaration(parent) && boundFunctionOf(parent) === fn
    ? parent
    : undefined;
}

export function isFunctionValue(
  node: Node | undefined,
): node is FunctionValue {
  return Node.isArrowFunction(node) || Node.isFunctionExpression(node);
}

/** The first function passed to `call`, searching nested wrapper calls. */
function wrappedFunctionOf(call: Node): FunctionValue | undefined {
  if (!Node.isCallExpression(call)) return undefined;
  for (const arg of call.getArguments()) {
    const value = skipTypeOnly(arg);
    const found = isFunctionValue(value) ? value : wrappedFunctionOf(value);
    if (found) return found;
  }
  return undefined;
}

function isCallableValue(variable: VariableDeclaration): boolean {
  return variable.getType().getCallSignatures().length > 0;
}

function isArgumentOf(parent: Node, node: Node): boolean {
  return (
    Node.isCallExpression(parent) &&
    parent.getArguments().some((arg) => arg === node)
  );
}

function skipTypeOnly(node: Node): Node {
  return isTypeOnly(node) ? skipTypeOnly(node.getExpression()) : node;
}

function isTypeOnly(node: Node): node is Node & { getExpression(): Node } {
  return (
    Node.isParenthesizedExpression(node) ||
    Node.isAsExpression(node) ||
    Node.isSatisfiesExpression(node) ||
    Node.isNonNullExpression(node) ||
    Node.isTypeAssertion(node)
  );
}
