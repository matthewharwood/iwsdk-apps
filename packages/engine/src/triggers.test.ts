import { describe, expect, test } from "bun:test";
import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  canonicalJson,
  ENGINE_VERSION,
  type ExecutionRegistry,
  emptyMana,
  type GameCommand,
  type MatchManifest,
  type Response,
  RulesState,
  SERIALIZER_VERSION,
  type SelfEntryProgram,
} from "@iwsdk-apps/contracts";
import { move, object, player } from "./common";
import { assertInvariants, createMatch, observe, transition } from "./index";
import {
  answerTriggerOrder,
  enterBattlefield,
  placeWaitingTriggers,
  resolveTriggeredAbility,
} from "./triggers";
import { givePriority } from "./turns";

// Expectations precede this implementation: docs/commander/source-etb-scenarios.json,
// reviewed hash eed7f8602b7258de2b18906f3970e9b42a93e7fbbec3e80b11c774c424829e32.
// CR source 4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f.
// Every fixture starts with normal 100-card setup. Direct staging, simultaneous entry,
// control changes and zero-toughness preconditions are explicitly synthetic rule-unit
// isolation, not real-card full games or claims for unavailable source mechanics.
function program(kind: "draw" | "gain-life", amount: number): SelfEntryProgram {
  return {
    schema: "commander-trigger/1",
    id: "self-entry-0",
    trigger: {
      kind: "self-enters-battlefield",
      view: "post-committed-event",
      placementClass: "ordinary",
    },
    choice: { kind: "mandatory" },
    effect: { kind, recipient: "trigger-controller", amount },
  };
}
function fixture(count: 2 | 4 = 2, active = "A") {
  const digest = "e".repeat(64);
  const commander: CardDefinition = {
    id: "commander",
    oracleId: "synthetic-commander",
    sourceVersion: digest,
    name: "Synthetic trigger-unit commander",
    typeLine: "Legendary Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: ["Legendary"],
    colors: ["W", "G"],
    colorIdentity: ["W", "G"],
    manaCost: { ...emptyMana(), G: 1, generic: 1 },
    manaValue: 2,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: true,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "trigger-audit/1",
  };
  const draw: CardDefinition = {
    ...commander,
    id: "draw",
    oracleId: "synthetic-draw",
    name: "Synthetic entry draw",
    typeLine: "Creature",
    supertypes: [],
    colors: ["G"],
    commanderEligible: false,
    deckLimit: null,
    oracleText: "When this creature enters, draw a card.",
    triggerPrograms: [program("draw", 1)],
  };
  const life: CardDefinition = {
    ...draw,
    id: "life",
    oracleId: "synthetic-life",
    name: "Synthetic entry life",
    oracleText: "When this creature enters, you gain 3 life.",
    triggerPrograms: [program("gain-life", 3)],
  };
  const zero: CardDefinition = {
    ...life,
    id: "zero",
    oracleId: "synthetic-zero",
    name: "Synthetic zero-toughness entry",
    toughness: 0,
  };
  // Exact reviewed source tuples; their surrounding decks/boards remain synthetic.
  const visionary: CardDefinition = {
    ...draw,
    id: "visionary",
    oracleId: "c6a3a882-a127-4590-93d7-679ef4313efe",
    sourceVersion: "fe8078e85c7554fc675f850df9cb426a683761a0cc3b1fa874e77dec414975cb",
    name: "Elvish Visionary",
    typeLine: "Creature — Elf Shaman",
    subtypes: ["Elf", "Shaman"],
    colorIdentity: ["G"],
    power: 1,
    toughness: 1,
    deckLimit: 1,
  };
  const cleric: CardDefinition = {
    ...life,
    id: "cleric",
    oracleId: "69bcdb42-c170-4848-b95b-f4621867d084",
    sourceVersion: "01794fe77e2b66ced40bd8c067585fd5efcedaac93ad39f84559cce08d71ecf3",
    name: "Arashin Cleric",
    typeLine: "Creature — Human Cleric",
    subtypes: ["Human", "Cleric"],
    colorIdentity: ["W"],
    colors: ["W"],
    manaCost: { ...emptyMana(), W: 1, generic: 1 },
    power: 1,
    toughness: 3,
    deckLimit: 1,
  };
  const land: CardDefinition = {
    ...commander,
    id: "land",
    oracleId: "synthetic-forest",
    name: "Synthetic Forest",
    typeLine: "Basic Land — Forest",
    types: ["Land"],
    subtypes: ["Forest"],
    supertypes: ["Basic"],
    colors: [],
    colorIdentity: ["G"],
    manaCost: null,
    manaValue: 0,
    power: null,
    toughness: null,
    manaAbilities: ["G"],
    commanderEligible: false,
    deckLimit: null,
  };
  const registry: ExecutionRegistry = {
    sourceReleaseHash: digest,
    preparedArtifactHash: null,
    definitions: { commander, draw, life, zero, visionary, cleric, land },
  };
  const seats = ["A", "B", "C", "D"].slice(0, count);
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: `trigger-audit-${count}`,
    releaseHash: digest,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 19,
    driverSeed: 71,
    driverVersion: "independent-trigger-unit/1",
    mode: count === 2 ? "two-seat" : "four-seat",
    resolver: "full-scan",
    seats: seats.map((id) => ({
      id,
      deck: {
        id: "synthetic-trigger-deck",
        hash: digest,
        commander: "commander",
        entries: [
          { definition: "commander", count: 1 },
          { definition: "draw", count: 2 },
          { definition: "life", count: 2 },
          { definition: "zero", count: 1 },
          { definition: "visionary", count: 1 },
          { definition: "cleric", count: 1 },
          { definition: "land", count: 92 },
        ],
      },
    })),
  };
  let state = createMatch(manifest, registry);
  function command(response: Response, actor = state.decision?.actor): GameCommand {
    const decision = state.decision;
    if (!decision || !actor) throw new Error("Missing entitled fixture decision");
    return {
      schema: CONTRACT_VERSION,
      matchId: manifest.id,
      commandId: `trigger-unit:${state.revision}`,
      actor,
      revision: state.revision,
      decisionId: decision.id,
      response,
    };
  }
  function send(response: Response) {
    const next = transition(state, command(response), registry);
    if (next.status !== "accepted") throw new Error(JSON.stringify(next));
    state = next.state;
    assertInvariants(state, registry);
  }
  send({ kind: "starting-player", player: active });
  for (const _seat of seats) send({ kind: "mulligan", keep: true });
  state.step = "main1";
  state.turn = 3;
  givePriority(state, registry, active);
  return {
    registry,
    seats,
    command,
    send,
    get state() {
      return state;
    },
    restore(snapshot: RulesState) {
      state = RulesState.parse(JSON.parse(canonicalJson(snapshot)));
    },
    stage(definition: string, owner = "A") {
      const source = Object.values(state.objects).find(
        (entry) =>
          entry.owner === owner &&
          entry.definition === definition &&
          ["hand", "library"].includes(entry.zone),
      );
      if (!source) throw new Error(`No staged ${definition} for ${owner}`);
      return move(state, source.id, "exile", "synthetic trigger-unit staging").id;
    },
    enter(entries: { objectId: string; controller: string }[]) {
      state.decision = null;
      state.priorityPlayer = null;
      return enterBattlefield(state, registry, entries, "synthetic trigger-unit entry event");
    },
    priority(actor = active) {
      givePriority(state, registry, actor);
    },
    passCycle() {
      const living = state.players.filter((seat) => !seat.lost).length;
      for (let i = 0; i < living; i++) send({ kind: "pass" });
    },
  };
}
function stackIds(state: RulesState): string[] {
  return state.stack.map((entry) => {
    if (entry.kind !== "triggered-ability") throw new Error("Expected only ability objects");
    return entry.triggerId;
  });
}
function controllers(state: RulesState): string[] {
  return stackIds(state).map((id) => {
    const ability = state.abilities[id];
    if (!ability) throw new Error("Missing ability context");
    return ability.controller;
  });
}
function events(state: RulesState, type: string) {
  return state.events.filter((event) => event.type === type);
}

