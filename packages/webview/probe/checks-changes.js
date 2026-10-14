"use strict";

const { assert, assertSamePositions } = require("./harness.js");
const { ID, messages } = require("./fixtures.js");

async function pressChanges(h, label, value) {
  await h.click(await h.call("centreOfButton", label));
  await h.until(
    () => h.posted("setDiffMode"),
    (found) => found.at(-1)?.value === value,
    `setDiffMode ${value}`,
  );
}

function changesOf(nodes) {
  return Object.fromEntries(
    Object.entries(nodes).map(([id, box]) => [id, box.change]),
  );
}

function waitForChanges(h, expected, description) {
  return h.until(
    () => h.nodes(),
    (found) =>
      Object.entries(found).every(([id, box]) => box.change === expected[id]),
    description,
  );
}

async function switchPostsAndMarksRecolour(h) {
  const before = await h.nodes();
  const ids = Object.keys(before);
  assert(
    ids.every((id) => before[id].change === undefined),
    `boxes were coloured before any marks: ${JSON.stringify(changesOf(before))}`,
  );

  await pressChanges(h, "PR", "pr");
  const pr = await h.call("buttonState", "PR");
  const uncommitted = await h.call("buttonState", "Uncommitted");
  assert(pr.pressed === "true", "PR is not pressed");
  assert(uncommitted.pressed === "false", "Uncommitted is still pressed");

  const marked = { [ID.helper]: "added", [ID.format]: "modified" };
  await h.send(messages.changeMarks(marked));
  const expected = Object.fromEntries(ids.map((id) => [id, marked[id]]));
  const coloured = await waitForChanges(h, expected, "the two marked boxes");
  assertSamePositions(before, coloured, ids, "the change marks");

  await h.send(messages.changeMarks({}));
  const cleared = await waitForChanges(h, {}, "every box to lose its colour");
  assertSamePositions(before, cleared, ids, "clearing the change marks");

  await pressChanges(h, "Uncommitted", "uncommitted");
}

module.exports = [
  {
    name: "the Changes switch posts the mode and change marks recolour boxes in place",
    run: switchPostsAndMarksRecolour,
  },
];
