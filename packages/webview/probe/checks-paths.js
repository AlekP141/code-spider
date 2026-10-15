"use strict";

const { assert, sleep } = require("./harness.js");
const { messages: base } = require("./fixtures.js");
const { ID, messages } = require("./fixtures-paths.js");

const SOURCE_VERSION = 5;
const SEARCH_ID = 9;
const PITCH = 320 + 192;
const SPINNER_WAIT_MS = 700;
const CLICK_SETTLE_MS = 450;
const BLUE = "rgb(55, 148, 255)";
const HANDLE_REACH = 6;
const ROUTE = [ID.start, ID.profile, ID.page, ID.header, ID.end];
const SEVEN = [...ROUTE, ID.callee, ID.caller];
const COLUMN = {
  [ID.callee]: -1,
  [ID.caller]: 1,
  [ID.start]: 0,
  [ID.profile]: 1,
  [ID.page]: 2,
  [ID.header]: 3,
  [ID.end]: 4,
};

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

function overlayText(h) {
  return h.evaluate(
    'document.querySelector(".path-overlay-text")?.textContent ?? null',
  );
}

function spinnerShown(h) {
  return h.evaluate('document.querySelector(".spinner") !== null');
}

async function overlayShowsAndCancels(h) {
  await h.send(base.settings());
  await h.send({ type: "busy", busy: true });
  await h.send(messages.searching(SEARCH_ID));
  const first = await h.until(
    () => overlayText(h),
    (text) => text !== null,
    "the overlay",
  );
  assert(
    first === "Searching for paths from fetchUser to renderAvatar...",
    `wrong overlay text: ${first}`,
  );
  const role = await h.evaluate(`(() => {
    const overlay = document.querySelector(".path-overlay");
    return [overlay.getAttribute("role"), overlay.getAttribute("aria-live")];
  })()`);
  assert(role.join() === "status,polite", `overlay roles are ${role}`);

  await h.send(messages.searching(SEARCH_ID, 140, 3));
  await h.until(
    () => overlayText(h),
    (text) => text?.endsWith("140 functions checked, 3 routes so far"),
    "the counts in the overlay",
  );
  await sleep(SPINNER_WAIT_MS);
  assert(
    !(await spinnerShown(h)),
    "the generic spinner showed under the overlay",
  );

  await h.click(await h.call("centreOfButton", "Cancel"));
  const [cancel] = await h.until(
    () => h.posted("cancelPath"),
    (found) => found.length === 1,
    "a cancelPath message",
  );
  assert(cancel.id === SEARCH_ID, `wrong message ${JSON.stringify(cancel)}`);
  const state = await h.until(
    () => h.call("buttonState", "Cancelling..."),
    (found) => found !== undefined,
    "a Cancelling... button",
  );
  assert(state.disabled, "Cancelling... is not disabled");

  await h.send(messages.pathSearch(undefined));
  await h.send({ type: "busy", busy: false });
  await h.until(
    () => overlayText(h),
    (text) => text === null,
    "the overlay to go",
  );
}

function startOf(d) {
  const match = /^M\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)/.exec(d);
  return match && { x: Number(match[1]), y: Number(match[2]) };
}

function assertColumns(nodes) {
  for (const id of SEVEN) {
    const expected = nodes[ID.start].x + COLUMN[id] * PITCH;
    assert(
      Math.abs(nodes[id].x - expected) < 1,
      `${id} is at x ${nodes[id].x}, not ${expected}`,
    );
  }
  const routeXs = ROUTE.map((id) => nodes[id].x);
  assert(nodes[ID.start].x === Math.min(...routeXs), "A is not leftmost");
  assert(
    nodes[ID.end].x === Math.max(...SEVEN.map((id) => nodes[id].x)),
    "B is not rightmost",
  );
}

function assertLook(nodes) {
  for (const id of SEVEN) {
    const onRoute = ROUTE.includes(id);
    const shadow = nodes[id].shadow;
    const blue = shadow.includes(BLUE) && shadow.includes("3px");
    assert(
      onRoute ? blue : shadow === "none",
      `${id} has box-shadow "${shadow}"`,
    );
    assert(
      nodes[id].route === onRoute,
      `${id} route flag is ${nodes[id].route}`,
    );
    const tag = { [ID.start]: "A", [ID.end]: "B" }[id] ?? "";
    assert(nodes[id].tag === tag, `${id} has tag "${nodes[id].tag}"`);
  }
}

