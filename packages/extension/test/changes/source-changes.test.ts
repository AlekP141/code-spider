import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSourceChanges } from "../../src/changes/source-changes.js";

describe("createSourceChanges", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const post = vi.fn();
    return { post, ...createSourceChanges(post, 200) };
  }

  it("posts one sourceChanged with the latest version after a burst", () => {
    const { post, changes } = setup();
    changes.mark("/repo/a.ts");
    changes.mark("/repo/b.ts");
    changes.mark("/repo/a.ts");
    vi.advanceTimersByTime(200);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ type: "sourceChanged", version: 3 });
  });

  it("posts nothing before the delay has passed", () => {
    const { post, changes } = setup();
    changes.mark("/repo/a.ts");
    vi.advanceTimersByTime(199);
    expect(post).not.toHaveBeenCalled();
  });

  it("posts nothing for a path that is not tracked", () => {
    const { post, changes } = setup();
    changes.mark("/repo/README.md");
    vi.advanceTimersByTime(1000);
    expect(post).not.toHaveBeenCalled();
  });

  it("posts a second message with a higher version for a later burst", () => {
    const { post, changes } = setup();
    changes.mark("/repo/a.ts");
    vi.advanceTimersByTime(200);
    changes.mark("/repo/a.ts");
    changes.mark("/repo/b.ts");
    vi.advanceTimersByTime(200);
    expect(post.mock.calls).toEqual([
      [{ type: "sourceChanged", version: 1 }],
      [{ type: "sourceChanged", version: 3 }],
    ]);
  });

  it("posts nothing when disposed before the delay passes", () => {
    const { post, changes, dispose } = setup();
    changes.mark("/repo/a.ts");
    dispose();
    vi.advanceTimersByTime(1000);
    expect(post).not.toHaveBeenCalled();
  });
});
