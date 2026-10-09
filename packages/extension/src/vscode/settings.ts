import * as vscode from "vscode";
import { SETTING_MAX_HEAP_MB } from "../ids.js";
import { normaliseHeapMb } from "../settings-values.js";

export function getMaxHeapMb(): number {
  return normaliseHeapMb(
    vscode.workspace.getConfiguration().get(SETTING_MAX_HEAP_MB),
  );
}
