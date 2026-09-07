import { describe, expect, test } from "bun:test";
import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  ENGINE_VERSION,
  type ExecutionRegistry,
  emptyMana,
  type GameEvent,
  type MatchManifest,
  type Response,
  SERIALIZER_VERSION,
} from "@iwsdk-apps/contracts";
import { move, player } from "./common";
import { assertInvariants, createMatch, transition } from "./index";
import { givePriority } from "./turns";

// Expectations were written from scenario-expectations.md and the pinned CR
// 4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f
// before execution. Synthetic 100-card decks/constructed starting boards are
// not source-backed full games. After prepare(), only transition() advances play.
const hash = "a".repeat(64);
function body(id: string, change: Partial<CardDefinition> = {}): CardDefinition {
  return {
    id,
    oracleId: `synthetic-${id}`,
    sourceVersion: hash,
    name: `Scenario ${id}`,
    typeLine: "Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: [],
    colors: ["B"],
    colorIdentity: ["B"],
    manaCost: { ...emptyMana(), B: 1, generic: 0 },
    manaValue: 1,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: false,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "constructed-integration-scenarios/1",
    ...change,
  };
}
function fixture(count: 2 | 4 = 2, changes: Record<string, Partial<CardDefinition>> = {}) {
  const definitions: Record<string, CardDefinition> = {
    commander: body("commander", {
      commanderEligible: true,
      typeLine: "Legendary Creature",
      supertypes: ["Legendary"],
      colorIdentity: ["B", "U"],
    }),
    a: body("a", changes.a),
    extra: body("extra", changes.extra),
    b: body("b", changes.b),
    swamp: body("swamp", {
      typeLine: "Basic Land — Swamp",
      types: ["Land"],
      supertypes: ["Basic"],
      subtypes: ["Swamp"],
      colors: [],
      manaCost: null,
      manaValue: 0,
      power: null,
      toughness: null,
      manaAbilities: ["B"],
      deckLimit: null,
    }),
    thirst: body("thirst", {
      oracleId: "ff27ff37-96c0-41af-8881-a078e884e67b",
      sourceVersion: "54ce92b3ffdee84710e229293608d9ee2c474fdaeb277a1bc17934363c2e309d",
      name: "Sorin's Thirst",
      typeLine: "Instant",
      types: ["Instant"],
      power: null,
      toughness: null,
      manaCost: { ...emptyMana(), B: 2, generic: 0 },
      manaValue: 2,
      oracleText: "Sorin's Thirst deals 2 damage to target creature and you gain 2 life.",
      spellProgram: {
        schema: "commander-spell/1",
        target: "creature",
        effects: [
          { kind: "damage", amount: 2 },
          { kind: "gain-life", recipient: "controller", amount: 2 },
        ],
      },
    }),
    inspiration: body("inspiration", {
      oracleId: "8f32ceb2-92c2-4dde-bf73-40bb79c3fcef",
      sourceVersion: "5027154446951c932a29f443e58f0c460fddb2e8cfdde09b794d952886515e7b",
      name: "Inspiration",
      typeLine: "Instant",
      types: ["Instant"],
      colors: ["U"],
      colorIdentity: ["U"],
      power: null,
      toughness: null,
      manaCost: { ...emptyMana(), U: 1, generic: 3 },
      manaValue: 4,
      oracleText: "Target player draws two cards.",
      spellProgram: {
        schema: "commander-spell/1",
        target: "player",
        effects: [{ kind: "draw", recipient: "target", amount: 2 }],
      },
    }),
  };
  const source: ContentRelease = {
    schema: "commander-content/1",
    id: "integration-scenarios",
    hash,
    sourceBundle: "constructed-unit-preconditions",
    rulesHash: "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f",
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "unit/1",
    processorAbi: ENGINE_VERSION,
  };
  const release: ExecutionRegistry = {
    sourceReleaseHash: source.hash,
    preparedArtifactHash: null,
    tokenTemplates: {},
    definitions: source.definitions,
  };
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: "integration-scenarios",
    releaseHash: hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 4,
    driverSeed: 1,
    driverVersion: "explicit-test-commands/1",
    mode: count === 2 ? "two-seat" : "four-seat",
    resolver: "full-scan",
    seats: ["A", "B", "C", "D"].slice(0, count).map((id) => ({
      id,
      deck: {
        id: `synthetic-${id}`,
        hash,
        commander: "commander",
        entries: [
          ...["commander", "a", "extra", "b", "thirst", "inspiration"].map((definition) => ({
            definition,
            count: 1,
          })),
          { definition: "swamp", count: 94 },
        ],
      },
    })),
  };
  const f = { release, state: createMatch(manifest, release), events: [] as GameEvent[] };
  answer(f, { kind: "starting-player", player: f.state.startingPlayerChooser });
  while (f.state.decision?.kind === "mulligan") answer(f, { kind: "mulligan", keep: true });
  while (f.state.step !== "main1") answer(f, { kind: "pass" });
  expect(f.state.activePlayer).toBe("A");
  // Construct a later main phase so old creatures may attack. This is fixture
  // history, never a claim that these setup moves were submitted commands.
  f.state.turn = 5;
  for (const [index, seat] of f.state.players.entries()) seat.lastTurnStarted = 5 - index;
  return f;
}
type Fixture = ReturnType<typeof fixture>;
function answer(f: Fixture, response: Response): void {
  const pending = f.state.decision;
  if (!pending) throw new Error("No pending decision");
  const result = transition(
    f.state,
    {
      schema: CONTRACT_VERSION,
      matchId: f.state.manifest.id,
      commandId: `integration-${f.state.revision}`,
      actor: pending.actor,
      revision: f.state.revision,
      decisionId: pending.id,
      response,
    },
    f.release,
  );
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
  f.events.push(...result.state.events);
}
/** Starting-board construction only. */
function place(f: Fixture, owner: string, definition: string, zone: "battlefield" | "hand") {
  const original = Object.values(f.state.objects).find(
    (entry) =>
      entry.owner === owner && entry.definition === definition && entry.zone !== "battlefield",
  );
  if (!original) throw new Error(`Missing fixture ${owner}/${definition}`);
  const entry = move(f.state, original.id, zone, "constructed starting board");
  entry.controlledSinceTurn = 0;
  return { id: entry.id, lineage: entry.lineage };
}
function prepare(f: Fixture): void {
  givePriority(f.state, f.release, "A");
  assertInvariants(f.state, f.release);
  f.events = [];
}
function passes(f: Fixture, actors: string[]): void {
  for (const actor of actors) {
    expect(f.state.decision).toMatchObject({ kind: "priority", actor });
    answer(f, { kind: "pass" });
  }
}
function blockedCombat(f: Fixture, attacker: string, blocker: string): void {
  passes(f, ["A", "B"]); // Main to beginning of combat.
  passes(f, ["A", "B"]); // Beginning of combat to attack declaration.
  expect(f.state.decision).toMatchObject({ kind: "attack", actor: "A" });
  answer(f, { kind: "attack", attacks: [{ attacker, defender: "B" }] });
  expect(f.state.step).toBe("attackers");
  passes(f, ["A", "B"]);
  expect(f.state.decision).toMatchObject({ kind: "block", actor: "B" });
  answer(f, { kind: "block", blocks: [{ blocker, attacker }] });
  expect(f.state.step).toBe("blockers");
  expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
}

