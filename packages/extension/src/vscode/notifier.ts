import * as vscode from "vscode";
import type { Notifier } from "../ports.js";

export const notifier: Notifier = {
  warn: (message) => {
    void vscode.window.showWarningMessage(message);
  },
  error: (message) => {
    void vscode.window.showErrorMessage(message);
  },
};
