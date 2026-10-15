import { Node, SyntaxKind, type ts } from "ts-morph";
import { outermostValueOf } from "../callees/passing.js";
import {
  belongsTo,
  nameableTarget,
  nearestNameableTarget,
  type FocusTarget,
} from "../focus/focus.js";
import { isExternalFile } from "../nodes/externals.js";
import type { CallerHit } from "./callers.js";
import { callOf } from "./call-of.js";
import { findReferenceNodes } from "./references.js";

/**
 * The function value `ref` stands for where it is handed over: the function
 * itself, or the result of calling it when that result is itself a function
 * (`createX()`).
 */
function valueOf(ref: Node): Node {
  const value = outermostValueOf(ref);
  const parent = value.getParent();
  const isFactoryCall =
    Node.isCallExpression(parent) &&
    parent.getExpression() === value &&
    parent.getType().getCallSignatures().length > 0;
  return isFactoryCall ? parent : value;
}

/**
 * The name of the parameter or property that receives `value`: `f(value)`,
 * `{ name: value }`, `{ name }` or `obj.name = value`.
 */
function receiverOf(value: Node): Node | undefined {
  const parent = value.getParent();
  if (Node.isCallExpression(parent) || Node.isNewExpression(parent)) {
    const index = parent.getArguments().indexOf(value);
    const declaration =
      index === -1
        ? undefined
        : parent
            .getProject()
            .getTypeChecker()
            .getResolvedSignature(parent)
            ?.getDeclaration();
    if (!declaration || isExternalFile(declaration.getSourceFile())) {
      return undefined;
    }
    const parameter = Node.isFunctionLikeDeclaration(declaration)
      ? declaration.getParameters()[index]
      : undefined;
    const name = parameter?.getNameNode();
    return Node.isIdentifier(name) ? name : undefined;
  }
  if (Node.isPropertyAssignment(parent)) {
    return parent.getInitializer() === value ? parent.getNameNode() : undefined;
  }
  if (Node.isShorthandPropertyAssignment(parent)) return parent.getNameNode();
  if (
    Node.isBinaryExpression(parent) &&
    parent.getRight() === value &&
    parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken
  ) {
    const left = parent.getLeft();
    return Node.isPropertyAccessExpression(left)
      ? left.getNameNode()
      : undefined;
  }
  return undefined;
}

/** Calls of the received name, including through `const { name } = obj`. */
function* callsOf(
  receiver: Node,
  token: ts.CancellationToken | undefined,
  depth = 0,
): Iterable<Node> {
  for (const ref of findReferenceNodes(receiver, token)) {
    if (ref === receiver) continue;
    const call = callOf(ref);
    if (call) {
      yield ref;
      continue;
    }
    const binding = ref.getParent();
    if (depth === 0 && Node.isBindingElement(binding)) {
      yield* callsOf(binding.getNameNode(), token, 1);
    }
  }
}

function hitFor(ref: Node): CallerHit | undefined {
  const call = callOf(ref);
  if (!call) return undefined;
  return {
    ref,
    kind: "injected",
    site: call,
    caller: nearestNameableTarget(ref),
    sourceFile: ref.getSourceFile(),
  };
}

function* hitsReceiving(
  value: Node,
  token: ts.CancellationToken | undefined,
): Iterable<CallerHit> {
  const receiver = receiverOf(value);
  if (!receiver) return;
  for (const ref of callsOf(receiver, token)) {
    const hit = hitFor(ref);
    if (hit) yield hit;
  }
}

/**
 * The calls that may reach the function behind `ref` because it is handed to
 * a parameter or property and called there.
 */
export function* injectedHitsFrom(
  ref: Node,
  token?: ts.CancellationToken,
): Iterable<CallerHit> {
  yield* hitsReceiving(valueOf(ref), token);
}

/**
 * The same for callbacks written inside the function: an inline arrow that
 * the function passes on runs when the receiver calls it, so the receiver's
 * callers reach the function that holds the arrow.
 */
export function* hostedFunctionHits(
  target: FocusTarget,
  token?: ts.CancellationToken,
): Iterable<CallerHit> {
  const inline = [
    ...target.declaration.getDescendantsOfKind(SyntaxKind.ArrowFunction),
    ...target.declaration.getDescendantsOfKind(SyntaxKind.FunctionExpression),
  ];
  for (const fn of inline) {
    if (nameableTarget(fn) || !belongsTo(fn, target)) continue;
    yield* hitsReceiving(fn, token);
  }
}
