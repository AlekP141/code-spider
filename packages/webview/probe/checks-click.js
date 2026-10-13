"use strict";

const { assert, assertSamePositions } = require("./harness.js");
const { ID, PROJECT } = require("./fixtures.js");

const THREE = [ID.main, ID.helper, ID.format];
const CODE_REGION_HEIGHT = 56;

async function jumpsAfter(h, count, what) {
  const jumps = await h.until(
    () => h.posted("openInEditor"),
    (found) => found.length === count,
    `openInEditor after ${what}`,
  );
  return JSON.stringify(jumps.at(-1));
}

async function untilOpen(h, open, what) {
  return h.until(
    () => h.nodes(),
    (found) => found[ID.helper].open === open,
    what,
  );
}

async function clickOpensAndCloses(h) {
  const before = await h.nodes();
  const jump = { type: "openInEditor", project: PROJECT, nodeId: ID.helper };
  const header = () => h.call("centreOfNode", ID.helper, ".node-header");

  await h.click(await header());
  const first = await jumpsAfter(h, 1, "a click on a closed box");
  assert(first === JSON.stringify(jump), `wrong message ${first}`);
  const opened = await untilOpen(h, true, "the clicked box to open");
  assertSamePositions(before, opened, [ID.main, ID.helper], "a click");
  assert(opened[ID.helper].code.includes("validate"), "no code was shown");
  assert(!opened[ID.format].open, "the box below the clicked one opened");
  assert(
    opened[ID.format].x === before[ID.format].x,
    "the box below the clicked one moved sideways",
  );
  const pushed = opened[ID.format].y - before[ID.format].y;
  assert(
    Math.abs(pushed - CODE_REGION_HEIGHT) <= 1,
    `the box below was pushed ${pushed}px, not ${CODE_REGION_HEIGHT}px`,
  );

  await h.click(await h.call("centreOfNode", ID.helper, ".node-code"), 3);
  const inCode = await jumpsAfter(h, 2, "a click in the code");
  const middleLine = JSON.stringify({ ...jump, line: 1 });
  assert(inCode === middleLine, `wrong message ${inCode}`);
  assert((await h.nodes())[ID.helper].open, "a click in the code closed it");

  await h.click(await header());
  const closed = await untilOpen(h, false, "a header click to close the box");
  assertSamePositions(opened, closed, THREE, "closing");
  assert((await h.posted("openInEditor")).length === 2, "closing jumped");

  await h.click(await header());
  await jumpsAfter(h, 3, "a click that opens the box again");
  const again = await untilOpen(h, true, "the box to open again");
  assertSamePositions(opened, again, THREE, "opening again");
  const pinned = THREE.filter((id) => again[id].pinned);
  assert(pinned.length === 0, `a click pinned ${pinned}`);
}

module.exports = { clickOpensAndCloses };
