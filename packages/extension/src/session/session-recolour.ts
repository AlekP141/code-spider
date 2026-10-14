import type { ChangeReader } from "../diff/change-reader.js";
import { changeMarks } from "../diff/annotate.js";
import type { JumpRegistry, PanelPort } from "../ports.js";

/**
 * Reads git first and takes the node list after it answers, so a slice posted
 * while git ran is covered; a slice posted later carries its own marks.
 */
export async function postChangeMarks(deps: {
  jumps: JumpRegistry;
  panel: PanelPort;
  reader: ChangeReader;
}): Promise<void> {
  const { jumps, panel, reader } = deps;
  for (const { project, repoRoot } of jumps.projects()) {
    const changes = await reader.read(repoRoot);
    if (!panel.isOpen()) return;
    panel.post({
      type: "changeMarks",
      project,
      marks: changeMarks(jumps.nodes(project), changes),
    });
  }
}
