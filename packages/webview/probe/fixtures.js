"use strict";

const { THEME, fakeApiSource } = require("./fixtures-page.js");

const RANGE = { startLine: 1, startColumn: 1, endLine: 3, endColumn: 2 };

function node(id, code, lineCount) {
  return {
    id,
    kind: "function",
    name: id.split("#")[1],
    file: id.split("#")[0],
    range: RANGE,
    inputType: "",
    returnType: "",
    isAsync: false,
    lineCount,
    codePreview: code,
  };
}

function site(line, column) {
  return {
    startLine: line,
    startColumn: column,
    endLine: line,
    endColumn: column + 1,
  };
}

function edge(from, to, overrides = {}) {
  return {
    id: `${from}->${to}`,
    from,
    to,
    kind: "call",
    supplies: "",
    callSite: RANGE,
    resolved: true,
    ...overrides,
  };
}

const ID = {
  main: "src/main.ts#main",
  helper: "src/helper.ts#helper",
  format: "src/format.ts#format",
  parse: "src/parse.ts#parse",
  validate: "src/validate.ts#validate",
  extra: "src/extra.ts#extra",
  late: "src/late.ts#late",
};

const CODE = {
  main: "function main() {\n  return helper(format());\n}",
  helper: "function helper() {\n  return validate(parse());\n}",
  format: "function format() {\n  return 1;\n}",
  parse: "function parse() {\n  return 2;\n}",
  validate: "function validate() {\n  return 3;\n}",
  extra: "function extra() {\n  return 4;\n}",
  late: "function late() {\n  return 5;\n}",
};

const REFRESHED_MARKER = "refreshedMarker";
const REFRESHED_MAIN_CODE = [
  "function main() {",
  "  const first = helper(format());",
  "  const second = helper(format());",
  "  const third = helper(format());",
  `  const ${REFRESHED_MARKER} = extra();`,
  "  return [first, second, third];",
  "}",
].join("\n");
const REORDERED_MAIN_CODE = [
  "function main() {",
  "  const early = extra();",
  "  const middle = late();",
  "  return helper(format());",
  "}",
].join("\n");

const AT = {
  centre: { helper: site(2, 10), format: site(2, 17) },
  refreshed: { helper: site(2, 17), format: site(2, 24), extra: site(5, 27) },
  reordered: {
    extra: site(2, 17),
    late: site(3, 18),
    helper: site(4, 10),
    format: site(4, 17),
  },
  helperBody: { validate: site(2, 10), parse: site(2, 19) },
};

function mainNode(code, lineCount) {
  return node(ID.main, code, lineCount);
}

function leaf(key) {
  return node(ID[key], CODE[key], 3);
}

const CENTRE_SLICE = {
  focusId: ID.main,
  nodes: [mainNode(CODE.main, 3), leaf("helper"), leaf("format")],
  edges: [
    edge(ID.helper, ID.main, { callSite: AT.centre.helper }),
    edge(ID.format, ID.main, { callSite: AT.centre.format }),
  ],
  truncated: false,
};

const HELPER_SLICE = {
  focusId: ID.helper,
  nodes: [
    leaf("helper"),
    mainNode(CODE.main, 3),
    leaf("parse"),
    leaf("validate"),
  ],
  edges: [
    edge(ID.parse, ID.helper, { callSite: AT.helperBody.parse }),
    edge(ID.validate, ID.helper, { callSite: AT.helperBody.validate }),
    edge(ID.helper, ID.main, { callSite: AT.centre.helper }),
  ],
  truncated: false,
};

const REFRESHED_CENTRE = {
  focusId: ID.main,
  nodes: [
    mainNode(REFRESHED_MAIN_CODE, 7),
    leaf("helper"),
    leaf("format"),
    leaf("extra"),
  ],
  edges: [
    edge(ID.helper, ID.main, { callSite: AT.refreshed.helper }),
    edge(ID.format, ID.main, { callSite: AT.refreshed.format }),
    edge(ID.extra, ID.main, { callSite: AT.refreshed.extra }),
  ],
  truncated: false,
};

const REFRESHED_HELPER_SLICE = {
  ...HELPER_SLICE,
  nodes: [
    leaf("helper"),
    mainNode(REFRESHED_MAIN_CODE, 7),
    leaf("parse"),
    leaf("validate"),
  ],
  edges: [
    ...HELPER_SLICE.edges.slice(0, 2),
    edge(ID.helper, ID.main, { callSite: AT.refreshed.helper }),
  ],
};

const REORDERED_CENTRE = {
  focusId: ID.main,
  nodes: [
    mainNode(REORDERED_MAIN_CODE, 5),
    leaf("helper"),
    leaf("format"),
    leaf("extra"),
    leaf("late"),
  ],
  edges: [
    edge(ID.extra, ID.main, { callSite: AT.reordered.extra }),
    edge(ID.late, ID.main, { callSite: AT.reordered.late }),
    edge(ID.helper, ID.main, { callSite: AT.reordered.helper }),
    edge(ID.format, ID.main, { callSite: AT.reordered.format }),
  ],
  truncated: false,
};

const REORDERED_HELPER_SLICE = {
  ...HELPER_SLICE,
  nodes: [
    leaf("helper"),
    mainNode(REORDERED_MAIN_CODE, 5),
    leaf("parse"),
    leaf("validate"),
  ],
  edges: [
    ...HELPER_SLICE.edges.slice(0, 2),
    edge(ID.helper, ID.main, { callSite: AT.reordered.helper }),
  ],
};

const PROJECT = "/probe/tsconfig.json";

const messages = {
  settings: (edgeStyle = "stepped") => ({
    type: "settings",
    columnGap: 192,
    edgeStyle,
  }),
  centre: (sourceVersion) => ({
    type: "slice",
    slice: CENTRE_SLICE,
    project: PROJECT,
    mode: { kind: "centre", sourceVersion },
  }),
  expansion: (nodeId, generation) => ({
    type: "slice",
    slice: HELPER_SLICE,
    project: PROJECT,
    mode: { kind: "expansion", nodeId, generation },
  }),
  refreshed: (generation, sourceVersion) => ({
    type: "refreshed",
    project: PROJECT,
    generation,
    sourceVersion,
    centre: REFRESHED_CENTRE,
    expansions: [{ nodeId: ID.helper, slice: REFRESHED_HELPER_SLICE }],
  }),
  reordered: (generation, sourceVersion) => ({
    type: "refreshed",
    project: PROJECT,
    generation,
    sourceVersion,
    centre: REORDERED_CENTRE,
    expansions: [{ nodeId: ID.helper, slice: REORDERED_HELPER_SLICE }],
  }),
  sourceChanged: (version) => ({ type: "sourceChanged", version }),
};

module.exports = {
  ID,
  PROJECT,
  REFRESHED_MARKER,
  THEME,
  fakeApiSource,
  messages,
};
