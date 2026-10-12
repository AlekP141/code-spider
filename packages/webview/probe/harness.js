"use strict";

const { pageHelpers } = require("./page-helpers.js");

const FRAME_TIMEOUT_MS = 3000;
const POLL_MS = 25;
const WAIT_MS = 10000;
const NEAR = 0.75;
const IGNORED_ERRORS = /ResizeObserver loop/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Harness {
  constructor(win) {
    this.win = win;
    this.contents = win.webContents;
  }

  evaluate(code) {
    return this.contents.executeJavaScript(code);
  }

  call(name, ...args) {
    return this.evaluate(`window.__probe.${name}(...${JSON.stringify(args)})`);
  }

  async installHelpers() {
    await this.evaluate(`(${pageHelpers.toString()})()`);
  }

  async frame() {
    const frames = `new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
    })`;
    const fired = await Promise.race([
      this.evaluate(frames),
      sleep(FRAME_TIMEOUT_MS).then(() => false),
    ]);
    if (!fired) throw new Error("the page never produced an animation frame");
  }

  async waitFor(expression, description, timeoutMs = WAIT_MS) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = await this.evaluate(expression);
      if (value) return value;
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${description}`);
      }
      await sleep(POLL_MS);
    }
  }

  async until(read, test, description, timeoutMs = WAIT_MS) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = await read();
      if (test(value)) return value;
      if (Date.now() > deadline) {
        const last = JSON.stringify(value)?.slice(0, 300);
        throw new Error(`timed out waiting for ${description} (last: ${last})`);
      }
      await sleep(POLL_MS);
    }
  }

  async send(message) {
    await this.evaluate(
      `window.postMessage(${JSON.stringify(message)}, "*"), true`,
    );
    await this.frame();
  }

  nodes() {
    return this.call("nodes");
  }

  edges() {
    return this.call("edges");
  }

  zoom() {
    return this.call("zoom");
  }

  posted(type) {
    return this.call("posted").then((all) =>
      type ? all.filter((message) => message.type === type) : all,
    );
  }

  async input(event) {
    this.contents.sendInputEvent({
      ...event,
      x: Math.round(event.x),
      y: Math.round(event.y),
    });
    await this.frame();
  }

  move(at, pressed = false) {
    const modifiers = pressed ? ["leftButtonDown"] : [];
    return this.input({ type: "mouseMove", ...at, modifiers });
  }

  async press(at, clickCount = 1) {
    await this.input({ type: "mouseDown", ...at, button: "left", clickCount });
  }

  async release(at, clickCount = 1) {
    await this.input({ type: "mouseUp", ...at, button: "left", clickCount });
  }

  async click(at, travel = 0) {
    await this.move(at);
    await this.press(at);
    const end = { x: at.x + travel, y: at.y };
    if (travel > 0) await this.move(end, true);
    await this.release(end);
  }

  async doubleClick(at) {
    await this.move(at);
    for (const count of [1, 2]) {
      await this.press(at, count);
      await this.release(at, count);
    }
  }

  async drag(from, to, steps, whileDragging) {
    await this.move(from);
    await this.press(from);
    for (let step = 1; step <= steps; step += 1) {
      const at = {
        x: from.x + ((to.x - from.x) * step) / steps,
        y: from.y + ((to.y - from.y) * step) / steps,
      };
      await this.move(at, true);
      if (whileDragging) await whileDragging(step);
    }
    await this.release(to);
  }

  /** `deltaY` has the sign of a DOM wheel event; Electron's is the opposite. */
  async wheel(at, deltaY) {
    await this.move(at);
    await this.input({ type: "mouseWheel", ...at, deltaX: 0, deltaY: -deltaY });
  }

  async reload() {
    const loaded = new Promise((resolve) =>
      this.contents.once("did-finish-load", resolve),
    );
    this.contents.reload();
    await loaded;
    await this.installHelpers();
    await this.frame();
  }

  startRecording() {
    return this.call("startRecording");
  }

  stopRecording() {
    return this.call("stopRecording");
  }

  watchEntering() {
    return this.evaluate(`
      (() => {
        window.__enteringObserver?.disconnect();
        window.__entering = new Set();
        const note = () => {
          for (const element of document.querySelectorAll(".is-entering")) {
            window.__entering.add(element.dataset.id);
          }
        };
        window.__enteringObserver = new MutationObserver(note);
        window.__enteringObserver.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["class"],
        });
        return true;
      })()
    `);
  }

  entered() {
    return this.evaluate("[...window.__entering]");
  }

  async pageProblems() {
    const problems = await this.call("problems");
    return problems.filter((problem) => !IGNORED_ERRORS.test(problem));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSamePositions(before, after, ids, what) {
  for (const id of ids) {
    const moved =
      Math.abs(before[id].x - after[id].x) > NEAR ||
      Math.abs(before[id].y - after[id].y) > NEAR;
    assert(
      !moved,
      `${what} moved ${id} from ${before[id].x},${before[id].y} to ${after[id].x},${after[id].y}`,
    );
  }
}

module.exports = { Harness, assert, assertSamePositions, sleep };
