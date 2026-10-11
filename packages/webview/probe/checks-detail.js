"use strict";

const { assert, assertSamePositions } = require("./harness.js");
const { ID, PROJECT, REFRESHED_MARKER, messages } = require("./fixtures.js");

const KEPT = [ID.main, ID.helper, ID.format, ID.parse, ID.validate];
const DOT_LABEL = "Files changed since this graph was drawn";
const DOT = `document.querySelector('[role="img"][aria-label="${DOT_LABEL}"]') !== null`;
const ZOOMED_OUT =
  'document.querySelector(".graph-canvas").classList.contains("is-zoomed-out")';
const LOD_ZOOM = 0.5;
const MAX_TICKS = 40;
const TICK = 100;

function overlaps(a, b) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

async function sendRefresh(h, shared) {
  await h.click(await h.call("centreOfButton", "Refresh"));
  const [request] = await h.until(
    () => h.posted("refresh"),
    (found) => found.length === 1,
    "a refresh message",
  );
  const wanted = JSON.stringify({
    type: "refresh",
    project: PROJECT,
    generation: shared.generation,
    focusId: ID.main,
    expanded: [ID.helper],
  });
  assert(
    JSON.stringify(request) === wanted,
    `wrong refresh message ${JSON.stringify(request)}`,
  );
}

async function refreshChangesCode(h, shared) {
  const before = await h.nodes();
  await sendRefresh(h, shared);
  await h.watchEntering();
  await h.send(messages.refreshed(shared.generation, 1));
  const after = await h.until(
    () => h.nodes(),
    (found) =>
      found[ID.extra] && found[ID.main].code.includes(REFRESHED_MARKER),
    "the refreshed code and the new box",
  );
  assertSamePositions(before, after, KEPT, "refresh");
  assert(
    after[ID.main].height > before[ID.main].height,
    "the changed box did not grow",
  );
  assert(after[ID.format].pinned, "refresh lost a pin");
  for (const id of KEPT) {
    assert(!overlaps(after[ID.extra], after[id]), `the new box overlaps ${id}`);
  }
  const edgeId = `${ID.extra}->${ID.main}`;
  await h.until(
    () => h.edges(),
    (found) => found.some((edge) => edge.id === edgeId && edge.length > 0),
    "the new neighbour's edge in the DOM",
    2000,
  );
  const entered = await h.entered();
  assert(
    entered.includes(ID.extra) && entered.includes(edgeId),
    `the new box and edge did not fade in (saw ${JSON.stringify(entered)})`,
  );
  const button = await h.call("buttonState", "Refresh");
  assert(!button.disabled, "Refresh stayed disabled after the answer");
}

async function dotFollowsSourceVersion(h, shared) {
  assert(!(await h.evaluate(DOT)), "the dot shows before any change");
  await h.send(messages.sourceChanged(2));
  await h.waitFor(DOT, "the dot after sourceChanged");
  await h.send(messages.refreshed(shared.generation, 2));
  await h.until(
    () => h.evaluate(DOT),
    (shown) => !shown,
    "the dot to clear after a newer refresh",
  );
}

function zoomAndClass(h) {
  return h.until(
    async () => ({
      zoom: await h.zoom(),
      zoomedOut: await h.evaluate(ZOOMED_OUT),
    }),
    ({ zoom, zoomedOut }) => zoomedOut === zoom < LOD_ZOOM,
    "is-zoomed-out to follow the zoom",
    2000,
  );
}

async function zoomUntil(h, deltaY, reached) {
  const at = await h.call("canvasCentre");
  let { zoom } = await zoomAndClass(h);
  for (let tick = 0; !reached(zoom) && tick < MAX_TICKS; tick += 1) {
    const previous = zoom;
    await h.wheel(at, deltaY);
    await h.until(
      () => h.zoom(),
      (now) => now !== previous,
      "the zoom to change after a wheel tick",
      2000,
    );
    zoom = (await zoomAndClass(h)).zoom;
  }
  assert(reached(zoom), `the zoom ${zoom} never got there`);
}

async function zoomTogglesBars(h) {
  await zoomUntil(h, TICK, (zoom) => zoom < LOD_ZOOM);
  assert(await h.evaluate(ZOOMED_OUT), "no is-zoomed-out below 0.5");
  const colour = await h.evaluate(
    'getComputedStyle(document.querySelector(".code-text")).color',
  );
  assert(colour === "rgba(0, 0, 0, 0)", `the code text shows (${colour})`);
  await zoomUntil(h, -TICK, (zoom) => zoom >= LOD_ZOOM);
  assert(
    !(await h.evaluate(ZOOMED_OUT)),
    "is-zoomed-out stayed after zooming in",
  );
}

const hasCurve = (edge) => edge.d.includes("C");

function allEdges(h, test, description) {
  return h.until(
    () => h.edges(),
    (edges) => edges.length > 0 && edges.every((edge) => edge.d && test(edge)),
    description,
  );
}

async function pressLines(h, label, value) {
  await h.click(await h.call("centreOfButton", label));
  await h.until(
    () => h.posted("setEdgeStyle"),
    (found) => found.at(-1)?.value === value,
    `setEdgeStyle ${value}`,
  );
}

async function assertPressed(h, label) {
  const state = await h.call("buttonState", label);
  assert(state.pressed === "true", `${label} is not pressed`);
}

async function linesSwitchChangesPaths(h) {
  await allEdges(h, (edge) => !hasCurve(edge), "stepped paths without a C");
  await assertPressed(h, "Stepped");
  await pressLines(h, "Curved", "curved");
  await allEdges(h, hasCurve, "curved paths with a C");
  await assertPressed(h, "Curved");
  await pressLines(h, "Stepped", "stepped");
  await allEdges(h, (edge) => !hasCurve(edge), "stepped paths again");
  await assertPressed(h, "Stepped");
}

module.exports = [
  {
    name: "refresh posts refresh and rebuilds from the answer",
    run: refreshChangesCode,
  },
  { name: "the dot follows the source version", run: dotFollowsSourceVersion },
  {
    name: "zooming out draws grey bars and zooming in removes them",
    run: zoomTogglesBars,
  },
  {
    name: "the Lines switch changes the edge paths",
    run: linesSwitchChangesPaths,
  },
];
