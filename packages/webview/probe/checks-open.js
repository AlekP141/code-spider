"use strict";

const { assert, assertSamePositions } = require("./harness.js");
const { ID, messages } = require("./fixtures.js");

const CODE_REGION_HEIGHT = 56;
const FAILURE = "Could not expand: gone";

async function counts(h) {
  return {
    openInEditor: (await h.posted("openInEditor")).length,
    expand: (await h.posted("expand")).length,
  };
}

function pinsOf(nodes) {
  return Object.fromEntries(
    Object.entries(nodes).map(([id, box]) => [id, box.pinned]),
  );
}

async function assertQuiet(h, was, what) {
  const now = await counts(h);
  assert(
    JSON.stringify(now) === JSON.stringify(was),
    `${what} posted ${JSON.stringify(now)}, not ${JSON.stringify(was)}`,
  );
}

async function chevronOpensAndCloses(h) {
  const before = await h.nodes();
  const ids = Object.keys(before);
  const posted = await counts(h);
  const label = (text) => `[aria-label="${text}"]`;
  await h.click(await h.call("centreOfNode", ID.late, label("Show code")));
  const opened = await h.until(
    () => h.nodes(),
    (found) => found[ID.late].open,
    "the chevron to open the box",
  );
  await assertQuiet(h, posted, "opening with the chevron");
  const pushed = opened[ID.helper].y - before[ID.helper].y;
  assert(
    pushed >= CODE_REGION_HEIGHT - 1,
    `the box below moved ${pushed}px, not at least ${CODE_REGION_HEIGHT}px`,
  );
  const others = ids.filter((id) => id !== ID.helper);
  assertSamePositions(before, opened, others, "the chevron");
  await h.click(await h.call("centreOfNode", ID.late, label("Hide code")));
  const closed = await h.until(
    () => h.nodes(),
    (found) => !found[ID.late].open,
    "the chevron to close the box",
  );
  assertSamePositions(opened, closed, ids, "closing");
  await assertQuiet(h, posted, "closing with the chevron");
  assert(
    JSON.stringify(pinsOf(closed)) === JSON.stringify(pinsOf(before)),
    "the chevron changed a pin",
  );
}

async function failureHangsBelow(h, shared) {
  const before = (await h.nodes())[ID.extra];
  assert(!before.open, "the box is open before the failure");
  await h.send(messages.expandFailed(ID.extra, shared.generation, FAILURE));
  const after = await h.until(
    () => h.nodes(),
    (found) => found[ID.extra].failureTop !== undefined,
    "the failure message",
  );
  const box = after[ID.extra];
  assert(
    box.failureTop >= box.top + box.height - 1,
    `the message is at ${box.failureTop}, above the box's bottom ${box.top + box.height}`,
  );
  assert(
    Math.abs(box.height - before.height) < 0.5,
    `the failure changed the box's height from ${before.height} to ${box.height}`,
  );
}

module.exports = [
  {
    name: "the chevron opens and closes a box without jumping",
    run: chevronOpensAndCloses,
  },
  {
    name: "a failure message hangs below a closed box",
    run: failureHangsBelow,
  },
];
