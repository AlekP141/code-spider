import { describe, expect, it, vi } from "vitest";
import { PathStart } from "../../src/session/path-start.js";

const mark = { project: "/repo/tsconfig.json", nodeId: "a.ts#f", name: "f" };

describe("PathStart", () => {
  it("starts empty", () => {
    expect(new PathStart().get()).toBeUndefined();
  });

  it("stores the mark on set and notifies once", () => {
    const start = new PathStart();
    const listener = vi.fn();
    start.onChange(listener);
    start.set(mark);
    expect(start.get()).toEqual(mark);
    expect(listener.mock.calls).toEqual([[mark]]);
  });

  it("moves the mark when set again and notifies", () => {
    const start = new PathStart();
    const listener = vi.fn();
    start.set(mark);
    start.onChange(listener);
    const moved = { ...mark, nodeId: "a.ts#g", name: "g" };
    start.set(moved);
    expect(start.get()).toEqual(moved);
    expect(listener.mock.calls).toEqual([[moved]]);
  });

  it("removes the mark on clear and notifies, and does nothing when empty", () => {
    const start = new PathStart();
    const listener = vi.fn();
    start.onChange(listener);
    start.clear();
    expect(listener).not.toHaveBeenCalled();
    start.set(mark);
    start.clear();
    expect(start.get()).toBeUndefined();
    expect(listener.mock.calls).toEqual([[mark], [undefined]]);
  });
});
