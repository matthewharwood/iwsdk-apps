import { expect, test } from "bun:test";
import {
  ConditionalSelfEntryProgram,
  canonicalJson,
  type MatchManifest,
  RulesState,
} from "@iwsdk-apps/contracts";
import { answer, cast, command, locate, resolveOne } from "../test-fixtures/counterspells";
import { board, enterBatch, observerFixture, priority } from "../test-fixtures/entry-observers";
import { definition, move, object, player } from "./common";
import { admitDeck, assertInvariants, transition } from "./index";

// Constructed rule scenarios for the separately authored IF01–IF12 expectations.
// Physical inventory/setup is normal; synthetic definitions do not pass source admission.
function fixture(mode: MatchManifest["resolver"] = "full-scan", seats: 2 | 4 = 2) {
  const f = observerFixture(mode, seats);
  definition(f.registry, "creature").triggerPrograms = [
    ConditionalSelfEntryProgram.parse({
      schema: "commander-conditional-self-entry/1",
      id: "conditional-self-entry:constructed:0",
      trigger: {
        kind: "self-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
      },
      interveningIf: { kind: "controls-permanent", types: ["Artifact"] },
      choice: { kind: "mandatory" },
      effects: [{ kind: "draw", recipient: "trigger-controller", amount: 1 }],
    }),
  ];
  for (const seat of f.state.manifest.seats) admitDeck(seat.deck, f.registry);
  priority(f);
  return f;
}
function capture(f: ReturnType<typeof fixture>) {
  cast(f, "A", "creature");
  resolveOne(f);
  const ability = Object.values(f.state.abilities)[0];
  if (!ability) throw new Error("Expected constructed conditional capture");
  return ability;
}
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`IF01 ${mode}: true at capture and resolution draws once from the captured controller`, () => {
    const f = fixture(mode);
    board(f, "artifact-creature");
    const ability = capture(f);
    expect(f.state.events.find((e) => e.type === "TriggerConditionEvaluated")?.data).toMatchObject({
      phase: "capture",
      matched: true,
      controller: "A",
    });
    const before = player(f.state, "A").hand.length;
    resolveOne(f);
    expect(player(f.state, "A").hand).toHaveLength(before + 1);
    expect(f.state.events.find((e) => e.type === "TriggerConditionEvaluated")?.data).toMatchObject({
      phase: "resolution",
      matched: true,
    });
    expect(f.state.abilities[ability.id]).toBeUndefined();
    expect(f.state.events.some((e) => e.type === "TriggeredAbilityResolved")).toBe(true);
  });
  test(`IF02/05 ${mode}: no owned battlefield artifact means no capture or retroactive ability`, () => {
    const f = fixture(mode);
    board(f, "artifact-creature", "B");
    board(f, "enchantment-creature");
    cast(f, "A", "creature");
    resolveOne(f);
    expect(f.state.events.find((e) => e.type === "TriggerConditionEvaluated")?.data.matched).toBe(
      false,
    );
    expect(Object.keys(f.state.abilities)).toEqual([]);
    enterBatch(f, [{ slot: "artifact-creature" }]);
    priority(f);
    expect(Object.keys(f.state.abilities)).toEqual([]);
    expect(f.state.stack).toEqual([]);
  });
  test(`IF03/11 ${mode}: current false after canonical restore removes the ability without countering or drawing`, () => {
    const f = fixture(mode);
    const artifact = board(f, "artifact-creature");
    const ability = capture(f);
    f.state = RulesState.parse(JSON.parse(canonicalJson(f.state)));
    move(f.state, artifact, "hand", "constructed loss of current witness");
    assertInvariants(f.state, f.registry); // A stored true-at-entry ability may now have a false condition.
    const before = player(f.state, "A").hand.length;
    resolveOne(f);
    expect(player(f.state, "A").hand).toHaveLength(before);
    expect(f.state.events.find((e) => e.type === "TriggeredAbilityRemoved")?.data).toMatchObject({
      trigger: ability.id,
      reason: "intervening-if-false",
    });
    expect(
      f.state.events.some((e) =>
        ["CardDrawn", "TriggeredAbilityResolved", "SpellCountered"].includes(e.type),
      ),
    ).toBe(false);
    expect(f.state.stack).toEqual([]);
  });
  test(`IF04/07 ${mode}: a different current witness suffices after the original witness and source leave`, () => {
    const f = fixture(mode, 4);
    const artifact = board(f, "artifact-creature");
    const ability = capture(f);
    move(f.state, artifact, "hand", "constructed old witness leaves");
    move(f.state, ability.source.id, "graveyard", "constructed source leaves");
    const replacement = move(
      f.state,
      locate(f, "B", "artifact-creature").id,
      "battlefield",
      "constructed new controlled witness",
      "A",
    );
    expect(replacement.owner).toBe("B");
    const hand = player(f.state, "A").hand.length;
    resolveOne(f);
    expect(player(f.state, "A").hand).toHaveLength(hand + 1);
    expect(
      f.state.events.find((e) => e.type === "TriggerConditionEvaluated")?.data.controller,
    ).toBe("A");
  });
}

