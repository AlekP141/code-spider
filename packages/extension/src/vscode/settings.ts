import type { PathLimits } from "@code-spider/core";
import * as vscode from "vscode";
import {
  SETTING_MAX_HEAP_MB,
  SETTING_PATH_MAX_BOXES,
  SETTING_PATH_TIME_LIMIT,
} from "../ids.js";
import { pathLimits } from "../settings/path-limits.js";
import { normaliseHeapMb } from "../settings/settings-values.js";

export function getMaxHeapMb(): number {
  return normaliseHeapMb(
    vscode.workspace.getConfiguration().get(SETTING_MAX_HEAP_MB),
  );
}

export function getPathLimits(): PathLimits {
  const config = vscode.workspace.getConfiguration();
  return pathLimits(
    config.get(SETTING_PATH_TIME_LIMIT),
    config.get(SETTING_PATH_MAX_BOXES),
  );
}
