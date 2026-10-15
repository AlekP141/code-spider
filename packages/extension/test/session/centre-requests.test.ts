import { describe, expect, it, vi } from "vitest";
import { CentreRequests } from "../../src/session/centre-requests.js";
import { deferred } from "../support/session-setup.js";

function setup() {
  const post = vi.fn();
  return { post, requests: new CentreRequests({ post }) };
}

describe("CentreRequests", () => {
  it("counts up and only the latest token is current", () => {
    const { requests } = setup();
    const first = requests.next();
    const second = requests.next();
    expect(second).toBe(first + 1);
    expect(requests.latest()).toBe(second);
    expect(requests.isCurrent(first)).toBe(false);
    expect(requests.isCurrent(second)).toBe(true);
  });

  it("keeps busy on while another bracket runs and ends it with the last", async () => {
    const { post, requests } = setup();
    const one = deferred<void>();
    const two = deferred<void>();
    const first = requests.busy(() => one.promise);
    const second = requests.busy(() => two.promise);
    expect(post).toHaveBeenCalledWith({ type: "busy", busy: true });
    one.resolve();
    await first;
    expect(post).not.toHaveBeenCalledWith({ type: "busy", busy: false });
    two.resolve();
    await second;
    const off = post.mock.calls.filter(([m]) => m.busy === false);
    expect(off).toHaveLength(1);
    expect(post.mock.calls.at(-1)).toEqual([{ type: "busy", busy: false }]);
  });

  it("runs the registered listeners after counting", () => {
    const { requests } = setup();
    const seen: number[] = [];
    requests.onNext(() => seen.push(requests.latest()));
    requests.onNext(() => seen.push(-1));
    requests.next();
    requests.next();
    expect(seen).toEqual([1, -1, 2, -1]);
  });
});