test("IF07: current source control changes do not change the captured condition's controller", () => {
  const f = fixture("full-scan", 4);
  board(f, "artifact-creature");
  const ability = capture(f);
  object(f.state, ability.source.id).controller = "C";
  object(f.state, ability.source.id).controlledSinceTurn = f.state.turn;
  const handA = player(f.state, "A").hand.length;
  const handC = player(f.state, "C").hand.length;
  resolveOne(f);
  expect(player(f.state, "A").hand).toHaveLength(handA + 1);
  expect(player(f.state, "C").hand).toHaveLength(handC);
});
test("IF06: the whole committed entry batch supplies an artifact even when the conditional source is first", () => {
  const f = fixture();
  enterBatch(f, [{ slot: "creature" }, { slot: "artifact-creature" }]);
  priority(f);
  expect(Object.keys(f.state.abilities)).toHaveLength(1);
  const hand = player(f.state, "A").hand.length;
  resolveOne(f);
  expect(player(f.state, "A").hand).toHaveLength(hand + 1);
});
test("IF10: countering the conditional creature spell produces neither entry nor condition evaluation", () => {
  const f = fixture();
  board(f, "artifact-creature");
  const spell = cast(f, "A", "creature");
  cast(f, "B", "counter", spell);
  resolveOne(f);
  expect(Object.keys(f.state.abilities)).toEqual([]);
  expect(
    f.state.events.some((e) =>
      ["BattlefieldEntryBatch", "TriggerConditionEvaluated", "TriggerCaptured"].includes(e.type),
    ),
  ).toBe(false);
});
test("IF09: failed draw loses only after the true ability finishes; false condition does not attempt a draw", () => {
  for (const matched of [true, false]) {
    const f = fixture();
    const artifact = board(f, "artifact-creature");
    capture(f);
    for (const id of [...player(f.state, "A").library])
      move(f.state, id, "graveyard", "constructed exhausted library");
    if (!matched) move(f.state, artifact, "hand", "constructed condition turns false");
    resolveOne(f);
    expect(player(f.state, "A").lost).toBe(matched);
    if (matched) {
      const types = f.state.events.map((e) => e.type);
      expect(types.indexOf("TriggeredAbilityResolved")).toBeGreaterThan(-1);
      expect(types.indexOf("PlayersLostBatch")).toBeGreaterThan(
        types.indexOf("TriggeredAbilityResolved"),
      );
    }
  }
});
test("IF11/12: rewritten stored program/controller/source context rejects before destructive dispatch", () => {
  const f = fixture();
  board(f, "artifact-creature");
  const ability = capture(f);
  const mutations = [
    (data: Record<string, unknown>) => {
      data.program = {
        ...ability.program,
        interveningIf: { kind: "controls-permanent", types: ["Creature"] },
      };
    },
    (data: Record<string, unknown>) => {
      data.program = {
        ...ability.program,
        effects: [{ kind: "draw", recipient: "trigger-controller", amount: 2 }],
      };
    },
    (data: Record<string, unknown>) => {
      data.controller = "B";
    },
    (data: Record<string, unknown>) => {
      data.sourceVersion = "f".repeat(64);
    },
    (data: Record<string, unknown>) => {
      data.source = { ...ability.source, controller: "B" };
    },
  ];
  for (const mutate of mutations) {
    const bad = JSON.parse(canonicalJson(f.state));
    mutate(bad.abilities[ability.id]);
    const before = canonicalJson(bad);
    expect(transition(bad, command(f, { kind: "pass" }), f.registry).status).toBe("fault");
    expect(canonicalJson(bad)).toBe(before);
  }
  const before = canonicalJson(f.state);
  const cmd = command(f, { kind: "pass" });
  for (const bad of [
    { ...cmd, actor: "B" },
    { ...cmd, revision: cmd.revision - 1 },
    { ...cmd, decisionId: "wrong" },
  ])
    expect(transition(f.state, bad, f.registry).status).toBe("rejected");
  expect(canonicalJson(f.state)).toBe(before);
});

test("IF supplemental: a post-entry artifact dying at the first SBA does not undo captures or require truth during ordering", () => {
  const f = fixture();
  definition(f.registry, "commander").triggerPrograms = structuredClone(
    definition(f.registry, "creature").triggerPrograms,
  );
  definition(f.registry, "artifact-creature").toughness = 0;
  enterBatch(f, [{ slot: "creature" }, { slot: "commander" }, { slot: "artifact-creature" }]);
  expect(Object.keys(f.state.abilities)).toHaveLength(2);
  priority(f);
  expect(locate(f, "A", "artifact-creature").zone).toBe("graveyard");
  expect(f.state.decision?.kind).toBe("trigger-order");
  const ids = f.state.decision?.triggers ?? [];
  expect(ids).toHaveLength(2);
  const hand = player(f.state, "A").hand.length;
  answer(f, { kind: "trigger-order", triggers: ids });
  expect(f.state.stack).toHaveLength(2);
  resolveOne(f);
  resolveOne(f);
  expect(player(f.state, "A").hand).toHaveLength(hand);
  expect(Object.keys(f.state.abilities)).toEqual([]);
});
