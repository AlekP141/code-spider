"use strict";

const { assert, assertSamePositions, sleep } = require("./harness.js");
const { PROJECT } = require("./fixtures.js");
const { ID, messages } = require("./fixtures-paths.js");

const SOURCE_VERSION = 5;
const CLICK_SETTLE_MS = 450;
const ROUTE = [ID.start, ID.profile, ID.page, ID.header, ID.end];
const SEVEN = [...ROUTE, ID.callee, ID.caller];
const EIGHT = [...SEVEN, ID.footer];
const SUMMARY = "Paths fetchUser → renderAvatar: 2 routes";

function allDrawn(ids) {
  return (nodes) => {
    const found = Object.keys(nodes).sort();
    const wanted = [...ids].sort();
    return (
      found.length === wanted.length &&
      wanted.every((id, i) => id === found[i]) &&
      ids.every((id) => nodes[id].width > 0 && nodes[id].height > 0)
    );
  };
}

function ordinaryGraph(nodes) {
  return allDrawn(SEVEN)(nodes) && SEVEN.every((id) => !nodes[id].route);
}

/** The ids are drawn as wanted and two frames later nothing has moved. */
async function stableNodes(h, ready, description) {
  await h.until(() => h.nodes(), ready, description);
  return h.until(
    async () => {
      const first = JSON.stringify(await h.nodes());
      await h.frame();
      await h.frame();
      const second = await h.nodes();
      return JSON.stringify(second) === first ? second : undefined;
    },
    (found) => found !== undefined,
    `${description} to stop moving`,
  );
}

function summaryText(h) {
  return h.evaluate(
    'document.querySelector(".toolbar-summary")?.textContent ?? null',
  );
}

async function shiftClickMarks(h) {
  await h.send(messages.oldCentre(SOURCE_VERSION));
  const before = await stableNodes(h, ordinaryGraph, "the ordinary graph");
  assert(!before[ID.caller].open, "the box to click starts open");
  const header = () => h.call("centreOfNode", ID.caller, ".node-header");
  const jumps = (await h.posted("openInEditor")).length;
  const marks = (await h.posted("pathClick")).length;

  await h.click(await header(), 0, ["shift"]);
  const found = await h.until(
    () => h.posted("pathClick"),
    (all) => all.length === marks + 1,
    "a pathClick message",
  );
  const click = found.at(-1);
  assert(
    click.nodeId === ID.caller && click.project === PROJECT,
    `wrong message ${JSON.stringify(click)}`,
  );
  await sleep(CLICK_SETTLE_MS);
  const jumped = (await h.posted("openInEditor")).length - jumps;
  assert(jumped === 0, `a Shift+click posted ${jumped} openInEditor`);
  const after = await h.nodes();
  assert(!after[ID.caller].open, "a Shift+click opened the box");
  assert(!after[ID.caller].pinned, "a Shift+click pinned the box");
  assertSamePositions(before, after, SEVEN, "a Shift+click");

  await h.click(await header());
  await h.until(
    () => h.posted("openInEditor"),
    (all) => all.length === jumps + 1,
    "openInEditor after a plain click",
  );
  const opened = await h.until(
    () => h.nodes(),
    (nodes) => nodes[ID.caller].open,
    "a plain click to open the box",
  );
  assert(opened[ID.caller].open, "a plain click did not open the box");
  assert(
    (await h.posted("pathClick")).length === marks + 1,
    "a plain click posted pathClick",
  );
}

async function refreshRebuildsInPlace(h) {
  await h.send(messages.oldCentre(SOURCE_VERSION));
  await h.send(messages.pathFound(SOURCE_VERSION));
  const before = await stableNodes(
    h,
    (found) => allDrawn(SEVEN)(found) && found[ID.end].route,
    "the path graph",
  );
  const requests = (await h.posted("refresh")).length;
  await h.click(await h.call("centreOfButton", "Refresh"));
  const sent = await h.until(
    () => h.posted("refresh"),
    (all) => all.length === requests + 1,
    "a refresh message",
  );
  const refresh = sent.at(-1);
  assert(
    refresh.pathEndId === ID.end && refresh.focusId === ID.start,
    `wrong message ${JSON.stringify(refresh)}`,
  );

  await h.send(messages.refreshedWider(refresh.generation, SOURCE_VERSION + 1));
  const after = await h.until(
    () => h.nodes(),
    allDrawn(EIGHT),
    "the new route box",
  );
  assertSamePositions(before, after, SEVEN, "the refresh");
  assert(after[ID.footer].route, "the new box is not on the route");
  assert(after[ID.footer].tag === "", "the new box has a tag");
  const text = await h.until(
    () => summaryText(h),
    (found) => found === SUMMARY,
    "the new summary",
  );
  assert(text === SUMMARY, `wrong summary ${text}`);
  const button = await h.call("buttonState", "Refresh");
  assert(!button.disabled, "Refresh stayed disabled after the answer");
}

async function reloadRestoresPath(h) {
  await h.until(
    () => h.call("savedState"),
    (saved) => saved?.current?.path?.summary.routes === 2,
    "the saved path graph",
  );
  const before = await h.nodes();
  await h.reload();
  const after = await h.until(
    () => h.nodes(),
    allDrawn(EIGHT),
    "the restored boxes",
  );
  assertSamePositions(before, after, EIGHT, "the reload");
  const onRoute = [...ROUTE, ID.footer];
  for (const id of EIGHT) {
    assert(
      after[id].route === onRoute.includes(id),
      `${id} route flag is ${after[id].route} after the reload`,
    );
  }
  assert(after[ID.start].tag === "A", "A lost its tag");
  assert(after[ID.end].tag === "B", "B lost its tag");
  const edges = await h.edges();
  assert(
    edges.filter((edge) => edge.route).length === 6,
    "the restored graph lost route edges",
  );
  const text = await h.until(
    () => summaryText(h),
    (found) => found === SUMMARY,
    "the summary after the reload",
  );
  assert(text === SUMMARY, `wrong summary ${text}`);
}

module.exports = [
  {
    name: "a Shift+click posts pathClick, never jumps, opens or pins, and a plain click still opens",
    run: shiftClickMarks,
  },
  {
    name: "Refresh on a path graph posts pathEndId and an answer with a new route box rebuilds in place",
    run: refreshRebuildsInPlace,
  },
  {
    name: "a reload restores the path graph with its route and summary",
    run: reloadRestoresPath,
  },
];
