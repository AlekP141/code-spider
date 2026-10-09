import {
  Node,
  type ArrowFunction,
  type FunctionExpression,
  type PropertyDeclaration,
  type VariableDeclaration,
} from "ts-morph";

export type FunctionValue = ArrowFunction | FunctionExpression;

/** A const or class property whose initializer may hold a function. */
export type Binding = VariableDeclaration | PropertyDeclaration;

/**
 * The function a binding holds: `const f = () => …` or `run = () => …` in a
 * class, behind parentheses, `as` or `satisfies`, or wrapped as in
 * `memo(forwardRef(fn))`. A wrapped function counts only when the binding
 * itself is callable, so `const xs = arr.map(cb)` is not bound to `cb`.
 */
export function boundFunctionOf(binding: Binding): FunctionValue | undefined {
  const initializer = binding.getInitializer();
  if (!initializer) return undefined;
  const value = skipTypeOnly(initializer);
  if (isFunctionValue(value)) return value;
  const wrapped = wrappedFunctionOf(value);
  return wrapped && isCallableValue(binding) ? wrapped : undefined;
}

export function isBinding(node: Node | undefined): node is Binding {
  return Node.isVariableDeclaration(node) || Node.isPropertyDeclaration(node);
}

/** The binding that holds `fn`, per boundFunctionOf. */
export function bindingOf(fn: FunctionValue): Binding | undefined {
  let node: Node = fn;
  let parent = node.getParent();
  while (parent && (isTypeOnly(parent) || isArgumentOf(parent, node))) {
    node = parent;
    parent = node.getParent();
  }
  return isBinding(parent) && boundFunctionOf(parent) === fn
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

function isCallableValue(binding: Binding): boolean {
  return binding.getType().getCallSignatures().length > 0;
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
