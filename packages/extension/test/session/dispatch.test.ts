import { describe, expect, it, vi } from "vitest";
import { createDispatcher } from "../../src/session/dispatch.js";

function setup() {
  const jumps = { handle: vi.fn(async () => undefined) };
  const session = {
    focusNode: vi.fn(async () => undefined),
    expand: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
  };
  const columnGap = { set: vi.fn(async () => undefined) };
  const edgeStyle = { set: vi.fn(async () => undefined) };
  return {
    jumps,
    session,
    columnGap,
    edgeStyle,
    dispatch: createDispatcher({ jumps, session, columnGap, edgeStyle }),
  };
}

describe("createDispatcher", () => {
  it("routes jump messages to the jump handler", async () => {
    const { jumps, session, dispatch } = setup();
    const open = {
      type: "openInEditor",
      project: "/p/tsconfig.json",
      nodeId: "a.ts#f",
    } as const;
    const site = {
      type: "openCallSite",
      project: "/p/tsconfig.json",
      edgeId: "a->b",
    } as const;
    await dispatch(open);
    await dispatch(site);
    expect(jumps.handle.mock.calls).toEqual([[open], [site]]);
    expect(session.focusNode).not.toHaveBeenCalled();
    expect(session.expand).not.toHaveBeenCalled();
  });

  it("routes focus to focusNode with the project and node", async () => {
    const { jumps, session, dispatch } = setup();
    await dispatch({
      type: "focus",
      project: "/p/tsconfig.json",
      nodeId: "a.ts#f",
    });
    expect(session.focusNode).toHaveBeenCalledWith({
      project: "/p/tsconfig.json",
      nodeId: "a.ts#f",
    });
    expect(jumps.handle).not.toHaveBeenCalled();
  });

  it("routes expand to expand with the generation", async () => {
    const { session, dispatch } = setup();
    await dispatch({
      type: "expand",
      project: "/p/tsconfig.json",
      nodeId: "a.ts#f",
      generation: 4,
    });
    expect(session.expand).toHaveBeenCalledWith({
      project: "/p/tsconfig.json",
      nodeId: "a.ts#f",
      generation: 4,
    });
  });

  it("routes setColumnGap to the store and runs nothing else", async () => {
    const { jumps, session, columnGap, dispatch } = setup();
    await dispatch({ type: "setColumnGap", value: 128 });
    expect(columnGap.set.mock.calls).toEqual([[128]]);
    expect(jumps.handle).not.toHaveBeenCalled();
    expect(session.focusNode).not.toHaveBeenCalled();
    expect(session.expand).not.toHaveBeenCalled();
  });

  it("routes setEdgeStyle to its store and runs nothing else", async () => {
    const { jumps, session, columnGap, edgeStyle, dispatch } = setup();
    await dispatch({ type: "setEdgeStyle", value: "curved" });
    expect(edgeStyle.set.mock.calls).toEqual([["curved"]]);
    expect(columnGap.set).not.toHaveBeenCalled();
    expect(jumps.handle).not.toHaveBeenCalled();
    expect(session.focusNode).not.toHaveBeenCalled();
    expect(session.expand).not.toHaveBeenCalled();
    expect(session.refresh).not.toHaveBeenCalled();
  });

  it("routes refresh to the session with its four fields and runs nothing else", async () => {
    const { jumps, session, columnGap, edgeStyle, dispatch } = setup();
    await dispatch({
      type: "refresh",
      project: "/p/tsconfig.json",
      generation: 6,
      focusId: "a.ts#f",
      expanded: ["a.ts#g"],
    });
    expect(session.refresh.mock.calls).toEqual([
      [
        {
          project: "/p/tsconfig.json",
          generation: 6,
          focusId: "a.ts#f",
          expanded: ["a.ts#g"],
        },
      ],
    ]);
    expect(jumps.handle).not.toHaveBeenCalled();
    expect(session.focusNode).not.toHaveBeenCalled();
    expect(session.expand).not.toHaveBeenCalled();
    expect(columnGap.set).not.toHaveBeenCalled();
    expect(edgeStyle.set).not.toHaveBeenCalled();
  });

  it("ignores ready", async () => {
    const { jumps, session, columnGap, edgeStyle, dispatch } = setup();
    await dispatch({ type: "ready" });
    expect(jumps.handle).not.toHaveBeenCalled();
    expect(session.focusNode).not.toHaveBeenCalled();
    expect(session.expand).not.toHaveBeenCalled();
    expect(session.refresh).not.toHaveBeenCalled();
    expect(columnGap.set).not.toHaveBeenCalled();
    expect(edgeStyle.set).not.toHaveBeenCalled();
  });
});
