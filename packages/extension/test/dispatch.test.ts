import { describe, expect, it, vi } from "vitest";
import { createDispatcher } from "../src/dispatch.js";

function setup() {
  const jumps = { handle: vi.fn(async () => undefined) };
  const session = {
    focusNode: vi.fn(async () => undefined),
    expand: vi.fn(async () => undefined),
  };
  return { jumps, session, dispatch: createDispatcher({ jumps, session }) };
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

  it("ignores ready, refresh and setColumnGap", async () => {
    const { jumps, session, dispatch } = setup();
    await dispatch({ type: "ready" });
    await dispatch({ type: "refresh" });
    await dispatch({ type: "setColumnGap", value: 128 });
    expect(jumps.handle).not.toHaveBeenCalled();
    expect(session.focusNode).not.toHaveBeenCalled();
    expect(session.expand).not.toHaveBeenCalled();
  });
});
