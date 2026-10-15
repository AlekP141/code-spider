import { describe, expect, it } from "vitest";
import { runRounds } from "../../src/path/rounds.js";
import { selectRoutes } from "../../src/path/routes.js";
import { graphSource, neverStops, parseCalls } from "./graph-source.js";

function select(...specs: string[]) {
  const rounds = runRounds(graphSource(parseCalls(...specs)), "A", "B", {
    signal: neverStops(),
  });
  return selectRoutes(rounds);
}

const sorted = (ids: Iterable<string>) => [...ids].sort();
const stepKeys = (steps: ReturnType<typeof select>["steps"]) =>
  steps.map((s) => `${s.from}>${s.to}`).sort();

describe("selectRoutes", () => {
  it("drops a turning point that is reached from only one start", () => {
    const { functions } = select("U > A", "V > U", "V > B", "W > B", "U > W");
    expect(sorted(functions)).toEqual(["A", "B", "U", "W"]);
  });

  it("never follows a link out of a turning point", () => {
    const { steps } = select("U > A", "V > U", "V > B", "W > B", "U > W");
    expect(stepKeys(steps)).toEqual(["A>U", "U>W", "W>B"]);
    expect(
      steps.some(({ link }) => link.supplier === "U" && link.consumer === "V"),
    ).toBe(false);
  });

  it("gives the union of the down and up routes when both ends are found on the other side", () => {
    const { functions, steps } = select("M > B", "A > M", "N > A", "B > N");
    expect(sorted(functions)).toEqual(["A", "B", "M", "N"]);
    expect(stepKeys(steps)).toEqual(["A>M", "A>N", "M>B", "N>B"]);
  });

  it("gives no routes when no turning point is live", () => {
    const selection = select("P > A", "Q > B");
    expect(selection.functions.size).toBe(0);
    expect(selection.steps).toEqual([]);
  });
});
