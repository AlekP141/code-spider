"use strict";

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
};

const CODE = {
  main: "function main() {\n  return helper(format());\n}",
  helper: "function helper() {\n  return parse(validate());\n}",
  format: "function format() {\n  return 1;\n}",
  parse: "function parse() {\n  return 2;\n}",
  validate: "function validate() {\n  return 3;\n}",
  extra: "function extra() {\n  return 4;\n}",
};

const REFRESHED_MARKER = "refreshedMarker";
const REFRESHED_MAIN_CODE = [
  "function main() {",
  `  const ${REFRESHED_MARKER} = extra();`,
  "  const first = helper(format());",
  "  const second = helper(format());",
  "  const third = helper(format());",
  "  return [first, second, third];",
  "}",
].join("\n");

function mainNode(code, lineCount) {
  return node(ID.main, code, lineCount);
}

function leaf(key) {
  return node(ID[key], CODE[key], 3);
}

const CENTRE_SLICE = {
  focusId: ID.main,
  nodes: [mainNode(CODE.main, 3), leaf("helper"), leaf("format")],
  edges: [edge(ID.helper, ID.main), edge(ID.format, ID.main)],
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
    edge(ID.parse, ID.helper),
    edge(ID.validate, ID.helper),
    edge(ID.helper, ID.main),
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
    edge(ID.helper, ID.main),
    edge(ID.format, ID.main),
    edge(ID.extra, ID.main),
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
  sourceChanged: (version) => ({ type: "sourceChanged", version }),
};

const THEME = {
  "--vscode-editor-foreground": "#cccccc",
  "--vscode-editor-background": "#1e1e1e",
  "--vscode-editor-font-family": "Menlo, Consolas, monospace",
  "--vscode-panel-border": "#80808059",
  "--vscode-focusBorder": "#007fd4",
  "--vscode-editorWidget-background": "#252526",
  "--vscode-editorWidget-border": "#454545",
  "--vscode-descriptionForeground": "#9d9d9d",
  "--vscode-charts-blue": "#3794ff",
  "--vscode-charts-purple": "#b180d7",
  "--vscode-button-foreground": "#ffffff",
  "--vscode-button-background": "#0e639c",
  "--vscode-button-hoverBackground": "#1177bb",
  "--vscode-button-border": "#ffffff1a",
  "--vscode-button-secondaryBackground": "#3a3d41",
  "--vscode-button-secondaryForeground": "#ffffff",
  "--vscode-button-secondaryHoverBackground": "#45494e",
  "--vscode-errorForeground": "#f48771",
  "--vscode-editorWarning-foreground": "#cca700",
  "--vscode-editorLineNumber-foreground": "#858585",
  "--vscode-toolbar-hoverBackground": "#5a5d5e50",
  "--vscode-progressBar-background": "#0e70c0",
  "--vscode-inputValidation-errorBorder": "#be1100",
  "--vscode-inputValidation-errorBackground": "#5a1d1d",
  "--vscode-icon-foreground": "#c5c5c5",
  "--vscode-foreground": "#cccccc",
  "--vscode-font-size": "13px",
  "--vscode-font-family": "sans-serif",
  "--vscode-badge-foreground": "#ffffff",
  "--vscode-badge-background": "#4d4d4d",
};

/**
 * Runs before the bundle. Like VS Code's, the API can be acquired only once,
 * and state survives a reload (sessionStorage) but posted messages do not.
 */
function fakeApiSource(theme) {
  return `
const theme = ${JSON.stringify(theme)};
for (const [name, value] of Object.entries(theme)) {
  document.documentElement.style.setProperty(name, value);
}
window.__posted = [];
window.__errors = [];
window.__violations = [];
const STATE_KEY = "probe-state";
let acquired = false;
window.acquireVsCodeApi = () => {
  if (acquired) {
    throw new Error("An instance of the VS Code API has already been acquired");
  }
  acquired = true;
  return {
    postMessage: (message) => {
      window.__posted.push(JSON.parse(JSON.stringify(message)));
    },
    getState: () => {
      const saved = sessionStorage.getItem(STATE_KEY);
      return saved === null ? undefined : JSON.parse(saved);
    },
    setState: (state) => {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    },
  };
};
window.addEventListener("error", (event) => {
  window.__errors.push(String(event.message));
});
window.addEventListener("unhandledrejection", (event) => {
  window.__errors.push(String(event.reason));
});
document.addEventListener("securitypolicyviolation", (event) => {
  window.__violations.push(event.violatedDirective + " " + event.blockedURI);
});
`;
}

module.exports = {
  ID,
  PROJECT,
  REFRESHED_MARKER,
  THEME,
  fakeApiSource,
  messages,
};
