import { Node, type ParameterDeclaration } from "ts-morph";
import { skipTypeOnly } from "../focus/bound-functions.js";
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
  for (const value of suppliedValuesOf(declaration)) {
    const target = functionBehind(value);
    if (target) targets.set(target.declaration, target);
    if (targets.size >= MAX_INJECTED) break;
  }
  return [...targets.values()];
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
    if (expression.getType().getCallSignatures().length === 0) return undefined;
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
