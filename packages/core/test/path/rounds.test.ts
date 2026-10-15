import { describe, expect, it } from "vitest";
import { runRounds, type Rounds } from "../../src/path/rounds.js";
import { createStopSignal, SearchStopped } from "../../src/path/signal.js";
import {
  fakeClock,
  graphSource,
  neverStops,
  newFlag,
  parseCalls,
} from "./graph-source.js";

const linkKeys = (links: Rounds["sideA"]["links"]) =>
  links.map((l) => `${l.supplier}->${l.consumer}#${l.kind}`);

describe("runRounds", () => {
  it("round 1 climbs both starts and the turning points are updated only after both sides ran", () => {
    const source = graphSource(parseCalls("B > A", "A > B"));
    const atRoundEnd: { asked: string[]; turning: string[] }[] = [];
    const rounds = runRounds(source, "A", "B", {
      signal: neverStops(),
      onRoundEnd: (r) =>
        atRoundEnd.push({
          asked: [...source.asked],
          turning: [...r.turning].sort(),
        }),
    });
    expect(atRoundEnd).toEqual([{ asked: ["A", "B"], turning: ["A", "B"] }]);
    expect([...rounds.turning].sort()).toEqual(["A", "B"]);
  });

  it("does not climb a function in a frontier that is a turning point", () => {
    const source = graphSource(parseCalls("Y > A", "Y > B", "Z > Y"));
    const rounds = runRounds(source, "A", "B", { signal: neverStops() });
    expect(source.asked).toEqual(["A", "B"]);
    expect(rounds.sideA.found.has("Z")).toBe(false);
  });

  it("does not climb a function found only by turning points", () => {
    const source = graphSource(
      parseCalls("Y > A", "Z > B", "Y > Z", "X > Y"),
    );
    const rounds = runRounds(source, "A", "B", { signal: neverStops() });
    expect(source.asked).toEqual(["A", "B", "Y", "Z"]);
    expect(rounds.sideA.found.has("X")).toBe(true);
    expect(rounds.turning.has("Y")).toBe(true);
  });

  it("climbs a frontier in NodeId code-point order, the A side first", () => {
    const source = graphSource(
      parseCalls("z0 > A", "Z2 > A", "Z1 > A", "Y2 > B", "Y1 > B"),
    );
    runRounds(source, "A", "B", { signal: neverStops() });
    expect(source.asked).toEqual(["A", "B", "Z1", "Z2", "z0", "Y1", "Y2"]);
  });

  it("ends when nothing is climbable, with no stop reason", () => {
    const rounds = runRounds(graphSource(parseCalls("P > A")), "A", "B", {
      signal: neverStops(),
    });
    expect(rounds.stoppedBy).toBeUndefined();
    expect(rounds.checked).toBe(3);
  });

  it("records each link once on one side and never the same link on both", () => {
    const calls = parseCalls(
      "P1 > A",
      "P2 > A",
      "T > P1",
      "T > P2",
      "C > B",
      "T > C",
      "B > A",
      "A > B",
    );
    const rounds = runRounds(graphSource(calls), "A", "B", {
      signal: neverStops(),
    });
    const onA = linkKeys(rounds.sideA.links);
    const onB = linkKeys(rounds.sideB.links);
    expect(new Set(onA).size).toBe(onA.length);
    expect(new Set(onB).size).toBe(onB.length);
    expect(onA.filter((key) => onB.includes(key))).toEqual([]);
  });

  it("records nothing for a climb that throws SearchStopped and takes the reason from the signal", () => {
    const flag = newFlag();
    const signal = createStopSignal(flag, 3_600_000);
    const source = graphSource(parseCalls("P > A", "Q > P"), {
      onClimb: (id) => {
        if (id !== "P") return;
        Atomics.store(flag, 0, 1);
        throw new SearchStopped();
      },
    });
    const rounds = runRounds(source, "A", "B", { signal });
    expect(rounds.stoppedBy).toBe("cancelled");
    expect(rounds.checked).toBe(2);
    expect(linkKeys(rounds.sideA.links)).toEqual(["A->P#call"]);
    expect(rounds.sideA.found.has("Q")).toBe(false);

    const bare = runRounds(
      graphSource(parseCalls("P > A"), {
        onClimb: (id) => {
          if (id === "P") throw new SearchStopped();
        },
      }),
      "A",
      "B",
      { signal: neverStops() },
    );
    expect(bare.stoppedBy).toBe("cancelled");
  });

  it("stops at the next check once a time limit passes and keeps the earlier links", () => {
    const clock = fakeClock();
    const signal = createStopSignal(newFlag(), 25, clock.now);
    const source = graphSource(parseCalls("P > A", "Q > B", "R > P"), {
      onClimb: () => clock.advance(10),
    });
    const rounds = runRounds(source, "A", "B", { signal });
    expect(rounds.stoppedBy).toBe("time");
    expect(source.asked).toEqual(["A", "B", "P"]);
    expect(rounds.checked).toBe(3);
    expect(linkKeys(rounds.sideA.links)).toEqual(["A->P#call", "P->R#call"]);
  });

  it("ends the search with no climb when the signal is set before the first climb", () => {
    const flag = newFlag();
    Atomics.store(flag, 0, 1);
    const source = graphSource(parseCalls("P > A"));
    const rounds = runRounds(source, "A", "B", {
      signal: createStopSignal(flag, 3_600_000),
    });
    expect(source.asked).toEqual([]);
    expect(rounds.stoppedBy).toBe("cancelled");
    expect(rounds.checked).toBe(0);
  });

  it("ends the search before the next climb when the signal trips between two climbs of one round, keeping what was recorded", () => {
    const flag = newFlag();
    const source = graphSource(parseCalls("P > A", "Q > B"), {
      onClimb: (id) => {
        if (id === "A") Atomics.store(flag, 0, 1);
      },
    });
    const rounds = runRounds(source, "A", "B", {
      signal: createStopSignal(flag, 3_600_000),
    });
    expect(source.asked).toEqual(["A"]);
    expect(rounds.stoppedBy).toBe("cancelled");
    expect(linkKeys(rounds.sideA.links)).toEqual(["A->P#call"]);
    expect(rounds.sideB.links).toEqual([]);
  });
});