test("CR603.3a rejects contradictory captured controllers while preserving entry-time control", () => {
  const f = fixture();
  f.enter([{ objectId: f.stage("life"), controller: "A" }]);
  f.priority();
  const before = structuredClone(f.state);
  const ability = Object.values(f.state.abilities)[0];
  if (!ability) throw new Error("Missing captured fixture ability");
  for (const field of ["controller", "source-controller"] as const) {
    const invalid = structuredClone(before);
    const changed = invalid.abilities[ability.id];
    if (!changed) throw new Error("Missing copied ability");
    if (field === "controller") changed.controller = "B";
    else changed.source.controller = "B";
    expect(() => assertInvariants(invalid, f.registry)).toThrow("entry snapshot");
  }
  // Current physical control is distinct from the immutable entry-time snapshot.
  object(f.state, ability.source.id).controller = "B";
  expect(() => assertInvariants(f.state, f.registry)).not.toThrow();
  f.passCycle();
  expect(player(f.state, "A").life).toBe(43);
  expect(player(f.state, "B").life).toBe(40);
});

test("CR603.3a/800.4a the source owner's departure does not remove another player's captured ability", () => {
  const f = fixture(4, "C");
  f.enter([{ objectId: f.stage("life", "A"), controller: "B" }]);
  player(f.state, "A").life = 0; // Synthetic precondition; use the actual loss checkpoint.
  f.priority();
  const ability = Object.values(f.state.abilities)[0];
  if (!ability) throw new Error("Missing surviving captured ability");
  expect(player(f.state, "A").lost).toBe(true);
  expect(f.state.objects[ability.source.id]).toBeUndefined();
  expect(ability.controller).toBe("B");
  expect(ability.source.controller).toBe("B");
  expect(ability.source.owner).toBe("A");
  expect(() => assertInvariants(f.state, f.registry)).not.toThrow();
  f.passCycle();
  expect(player(f.state, "B").life).toBe(43);
  expect(f.state.abilities).toEqual({});
});

