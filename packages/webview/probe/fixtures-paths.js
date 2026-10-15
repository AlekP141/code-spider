"use strict";

const { PROJECT } = require("./fixtures.js");

const RANGE = { startLine: 1, startColumn: 1, endLine: 3, endColumn: 2 };

const ID = {
  start: "src/user.ts#fetchUser",
  profile: "src/user.ts#loadProfile",
  page: "src/page.ts#buildPage",
  header: "src/page.ts#renderHeader",
  end: "src/avatar.ts#renderAvatar",
  callee: "src/net.ts#request",
  caller: "src/cache.ts#warmUp",
  inner: "src/avatar.ts#decode",
  footer: "src/page.ts#renderFooter",
};

function node(id) {
  const [file, name] = id.split("#");
  return {
    id,
    kind: "function",
    name,
    file,
    range: RANGE,
    inputType: "",
    returnType: "",
    isAsync: false,
    lineCount: 3,
    codePreview: `function ${name}() {\n  return 1;\n}`,
  };
}

function edge(from, to) {
  return {
    id: `${from}->${to}`,
    from,
    to,
    kind: "call",
    supplies: "",
    callSite: RANGE,
    resolved: true,
  };
}

const NEIGHBOURS = [
  edge(ID.callee, ID.start),
  edge(ID.start, ID.profile),
  edge(ID.start, ID.caller),
];
const ROUTE_EDGES = [
  edge(ID.start, ID.profile),
  edge(ID.profile, ID.page),
  edge(ID.header, ID.page),
  edge(ID.end, ID.header),
];
const COLUMNS = [
  [ID.start, 0],
  [ID.profile, 1],
  [ID.page, 2],
  [ID.header, 3],
  [ID.end, 4],
];

const START_SLICE = {
  focusId: ID.start,
  nodes: [ID.start, ID.callee, ID.profile, ID.caller].map(node),
  edges: NEIGHBOURS,
  truncated: false,
};

const OLD_SLICE = {
  focusId: ID.start,
  nodes: [...START_SLICE.nodes, ...COLUMNS.slice(2).map(([id]) => node(id))],
  edges: [
    ...NEIGHBOURS,
    ...ROUTE_EDGES.filter((each) => !NEIGHBOURS.some((n) => n.id === each.id)),
  ],
  truncated: false,
};

const ROUTE = {
  nodes: COLUMNS.map(([id]) => node(id)),
  edges: ROUTE_EDGES,
};

const PATH = {
  endId: ID.end,
  boxes: COLUMNS.map(([id, column]) => ({ id, column })),
  edgeIds: ROUTE_EDGES.map((each) => each.id),
  summary: { routes: 1, routesCapped: false, leftOut: 0, checked: 6 },
};

const END_SLICE = {
  focusId: ID.end,
  nodes: [ID.end, ID.inner].map(node),
  edges: [edge(ID.inner, ID.end)],
  truncated: false,
};

const WIDER_ROUTE = {
  nodes: [...ROUTE.nodes, node(ID.footer)],
  edges: [...ROUTE_EDGES, edge(ID.footer, ID.page), edge(ID.end, ID.footer)],
};

const WIDER_PATH = {
  endId: ID.end,
  boxes: [...PATH.boxes, { id: ID.footer, column: 3 }],
  edgeIds: WIDER_ROUTE.edges.map((each) => each.id),
  summary: { routes: 2, routesCapped: false, leftOut: 0, checked: 8 },
};

const messages = {
  oldCentre: (sourceVersion) => ({
    type: "slice",
    slice: OLD_SLICE,
    project: PROJECT,
    mode: { kind: "centre", sourceVersion },
  }),
  pathFound: (sourceVersion) => ({
    type: "pathFound",
    project: PROJECT,
    slice: START_SLICE,
    route: ROUTE,
    path: PATH,
    sourceVersion,
  }),
  refreshedWider: (generation, sourceVersion) => ({
    type: "refreshed",
    project: PROJECT,
    generation,
    sourceVersion,
    centre: START_SLICE,
    expansions: [],
    route: WIDER_ROUTE,
    path: WIDER_PATH,
  }),
  endExpansion: (generation) => ({
    type: "slice",
    slice: END_SLICE,
    project: PROJECT,
    mode: { kind: "expansion", nodeId: ID.end, generation },
  }),
  pathSearch: (search) => ({ type: "pathSearch", search }),
  searching: (id, checked = 0, routes = 0) => ({
    type: "pathSearch",
    search: {
      id,
      purpose: "search",
      from: "fetchUser",
      to: "renderAvatar",
      checked,
      routes,
      routesCapped: false,
    },
  }),
  pathStart: (nodeId) => ({
    type: "pathStart",
    mark: nodeId && { project: PROJECT, nodeId, name: nodeId.split("#")[1] },
  }),
};

module.exports = { ID, PATH, messages };
