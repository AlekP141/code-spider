import * as vscode from "vscode";
import {
  COMMAND_CLEAR_PATH_START,
  COMMAND_PATH_FROM,
  COMMAND_PATH_TO,
} from "../ids.js";
import type { PathSearcher } from "../session/path-search.js";
import type { PathStart } from "../session/path-start.js";
import type { FocusRequest } from "../session/session.js";
import { resolveFocusRequest } from "./focus-request.js";

export function registerPathCommands(
  paths: PathSearcher,
  start: PathStart,
): vscode.Disposable {
  const run =
    (action: (request: FocusRequest) => Promise<void>) =>
    async (uri?: vscode.Uri, position?: vscode.Position) => {
      const request = await resolveFocusRequest(uri, position);
      if (request) await action(request);
    };
  return vscode.Disposable.from(
    vscode.commands.registerCommand(
      COMMAND_PATH_FROM,
      run((request) => paths.markStart(request)),
    ),
    vscode.commands.registerCommand(
      COMMAND_PATH_TO,
      run((request) => paths.finishAt(request)),
    ),
    vscode.commands.registerCommand(COMMAND_CLEAR_PATH_START, () =>
      start.clear(),
    ),
  );
}
