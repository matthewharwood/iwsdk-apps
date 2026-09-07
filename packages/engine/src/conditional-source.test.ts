import { expect, test } from "bun:test";
import { canonicalJson, RulesState, semanticHash } from "@iwsdk-apps/contracts";
import {
  conditionalSourceAnswer,
  conditionalSourceCard,
  conditionalSourceCast,
  conditionalSourceFixture,
  conditionalSourceObject,
  conditionalSourceResolve,
  conditionalSourceSnapshot,
} from "../test-fixtures/conditional-source";
import { player } from "./common";

// Sealed independent source pack4efb9d... and IF01–IF12 supply expected rule outcomes.
// Actual authenticated bodies/legal100-card inventories, ordinary cast/pay/pass transitions;
// selected hand/basic-land preconditions remain explicit, and no test is a complete game.
test("both new complete Oracle bodies and supporting physical definitions match retained source proofs", async () => {
  const { hash, ...body } = conditionalSourceSnapshot;
  expect(await semanticHash(body)).toBe(hash);
  for (const row of conditionalSourceSnapshot.cards) {
    expect(await semanticHash(row.definition)).toBe(row.definitionHash);
    const proof = conditionalSourceSnapshot.sourceRecords.find(
      (r) => r.identity === row.definition.oracleId,
    );
    expect(proof?.sourceVersion).toBe(row.definition.sourceVersion);
    expect(proof?.proof.payload.oracle_text).toBe(row.definition.oracleText);
  }
  expect(conditionalSourceCard("Scholar of Stars").oracleText).toBe(
    "When this creature enters, if you control an artifact, draw a card.",
  );
  expect(conditionalSourceCard("Donatello, Turtle Techie").oracleText).toBe(
    "When Donatello enters, if you control an artifact, draw a card.",
  );
});
for (const name of ["Scholar of Stars", "Donatello, Turtle Techie"]) {
  for (const witness of [true, false]) {
    test(`IF01/02/08 actual ${name}: paid {3}{U}, ${witness ? "battlefield" : "hand-only"} Memnite, ${witness ? "one" : "no"} ability and draw`, async () => {
      const f = await conditionalSourceFixture("Donatello, Turtle Techie", [
        "Scholar of Stars",
        "Memnite",
      ]);
      if (witness) {
        conditionalSourceCast(f, "A", "Memnite");
        conditionalSourceResolve(f);
      }
      const paid = conditionalSourceCast(f, "A", name);
      expect(paid.event?.data.paid).toMatchObject({ U: 4, W: 0, B: 0, R: 0, G: 0, C: 0 });
      conditionalSourceResolve(f);
      const capture = f.state.events.find((e) => e.type === "TriggerConditionEvaluated");
      expect(capture?.data).toMatchObject({ phase: "capture", matched: witness, controller: "A" });
      expect(Object.keys(f.state.abilities)).toHaveLength(Number(witness));
      expect(conditionalSourceObject(f, "A", name).zone).toBe("battlefield");
      const hand = player(f.state, "A").hand.length;
      if (witness) conditionalSourceResolve(f);
      expect(player(f.state, "A").hand).toHaveLength(hand + Number(witness));
      expect(f.state.stack).toEqual([]);
      if (name === "Donatello, Turtle Techie")
        expect(Object.values(player(f.state, "A").commanderCasts)).toEqual([1]);
    });
  }
}
async function pendingScholar() {
  const f = await conditionalSourceFixture(
    "Tobias Andrion",
    ["Scholar of Stars", "Memnite", "Darksteel Sentinel"],
    "Tobias Andrion",
    ["Repulse", "Counterspell"],
  );
  conditionalSourceCast(f, "A", "Memnite");
  conditionalSourceResolve(f);
  conditionalSourceCast(f, "A", "Scholar of Stars");
  conditionalSourceResolve(f);
  expect(Object.keys(f.state.abilities)).toHaveLength(1);
  return f;
}