function assertEdges(edges, nodes) {
  assert(edges.length === 6, `${edges.length} edges, not 6`);
  const routeEdges = edges.filter((edge) => edge.route);
  assert(routeEdges.length === 4, `${routeEdges.length} route edges, not 4`);
  for (const edge of edges) {
    assert(
      (edge.stroke === BLUE) === edge.route &&
        (edge.width === "4px") === edge.route,
      `edge ${edge.id} is ${edge.stroke} at ${edge.width}, route ${edge.route}`,
    );
  }
  const backward = edges.find((edge) => edge.id === `${ID.end}->${ID.header}`);
  const from = startOf(backward.d);
  assert(
    from && Math.abs(from.x - nodes[ID.end].x) <= HANDLE_REACH,
    `the backward edge starts at ${backward.d.slice(0, 40)}, not at the left edge of the end box (x ${nodes[ID.end].x})`,
  );
  const forward = edges.find(
    (edge) => edge.id === `${ID.start}->${ID.profile}`,
  );
  const leaves = startOf(forward.d);
  assert(
    leaves && Math.abs(leaves.x - (nodes[ID.start].x + 320)) <= HANDLE_REACH,
    `the forward edge starts at ${forward.d.slice(0, 40)}, not at the right edge`,
  );
}

async function pathFoundDraws(h) {
  await h.send(messages.oldCentre(SOURCE_VERSION));
  await h.until(() => h.nodes(), allDrawn(SEVEN), "the graph before the path");
  await h.send(messages.pathFound(SOURCE_VERSION));
  const edges = await h.until(
    () => h.edges(),
    (found) =>
      found.length === 6 &&
      found.every((edge) => edge.d) &&
      found.filter((edge) => edge.route).length === 4,
    "six edges, four of them on the route",
  );
  const nodes = await h.until(() => h.nodes(), allDrawn(SEVEN), "seven boxes");
  assertColumns(nodes);
  assertLook(nodes);
  assertEdges(edges, nodes);
  const summary = await h.evaluate(`(() => {
    const element = document.querySelector(".toolbar-summary");
    return element && [
      element.getAttribute("role"),
      element.title,
      element.textContent,
    ];
  })()`);
  const text = "Paths fetchUser → renderAvatar: 1 route";
  assert(
    summary && summary.join("|") === `status|${text}|${text}`,
    `wrong summary ${JSON.stringify(summary)}`,
  );
  const ends = [ID.start, ID.end].filter((id) => nodes[id].open);
  assert(ends.length === 2, "A and B did not both start open");
}

async function doubleClicksOnEnds(h) {
  const before = (await h.posted()).length;
  await h.doubleClick(await h.call("centreOfNode", ID.start, ".node-header"));
  await sleep(CLICK_SETTLE_MS);
  const after = (await h.posted()).length;
  assert(after === before, `a double-click on A posted ${after - before}`);

  const expands = (await h.posted("expand")).length;
  await h.doubleClick(await h.call("centreOfNode", ID.end, ".node-header"));
  const expand = (
    await h.until(
      () => h.posted("expand"),
      (found) => found.length === expands + 1,
      "an expand message for B",
    )
  ).at(-1);
  assert(expand.nodeId === ID.end, `wrong message ${JSON.stringify(expand)}`);
  await h.send(messages.endExpansion(expand.generation));
  const grown = await h.until(
    () => h.nodes(),
    (found) => Object.hasOwn(found, ID.inner),
    "the expansion of B",
  );
  assert(grown[ID.inner].route === false, "an expansion box is on the route");

  await h.doubleClick(await h.call("centreOfNode", ID.end, ".node-header"));
  const shrunk = await h.until(
    () => h.nodes(),
    allDrawn(SEVEN),
    "the route boxes after collapsing B",
  );
  assert(
    ROUTE.every((id) => shrunk[id].route),
    "collapsing B changed the route boxes",
  );
}

async function startMarkShowsAndClears(h) {
  await h.send(messages.pathStart(ID.caller));
  const marked = await h.until(
    () => h.nodes(),
    (found) => found[ID.caller]?.marked,
    "the marked box",
  );
  assert(marked[ID.caller].tag === "A", "the marked box has no tag A");
  assert(
    marked[ID.caller].outline === "dashed",
    `the marked box outline is ${marked[ID.caller].outline}`,
  );
  const others = SEVEN.filter((id) => id !== ID.caller && marked[id].marked);
  assert(others.length === 0, `${others} were marked too`);
  assert(marked[ID.end].tag === "B", "the end box lost its tag");

  await h.send(messages.pathStart(undefined));
  const cleared = await h.until(
    () => h.nodes(),
    (found) => !found[ID.caller]?.marked,
    "the mark to clear",
  );
  assert(cleared[ID.caller].tag === "", "the box kept its tag");
  assert(cleared[ID.caller].outline !== "dashed", "the box kept its outline");
}

module.exports = [
  {
    name: "a path search shows the overlay in place of the spinner and Cancel posts cancelPath",
    run: overlayShowsAndCancels,
  },
  {
    name: "a path graph is drawn in columns with a blue outline, tags and a summary",
    run: pathFoundDraws,
  },
  {
    name: "a double-click does nothing on A and expands and collapses B",
    run: doubleClicksOnEnds,
  },
  {
    name: "the start mark tags a box A with a dashed outline and clears",
    run: startMarkShowsAndClears,
  },
  ...require("./checks-paths-actions.js"),
];
