import type { PathSummary } from "@code-spider/core/types";
import type { PathSearch } from "../host/protocol.js";
import type { GraphState } from "../view/types.js";

const SEPARATOR = " · ";

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

function routesText(routes: number, capped: boolean): string {
  return capped
    ? `${formatCount(routes)}+ routes`
    : plural(routes, "route", "routes");
}

export function pathOverlayText(search: PathSearch): string {
  const verb = search.purpose === "refresh" ? "Refreshing" : "Searching for";
  const head = `${verb} paths from ${search.from} to ${search.to}...`;
  if (search.checked === 0) return head;
  const checked = `${plural(search.checked, "function", "functions")} checked`;
  const routes = routesText(search.routes, search.routesCapped);
  return `${head} ${checked}, ${routes} so far`;
}

function clauses(summary: PathSummary, shown: number): string[] {
  return [
    ...(summary.stoppedBy === "time" ? ["stopped early (time limit)"] : []),
    ...(summary.leftOut > 0
      ? [`nearest ${shown} route boxes shown, ${summary.leftOut} left out`]
      : []),
  ];
}

export function pathSummaryText(
  graph: GraphState,
): { text: string; title: string } | undefined {
  const { path } = graph;
  if (!path) return undefined;
  const nameOf = (id: string) => graph.nodes[id]?.name ?? id;
  const { summary } = path;
  const names = `${nameOf(graph.focusId)} → ${nameOf(path.endId)}`;
  const routes = routesText(summary.routes, summary.routesCapped);
  const head = `Paths ${names}: ${routes}`;
  const text = [head, ...clauses(summary, path.boxes.length)].join(SEPARATOR);
  return { text, title: text };
}
