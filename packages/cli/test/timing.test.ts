import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main, runTarget } from "../src/index.js";
import { formatTiming } from "../src/timing.js";

const SIGNUP = fileURLToPath(
  new URL("../../../test-code/basic/src/signup.ts", import.meta.url),
);
const GOLDEN = fileURLToPath(
  new URL(
    "../../core/test/__goldens__/basic-handleSignup.json",
    import.meta.url,
  ),
);

describe("formatTiming", () => {
  it("prints load, warm and analyze on one line for a single run", () => {
    expect(
      formatTiming({ loadMs: 1234.4, warmMs: 800.2, analyzeMs: [56.6] }),
    ).toEqual(["load: 1234ms  warm: 800ms  analyze: 57ms"]);
  });

  it("prints setup on its own line and one line per analyze run", () => {
    expect(
      formatTiming({ loadMs: 10, warmMs: 4, analyzeMs: [9.5, 3.2, 2.4] }),
    ).toEqual([
      "load: 10ms  warm: 4ms",
      "analyze[1]: 10ms",
      "analyze[2]: 3ms",
      "analyze[3]: 2ms",
    ]);
  });
});

describe("runTarget", () => {
  it("reports one analyze timing per run, slice from the first", () => {
    const result = runTarget(`${SIGNUP}:19:3`, undefined, 3);
    expect(result.analyzeMs).toHaveLength(3);
    expect(result.loadMs).toBeGreaterThanOrEqual(0);
    expect(result.warmMs).toBeGreaterThanOrEqual(0);
    expect(result.slice.focusId).toBe("src/signup.ts#handleSignup");
  });
});

describe("main with --timing and --repeat", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes timing lines to stderr and only the slice to stdout", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(main([`${SIGNUP}:19:3`, "--timing", "--repeat", "3"])).toBe(0);

    const stderrLines = error.mock.calls.map((call) => String(call[0]));
    expect(stderrLines).toHaveLength(4);
    expect(stderrLines[0]).toMatch(/^load: \d+ms {2}warm: \d+ms$/);
    expect(stderrLines[1]).toMatch(/^analyze\[1\]: \d+ms$/);
    expect(stderrLines[2]).toMatch(/^analyze\[2\]: \d+ms$/);
    expect(stderrLines[3]).toMatch(/^analyze\[3\]: \d+ms$/);

    expect(log).toHaveBeenCalledTimes(1);
    const printed = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(printed).toEqual(JSON.parse(readFileSync(GOLDEN, "utf8")));
    expect(printed.focusId).toBe("src/signup.ts#handleSignup");
  });

  it("writes one load-and-analyze line to stderr for a single run", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(main([`${SIGNUP}:19:3`, "--timing"])).toBe(0);

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toMatch(
      /^load: \d+ms {2}warm: \d+ms {2}analyze: \d+ms$/,
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual(
      JSON.parse(readFileSync(GOLDEN, "utf8")),
    );
  });

  it("does not take a flag as the --root directory", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(main(["--root", "--timing", "a.ts:1"])).toBe(1);
    expect(main(["--root", "--repeat", "3", "a.ts:1"])).toBe(1);

    expect(error.mock.calls.map((call) => call[0])).toEqual([
      "code-spider: --root requires a directory",
      "code-spider: --root requires a directory",
    ]);
    expect(log).not.toHaveBeenCalled();
  });

  it("repeats silently without --timing", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(main([`${SIGNUP}:19:3`, "--repeat=2"])).toBe(0);

    expect(error).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0])).focusId).toBe(
      "src/signup.ts#handleSignup",
    );
  });

  it("reports an invalid --repeat as a one-line error and returns 1", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(main([`${SIGNUP}:19:3`, "--repeat", "0"])).toBe(1);

    expect(error).toHaveBeenCalledWith(
      "code-spider: --repeat requires a positive integer",
    );
    expect(log).not.toHaveBeenCalled();
  });
});
