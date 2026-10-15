import { describe, expect, it, vi } from "vitest";
import { createDispatcher } from "../../src/session/dispatch.js";

function setup() {
  const session = {
    focusNode: vi.fn(async () => undefined),
    expand: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    recolour: vi.fn(async () => undefined),
  };
  const paths = {
    click: vi.fn(async () => undefined),
    cancel: vi.fn(() => undefined),
  };
  const store = { set: vi.fn(async () => undefined) };
  const dispatch = createDispatcher({
    jumps: { handle: vi.fn(async () => undefined) },
    session,
    paths,
    columnGap: store,
    edgeStyle: store,
    diffMode: store,
    testVisibility: store,
  });
  return { session, paths, dispatch };
}

describe("createDispatcher for paths", () => {
  it("routes pathClick to paths.click", async () => {
    const { session, paths, dispatch } = setup();
    await dispatch({
      type: "pathClick",
      project: "/p/tsconfig.json",
      nodeId: "a.ts#f",
    });
    expect(paths.click.mock.calls).toEqual([
      [{ project: "/p/tsconfig.json", nodeId: "a.ts#f" }],
    ]);
    expect(session.focusNode).not.toHaveBeenCalled();
    expect(paths.cancel).not.toHaveBeenCalled();
  });

  it("routes cancelPath to paths.cancel", async () => {
    const { paths, dispatch } = setup();
    await dispatch({ type: "cancelPath", id: 5 });
    expect(paths.cancel.mock.calls).toEqual([[5]]);
    expect(paths.click).not.toHaveBeenCalled();
  });

  it("passes pathEndId on a refresh to the session", async () => {
    const { session, paths, dispatch } = setup();
    await dispatch({
      type: "refresh",
      project: "/p/tsconfig.json",
      generation: 6,
      focusId: "a.ts#f",
      expanded: [],
      pathEndId: "b.ts#g",
    });
    expect(session.refresh.mock.calls).toEqual([
      [
        {
          project: "/p/tsconfig.json",
          generation: 6,
          focusId: "a.ts#f",
          expanded: [],
          pathEndId: "b.ts#g",
        },
      ],
    ]);
    expect(paths.click).not.toHaveBeenCalled();
  });
});
