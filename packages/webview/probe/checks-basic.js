"use strict";

const { assert, assertSamePositions } = require("./harness.js");
const { ID, PROJECT, messages } = require("./fixtures.js");

const THREE = [ID.main, ID.helper, ID.format];
const FIVE = [...THREE, ID.parse, ID.validate];
const DRAG_OFFSETS = [
  [0, 160],
  [0, -160],
  [160, 0],
  [-160, 0],
  [160, 160],
  [-160, -160],
];
const MARGIN = 12;
const TOOLBAR_HEIGHT = 60;
const DRAG_STEPS = 12;

function hasSize(box) {
  return box.width > 0 && box.height > 0;
}

function onlyIds(nodes, ids) {
  const found = Object.keys(nodes).sort();
  const wanted = [...ids].sort();
  return (
    found.length === wanted.length && wanted.every((id, i) => id === found[i])
  );
}

function allDrawn(ids) {
  return (nodes) =>
    onlyIds(nodes, ids) && ids.every((id) => hasSize(nodes[id]));
}

async function assertCspBlocksEval(h) {
  const outcome = await h.evaluate(`
    (() => {
      const attempts = {
        eval: () => (0, eval)("1"),
        Function: () => new Function("return 1")(),
      };
      const result = {};
      for (const [name, attempt] of Object.entries(attempts)) {
        try {
          attempt();
          result[name] = "allowed";
        } catch (error) {
          result[name] = error.name;
        }
      }
      return result;
    })()
  `);
  await h.frame();
  await h.evaluate("window.__violations.splice(0).length");
  assert(
    outcome.eval === "EvalError" && outcome.Function === "EvalError",
    `the page's CSP allows code from strings (${JSON.stringify(outcome)})`,
  );
}

async function centreDraws(h) {
  await assertCspBlocksEval(h);
  const ready = await h.posted("ready");
  assert(ready.length === 1, "the page did not post ready once");
  await h.send(messages.settings());
  await h.send(messages.centre(1));
  const nodes = await h.until(
    () => h.nodes(),
    allDrawn(THREE),
    "three boxes of non-zero size",
  );
  const edges = await h.until(
    () => h.edges(),
    (found) =>
      found.length === 2 && found.every((edge) => edge.d && edge.length > 0),
    "two edges with non-empty paths",
  );
  const invisible = edges.filter((edge) => edge.stroke === "none");
  assert(
    invisible.length === 0,
    `edges drawn with no stroke colour: ${invisible.map((edge) => edge.id)}`,
  );
  assert(
    nodes[ID.main].x > nodes[ID.helper].x,
    "the supplier is not left of the consumer",
  );
}

async function clickOpensEditor(h) {
  const before = await h.nodes();
  const header = await h.call("centreOfNode", ID.helper, ".node-header");
  const wanted = JSON.stringify({
    type: "openInEditor",
    project: PROJECT,
    nodeId: ID.helper,
  });
  for (const [travel, count] of [
    [0, 1],
    [3, 2],
  ]) {
    await h.click(header, travel);
    const opened = await h.until(
      () => h.posted("openInEditor"),
      (found) => found.length === count,
      `openInEditor after a click moving ${travel}px`,
    );
    const last = JSON.stringify(opened.at(-1));
    assert(last === wanted, `wrong message ${last}`);
  }
  const after = await h.nodes();
  assertSamePositions(before, after, THREE, "a click");
  const pinned = THREE.filter((id) => after[id].pinned);
  assert(pinned.length === 0, `a click pinned ${pinned}`);
}

async function doubleClickExpands(h, shared) {
  const before = await h.nodes();
  const header = await h.call("centreOfNode", ID.helper, ".node-header");
  await h.doubleClick(header);
  const [expand] = await h.until(
    () => h.posted("expand"),
    (found) => found.length === 1,
    "an expand message",
  );
  assert(
    expand.nodeId === ID.helper && expand.project === PROJECT,
    `wrong message ${JSON.stringify(expand)}`,
  );
  shared.generation = expand.generation;
  await h.send(messages.expansion(ID.helper, expand.generation));
  const after = await h.until(
    () => h.nodes(),
    allDrawn(FIVE),
    "the answer's boxes",
  );
  assertSamePositions(before, after, THREE, "the expansion");
  await h.frame();
  await h.frame();
  const later = await h.nodes();
  assertSamePositions(before, later, THREE, "the expansion, later,");
}

