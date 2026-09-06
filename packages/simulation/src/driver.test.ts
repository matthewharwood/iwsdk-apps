import { describe, expect, test } from "bun:test";
import { Decision, emptyMana, type PlayerObservation, type Response } from "@iwsdk-apps/contracts";
import { findPayment, heuristicDriver, scriptedDriver } from "./driver";

function damageObservation(): PlayerObservation {
  return {
    matchId: "driver-unit",
    player: "A",
    revision: 4,
    turn: 3,
    step: "combat-damage",
    startingPlayerChooser: "A",
    startingPlayer: "A",
    activePlayer: "A",
    outcome: { kind: "ongoing" },
    players: [],
    objects: [],
    stack: [],
    combat: {
      attacks: [],
      blocks: [],
      blocked: [],
      remainingDefenders: [],
      damageActors: [],
      allocations: [],
      firstStrikeParticipants: [],
    },
    decision: Decision.parse({
      id: "damage",
      actor: "A",
      revision: 4,
      kind: "damage",
      context: "",
      count: 0,
      cards: [],
      players: [],
      manaSources: [],
      cost: null,
      cardCosts: {},
      damageDomain: [
        {
          source: "attacker",
          power: 5,
          targets: [{ id: "blocker", kind: "creature", lethal: 2 }],
          tramplePlayer: null,
        },
      ],
    }),
  };
}
describe("observation-only driver", () => {
  test("starting-player proposal chooses the owned seat through an explicit ordinary response", async () => {
    const observation = damageObservation();
    observation.revision = 0;
    observation.turn = 0;
    observation.step = "setup";
    observation.activePlayer = null;
    observation.startingPlayer = null;
    if (!observation.decision) throw new Error("Missing fixture decision");
    observation.decision.kind = "starting-player";
    observation.decision.players = ["A", "B"];
    observation.decision.damageDomain = [];
    expect(await heuristicDriver(observation, 123)).toEqual({
      kind: "starting-player",
      player: "A",
    });
    observation.decision.players = ["B"];
    expect(() => heuristicDriver(observation, 123)).toThrow("omits the chooser");
  });
  test("script lookup is revision-bound and deterministic after retries or reconstruction", () => {
    const observation = damageObservation();
    const response: Response = { kind: "damage", allocations: [] };
    const script = [
      {
        actor: "A",
        kind: "damage" as const,
        response,
      },
    ];
    const driver = scriptedDriver(script, 4);
    expect(driver(observation, 1)).toEqual(response);
    expect(driver(observation, 1)).toEqual(response);
    expect(scriptedDriver(script, 4)(observation, 1)).toEqual(response);
    expect(() => driver({ ...observation, revision: 5 }, 1)).toThrow("diverged");
  });
  test("colored payment reassigns flexible source instead of consuming the sole green source", () => {
    const result = findPayment({ ...emptyMana(), W: 1, G: 1, generic: 0 }, emptyMana(), [
      { object: "flexible", colors: ["W", "G"] },
      { object: "white-only", colors: ["W"] },
    ]);
    expect(result).toEqual({
      kind: "payment",
      spend: { ...emptyMana(), W: 1, G: 1 },
      sources: [
        { object: "flexible", color: "G" },
        { object: "white-only", color: "W" },
      ],
    });
  });
  test("uses floating mana once and rejects insufficient colorless or generic resources", () => {
    expect(
      findPayment({ ...emptyMana(), W: 1, generic: 2 }, { ...emptyMana(), W: 3 }, [])?.spend.W,
    ).toBe(3);
    expect(
      findPayment({ ...emptyMana(), C: 1, generic: 0 }, { ...emptyMana(), W: 3 }, []),
    ).toBeNull();
    expect(
      findPayment({ ...emptyMana(), W: 2, generic: 1 }, emptyMana(), [
        { object: "one", colors: ["W"] },
      ]),
    ).toBeNull();
  });
  test("combines excess nontrample damage into one source-target allocation (first real-game regression)", async () => {
    const observation = damageObservation();
    expect(await heuristicDriver(observation, 1)).toEqual({
      kind: "damage",
      allocations: [{ source: "attacker", target: "blocker", amount: 5 }],
    });
  });
  test("trample distributes lethal first, then remaining power to the defender", async () => {
    const observation = damageObservation();
    if (!observation.decision?.damageDomain[0]) throw new Error("Missing fixture domain");
    observation.decision.damageDomain[0].tramplePlayer = "B";
    expect(await heuristicDriver(observation, 1)).toEqual({
      kind: "damage",
      allocations: [
        { source: "attacker", target: "blocker", amount: 2 },
        { source: "attacker", target: "B", amount: 3 },
      ],
    });
  });
  test("unowned decision is a driver failure rather than an invented pass", () => {
    const observation = damageObservation();
    observation.decision = null;
    expect(() => heuristicDriver(observation, 1)).toThrow("no owned decision");
  });
});
