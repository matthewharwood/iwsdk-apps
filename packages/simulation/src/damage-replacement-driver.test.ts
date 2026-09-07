import { expect, test } from "bun:test";
import {
  type DamageReplacementChoice,
  Decision,
  emptyMana,
  type PlayerObservation,
  Response,
} from "@iwsdk-apps/contracts";
import { heuristicDriver, scriptedDriver } from "./driver";

// Constructed policy inputs only; source-bound rules execution belongs to the engine suites.
function observation(): PlayerObservation {
  const effects: DamageReplacementChoice["occurrences"][number]["effects"] = [
    {
      id: "effect:double",
      provider: "A:provider",
      definition: "synthetic:double",
      program: {
        schema: "commander-damage-static/1",
        id: "program:double",
        sourceZone: "battlefield",
        kind: "replacement",
        priority: "ordinary",
        source: "any",
        recipient: "permanent-or-player",
        operation: { kind: "multiply", factor: 2 },
      },
    },
    {
      id: "effect:subtract",
      provider: "B:provider",
      definition: "synthetic:subtract",
      program: {
        schema: "commander-damage-static/1",
        id: "program:subtract",
        sourceZone: "battlefield",
        kind: "replacement",
        priority: "ordinary",
        source: "spell",
        recipient: "permanent-or-player",
        operation: { kind: "subtract", amount: 1 },
      },
    },
  ];
  return {
    matchId: "damage-policy-unit",
    player: "C",
    revision: 42,
    turn: 7,
    step: "main1",
    startingPlayerChooser: "A",
    startingPlayer: "A",
    activePlayer: "A",
    outcome: { kind: "ongoing" },
    players: ["A", "B", "C", "D"].map((id) => ({
      id,
      life: 40,
      lost: false,
      handCount: 5,
      libraryCount: 90,
      mulligans: 0,
      keptHand: true,
      mulliganDeclaration: null,
      mana: emptyMana(),
      commanderDamage: {},
    })),
    objects: [],
    stack: [],
    abilities: [],
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
      id: "replacement-42",
      actor: "C",
      revision: 42,
      kind: "damage-replacement",
      context: "event:41",
      count: 0,
      cards: [],
      triggers: [],
      players: [],
      manaSources: [],
      cost: null,
      cardCosts: {},
      damageDomain: [],
      damageReplacement: {
        eventId: "event:41",
        version: 1,
        occurrences: [
          {
            id: "occurrence:0",
            source: "A:spell",
            recipient: { kind: "creature", id: "C:creature" },
            amount: 2,
            preventable: true,
            effects,
          },
        ],
      },
    }),
  };
}
function choice(view: PlayerObservation) {
  const value = view.decision?.damageReplacement;
  if (!value) throw new Error("Unit fixture choice absent");
  return value;
}
test("nonactive affected controller proposes one advertised current occurrence/effect without mutating its view", async () => {
  const view = observation(),
    before = structuredClone(view);
  const result = Response.parse(await heuristicDriver(view, 7));
  expect(result.kind).toBe("damage-replacement");
  if (result.kind !== "damage-replacement") throw new Error("Wrong policy response");
  expect(result.eventId).toBe("event:41");
  expect(result.eventVersion).toBe(1);
  const occurrence = choice(view).occurrences.find((row) => row.id === result.occurrenceId);
  expect(occurrence?.effects.some((row) => row.id === result.effectId)).toBe(true);
  expect(view).toEqual(before);
  expect(await heuristicDriver(structuredClone(view), 7)).toEqual(result);
  expect("frames" in view).toBe(false);
});
test("presentation ordering cannot alter the seeded policy's exact response", async () => {
  const view = observation(),
    reversed = structuredClone(view);
  for (const row of choice(reversed).occurrences) row.effects.reverse();
  expect(await heuristicDriver(reversed, 17)).toEqual(await heuristicDriver(view, 17));
});
test("a next-version decision uses only newly supplied legal effects, never a remembered provider", async () => {
  const view = observation();
  const previous = await heuristicDriver(view, 9);
  if (previous.kind !== "damage-replacement") throw new Error("Wrong policy response");
  const row = choice(view).occurrences[0];
  if (!row) throw new Error("Missing occurrence");
  row.effects = row.effects.filter((effect) => effect.id !== previous.effectId);
  row.amount = 4;
  choice(view).version = 2;
  view.revision++;
  const result = await heuristicDriver(view, 9);
  expect(result.kind).toBe("damage-replacement");
  if (result.kind !== "damage-replacement") throw new Error("Wrong policy response");
  expect(result.eventVersion).toBe(2);
  expect(result.effectId).not.toBe(previous.effectId);
  expect(row.effects.map((effect) => effect.id)).toContain(result.effectId);
});
test("mandatory replacement answers never invent pass, payment or mana activation", async () => {
  const view = observation();
  for (let seed = 1; seed <= 20; seed++)
    expect((await heuristicDriver(view, seed)).kind).toBe("damage-replacement");
  expect(() => heuristicDriver({ ...view, player: "A" }, 1)).toThrow("no owned decision");
  const malformed = structuredClone(view);
  if (!malformed.decision) throw new Error("Missing decision");
  delete malformed.decision.damageReplacement;
  expect(() => heuristicDriver(malformed, 1)).toThrow("lacks its current owned event");
  choice(view).occurrences = [];
  expect(() => heuristicDriver(view, 1)).toThrow("no applicable effect");
});
test("explicit scripts retain the affected player's alternate effect choice across resume", () => {
  const view = observation();
  const response = Response.parse({
    kind: "damage-replacement",
    eventId: "event:41",
    eventVersion: 1,
    occurrenceId: "occurrence:0",
    effectId: "effect:subtract",
  });
  const driver = scriptedDriver([{ actor: "C", kind: "damage-replacement", response }], 42);
  expect(driver(view, 1)).toEqual(response);
  expect(driver(structuredClone(view), 1)).toEqual(response);
});