function isClear(box, others, offset, view) {
  const left = box.left + offset[0];
  const top = box.top + offset[1];
  const inside =
    left > 0 &&
    top > TOOLBAR_HEIGHT &&
    left + box.width < view.width &&
    top + box.height < view.height;
  const apart = (other) =>
    left + box.width + MARGIN < other.left ||
    other.left + other.width + MARGIN < left ||
    top + box.height + MARGIN < other.top ||
    other.top + other.height + MARGIN < top;
  return inside && others.every(apart);
}

/** Dropped on an empty spot, so a later refresh has no overlap to resolve. */
async function pickDrag(h, before) {
  const view = await h.call("windowSize");
  const others = FIVE.filter((id) => id !== ID.format).map((id) => before[id]);
  const offset = DRAG_OFFSETS.find((candidate) =>
    isClear(before[ID.format], others, candidate, view),
  );
  assert(offset, "no free spot in the window to drop the dragged box");
  const from = await h.call("centreOfNode", ID.format, ".node-header");
  return { from, to: { x: from.x + offset[0], y: from.y + offset[1] } };
}

function travelled(box, before, zoom) {
  return Math.hypot((box.x - before.x) * zoom, (box.y - before.y) * zoom);
}

async function dragKeepsEdges(h) {
  const before = await h.nodes();
  const zoom = await h.zoom();
  const { from, to } = await pickDrag(h, before);
  const wanted = Math.hypot(to.x - from.x, to.y - from.y);
  const expected = (await h.edges()).length;
  await h.startRecording();
  await h.drag(from, to, DRAG_STEPS, async (step) => {
    if (step < DRAG_STEPS) return;
    const live = (await h.nodes())[ID.format];
    const moved = travelled(live, before[ID.format], zoom);
    assert(
      moved > wanted * 0.8,
      `the box had moved ${moved.toFixed(1)}px of ${wanted.toFixed(1)}px before the button was released`,
    );
  });
  const frames = await h.stopRecording();
  assert(
    Math.min(...frames) === expected,
    `edges with a path per frame during the drag (want ${expected}): ${frames.join(",")}`,
  );
  const dragged = await h.until(
    () => h.nodes(),
    (found) => found[ID.format]?.pinned,
    "the pin on the dragged box",
  );
  const moved = travelled(dragged[ID.format], before[ID.format], zoom);
  assert(
    moved > wanted * 0.8,
    `the box moved ${moved.toFixed(1)}px of ${wanted.toFixed(1)}px`,
  );
  const others = THREE.filter((id) => id !== ID.format);
  assertSamePositions(before, dragged, others, "the drag");
}

async function reloadRestores(h) {
  const before = await h.nodes();
  const dragged = before[ID.format];
  await h.until(
    () => h.call("savedState"),
    (saved) =>
      saved?.current?.pinned.includes(ID.format) &&
      Math.abs(saved.current.positions[ID.format]?.x - dragged.x) < 0.01,
    "the saved state to hold the dragged box",
  );
  await h.reload();
  const after = await h.until(
    () => h.nodes(),
    allDrawn(FIVE),
    "the restored boxes",
  );
  assertSamePositions(before, after, FIVE, "the reload");
  assert(after[ID.format].pinned, "the pin was not restored");
  assert((await h.edges()).length === 4, "the restored graph lost edges");
  await h.until(
    () => h.posted("ready"),
    (found) => found.length === 1,
    "ready after the reload",
  );
}

module.exports = [
  { name: "a centre slice draws its boxes and edges", run: centreDraws },
  { name: "a click opens the editor and does not pin", run: clickOpensEditor },
  {
    name: "a double-click expands and keeps positions",
    run: doubleClickExpands,
  },
  { name: "a drag keeps the edges and pins the box", run: dragKeepsEdges },
  { name: "a reload restores the graph and positions", run: reloadRestores },
];
