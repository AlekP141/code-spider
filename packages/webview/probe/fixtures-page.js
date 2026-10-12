"use strict";

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

module.exports = { THEME, fakeApiSource };