test("IF03/11 original SRC-TRG-02: actual Memnite/Scholar/Repulse, saved context, B draws but A's false ability is removed", async () => {
  const f = await pendingScholar();
  const original = Object.values(f.state.abilities)[0];
  if (!original) throw new Error("Missing source conditional ability");
  f.state = RulesState.parse(JSON.parse(canonicalJson(f.state)));
  const bHand = player(f.state, "B").hand.length;
  conditionalSourceCast(f, "B", "Repulse", conditionalSourceObject(f, "A", "Memnite").id);
  conditionalSourceResolve(f);
  expect(player(f.state, "B").hand).toHaveLength(bHand); // One spent spell and one mandatory draw.
  expect(f.state.events.filter((e) => e.type === "CardDrawn").map((e) => e.data.player)).toEqual([
    "B",
  ]);
  expect(conditionalSourceObject(f, "A", "Memnite").zone).toBe("hand");
  const aHand = player(f.state, "A").hand.length;
  conditionalSourceResolve(f);
  expect(player(f.state, "A").hand).toHaveLength(aHand);
  expect(f.state.events.find((e) => e.type === "TriggeredAbilityRemoved")?.data).toMatchObject({
    trigger: original?.id,
    reason: "intervening-if-false",
  });
  expect(
    f.state.events.some((e) =>
      ["CardDrawn", "TriggeredAbilityResolved", "SpellCountered"].includes(e.type),
    ),
  ).toBe(false);
});
test("IF04 actual Darksteel Sentinel is a different current witness after Repulse removes Memnite", async () => {
  const f = await pendingScholar();
  const original = Object.values(f.state.abilities)[0];
  if (!original) throw new Error("Missing source conditional ability");
  conditionalSourceCast(f, "B", "Repulse", conditionalSourceObject(f, "A", "Memnite").id);
  conditionalSourceResolve(f);
  expect(Object.keys(f.state.abilities)).toEqual([original?.id]);
  conditionalSourceCast(f, "A", "Darksteel Sentinel"); // Printed flash grants this ordinary timing.
  conditionalSourceResolve(f);
  const hand = player(f.state, "A").hand.length;
  conditionalSourceResolve(f);
  expect(player(f.state, "A").hand).toHaveLength(hand + 1);
  expect(f.state.events.find((e) => e.type === "TriggerConditionEvaluated")?.data).toMatchObject({
    phase: "resolution",
    matched: true,
  });
});
test("IF06 the condition is evaluated at actual entry, so flashing Sentinel above the Scholar spell supplies its witness", async () => {
  const f = await conditionalSourceFixture("Tobias Andrion", [
    "Scholar of Stars",
    "Darksteel Sentinel",
  ]);
  conditionalSourceCast(f, "A", "Scholar of Stars");
  expect(Object.keys(f.state.abilities)).toEqual([]);
  conditionalSourceCast(f, "A", "Darksteel Sentinel");
  conditionalSourceResolve(f);
  conditionalSourceResolve(f);
  expect(Object.keys(f.state.abilities)).toHaveLength(1);
  const hand = player(f.state, "A").hand.length;
  conditionalSourceResolve(f);
  expect(player(f.state, "A").hand).toHaveLength(hand + 1);
});
test("IF07 actual Repulse removes Scholar, but its original captured controller still draws with Memnite present", async () => {
  const f = await pendingScholar();
  const original = Object.values(f.state.abilities)[0];
  if (!original) throw new Error("Missing source conditional ability");
  conditionalSourceCast(f, "B", "Repulse", conditionalSourceObject(f, "A", "Scholar of Stars").id);
  conditionalSourceResolve(f);
  expect(conditionalSourceObject(f, "A", "Scholar of Stars").id).not.toBe(original?.source.id);
  expect(conditionalSourceObject(f, "A", "Scholar of Stars").zone).toBe("hand");
  const hand = player(f.state, "A").hand.length;
  conditionalSourceResolve(f);
  expect(player(f.state, "A").hand).toHaveLength(hand + 1);
  expect(f.state.events.find((e) => e.type === "TriggeredAbilityResolved")?.data).toMatchObject({
    source: original?.source.id,
    controller: "A",
  });
});
test("IF10 actual Counterspell prevents Scholar's entry and both condition checks", async () => {
  const f = await conditionalSourceFixture(
    "Tobias Andrion",
    ["Scholar of Stars", "Memnite"],
    "Tobias Andrion",
    ["Counterspell"],
  );
  conditionalSourceCast(f, "A", "Memnite");
  conditionalSourceResolve(f);
  const spell = conditionalSourceCast(f, "A", "Scholar of Stars");
  conditionalSourceCast(f, "B", "Counterspell", spell.id);
  conditionalSourceResolve(f);
  expect(conditionalSourceObject(f, "A", "Scholar of Stars").zone).toBe("graveyard");
  expect(Object.keys(f.state.abilities)).toEqual([]);
  expect(
    f.state.events.some((e) =>
      ["BattlefieldEntryBatch", "TriggerConditionEvaluated", "TriggerCaptured"].includes(e.type),
    ),
  ).toBe(false);
});

test("IF02 actual later flash Artifact cannot create a missed Scholar ability retroactively", async () => {
  const f = await conditionalSourceFixture("Tobias Andrion", [
    "Scholar of Stars",
    "Darksteel Sentinel",
  ]);
  conditionalSourceCast(f, "A", "Scholar of Stars");
  conditionalSourceResolve(f);
  expect(Object.keys(f.state.abilities)).toEqual([]);
  conditionalSourceCast(f, "A", "Darksteel Sentinel");
  const hand = player(f.state, "A").hand.length;
  conditionalSourceResolve(f);
  expect(Object.keys(f.state.abilities)).toEqual([]);
  expect(f.state.stack).toEqual([]);
  expect(player(f.state, "A").hand).toHaveLength(hand);
});
async function nextMain(f: Awaited<ReturnType<typeof conditionalSourceFixture>>, actor: string) {
  for (let n = 0; n < 150; n++) {
    if (
      f.state.activePlayer === actor &&
      f.state.step === "main1" &&
      f.state.decision?.actor === actor
    )
      return;
    const kind = f.state.decision?.kind;
    if (kind !== "priority" && kind !== "attack")
      throw new Error(`Unexpected quiet source choice ${kind}`);
    conditionalSourceAnswer(
      f,
      kind === "attack" ? { kind: "attack", attacks: [] } : { kind: "pass" },
    );
  }
  throw new Error("Bounded ordinary turn advancement did not reach requested main phase");
}
test("IF05 actual opponent Memnite cast on its own turn never satisfies Scholar's controller", async () => {
  const f = await conditionalSourceFixture(
    "Donatello, Turtle Techie",
    ["Scholar of Stars"],
    "Donatello, Turtle Techie",
    ["Memnite"],
  );
  await nextMain(f, "B");
  conditionalSourceCast(f, "B", "Memnite");
  conditionalSourceResolve(f);
  await nextMain(f, "A");
  conditionalSourceCast(f, "A", "Scholar of Stars");
  const hand = player(f.state, "A").hand.length;
  conditionalSourceResolve(f);
  expect(conditionalSourceObject(f, "B", "Memnite").zone).toBe("battlefield");
  expect(f.state.events.find((e) => e.type === "TriggerConditionEvaluated")?.data).toMatchObject({
    controller: "A",
    matched: false,
  });
  expect(Object.keys(f.state.abilities)).toEqual([]);
  expect(player(f.state, "A").hand).toHaveLength(hand);
});
