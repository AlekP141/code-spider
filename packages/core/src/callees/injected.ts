import { Node, type ParameterDeclaration } from "ts-morph";
import { callReturnsFunction, skipTypeOnly } from "../focus/bound-functions.js";
import { callerHits } from "../callers/callers.js";
import { findReferenceNodes } from "../callers/references.js";
import {
  isCallable,
  nameableTarget,
  nearestNameableTarget,
  type FocusTarget,
} from "../focus/focus.js";
import { resolveDeclaration } from "./graph-helpers.js";

/** A parameter or property can be fed by many callers; show the first few. */
export const MAX_INJECTED = 10;

/**
 * The functions that may stand behind a call on something the code was handed
 * rather than imported: a parameter, a property of an options or services
 * object, or a destructured name. They are the values the callers pass in or
 * the object literals assign, so each one is a guess, not a certainty.
 */
export function injectedTargetsOf(declaration: Node): FocusTarget[] {
  const targets = new Map<Node, FocusTarget>();
  const seen = new Set<Node>([declaration]);
  for (const value of suppliedValuesOf(declaration)) {
    follow(value, targets, seen, 0);
  }
  return [...targets.values()];
}

/** How many hand-overs (argument, property, const) are followed from one call. */
const MAX_FLOW_DEPTH = 8;

/**
 * Turns a supplied value into the function behind it. A value that is itself
 * a name handed in or held elsewhere (`createTool(generateSchema)`,
 * `const run = createX()`) is followed to what it was given.
 */
function follow(
  value: Node,
  targets: Map<Node, FocusTarget>,
  seen: Set<Node>,
  depth: number,
): void {
  if (targets.size >= MAX_INJECTED || depth > MAX_FLOW_DEPTH) return;
  const expression = skipAwait(value);
  const target = functionBehind(expression);
  if (target) {
    targets.set(target.declaration, target);
    return;
  }
  if (
    !Node.isIdentifier(expression) &&
    !Node.isPropertyAccessExpression(expression)
  ) {
    return;
  }
  const declaration = resolveDeclaration(expression);
  if (!declaration || seen.has(declaration)) return;
  seen.add(declaration);
  if (Node.isVariableDeclaration(declaration)) {
    const initializer = declaration.getInitializer();
    if (initializer) follow(initializer, targets, seen, depth + 1);
    return;
  }
  for (const next of suppliedValuesOf(declaration)) {
    follow(next, targets, seen, depth + 1);
  }
}

function skipAwait(value: Node): Node {
  const expression = skipTypeOnly(value);
  return Node.isAwaitExpression(expression)
    ? skipTypeOnly(expression.getExpression())
    : expression;
}

function suppliedValuesOf(declaration: Node): Node[] {
  if (Node.isParameterDeclaration(declaration)) {
    return Node.isIdentifier(declaration.getNameNode())
      ? argumentsFor(declaration)
      : [];
  }
  if (Node.isBindingElement(declaration)) {
    return assignedTo(
      declaration.getPropertyNameNode() ?? declaration.getNameNode(),
    );
  }
  if (
    Node.isPropertySignature(declaration) ||
    Node.isPropertyDeclaration(declaration) ||
    Node.isPropertyAssignment(declaration) ||
    Node.isMethodSignature(declaration)
  ) {
    return assignedTo(declaration.getNameNode());
  }
  return [];
}

/** What each call to the parameter's function passes in its place. */
function argumentsFor(parameter: ParameterDeclaration): Node[] {
  const fn = parameter.getParent();
  const owner = isCallable(fn) ? nameableTarget(fn) : undefined;
  if (!owner || !Node.isFunctionLikeDeclaration(fn)) return [];

  const index = fn.getParameters().indexOf(parameter);
  const values: Node[] = [];
  for (const hit of callerHits(owner.nameNode)) {
    if (hit.kind !== "call" || !Node.isCallExpression(hit.site)) continue;
    const argument = hit.site.getArguments()[index];
    if (argument) values.push(argument);
  }
  return values;
}

/** The values written to a property: `{ name: value }`, `{ name }` or `obj.name = value`. */
function assignedTo(nameNode: Node): Node[] {
  const values: Node[] = [];
  for (const ref of findReferenceNodes(nameNode)) {
    const parent = ref.getParent();
    if (Node.isPropertyAssignment(parent) && parent.getNameNode() === ref) {
      const value = parent.getInitializer();
      if (value) values.push(value);
    } else if (
      Node.isShorthandPropertyAssignment(parent) &&
      parent.getNameNode() === ref
    ) {
      values.push(ref);
    } else if (
      Node.isPropertyAccessExpression(parent) &&
      parent.getNameNode() === ref
    ) {
      const assignment = parent.getParent();
      if (
        Node.isBinaryExpression(assignment) &&
        assignment.getLeft() === parent &&
        assignment.getOperatorToken().getText() === "="
      ) {
        values.push(assignment.getRight());
      }
    }
  }
  return values;
}

/**
 * The named function whose code runs when `value` is called: the function
 * itself, the factory behind `createX(...)`, or for an inline arrow the
 * function it is written in, since that holds the arrow's calls.
 */
function functionBehind(value: Node): FocusTarget | undefined {
  const expression = skipTypeOnly(value);
  if (
    Node.isArrowFunction(expression) ||
    Node.isFunctionExpression(expression)
  ) {
    return nearestNameableTarget(expression);
  }
  if (Node.isCallExpression(expression)) {
    if (!callReturnsFunction(expression)) return undefined;
    return callableTarget(resolveDeclaration(expression.getExpression()));
  }
  if (
    Node.isIdentifier(expression) ||
    Node.isPropertyAccessExpression(expression)
  ) {
    return callableTarget(resolveDeclaration(expression));
  }
  return undefined;
}

function callableTarget(
  declaration: Node | undefined,
): FocusTarget | undefined {
  return declaration && isCallable(declaration)
    ? nameableTarget(declaration)
    : undefined;
}