describe("transition and checkpoint scenario integration", () => {
  test("COM-11 first-strike damage kills the blocker before normal damage and gives intervening priority", () => {
    const f = fixture(2, { a: { keywords: ["first-strike"] } });
    const attacker = place(f, "A", "a", "battlefield");
    const blocker = place(f, "B", "b", "battlefield");
    prepare(f);
    blockedCombat(f, attacker.id, blocker.id);
    passes(f, ["A", "B"]);
    expect(f.state.step).toBe("first-strike-damage");
    expect(f.state.decision).toMatchObject({ kind: "damage", actor: "A" });
    answer(f, {
      kind: "damage",
      allocations: [{ source: attacker.id, target: blocker.id, amount: 2 }],
    });
    expect(f.state.objects[blocker.id]).toBeUndefined();
    expect(
      Object.values(f.state.objects).find((entry) => entry.lineage === blocker.lineage)?.zone,
    ).toBe("graveyard");
    expect(f.state.objects[attacker.id]?.damage).toBe(0);
    expect(f.state.step).toBe("first-strike-damage");
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
    passes(f, ["A"]);
    expect(f.state.step).toBe("first-strike-damage");
    passes(f, ["B"]);
    expect(f.state.step).toBe("combat-damage");
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
    expect(f.state.objects[attacker.id]?.damage).toBe(0);
    expect(player(f.state, "B").life).toBe(40);
    expect(f.events.filter((event) => event.type === "CombatDamageDealt")).toHaveLength(1);
    expect(f.events.some((event) => event.type === "CreaturesDiedBatch")).toBe(true);
  });

  test("END-01 simultaneous lifelink and combat damage leave the defender alive at the real SBA checkpoint", () => {
    const f = fixture(2, {
      a: { power: 5, toughness: 5 },
      b: { power: 3, toughness: 3, keywords: ["lifelink"] },
    });
    const large = place(f, "A", "a", "battlefield");
    const small = place(f, "A", "extra", "battlefield");
    const blocker = place(f, "B", "b", "battlefield");
    player(f.state, "B").life = 4;
    prepare(f);
    passes(f, ["A", "B", "A", "B"]);
    answer(f, {
      kind: "attack",
      attacks: [
        { attacker: large.id, defender: "B" },
        { attacker: small.id, defender: "B" },
      ],
    });
    passes(f, ["A", "B"]);
    answer(f, { kind: "block", blocks: [{ blocker: blocker.id, attacker: small.id }] });
    passes(f, ["A", "B"]);
    answer(f, {
      kind: "damage",
      allocations: [
        { source: large.id, target: "B", amount: 5 },
        { source: small.id, target: blocker.id, amount: 2 },
      ],
    });
    expect(player(f.state, "B").life).toBe(4);
    answer(f, {
      kind: "damage",
      allocations: [{ source: blocker.id, target: small.id, amount: 3 }],
    });
    expect(player(f.state, "B")).toMatchObject({ life: 2, lost: false });
    expect(f.state.outcome.kind).toBe("ongoing");
    expect(f.state.objects[small.id]).toBeUndefined();
    expect(
      Object.values(f.state.objects).find((entry) => entry.lineage === small.lineage)?.zone,
    ).toBe("graveyard");
    expect(f.state.objects[blocker.id]?.damage).toBe(2);
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
    expect(f.events.some((event) => event.type === "PlayersLostBatch")).toBe(false);
  });

  for (const trample of [false, true]) {
    test(`COM-05 a blocker killed by a resolved spell leaves its ${trample ? "trampling" : "nontrampling"} attacker blocked`, () => {
      const f = fixture(2, { a: { keywords: trample ? ["trample"] : [] } });
      const attacker = place(f, "A", "a", "battlefield");
      const blocker = place(f, "B", "b", "battlefield");
      const spell = place(f, "A", "thirst", "hand");
      place(f, "A", "swamp", "battlefield");
      place(f, "A", "swamp", "battlefield");
      prepare(f);
      blockedCombat(f, attacker.id, blocker.id);
      answer(f, { kind: "cast", card: spell.id });
      expect(f.state.decision).toMatchObject({ kind: "target", actor: "A" });
      answer(f, { kind: "target", target: blocker.id });
      const sources =
        f.state.decision?.manaSources.map((source) => ({
          object: source.object,
          color: "B" as const,
        })) ?? [];
      expect(sources).toHaveLength(2);
      answer(f, { kind: "payment", sources, spend: { ...emptyMana(), B: 2 } });
      passes(f, ["A", "B"]);
      expect(f.state.objects[blocker.id]).toBeUndefined();
      expect(
        Object.values(f.state.objects).find((entry) => entry.lineage === blocker.lineage)?.zone,
      ).toBe("graveyard");
      expect(f.state.combat.blocked).toContain(attacker.id);
      expect(f.state.step).toBe("blockers");
      passes(f, ["A", "B"]);
      expect(f.state.step).toBe("combat-damage");
      if (trample)
        answer(f, {
          kind: "damage",
          allocations: [{ source: attacker.id, target: "B", amount: 2 }],
        });
      expect(player(f.state, "B").life).toBe(trample ? 38 : 40);
      expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
      expect(
        f.events.some(
          (event) => event.type === "StepStarted" && event.data.step === "first-strike-damage",
        ),
      ).toBe(false);
    });
  }

  test("PRI-04 immediate mana activation resets prior passes before stack resolution", () => {
    const f = fixture(4);
    const source = place(f, "C", "swamp", "battlefield");
    player(f.state, "A").mana.B = 1;
    prepare(f);
    const commander = Object.values(f.state.objects).find(
      (entry) => entry.owner === "A" && entry.commander,
    );
    if (!commander) throw new Error("Missing commander");
    answer(f, { kind: "cast", card: commander.id });
    answer(f, { kind: "payment", sources: [], spend: { ...emptyMana(), B: 1 } });
    passes(f, ["A", "B"]);
    answer(f, { kind: "mana", source: { object: source.id, color: "B" } });
    expect(f.state.objects[source.id]?.tapped).toBe(true);
    expect(player(f.state, "C").mana.B).toBe(1);
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "C" });
    for (const actor of ["C", "D", "A"]) {
      passes(f, [actor]);
      expect(f.state.stack).toHaveLength(1);
      expect(player(f.state, "C").mana.B).toBe(1);
    }
    passes(f, ["B"]);
    expect(f.state.stack).toHaveLength(0);
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
    expect(player(f.state, "C").mana.B).toBe(1);
    passes(f, ["A", "B", "C", "D"]);
    expect(f.state.step).toBe("begin-combat");
    expect(player(f.state, "C").mana.B).toBe(0);
  });

  test("END-05 active player loses from a resolved draw and the turn finishes cleanup before the next living turn", () => {
    const f = fixture(4);
    const spell = place(f, "A", "inspiration", "hand");
    for (const id of [...player(f.state, "A").library])
      move(f.state, id, "graveyard", "constructed empty library");
    player(f.state, "A").mana = { ...emptyMana(), B: 3, U: 1 };
    prepare(f);
    expect(player(f.state, "A").lost).toBe(false); // Empty is not a failed draw.
    answer(f, { kind: "cast", card: spell.id });
    answer(f, { kind: "target", target: "A" });
    answer(f, { kind: "payment", sources: [], spend: { ...emptyMana(), B: 3, U: 1 } });
    passes(f, ["A", "B", "C", "D"]);
    expect(player(f.state, "A")).toMatchObject({ lost: true, lossReason: "empty-library-draw" });
    expect(f.state).toMatchObject({
      turn: 5,
      activePlayer: "A",
      step: "main1",
      outcome: { kind: "ongoing" },
    });
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "B" });
    expect(Object.values(f.state.objects).some((entry) => entry.owner === "A")).toBe(false);
    const decisions: string[] = [];
    for (let n = 0; n < 40 && f.state.turn === 5; n++) {
      expect(f.state.activePlayer).toBe("A");
      expect(f.state.decision?.kind).toBe("priority");
      const actor = f.state.decision?.actor;
      if (!actor) throw new Error("Missing continuing-turn actor");
      decisions.push(actor);
      answer(f, { kind: "pass" });
    }
    expect(decisions).not.toContain("A");
    expect(f.state).toMatchObject({ turn: 6, activePlayer: "B", step: "upkeep" });
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "B" });
    const cleanup = f.events.findIndex(
      (event) => event.type === "CleanupPerformed" && event.data.turn === 5,
    );
    const nextUntap = f.events.findIndex(
      (event) =>
        event.type === "UntapPerformed" && event.data.player === "B" && event.data.turn === 6,
    );
    expect(cleanup).toBeGreaterThanOrEqual(0);
    expect(nextUntap).toBeGreaterThan(cleanup);
  });
});