test("CR603.3b rejects reordered, omitted, duplicated or foreign APNAP continuation seats", () => {
  const f = fixture(4, "C");
  f.enter(
    f.seats.flatMap((controller) => [
      { objectId: f.stage("draw", controller), controller },
      { objectId: f.stage("life", controller), controller },
    ]),
  );
  f.priority();
  expect(f.state.triggerPlacement?.remainingPlayers).toEqual(["C", "D", "A", "B"]);
  for (const invalidOrder of [
    ["C", "B", "A", "D"],
    ["C", "A", "B"],
    ["C", "D", "A", "B", "B"],
    ["C", "D", "A", "B", "missing"],
  ]) {
    const invalid = structuredClone(f.state);
    if (!invalid.triggerPlacement) throw new Error("Missing copied placement");
    invalid.triggerPlacement.remainingPlayers = invalidOrder;
    expect(() => assertInvariants(invalid, f.registry)).toThrow("living APNAP order");
  }
  const skipped = structuredClone(f.state);
  if (!skipped.triggerPlacement || !skipped.decision) throw new Error("Missing copied placement");
  skipped.triggerPlacement.remainingPlayers = ["D", "A", "B"];
  skipped.decision.actor = "D";
  skipped.decision.triggers = skipped.triggerPlacement.cohort.filter(
    (id) => skipped.abilities[id]?.controller === "D",
  );
  expect(() => assertInvariants(skipped, f.registry)).toThrow("living APNAP order");
  f.send({ kind: "trigger-order", triggers: [...(f.state.decision?.triggers ?? [])] });
  expect(f.state.triggerPlacement?.remainingPlayers).toEqual(["D", "A", "B"]);
  expect(() => assertInvariants(f.state, f.registry)).not.toThrow();
});

