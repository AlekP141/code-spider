import type { GraphSlice } from "@code-spider/core/types";
import { makeEdge, makeNode, makeSlice, readGolden, site } from "./slices.js";

export const CENTRE = "src/signup.ts#handleSignup";
export const MAIN = "src/app.ts#main";

export const signupSlice = (): GraphSlice =>
  readGolden("basic-handleSignup.json");

/**
 * `main` expanded: it calls `before` functions ahead of the centre and `after`
 * functions behind it, all `lineCount` lines long.
 */
export function mainSlice(
  before: number,
  after: number,
  lineCount: number,
): GraphSlice {
  const golden = signupSlice();
  const centreNode = golden.nodes.find((node) => node.id === CENTRE);
  const mainNode = golden.nodes.find((node) => node.id === MAIN);
  const centreEdge = golden.edges.find(
    (edge) => edge.from === CENTRE && edge.to === MAIN,
  );
  if (!centreNode || !mainNode || !centreEdge) throw new Error("golden");
  const named = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `src/app.ts#${prefix}${index}`);
  const ahead = named("b", before);
  const behind = named("a", after);
  const nodes = [...ahead, ...behind].map((id) => makeNode({ id, lineCount }));
  const calls = [
    ...ahead.map((id, index) =>
      makeEdge(id, MAIN, { callSite: site(1, index + 1) }),
    ),
    ...behind.map((id, index) =>
      makeEdge(id, MAIN, { callSite: site(20, index + 1) }),
    ),
  ];
  return makeSlice(
    MAIN,
    [mainNode, centreNode, ...nodes],
    [centreEdge, ...calls],
  );
}

export const SHAPES = [0, 1, 2, 3].flatMap((before) =>
  [0, 1, 2, 3].map((after) => ({ before, after })),
);
