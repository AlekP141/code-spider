import { describe, expect, it } from "vitest";
import { createWorkerHandler } from "../../src/worker/handler.js";
import type {
  RefreshResult,
  WorkerResponse,
} from "../../src/worker/protocol.js";
import { fixturePath } from "../support/fixtures.js";

const tsconfig = fixturePath("paths", "tsconfig.json");
const limits = { timeLimitMs: 60_000, maxBoxes: 200 };

const LOAD_ROWS = "src/report.ts#loadRows";
const RENDER_CELL = "src/report.ts#renderCell";

function flag(set = false): SharedArrayBuffer {
  const buffer = new SharedArrayBuffer(4);
  if (set) Atomics.store(new Int32Array(buffer), 0, 1);
  return buffer;
}

function refresh(
  overrides: {
    focusId?: string;
    endId?: string;
    expanded?: string[];
    cancel?: SharedArrayBuffer;
    timeLimitMs?: number;
    withPath?: boolean;
    now?: () => number;
  } = {},
): RefreshResult {
  const handle = createWorkerHandler(undefined, overrides.now);
  const response: WorkerResponse = handle({
    id: 8,
    kind: "refresh",
    tsconfig,
    focusId: overrides.focusId ?? LOAD_ROWS,
    expanded: overrides.expanded ?? [],
    changedFiles: [],
    ...(overrides.withPath === false
      ? {}
      : {
          path: {
            endId: overrides.endId ?? RENDER_CELL,
            limits: { ...limits, timeLimitMs: overrides.timeLimitMs ?? 60_000 },
            cancel: overrides.cancel ?? flag(),
          },
        }),
  });
  if (response.kind !== "refreshed") throw new Error(response.kind);
  return response.result;
}

describe("worker refresh with a path", () => {
  it("returns the normal centre slice with route and path beside it", () => {
    const result = refresh();
    const plain = refresh({ withPath: false });
    expect(result.centre).toEqual(plain.centre);
    expect(result.route?.nodes).toHaveLength(5);
    expect(result.path?.endId).toBe(RENDER_CELL);
    expect(result.path?.boxes).toHaveLength(5);
    expect(result.pathStatus).toBeUndefined();
  });

  it("runs the centre's expansions as a normal refresh does", () => {
    const expanded = ["src/report.ts#readRows", "src/report.ts#buildReport"];
    const result = refresh({ expanded });
    expect(result.expansions.map((item) => item.nodeId)).toEqual(expanded);
    expect(result.expansions).toEqual(
      refresh({ expanded, withPath: false }).expansions,
    );
  });

  it("gives no centre, status gone and no expansions for a missing start", () => {
    const result = refresh({
      focusId: "src/report.ts#vanished",
      expanded: ["src/report.ts#readRows"],
    });
    expect(result.centre).toBeUndefined();
    expect(result.pathStatus).toBe("gone");
    expect(result.expansions).toEqual([]);
    expect(result.route).toBeUndefined();
  });

  it("gives no centre and status none for no route, with pathStoppedBy when time ended it", () => {
    const none = refresh({
      focusId: "src/lonely.ts#lonely",
      endId: "src/lonely.ts#elsewhere",
      expanded: ["src/lonely.ts#lonely"],
    });
    expect(none.centre).toBeUndefined();
    expect(none.pathStatus).toBe("none");
    expect(none.pathStoppedBy).toBeUndefined();
    expect(none.expansions).toEqual([]);

    let clock = 0;
    const timed = refresh({
      timeLimitMs: 5,
      now: () => (clock += 10),
    });
    expect(timed.centre).toBeUndefined();
    expect(timed.pathStatus).toBe("none");
    expect(timed.pathStoppedBy).toBe("time");
  });

  it("gives status cancelled when the flag was set before the request", () => {
    const result = refresh({
      cancel: flag(true),
      expanded: ["src/report.ts#readRows"],
    });
    expect(result.centre).toBeUndefined();
    expect(result.pathStatus).toBe("cancelled");
    expect(result.expansions).toEqual([]);
  });

  it("has no route, path or pathStatus without path", () => {
    const result = refresh({ withPath: false });
    expect(result.centre?.focusId).toBe(LOAD_ROWS);
    expect("route" in result).toBe(false);
    expect("path" in result).toBe(false);
    expect("pathStatus" in result).toBe(false);
    expect("pathStoppedBy" in result).toBe(false);
  });
});