test("CR603.3b/704.3/800.4 simultaneous departures preserve the living APNAP suffix and captured cohorts", () => {
  const f = fixture(4, "C");
  f.enter(
    f.seats.flatMap((controller) => [
      { objectId: f.stage("draw", controller), controller },
      { objectId: f.stage("life", controller), controller },
    ]),
  );
  player(f.state, "C").life = 0;
  player(f.state, "A").life = 0;
  f.priority();
  expect(f.state.players.filter((seat) => seat.lost).map((seat) => seat.id)).toEqual(["A", "C"]);
  expect(f.state.triggerPlacement?.remainingPlayers).toEqual(["D", "B"]);
  expect(f.state.decision).toMatchObject({ kind: "trigger-order", actor: "D" });
  expect(Object.values(f.state.objects)).toHaveLength(200);
  expect(() => assertInvariants(f.state, f.registry)).not.toThrow();
  f.send({ kind: "trigger-order", triggers: [...(f.state.decision?.triggers ?? [])] });
  expect(f.state.triggerPlacement?.remainingPlayers).toEqual(["B"]);
  f.send({ kind: "trigger-order", triggers: [...(f.state.decision?.triggers ?? [])] });
  expect(controllers(f.state)).toEqual(["D", "D", "B", "B"]);
  expect(f.state.decision).toMatchObject({ kind: "priority", actor: "D" });
  for (let index = 0; index < 4; index++) f.passCycle();
  expect(player(f.state, "D").life).toBe(43);
  expect(player(f.state, "B").life).toBe(43);
  expect(f.state.abilities).toEqual({});
});

