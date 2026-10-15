import { Node, SyntaxKind } from "ts-morph";

/**
 * Where `ref` hands its function over as a value instead of calling it, as
 * the node an edge's call site points at: `items.map(format)`,
 * `onClick={onClick}`, `{ handler: track }`, `[load, save]`, `return handler`,
 * `el.onclick = handler` or `save.bind(null, id)`. Imports, exports and type
 * positions are not passing.
 */
export function passSiteOf(ref: Node): Node | undefined {
  const value = outermostValueOf(ref);
  const parent = value.getParent();
  if (!parent) return undefined;

  if (Node.isPropertyAccessExpression(parent)) return bindCallOf(parent, value);
  if (Node.isCallExpression(parent) || Node.isNewExpression(parent)) {
    return parent.getArguments().some((arg) => arg === value)
      ? parent
      : undefined;
  }
  if (Node.isJsxExpression(parent)) {
    const attribute = parent.getParent();
    return Node.isJsxAttribute(attribute) ? attribute : undefined;
  }
  if (Node.isPropertyAssignment(parent)) {
    return parent.getInitializer() === value ? parent : undefined;
  }
  if (Node.isShorthandPropertyAssignment(parent)) return parent;
  if (Node.isArrayLiteralExpression(parent)) return value;
  if (Node.isReturnStatement(parent)) return parent;
  if (Node.isBinaryExpression(parent)) {
    const assigns =
      parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken;
    return assigns && parent.getRight() === value ? parent : undefined;
  }
  return undefined;
}

/** `ref`, or `obj.ref` when `ref` is a member name, without type assertions. */
export function outermostValueOf(ref: Node): Node {
  const parent = ref.getParent();
  let value =
    Node.isPropertyAccessExpression(parent) && parent.getNameNode() === ref
      ? parent
      : ref;
  for (
    let up = value.getParent();
    up && isTypeOnly(up);
    up = value.getParent()
  ) {
    value = up;
  }
  return value;
}

function bindCallOf(member: Node, value: Node): Node | undefined {
  if (!Node.isPropertyAccessExpression(member)) return undefined;
  if (member.getExpression() !== value || member.getName() !== "bind") {
    return undefined;
  }
  const call = member.getParent();
  return Node.isCallExpression(call) && call.getExpression() === member
    ? call
    : undefined;
}

function isTypeOnly(node: Node): boolean {
  return (
    Node.isParenthesizedExpression(node) ||
    Node.isAsExpression(node) ||
    Node.isSatisfiesExpression(node) ||
    Node.isNonNullExpression(node)
  );
}
