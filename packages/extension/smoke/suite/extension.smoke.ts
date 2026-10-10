import assert from "node:assert/strict";
import * as vscode from "vscode";
import type { ExtensionApi } from "../../src/extension.js";

const EXTENSION_ID = "code-spider.code-spider-vscode";

async function activateExtension(): Promise<ExtensionApi> {
  const extension = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(extension, `extension ${EXTENSION_ID} is not installed`);
  return extension.isActive ? extension.exports : extension.activate();
}

async function openFile(relativePath: string): Promise<vscode.TextEditor> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "no workspace folder is open");
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(folder.uri, relativePath),
  );
  return vscode.window.showTextDocument(document, vscode.ViewColumn.One);
}

function activeEditor(): vscode.TextEditor {
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, "no text editor is active");
  return editor;
}

function graphPanelTab(): vscode.Tab | undefined {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview &&
        tab.input.viewType.endsWith("codeSpider.graph"),
    );
}

function currentProject(api: ExtensionApi): string {
  const graph = api.currentGraph();
  assert.ok(graph, "no graph: the panel test must pass first");
  return graph.tsconfig;
}

async function closeGraphPanel(): Promise<void> {
  const tab = graphPanelTab();
  assert.ok(tab, "the Code Spider panel is not open");
  await vscode.window.tabGroups.close(tab);
  const deadline = Date.now() + 10_000;
  while (graphPanelTab()) {
    assert.ok(Date.now() < deadline, "the Code Spider panel did not close");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("Code Spider", () => {
  let api: ExtensionApi;

  before(async () => {
    api = await activateExtension();
  });

  it("registers the Show Graph commands", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("codeSpider.showGraph"));
    assert.ok(commands.includes("codeSpider.showInCodeSpider"));
  });

  it("opens the graph panel beside the editor and analyses the function", async () => {
    const editor = await openFile("src/signup.ts");
    const inside = editor.document.positionAt(
      editor.document.getText().indexOf("validateUser(input)") + 3,
    );

    await vscode.commands.executeCommand(
      "codeSpider.showGraph",
      editor.document.uri,
      inside,
    );

    assert.equal(
      api.currentGraph()?.slice.focusId,
      "src/signup.ts#handleSignup",
    );
    const tab = graphPanelTab();
    assert.ok(tab, "the Code Spider panel did not open");
    assert.notEqual(tab.group.viewColumn, vscode.ViewColumn.One);
  });

  it("jumps to the declaration when a node is clicked", async () => {
    await api.handleWebviewMessage({
      type: "openInEditor",
      project: currentProject(api),
      nodeId: "src/signup.ts#validateUser",
    });

    const editor = activeEditor();
    assert.ok(editor.document.uri.path.endsWith("src/signup.ts"));
    assert.equal(editor.selection.start.line, 2);
    assert.ok(editor.selection.isEmpty);
    assert.equal(editor.selection.start.character, 0);
    assert.ok(
      editor.document.lineAt(2).text.startsWith("export function validateUser"),
    );
  });

  it("jumps to the exact call site when an edge is clicked", async () => {
    await api.handleWebviewMessage({
      type: "openCallSite",
      project: currentProject(api),
      edgeId: "src/signup.ts#handleSignup->src/app.ts#main",
    });

    const editor = activeEditor();
    assert.ok(editor.document.uri.path.endsWith("src/app.ts"));
    assert.equal(editor.selection.start.line, 4);
    assert.equal(
      editor.document.getText(editor.selection),
      "handleSignup(input)",
    );
  });

  // The webview sends no focus message, so this covers the extension side only.
  it("the extension re-centres on a node by its id", async () => {
    await api.handleWebviewMessage({
      type: "focus",
      project: currentProject(api),
      nodeId: "src/signup.ts#validateUser",
    });

    assert.equal(
      api.currentGraph()?.slice.focusId,
      "src/signup.ts#validateUser",
    );
  });

  it("jumps to a node that only an expansion brought in", async () => {
    await closeGraphPanel();
    const signup = await openFile("src/signup.ts");
    const inside = signup.document.positionAt(
      signup.document.getText().indexOf("input.email") + 3,
    );
    await vscode.commands.executeCommand(
      "codeSpider.showGraph",
      signup.document.uri,
      inside,
    );
    assert.equal(
      api.currentGraph()?.slice.focusId,
      "src/signup.ts#validateUser",
    );
    const project = currentProject(api);
    const createUser = {
      type: "openInEditor",
      project,
      nodeId: "src/signup.ts#createUser",
    } as const;

    const app = await openFile("src/app.ts");
    const before = app.selection.start;
    await api.handleWebviewMessage(createUser);
    assert.ok(activeEditor().document.uri.path.endsWith("src/app.ts"));
    assert.ok(activeEditor().selection.start.isEqual(before));

    await api.handleWebviewMessage({
      type: "expand",
      project,
      nodeId: "src/signup.ts#handleSignup",
      generation: 1,
    });
    await api.handleWebviewMessage(createUser);

    const editor = activeEditor();
    assert.ok(editor.document.uri.path.endsWith("src/signup.ts"));
    assert.equal(editor.selection.start.line, 7);
    assert.equal(editor.selection.start.character, 0);
    assert.ok(
      editor.document
        .lineAt(7)
        .text.startsWith("export async function createUser"),
    );
  });
});
