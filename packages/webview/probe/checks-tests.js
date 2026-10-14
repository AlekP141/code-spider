"use strict";

const { assert, assertSamePositions } = require("./harness.js");
const { ID, messages } = require("./fixtures.js");

const SOURCE_VERSION = 4;
const SHOWN = [ID.main, ID.helper, ID.format];
const FIVE = [...SHOWN, ID.spec, ID.fixture];
const TESTS = [ID.spec, ID.fixture];

function onlyIds(nodes, ids) {
  const found = Object.keys(nodes).sort();
  const wanted = [...ids].sort();
  return (
    found.length === wanted.length && wanted.every((id, i) => id === found[i])
  );
}

function allDrawn(ids) {
  return (nodes) =>
    onlyIds(nodes, ids) &&
    ids.every((id) => nodes[id].width > 0 && nodes[id].height > 0);
}

function overlaps(a, b) {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

function fadedAsTests(nodes) {
  return (
    allDrawn(FIVE)(nodes) &&
    FIVE.every((id) => {
      const isTest = TESTS.includes(id);
      return (
        nodes[id].test === isTest &&
        (isTest ? nodes[id].opacity < 1 : nodes[id].opacity === 1)
      );
    })
  );
}

function dashedAroundTests(edges) {
  return (
    edges.length === 4 &&
    edges.every((edge) => {
      const touches = TESTS.some((id) => edge.id.includes(id));
      return edge.test === touches && (edge.dash !== "none") === touches;
    })
  );
}

async function pressTests(h, label, pressedLabel, value) {
  await h.click(await h.call("centreOfButton", label));
  await h.until(
    () => h.posted("setTestVisibility"),
    (found) => found.at(-1)?.value === value,
    `setTestVisibility ${value}`,
  );
  await h.until(
    () => h.call("buttonState", pressedLabel),
    (state) => state?.pressed === "true",
    `${pressedLabel} to be pressed`,
  );
}

async function switchFadesHidesAndShowsAgain(h) {
  await h.send(messages.testedCentre(SOURCE_VERSION));
  await h.until(() => h.nodes(), fadedAsTests, "five boxes, two of them faded");
  await h.until(() => h.edges(), dashedAroundTests, "dashed lines to tests");

  const closed = await h.nodes();
  assert(
    SHOWN.every((id) => !closed[id].test),
    "a box that is not test code is marked as test",
  );
  await h.click(
    await h.call("centreOfNode", ID.fixture, '[aria-label="Show code"]'),
  );
  const reading = await h.until(
    () => h.nodes(),
    (found) => allDrawn(FIVE)(found) && found[ID.fixture].open,
    "the fixture box to open",
  );

  await pressTests(h, "Hide", "Hide (2)", "hide");
  const hidden = await h.until(
    () => h.nodes(),
    allDrawn(SHOWN),
    "only main, helper and format after Hide",
  );
  assertSamePositions(reading, hidden, SHOWN, "Hide");

  await pressTests(h, "Show", "Show", "show");
  const back = await h.until(
    () => h.nodes(),
    allDrawn(FIVE),
    "all five boxes after Show",
  );
  assertSamePositions(reading, back, SHOWN, "Show");
  assert(!back[ID.fixture].open, "the fixture box came back open");
  assert(!back[ID.fixture].pinned, "the fixture box came back pinned");
  for (const [index, id] of FIVE.entries()) {
    for (const other of FIVE.slice(index + 1)) {
      assert(!overlaps(back[id], back[other]), `${id} overlaps ${other}`);
    }
  }
}

module.exports = [
  {
    name: "the Tests switch fades test boxes, hides them, and shows them again as new boxes",
    run: switchFadesHidesAndShowsAgain,
  },
];
