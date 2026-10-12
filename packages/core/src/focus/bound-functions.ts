import {
  Node,
  SyntaxKind,
  VariableDeclarationKind,
  type ArrowFunction,
  type ExportAssignment,
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
  return initializer && functionHeldBy(initializer, binding);
}

/** The same for `export default () => …` or `export default memo(fn)`. */
export function exportedFunctionOf(
  assignment: ExportAssignment,
): FunctionValue | undefined {
  if (assignment.isExportEquals()) return undefined;
  const expression = assignment.getExpression();
  return functionHeldBy(expression, expression);
}

function functionHeldBy(
  value: Node,
  holder: Node,
): FunctionValue | undefined {
  const unwrapped = skipTypeOnly(value);
  if (isFunctionValue(unwrapped)) return unwrapped;
  const wrapped = wrappedFunctionOf(unwrapped);
  return wrapped && isCallableValue(holder) ? wrapped : undefined;
}

/** How many `const a = b` hops are followed; also stops alias cycles. */
export const MAX_ALIAS_DEPTH = 8;

/**
 * For `const alias = cn` or `const save = api.save`, the expression aliased.
 * A `let` can be reassigned, so it is never an alias.
 */
export function aliasedExpressionOf(binding: Binding): Node | undefined {
  if (!Node.isVariableDeclaration(binding)) return undefined;
  const list = binding.getParentIfKind(SyntaxKind.VariableDeclarationList);
  if (list?.getDeclarationKind() !== VariableDeclarationKind.Const) {
    return undefined;
  }
  const initializer = binding.getInitializer();
  const value = initializer && skipTypeOnly(initializer);
  return Node.isIdentifier(value) || Node.isPropertyAccessExpression(value)
    ? value
    : undefined;
}

/** The const that aliases `ref`, as `alias` in `const alias = ref`. */
export function aliasDeclaredBy(ref: Node): VariableDeclaration | undefined {
  const parent = ref.getParent();
  const value =
    Node.isPropertyAccessExpression(parent) && parent.getNameNode() === ref
      ? parent
      : ref;
  let holder = value.getParent();
  while (holder && isTypeOnly(holder)) holder = holder.getParent();
  return Node.isVariableDeclaration(holder) &&
    aliasedExpressionOf(holder) === value
    ? holder
    : undefined;
}

export function isBinding(node: Node | undefined): node is Binding {
  return Node.isVariableDeclaration(node) || Node.isPropertyDeclaration(node);
}

/** The binding that holds `fn`, per boundFunctionOf. */
export function bindingOf(fn: FunctionValue): Binding | undefined {
  const holder = holderOf(fn);
  return isBinding(holder) && boundFunctionOf(holder) === fn
    ? holder
    : undefined;
}

/** The `export default` that holds `fn`, per exportedFunctionOf. */
export function defaultExportOf(
  fn: FunctionValue,
): ExportAssignment | undefined {
  const holder = holderOf(fn);
  return Node.isExportAssignment(holder) && exportedFunctionOf(holder) === fn
    ? holder
    : undefined;
}

/** The first node above `fn` that is not a type assertion or wrapper call. */
function holderOf(fn: FunctionValue): Node | undefined {
  let node: Node = fn;
  let parent = node.getParent();
  while (parent && (isTypeOnly(parent) || isArgumentOf(parent, node))) {
    node = parent;
    parent = node.getParent();
  }
  return parent;
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

function isCallableValue(holder: Node): boolean {
  return holder.getType().getCallSignatures().length > 0;
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
