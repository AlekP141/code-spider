import { Node, type CallExpression, type NewExpression } from "ts-morph";

const CALL_APPLY = new Set(["call", "apply"]);

/**
 * The call a reference invokes: `f()`, `new F()`, `obj.f()`, `f.call(...)`,
 * `f.apply(...)` or `obj.f.call(...)`. Imports, type positions and other
 * members such as `f.toString()` are not calls.
 */
export function callOf(ref: Node): CallExpression | NewExpression | undefined {
  const direct = invokerOf(ref) ?? callApplyOn(ref);
  if (direct) return direct;
  const parent = ref.getParent();
  if (
    Node.isPropertyAccessExpression(parent) &&
    parent.getExpression() !== ref
  ) {
    return invokerOf(parent) ?? callApplyOn(parent);
  }
  return undefined;
}

/** The call that invokes `expr` directly, as in `expr()` or `new expr()`. */
function invokerOf(expr: Node): CallExpression | NewExpression | undefined {
  const parent = expr.getParent();
  if (!Node.isCallExpression(parent) && !Node.isNewExpression(parent)) {
    return undefined;
  }
  return parent.getExpression() === expr ? parent : undefined;
}

/** For `expr.call(...)` or `expr.apply(...)`, the call of that member. */
function callApplyOn(expr: Node): CallExpression | NewExpression | undefined {
  const parent = expr.getParent();
  if (!Node.isPropertyAccessExpression(parent)) return undefined;
  if (parent.getExpression() !== expr) return undefined;
  return CALL_APPLY.has(parent.getName()) ? invokerOf(parent) : undefined;
}
