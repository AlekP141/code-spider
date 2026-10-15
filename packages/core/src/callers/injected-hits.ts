import { Node, SyntaxKind, type ts } from "ts-morph";
import { callReturnsFunction } from "../focus/bound-functions.js";
import { outermostValueOf } from "../callees/passing.js";
import { nearestNameableTarget } from "../focus/focus.js";
import { isExternalFile } from "../nodes/externals.js";
import { isTestPath } from "../nodes/test-path.js";
import type { CallerHit } from "./callers.js";
import { callOf } from "./call-of.js";
import { findReferenceNodes } from "./references.js";

/**
 * The function value `ref` stands for where it is handed over: the function
 * itself, or the result of calling it when that result is itself a function,
 * possibly behind a promise (`createX()`, `await createX()`).
 */
function valueOf(ref: Node): Node {
  const value = outermostValueOf(ref);
  const call = value.getParent();
  if (
    !Node.isCallExpression(call) ||
    call.getExpression() !== value ||
    !callReturnsFunction(call)
  ) {
    return value;
  }
  const awaited = call.getParent();
  return Node.isAwaitExpression(awaited) ? awaited : call;
}

/**
 * The name of the parameter, property or variable that receives `value`:
 * `f(value)`, `{ name: value }`, `{ name }`, `obj.name = value` or
 * `const name = value`.
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
  if (Node.isVariableDeclaration(parent)) {
    const name = parent.getNameNode();
    return parent.getInitializer() === value && Node.isIdentifier(name)
      ? name
      : undefined;
  }
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

/** How many hand-overs (argument, property, const) are followed from one function. */
const MAX_FLOW_DEPTH = 8;

/**
 * Calls of the received name, followed on through `const { name } = obj`
 * and wherever the name is handed over again.
 */
function* callsOf(
  receiver: Node,
  token: ts.CancellationToken | undefined,
  seen = new Set<Node>(),
  depth = 0,
): Iterable<Node> {
  if (seen.has(receiver) || depth > MAX_FLOW_DEPTH) return;
  seen.add(receiver);
  for (const ref of findReferenceNodes(receiver, token)) {
    if (ref === receiver) continue;
    if (callOf(ref)) {
      yield ref;
      continue;
    }
    const binding = ref.getParent();
    if (Node.isBindingElement(binding)) {
      yield* callsOf(binding.getNameNode(), token, seen, depth + 1);
      continue;
    }
    const next = receiverOf(valueOf(ref));
    if (next) yield* callsOf(next, token, seen, depth + 1);
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
 * a parameter or property and called there. Test code that wires a function
 * in is skipped: it would make the production caller look like a user of it.
 */
export function* injectedHitsFrom(
  ref: Node,
  token?: ts.CancellationToken,
): Iterable<CallerHit> {
  if (isTestPath(ref.getSourceFile().getFilePath())) return;
  yield* hitsReceiving(valueOf(ref), token);
}