describe("source-derived self-entry trigger integration", () => {
  test("ETB01/24 Elvish Visionary cast resolves before its distinct draw ability and each top object needs a fresh pass cycle", () => {
    const f = fixture();
    const card = move(f.state, f.stage("visionary"), "hand", "synthetic hand precondition");
    player(f.state, "A").mana = { ...emptyMana(), G: 2 };
    const before = player(f.state, "A").hand.length;
    f.priority();
    f.send({ kind: "cast", card: card.id });
    f.send({ kind: "payment", sources: [], spend: { ...emptyMana(), G: 2 } });
    expect(f.state.stack).toHaveLength(1);
    expect(f.state.pendingTriggers).toEqual([]);
    expect(Object.keys(f.state.abilities)).toHaveLength(0);
    f.passCycle();
    expect(player(f.state, "A").hand).toHaveLength(before - 1);
    expect(f.state.stack).toMatchObject([{ kind: "triggered-ability" }]);
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
    expect(
      Object.values(f.state.objects).filter(
        (entry) => entry.zone === "battlefield" && entry.definition === "visionary",
      ),
    ).toHaveLength(1);
    f.send({ kind: "pass" });
    expect(player(f.state, "A").hand).toHaveLength(before - 1);
    f.send({ kind: "pass" });
    expect(player(f.state, "A").hand).toHaveLength(before);
    expect(f.state.stack).toEqual([]);
    expect(f.state.abilities).toEqual({});
    expect(Object.values(f.state.objects)).toHaveLength(200);
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
  });

  test("ETB19 Arashin Cleric captures a mandatory gain-three effect without executing it at entry or placement", () => {
    const f = fixture();
    f.enter([{ objectId: f.stage("cleric"), controller: "A" }]);
    expect(player(f.state, "A").life).toBe(40);
    expect(f.state.pendingTriggers).toHaveLength(1);
    expect(placeWaitingTriggers(f.state)).toEqual({ waiting: false, changed: true });
    expect(player(f.state, "A").life).toBe(40);
    f.priority();
    expect(f.state.decision?.kind).toBe("priority");
    f.passCycle();
    expect(player(f.state, "A").life).toBe(43);
    expect(f.state.abilities).toEqual({});
  });

  for (const timing of ["before-placement", "after-placement"] as const) {
    test(`ETB04/05/20 source removed ${timing} cannot erase the captured targetless ability`, () => {
      const f = fixture();
      const [entered] = f.enter([{ objectId: f.stage("visionary"), controller: "A" }]);
      if (!entered) throw new Error("Missing entry");
      const id = f.state.pendingTriggers[0];
      if (!id) throw new Error("Missing captured trigger");
      const context = structuredClone(f.state.abilities[id]);
      const hand = player(f.state, "A").hand.length;
      if (timing === "after-placement") f.priority();
      move(f.state, entered, "graveyard", "synthetic resolved removal");
      f.priority();
      expect(f.state.abilities[id]).toEqual(context);
      expect(f.state.objects[entered]).toBeUndefined();
      f.passCycle();
      expect(player(f.state, "A").hand).toHaveLength(hand + 1);
      expect(f.state.abilities).toEqual({});
    });
  }

  test("ETB06 distinct reentry generations preserve separate occurrence IDs and old source snapshots", () => {
    const f = fixture();
    const [first] = f.enter([{ objectId: f.stage("draw"), controller: "A" }]);
    if (!first) throw new Error("Missing first entry");
    const left = move(f.state, first, "exile", "synthetic blink departure");
    const [second] = enterBattlefield(
      f.state,
      f.registry,
      [{ objectId: left.id, controller: "A" }],
      "synthetic blink return",
    );
    if (!second) throw new Error("Missing returned entry");
    const ids = [...f.state.pendingTriggers];
    expect(new Set(ids).size).toBe(2);
    expect(Object.values(f.state.abilities).map((ability) => ability.source.id)).toEqual([
      first,
      second,
    ]);
    f.priority();
    const hand = player(f.state, "A").hand.length;
    f.send({ kind: "trigger-order", triggers: ids });
    f.passCycle();
    f.passCycle();
    expect(player(f.state, "A").hand).toHaveLength(hand + 2);
    expect(f.state.abilities).toEqual({});
  });

  for (const reverse of [false, true]) {
    test(`ETB03/11/26 two identical instances remain distinct and the owner may choose ${reverse ? "reverse" : "capture"} order`, () => {
      const f = fixture();
      f.enter([
        { objectId: f.stage("draw"), controller: "A" },
        { objectId: f.stage("draw"), controller: "A" },
      ]);
      const captured = [...f.state.pendingTriggers];
      expect(captured).toHaveLength(2);
      expect(new Set(captured).size).toBe(2);
      expect(
        new Set(Object.values(f.state.abilities).map((ability) => ability.source.lineage)).size,
      ).toBe(2);
      f.priority();
      expect(f.state.decision).toMatchObject({
        kind: "trigger-order",
        actor: "A",
        triggers: captured,
      });
      expect(observe(f.state, f.registry, "B").decision).toBeNull();
      const before = structuredClone(f.state);
      const first = captured[0];
      if (!first) throw new Error("Missing own trigger");
      const valid = f.command({ kind: "trigger-order", triggers: captured });
      for (const rejected of [
        { ...valid, actor: "B" },
        { ...valid, revision: valid.revision + 1 },
        { ...valid, decisionId: "unrelated" },
        { ...valid, response: { kind: "trigger-order", triggers: [first, first] } },
        { ...valid, response: { kind: "trigger-order", triggers: [first] } },
        { ...valid, response: { kind: "trigger-order", triggers: [first, "foreign-trigger"] } },
      ]) {
        expect(transition(f.state, rejected, f.registry).status).toBe("rejected");
        expect(f.state).toEqual(before);
      }
      const selected = reverse ? [...captured].reverse() : captured;
      const one = structuredClone(f.state);
      expect(answerTriggerOrder(one, "A", { kind: "trigger-order", triggers: selected })).toBe(
        true,
      );
      f.send({ kind: "trigger-order", triggers: selected });
      expect(stackIds(f.state)).toEqual(selected);
      const hand = player(f.state, "A").hand.length;
      f.passCycle();
      expect(events(f.state, "TriggeredAbilityResolved").at(-1)?.data.trigger).toBe(
        selected.at(-1),
      );
      expect(player(f.state, "A").hand).toHaveLength(hand + 1);
      expect(f.state.stack).toHaveLength(1);
      f.passCycle();
      expect(player(f.state, "A").hand).toHaveLength(hand + 2);
    });
  }

  for (const lifeOnTop of [false, true]) {
    test(`ETB11 distinct draw/life abilities resolve in the owner's selected ${lifeOnTop ? "life-first" : "draw-first"} order`, () => {
      const f = fixture();
      f.enter([
        { objectId: f.stage("draw"), controller: "A" },
        { objectId: f.stage("life"), controller: "A" },
      ]);
      const capture = [...f.state.pendingTriggers];
      const order = lifeOnTop ? capture : [...capture].reverse();
      const hand = player(f.state, "A").hand.length;
      f.priority();
      f.send({ kind: "trigger-order", triggers: order });
      f.passCycle();
      expect(player(f.state, "A").life).toBe(lifeOnTop ? 43 : 40);
      expect(player(f.state, "A").hand).toHaveLength(hand + (lifeOnTop ? 0 : 1));
      expect(f.state.stack).toHaveLength(1);
      f.passCycle();
      expect(player(f.state, "A").life).toBe(43);
      expect(player(f.state, "A").hand).toHaveLength(hand + 1);
    });
  }

  test("ETB11/13 each controller chooses their own cohort in APNAP order and sees earlier public stack choices", () => {
    const f = fixture(4, "C");
    f.enter(
      f.seats.flatMap((controller) => [
        { objectId: f.stage("draw", controller), controller },
        { objectId: f.stage("life", controller), controller },
      ]),
    );
    f.priority();
    const placed: string[] = [];
    for (const actor of ["C", "D", "A", "B"]) {
      expect(f.state.decision).toMatchObject({ kind: "trigger-order", actor });
      expect(observe(f.state, f.registry, actor).stack).toEqual(
        placed.map((triggerId) => ({ kind: "triggered-ability", triggerId })),
      );
      const own = f.state.decision?.triggers;
      if (!own) throw new Error("Missing controller cohort");
      expect(own).toHaveLength(2);
      expect(own.every((id) => f.state.abilities[id]?.controller === actor)).toBe(true);
      const selected = [...own].reverse();
      f.send({ kind: "trigger-order", triggers: selected });
      placed.push(...selected);
    }
    expect(stackIds(f.state)).toEqual(placed);
    expect(controllers(f.state)).toEqual(["C", "C", "D", "D", "A", "A", "B", "B"]);
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "C" });
    expect(f.state.triggerPlacement).toBeNull();
  });

  for (const count of [2, 4] as const) {
    test(`ETB12/13 ${count}-seat placement rotates from the active seat and resolves in reverse APNAP order`, () => {
      const active = count === 2 ? "B" : "C";
      const f = fixture(count, active);
      f.enter(
        [...f.seats]
          .reverse()
          .map((controller) => ({ objectId: f.stage("life", controller), controller })),
      );
      f.priority();
      const expected = count === 2 ? ["B", "A"] : ["C", "D", "A", "B"];
      expect(controllers(f.state)).toEqual(expected);
      for (const actor of [...expected].reverse()) {
        expect(f.state.decision).toMatchObject({ kind: "priority", actor: active });
        f.passCycle();
        expect(player(f.state, actor).life).toBe(43);
        expect(events(f.state, "TriggeredAbilityResolved").at(-1)?.data.controller).toBe(actor);
      }
      expect(f.state.stack).toEqual([]);
    });
  }

  test("ETB07/08 the whole entry batch commits with assigned controllers and later source control cannot redirect its trigger", () => {
    const f = fixture(4);
    const [source] = f.enter([
      { objectId: f.stage("life", "A"), controller: "B" },
      { objectId: f.stage("draw", "C"), controller: "D" },
    ]);
    if (!source) throw new Error("Missing entered source");
    const batch = events(f.state, "BattlefieldEntryBatch").at(-1);
    const captures = events(f.state, "TriggerCaptured");
    expect(captures.every((event) => event.index > (batch?.index ?? Infinity))).toBe(true);
    expect(
      Object.values(f.state.abilities).map((ability) => [
        ability.source.owner,
        ability.controller,
        ability.source.controller,
      ]),
    ).toEqual([
      ["A", "B", "B"],
      ["C", "D", "D"],
    ]);
    object(f.state, source).controller = "C"; // Synthetic control-change precondition only.
    const hand = player(f.state, "D").hand.length;
    f.priority();
    f.passCycle();
    f.passCycle();
    expect(player(f.state, "B").life).toBe(43);
    expect(player(f.state, "A").life).toBe(40);
    expect(player(f.state, "C").life).toBe(40);
    expect(player(f.state, "D").hand).toHaveLength(hand + 1);
  });

  test("ETB10 zero-toughness source dies at the real SBA checkpoint before its preserved trigger is placed", () => {
    const f = fixture();
    const [source] = f.enter([{ objectId: f.stage("zero"), controller: "A" }]);
    if (!source) throw new Error("Missing synthetic zero-toughness entry");
    f.priority();
    expect(f.state.objects[source]).toBeUndefined();
    expect(
      Object.values(f.state.objects).find(
        (entry) => entry.definition === "zero" && entry.owner === "A",
      )?.zone,
    ).toBe("graveyard");
    const captured = events(f.state, "TriggerCaptured").at(-1)?.index;
    const died = events(f.state, "CreaturesDiedBatch").at(-1)?.index;
    const placed = events(f.state, "TriggeredAbilityPutOnStack").at(-1)?.index;
    if (captured === undefined || died === undefined || placed === undefined)
      throw new Error("Missing ordered events");
    expect(captured).toBeLessThan(died);
    expect(died).toBeLessThan(placed);
    f.passCycle();
    expect(player(f.state, "A").life).toBe(43);
  });

  test("ETB16/25/26/27 repeated checkpoints and canonical restoration preserve one occurrence and the exact pending choice", () => {
    const f = fixture();
    f.enter([
      { objectId: f.stage("draw"), controller: "A" },
      { objectId: f.stage("life"), controller: "A" },
    ]);
    const captured = structuredClone(f.state.pendingTriggers);
    f.restore(f.state);
    f.priority();
    const pending = structuredClone(f.state);
    const command = f.command({ kind: "trigger-order", triggers: [...captured].reverse() });
    const first = transition(f.state, command, f.registry);
    f.restore(pending);
    for (let i = 0; i < 3; i++) f.priority();
    expect(f.state.decision).toEqual(pending.decision);
    expect(f.state.abilities).toEqual(pending.abilities);
    expect(events(f.state, "TriggerCaptured")).toHaveLength(2);
    expect(transition(f.state, command, f.registry)).toEqual(first);
    f.send(command.response);
    const contexts = structuredClone(f.state.abilities);
    for (const ability of Object.values(contexts))
      move(f.state, ability.source.id, "graveyard", "synthetic removal before stack restore");
    f.restore(f.state);
    expect(f.state.abilities).toEqual(contexts);
    expect(Object.values(contexts).every((ability) => !f.state.objects[ability.source.id])).toBe(
      true,
    );
    for (let i = 0; i < 3; i++) f.priority();
    expect(stackIds(f.state)).toEqual([...captured].reverse());
    // Accepted transitions reset the event batch; old captures are journaled separately.
    expect(events(f.state, "TriggerCaptured")).toHaveLength(0);
    expect(Object.keys(f.state.abilities)).toHaveLength(2);
    f.passCycle();
    const firstResolved = events(f.state, "TriggeredAbilityResolved").at(-1)?.data.trigger;
    f.passCycle();
    const secondResolved = events(f.state, "TriggeredAbilityResolved").at(-1)?.data.trigger;
    expect([firstResolved, secondResolved]).toEqual(captured);
    expect(f.state.abilities).toEqual({});
  });

  for (const placed of [false, true]) {
    test(`ETB21/22 departed controller loses its ${placed ? "stack" : "waiting"} abilities without creating physical cards`, () => {
      const f = fixture(4, "C");
      f.enter([
        { objectId: f.stage("life", "A"), controller: "A" },
        { objectId: f.stage("life", "B"), controller: "B" },
      ]);
      if (placed) f.priority();
      player(f.state, "A").life = 0; // Synthetic loss precondition; elimination uses real SBAs.
      f.priority();
      expect(player(f.state, "A").lost).toBe(true);
      expect(Object.values(f.state.abilities).map((ability) => ability.controller)).toEqual(["B"]);
      expect(controllers(f.state)).toEqual(["B"]);
      expect(Object.values(f.state.objects)).toHaveLength(300);
      expect(f.state.pendingTriggers).toEqual([]);
      f.passCycle();
      expect(player(f.state, "B").life).toBe(43);
      expect(player(f.state, "A").life).toBe(0);
      expect(f.state.abilities).toEqual({});
    });
  }

  test("ETB24/800.4j departed active player's turn continues and next living player receives priority around ability resolution", () => {
    const f = fixture(4);
    f.enter([{ objectId: f.stage("life", "B"), controller: "B" }]);
    player(f.state, "A").life = 0;
    f.priority();
    expect(f.state.turn).toBe(3);
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "B" });
    f.passCycle();
    expect(player(f.state, "B").life).toBe(43);
    expect(f.state.turn).toBe(3);
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "B" });
    expect(f.state.stack).toEqual([]);
  });

  test("ETB23 failed draw finishes and removes the ability before the loss checkpoint", () => {
    const f = fixture(4);
    const source = f.stage("visionary", "B");
    for (const id of [...player(f.state, "B").library])
      move(f.state, id, "exile", "synthetic empty-library precondition");
    f.enter([{ objectId: source, controller: "B" }]);
    f.priority();
    expect(player(f.state, "B").lost).toBe(false);
    expect(player(f.state, "B").drawnFromEmptyLibrary).toBe(false);
    resolveTriggeredAbility(f.state);
    expect(player(f.state, "B").drawnFromEmptyLibrary).toBe(true);
    expect(player(f.state, "B").lost).toBe(false);
    expect(f.state.stack).toEqual([]);
    expect(f.state.abilities).toEqual({});
    f.priority();
    expect(player(f.state, "B").lost).toBe(true);
    const resolved = events(f.state, "TriggeredAbilityResolved").at(-1)?.index;
    const lost = events(f.state, "PlayersLostBatch").at(-1)?.index;
    if (resolved === undefined || lost === undefined)
      throw new Error("Missing resolution/loss events");
    expect(resolved).toBeLessThan(lost);
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
  });

  test("ETB16 duplicate or non-entry batch proposals cannot mutate committed state", () => {
    const f = fixture();
    const source = f.stage("draw");
    const before = structuredClone(f.state);
    expect(() =>
      enterBattlefield(
        f.state,
        f.registry,
        [
          { objectId: source, controller: "A" },
          { objectId: source, controller: "A" },
        ],
        "invalid batch",
      ),
    ).toThrow();
    expect(f.state).toEqual(before);
    const [entered] = f.enter([{ objectId: source, controller: "A" }]);
    if (!entered) throw new Error("Missing first entry");
    const captured = structuredClone(f.state);
    expect(() =>
      enterBattlefield(
        f.state,
        f.registry,
        [{ objectId: entered, controller: "A" }],
        "not an entry",
      ),
    ).toThrow();
    expect(f.state).toEqual(captured);
  });
});
