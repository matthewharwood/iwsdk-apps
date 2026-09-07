import { expect, test } from "bun:test";
import {
  Decision,
  emptyMana,
  type Mana,
  type PlayerObservation,
  Response,
} from "@iwsdk-apps/contracts";
import { heuristicDriver, scriptedDriver } from "./driver";

function observation(pool: Mana, sources: Decision["manaSources"]): PlayerObservation {
  return {
    matchId: "trigger-payment-driver-unit",
    player: "B",
    revision: 42,
    turn: 7,
    step: "main1",
    startingPlayerChooser: "A",
    startingPlayer: "A",
    activePlayer: "A",
    outcome: { kind: "ongoing" },
    players: ["A", "B"].map((id) => ({
      id,
      life: 40,
      lost: false,
      handCount: 5,
      libraryCount: 90,
      mulligans: 0,
      keptHand: true,
      mulliganDeclaration: null,
      mana: id === "B" ? pool : { ...emptyMana(), W: 99 },
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
      id: "payment-42",
      actor: "B",
      revision: 42,
      kind: "trigger-payment",
      context: "public-proctor-occurrence",
      count: 0,
      cards: [],
      triggers: [],
      players: [],
      manaSources: sources,
      cost: { ...emptyMana(), generic: 2 },
      cardCosts: {},
      damageDomain: [],
    }),
  };
}
test("nonactive payer proposes exactly two generic mana from only its entitled legal sources", async () => {
  const view = observation({ ...emptyMana(), G: 1 }, [{ object: "B:island", colors: ["U"] }]);
  const before = structuredClone(view);
  const result = await heuristicDriver(view, 1);
  expect(result).toEqual({
    kind: "trigger-payment",
    pay: true,
    sources: [{ object: "B:island", color: "U" }],
    spend: { ...emptyMana(), G: 1, U: 1 },
  });
  expect(Response.parse(result)).toEqual(result);
  expect(view).toEqual(before);
  expect(await heuristicDriver(structuredClone(view), 1)).toEqual(result);
  expect("frames" in view).toBe(false);
});
test("insufficient payer mana declines without borrowing the active player's pool or inventing priority", async () => {
  const view = observation(emptyMana(), [{ object: "B:plains", colors: ["W"] }]);
  expect(await heuristicDriver(view, 1)).toEqual({ kind: "trigger-payment", pay: false });
  expect(await heuristicDriver(observation({ ...emptyMana(), C: 2, R: 4 }, []), 1)).toEqual({
    kind: "trigger-payment",
    pay: true,
    sources: [],
    spend: { ...emptyMana(), R: 2 },
  });
});
test("a script may explicitly decline an affordable cost after reload; policy does not own the rules choice", () => {
  const view = observation({ ...emptyMana(), W: 4 }, []);
  const response: Response = { kind: "trigger-payment", pay: false };
  const script = [{ actor: "B", kind: "trigger-payment" as const, response }];
  expect(scriptedDriver(script, 42)(view, 1)).toEqual(response);
  expect(scriptedDriver(script, 42)(structuredClone(view), 1)).toEqual(response);
  expect(() => heuristicDriver({ ...view, player: "A" }, 1)).toThrow("no owned decision");
  expect(() => heuristicDriver({ ...view, decision: null }, 1)).toThrow("no owned decision");
});
