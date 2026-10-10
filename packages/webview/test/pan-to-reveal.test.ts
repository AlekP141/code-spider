import { describe, expect, it } from "vitest";
import { boundingRect, panToReveal } from "../src/graph/pan-to-reveal.js";

const area = { width: 800, height: 600 };
const origin = { x: 0, y: 0, zoom: 1 };

describe("panToReveal", () => {
  it("does nothing when the box is already inside with 24 px clear", () => {
    expect(
      panToReveal(origin, area, { x: 100, y: 100, width: 200, height: 100 }),
    ).toBeUndefined();
    expect(
      panToReveal(origin, area, { x: 24, y: 24, width: 752, height: 552 }),
    ).toBeUndefined();
  });

  it("pans left by the overflow plus the padding when the box is off the right edge", () => {
    expect(
      panToReveal(origin, area, { x: 700, y: 100, width: 200, height: 100 }),
    ).toEqual({ x: -124, y: 0, zoom: 1 });
  });

  it("pans right when the box is off the left edge", () => {
    expect(
      panToReveal(origin, area, { x: -50, y: 100, width: 200, height: 100 }),
    ).toEqual({ x: 74, y: 0, zoom: 1 });
  });

  it("pans vertically when the box is below or above the area", () => {
    expect(
      panToReveal(origin, area, { x: 100, y: 550, width: 200, height: 100 }),
    ).toEqual({ x: 0, y: -74, zoom: 1 });
    expect(
      panToReveal(origin, area, { x: 100, y: -80, width: 200, height: 100 }),
    ).toEqual({ x: 0, y: 104, zoom: 1 });
  });

  it("pans both axes at once", () => {
    expect(
      panToReveal(origin, area, { x: 700, y: 550, width: 200, height: 100 }),
    ).toEqual({ x: -124, y: -74, zoom: 1 });
  });

  it("centres an axis on which the box does not fit", () => {
    expect(
      panToReveal(origin, area, { x: 0, y: 100, width: 2000, height: 100 }),
    ).toEqual({ x: -600, y: 0, zoom: 1 });
    expect(
      panToReveal(origin, area, { x: 100, y: 0, width: 200, height: 1400 }),
    ).toEqual({ x: 0, y: -400, zoom: 1 });
  });

  it("centres a box wider than the padded area but narrower than the area", () => {
    expect(
      panToReveal(origin, area, { x: 0, y: 100, width: 780, height: 100 }),
    ).toEqual({ x: 10, y: 0, zoom: 1 });
  });

  it("needs no further pan once it has panned, even at a fractional zoom", () => {
    const viewport = { x: 0, y: 0, zoom: 0.7 };
    const box = { x: 1359, y: 100, width: 108, height: 100 };
    const panned = panToReveal(viewport, area, box);
    expect(panned).toBeDefined();
    expect(panToReveal(panned ?? viewport, area, box)).toBeUndefined();
  });

  it("accounts for zoom and an existing pan, and never changes the zoom", () => {
    const viewport = { x: 100, y: 50, zoom: 2 };
    expect(
      panToReveal(viewport, area, { x: 300, y: 100, width: 100, height: 50 }),
    ).toEqual({ x: -24, y: 50, zoom: 2 });
  });

  it("honours a different padding", () => {
    expect(
      panToReveal(origin, area, { x: 750, y: 100, width: 100, height: 100 }, 0),
    ).toEqual({ x: -50, y: 0, zoom: 1 });
  });
});

describe("boundingRect", () => {
  it("is undefined for nothing and covers every rectangle otherwise", () => {
    expect(boundingRect([])).toBeUndefined();
    expect(
      boundingRect([
        { x: 10, y: 20, width: 100, height: 50 },
        { x: -30, y: 60, width: 40, height: 200 },
      ]),
    ).toEqual({ x: -30, y: 20, width: 140, height: 240 });
  });
});
