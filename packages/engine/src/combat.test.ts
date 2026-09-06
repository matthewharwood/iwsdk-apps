import { describe, expect, test } from "bun:test";
import {
  type CardDefinition,
  CHANCE_VERSION,
  type ContentRelease,
  ENGINE_VERSION,
  type ExecutionRegistry,
  emptyMana,
  type GameObject,
  type Keyword,
  RulesState,
  SERIALIZER_VERSION,
} from "@iwsdk-apps/contracts";
import {
  answerAttack,
  answerBlock,
  answerDamage,
  applyCombatDamage,
  damageDomain,
  hasFirstStrikeStep,
  startAttackDeclaration,
  startBlockDeclarations,
  startCombatDamage,
} from "./combat";
import { emptyCombat, move, player } from "./common";

const digest = "a".repeat(64);

/** Deliberate isolated rule-unit states, not admitted decks or full-game evidence. */
function fixture(seats: 2 | 4 = 2) {
  const ids = ["A", "B", "C", "D"].slice(0, seats);
  const source: ContentRelease = {
    schema: "commander-content/1",
    id: "combat-rule-fixture",
    hash: digest,
    sourceBundle: "isolated-rules",
    rulesHash: digest,
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions: {},
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "fixture/1",
    processorAbi: "fixture/1",
  };
  const release: ExecutionRegistry = {
    sourceReleaseHash: source.hash,
    preparedArtifactHash: null,
    definitions: source.definitions,
  };
  const state = RulesState.parse({
    schema: "commander-state/1",
    manifest: {
      schema: "commander-match/1",
      id: "combat-fixture",
      releaseHash: digest,
      engineVersion: ENGINE_VERSION,
      serializer: SERIALIZER_VERSION,
      chance: CHANCE_VERSION,
      gameSeed: 1,
      driverSeed: 2,
      driverVersion: "fixture/1",
      mode: seats === 2 ? "two-seat" : "four-seat",
      seats: ids.map((id) => ({
        id,
        deck: {
          id: "unit-state",
          hash: digest,
          commander: "unit",
          entries: [{ definition: "unit", count: 100 }],
        },
      })),
      resolver: "full-scan",
    },
    revision: 0,
    epoch: 0,
    turn: 5,
    startingPlayerChooser: "A",
    startingPlayer: "A",
    activePlayer: "A",
    priorityPlayer: "A",
    eventSequence: 0,
    setupChoices: {},
    step: "attackers",
    consecutivePasses: 0,
    cleanupPriority: false,
    players: ids.map((id) => ({
      id,
      life: 40,
      poison: 0,
      lost: false,
      lossReason: null,
      library: [],
      hand: [],
      graveyard: [],
      mana: emptyMana(),
      landsPlayed: 0,
      commanderCasts: {},
      commanderDamage: {},
      drawnFromEmptyLibrary: false,
      mulligans: 0,
      keptHand: true,
      lastTurnStarted: id === "A" ? 5 : 4,
    })),
    objects: {},
    stack: [],
    abilities: {},
    pendingTriggers: [],
    triggerPlacement: null,
    chanceState: 1,
    chanceOperations: 0,
    combat: emptyCombat(),
    frames: [],
    decision: null,
    events: [],
    outcome: { kind: "ongoing" },
    coverage: {},
  });
  return { state, release };
}

function put(
  state: RulesState,
  release: ExecutionRegistry,
  id: string,
  controller: string,
  options: {
    power?: number;
    toughness?: number;
    keywords?: Keyword[];
    tapped?: boolean;
    controlledSinceTurn?: number;
    commander?: boolean;
    types?: string[];
  } = {},
): GameObject {
  const definition: CardDefinition = {
    id: `definition:${id}`,
    oracleId: `unit:${id}`,
    sourceVersion: digest,
    name: `Rule fixture ${id}`,
    typeLine: "Creature",
    types: options.types ?? ["Creature"],
    subtypes: [],
    supertypes: [],
    colors: [],
    colorIdentity: [],
    manaCost: { ...emptyMana(), generic: 2 },
    manaValue: 2,
    power: options.power ?? 2,
    toughness: options.toughness ?? 2,
    keywords: options.keywords ?? [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: options.commander ?? false,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "isolated-combat-fixture/1",
  };
  release.definitions[definition.id] = definition;
  const result: GameObject = {
    id,
    lineage: `physical:${id}`,
    generation: 0,
    definition: definition.id,
    owner: controller,
    controller,
    zone: "battlefield",
    tapped: options.tapped ?? false,
    controlledSinceTurn: options.controlledSinceTurn ?? 0,
    damage: 0,
    deathtouchDamage: false,
    counters: {},
    commander: options.commander ?? false,
    commanderMoveOffered: false,
  };
  state.objects[id] = result;
  return result;
}

function attack(
  state: RulesState,
  release: ExecutionRegistry,
  attacks: { attacker: string; defender: string }[],
) {
  startAttackDeclaration(state, release);
  answerAttack(state, release, "A", { kind: "attack", attacks });
  startBlockDeclarations(state, release);
}

function block(
  state: RulesState,
  release: ExecutionRegistry,
  blocks: { blocker: string; attacker: string }[],
  actor = "B",
) {
  return answerBlock(state, release, actor, { kind: "block", blocks });
}

function assign(
  state: RulesState,
  release: ExecutionRegistry,
  actor: string,
  allocations: { source: string; target: string; amount: number }[],
) {
  return answerDamage(state, release, actor, { kind: "damage", allocations });
}

describe("combat declarations (independent COM-01 through COM-04)", () => {
  test("attack permissions, haste, vigilance, defender, and whole-declaration rollback", () => {
    const { state, release } = fixture();
    const old = put(state, release, "old", "A");
    const vigilant = put(state, release, "vigilant", "A", { keywords: ["vigilance"] });
    put(state, release, "new", "A", { controlledSinceTurn: 5 });
    put(state, release, "hasty", "A", { controlledSinceTurn: 5, keywords: ["haste"] });
    put(state, release, "tapped", "A", { tapped: true, keywords: ["vigilance"] });
    put(state, release, "defender", "A", { keywords: ["defender", "haste"] });
    put(state, release, "battle", "A", { types: ["Creature", "Battle"] });
    put(state, release, "opponent", "B");
    startAttackDeclaration(state, release);
    expect(state.decision?.cards).toEqual(["hasty", "old", "vigilant"]);
    const before = structuredClone(state);
    expect(() =>
      answerAttack(state, release, "A", {
        kind: "attack",
        attacks: [
          { attacker: "old", defender: "B" },
          { attacker: "new", defender: "B" },
        ],
      }),
    ).toThrow("eligible untapped");
    expect(state).toEqual(before);
    answerAttack(state, release, "A", {
      kind: "attack",
      attacks: [
        { attacker: "old", defender: "B" },
        { attacker: "vigilant", defender: "B" },
      ],
    });
    expect(old.tapped).toBe(true);
    expect(vigilant.tapped).toBe(false);
    expect(state.decision).toBeNull();
  });

  test("one attacker cannot attack twice or attack its controller", () => {
    const { state, release } = fixture();
    put(state, release, "x", "A");
    startAttackDeclaration(state, release);
    expect(() =>
      answerAttack(state, release, "A", {
        kind: "attack",
        attacks: [
          { attacker: "x", defender: "B" },
          { attacker: "x", defender: "B" },
        ],
      }),
    ).toThrow("more than one");
    expect(() =>
      answerAttack(state, release, "A", {
        kind: "attack",
        attacks: [{ attacker: "x", defender: "A" }],
      }),
    ).toThrow("opponent");
    expect(state.objects.x?.tapped).toBe(false);
  });

  test("four-seat blocking obeys defender ownership and APNAP with flying/reach", () => {
    const { state, release } = fixture(4);
    put(state, release, "x", "A", { keywords: ["flying"] });
    put(state, release, "y", "A");
    put(state, release, "ground", "B");
    put(state, release, "reach", "B", { keywords: ["reach"], controlledSinceTurn: 5 });
    put(state, release, "c", "C");
    attack(state, release, [
      { attacker: "x", defender: "B" },
      { attacker: "y", defender: "C" },
    ]);
    expect(state.decision?.actor).toBe("B");
    expect(() => block(state, release, [{ blocker: "c", attacker: "y" }], "C")).toThrow(
      "requested player",
    );
    expect(() => block(state, release, [{ blocker: "ground", attacker: "x" }])).toThrow(
      "flying or reach",
    );
    expect(() => block(state, release, [{ blocker: "reach", attacker: "y" }])).toThrow(
      "attacking you",
    );
    expect(block(state, release, [{ blocker: "reach", attacker: "x" }])).toBe(false);
    expect(state.objects.reach?.tapped).toBe(false);
    expect(state.decision?.actor).toBe("C");
    expect(block(state, release, [{ blocker: "c", attacker: "y" }], "C")).toBe(true);
    expect(state.combat.blocked).toEqual(["x", "y"]);
  });

  test("menace rejects a single block, accepts two, and repeated blockers are invalid", () => {
    const { state, release } = fixture();
    put(state, release, "x", "A", { keywords: ["menace"] });
    put(state, release, "b1", "B");
    put(state, release, "b2", "B");
    attack(state, release, [{ attacker: "x", defender: "B" }]);
    const before = structuredClone(state);
    expect(() => block(state, release, [{ blocker: "b1", attacker: "x" }])).toThrow("at least two");
    expect(state).toEqual(before);
    expect(() =>
      block(state, release, [
        { blocker: "b1", attacker: "x" },
        { blocker: "b1", attacker: "x" },
      ]),
    ).toThrow("multiple attackers");
    expect(
      block(state, release, [
        { blocker: "b1", attacker: "x" },
        { blocker: "b2", attacker: "x" },
      ]),
    ).toBe(true);
  });
});

describe("combat damage assignments (COM-05 through COM-14)", () => {
  test("four-seat damage choices start at the actual active player and retain defender order", () => {
    const { state, release } = fixture(4);
    state.activePlayer = "C";
    put(state, release, "x", "C");
    put(state, release, "y", "C");
    put(state, release, "d", "D");
    put(state, release, "b", "B");
    startAttackDeclaration(state, release);
    answerAttack(state, release, "C", {
      kind: "attack",
      attacks: [
        { attacker: "x", defender: "D" },
        { attacker: "y", defender: "B" },
      ],
    });
    startBlockDeclarations(state, release);
    expect(state.combat.remainingDefenders).toEqual(["D", "B"]);
    block(state, release, [{ blocker: "d", attacker: "x" }], "D");
    block(state, release, [{ blocker: "b", attacker: "y" }]);
    startCombatDamage(state, release, false);
    expect(state.combat.damageActors).toEqual(["C", "D", "B"]);
    assign(state, release, "C", [
      { source: "x", target: "d", amount: 2 },
      { source: "y", target: "b", amount: 2 },
    ]);
    assign(state, release, "D", [{ source: "d", target: "x", amount: 2 }]);
    assign(state, release, "B", [{ source: "b", target: "y", amount: 2 }]);
    applyCombatDamage(state, release);
    expect(["x", "y", "d", "b"].map((id) => state.objects[id]?.damage)).toEqual([2, 2, 2, 2]);
  });

  test("a first-strike blocker remains in combat after its attacker leaves", () => {
    const { state, release } = fixture();
    put(state, release, "x", "A");
    put(state, release, "b", "B", { keywords: ["first-strike"] });
    attack(state, release, [{ attacker: "x", defender: "B" }]);
    block(state, release, [{ blocker: "b", attacker: "x" }]);
    move(state, "x", "graveyard", "scenario-attacker-removed");
    expect(hasFirstStrikeStep(state, release)).toBe(true);
    expect(startCombatDamage(state, release, true)).toBe(false);
    expect(state.combat.firstStrikeParticipants).toEqual(["b"]);
    applyCombatDamage(state, release);
    expect(startCombatDamage(state, release, false)).toBe(false);
  });

  test("5/5 may divide 2/3 between two 3/3 blockers, with simultaneous damage", () => {
    const { state, release } = fixture();
    put(state, release, "x", "A", { power: 5, toughness: 5 });
    put(state, release, "b1", "B", { power: 3, toughness: 3 });
    put(state, release, "b2", "B", { power: 3, toughness: 3 });
    attack(state, release, [{ attacker: "x", defender: "B" }]);
    block(state, release, [
      { blocker: "b1", attacker: "x" },
      { blocker: "b2", attacker: "x" },
    ]);
    expect(hasFirstStrikeStep(state, release)).toBe(false);
    expect(startCombatDamage(state, release, false)).toBe(true);
    expect(state.decision?.damageDomain[0]?.targets.map((entry) => entry.id)).toEqual(["b1", "b2"]);
    expect(
      assign(state, release, "A", [
        { source: "x", target: "b1", amount: 2 },
        { source: "x", target: "b2", amount: 3 },
      ]),
    ).toBe(false);
    expect(() => applyCombatDamage(state, release)).toThrow("finish assigning");
    expect(state.objects.b1?.damage).toBe(0);
    expect(
      assign(state, release, "B", [
        { source: "b1", target: "x", amount: 3 },
        { source: "b2", target: "x", amount: 3 },
      ]),
    ).toBe(true);
    applyCombatDamage(state, release);
    expect([state.objects.x?.damage, state.objects.b1?.damage, state.objects.b2?.damage]).toEqual([
      6, 2, 3,
    ]);
    expect(state.objects.x?.zone).toBe("battlefield"); // SBA is the caller's next operation.
    applyCombatDamage(state, release);
    expect(state.objects.x?.damage).toBe(6);
  });

  test("trample allows lethal-plus-excess or all damage to blocker, not an underassignment", () => {
    const { state, release } = fixture();
    put(state, release, "x", "A", { power: 5, toughness: 5, keywords: ["trample"] });
    put(state, release, "b", "B");
    attack(state, release, [{ attacker: "x", defender: "B" }]);
    block(state, release, [{ blocker: "b", attacker: "x" }]);
    startCombatDamage(state, release, false);
    const before = structuredClone(state);
    expect(() =>
      assign(state, release, "A", [
        { source: "x", target: "b", amount: 1 },
        { source: "x", target: "B", amount: 4 },
      ]),
    ).toThrow("lethal damage");
    expect(state).toEqual(before);
    const excess = structuredClone(state);
    assign(excess, release, "A", [
      { source: "x", target: "b", amount: 2 },
      { source: "x", target: "B", amount: 3 },
    ]);
    assign(excess, release, "B", [{ source: "b", target: "x", amount: 2 }]);
    applyCombatDamage(excess, release);
    expect(player(excess, "B").life).toBe(37);
    assign(state, release, "A", [{ source: "x", target: "b", amount: 5 }]);
    assign(state, release, "B", [{ source: "b", target: "x", amount: 2 }]);
    applyCombatDamage(state, release);
    expect(player(state, "B").life).toBe(40);
    expect(state.objects.b?.damage).toBe(5);
  });

  test("trample lethal accounts for marked damage and deathtouch", () => {
    for (const deathtouch of [false, true]) {
      const { state, release } = fixture();
      put(state, release, "x", "A", {
        power: 5,
        toughness: 5,
        keywords: deathtouch ? ["trample", "deathtouch"] : ["trample"],
      });
      const blocker = put(state, release, "b", "B", { power: 4, toughness: deathtouch ? 4 : 2 });
      blocker.damage = deathtouch ? 0 : 1;
      attack(state, release, [{ attacker: "x", defender: "B" }]);
      block(state, release, [{ blocker: "b", attacker: "x" }]);
      startCombatDamage(state, release, false);
      expect(damageDomain(state, release, "A")[0]?.targets[0]?.lethal).toBe(1);
      assign(state, release, "A", [
        { source: "x", target: "b", amount: 1 },
        { source: "x", target: "B", amount: 4 },
      ]);
      assign(state, release, "B", [{ source: "b", target: "x", amount: 4 }]);
      applyCombatDamage(state, release);
      expect(player(state, "B").life).toBe(36);
      expect(state.objects.b?.deathtouchDamage).toBe(deathtouch);
    }
  });

  test("leaving blocker preserves blocked status; trample can then reach defender", () => {
    for (const trample of [false, true]) {
      const { state, release } = fixture();
      put(state, release, "x", "A", { keywords: trample ? ["trample"] : [] });
      put(state, release, "b", "B");
      attack(state, release, [{ attacker: "x", defender: "B" }]);
      block(state, release, [{ blocker: "b", attacker: "x" }]);
      move(state, "b", "graveyard", "scenario-removal-before-damage");
      expect(startCombatDamage(state, release, false)).toBe(trample);
      expect(state.combat.blocked).toEqual(["x"]);
      if (trample) assign(state, release, "A", [{ source: "x", target: "B", amount: 2 }]);
      applyCombatDamage(state, release);
      expect(player(state, "B").life).toBe(trample ? 38 : 40);
    }
  });

  test("first-strike snapshot prevents dealing again after losing first strike", () => {
    const { state, release } = fixture();
    const attacker = put(state, release, "x", "A", { keywords: ["first-strike"] });
    put(state, release, "b", "B");
    attack(state, release, [{ attacker: "x", defender: "B" }]);
    block(state, release, [{ blocker: "b", attacker: "x" }]);
    expect(hasFirstStrikeStep(state, release)).toBe(true);
    startCombatDamage(state, release, true);
    expect(state.combat.damageActors).toEqual(["A"]);
    assign(state, release, "A", [{ source: "x", target: "b", amount: 2 }]);
    applyCombatDamage(state, release);
    expect(state.objects.x?.damage).toBe(0);
    move(state, "b", "graveyard", "scenario-lethal-SBA");
    const current = release.definitions[attacker.definition];
    if (!current) throw new Error("Fixture definition missing");
    current.keywords = [];
    expect(startCombatDamage(state, release, false)).toBe(false);
    expect(state.combat.firstStrikeParticipants).toEqual(["x"]);
    applyCombatDamage(state, release);
    expect(player(state, "B").life).toBe(40);
  });

  test("double strike applies two separate steps with a surviving blocker", () => {
    const { state, release } = fixture();
    put(state, release, "x", "A", { keywords: ["double-strike"] });
    put(state, release, "b", "B", { power: 3, toughness: 3 });
    attack(state, release, [{ attacker: "x", defender: "B" }]);
    block(state, release, [{ blocker: "b", attacker: "x" }]);
    startCombatDamage(state, release, true);
    assign(state, release, "A", [{ source: "x", target: "b", amount: 2 }]);
    applyCombatDamage(state, release);
    expect([state.objects.x?.damage, state.objects.b?.damage]).toEqual([0, 2]);
    startCombatDamage(state, release, false);
    assign(state, release, "A", [{ source: "x", target: "b", amount: 2 }]);
    assign(state, release, "B", [{ source: "b", target: "x", amount: 3 }]);
    applyCombatDamage(state, release);
    expect([state.objects.x?.damage, state.objects.b?.damage]).toEqual([3, 4]);
  });

  test("zero-power first striker still establishes the first-strike step", () => {
    const { state, release } = fixture();
    put(state, release, "x", "A", { power: 0, keywords: ["first-strike"] });
    put(state, release, "b", "B");
    attack(state, release, [{ attacker: "x", defender: "B" }]);
    block(state, release, [{ blocker: "b", attacker: "x" }]);
    expect(hasFirstStrikeStep(state, release)).toBe(true);
    expect(startCombatDamage(state, release, true)).toBe(false);
    applyCombatDamage(state, release);
    expect(startCombatDamage(state, release, false)).toBe(true);
    expect(state.decision?.actor).toBe("B");
  });

  test("wrong owner, foreign target, partial power, duplicate and fractional amounts cannot mutate state", () => {
    const { state, release } = fixture();
    put(state, release, "x", "A");
    attack(state, release, [{ attacker: "x", defender: "B" }]);
    block(state, release, []);
    startCombatDamage(state, release, false);
    const before = structuredClone(state);
    expect(() => assign(state, release, "B", [{ source: "x", target: "B", amount: 2 }])).toThrow(
      "requested player",
    );
    for (const allocations of [
      [{ source: "x", target: "A", amount: 2 }],
      [{ source: "x", target: "B", amount: 1 }],
      [{ source: "x", target: "B", amount: 0.5 }],
      [
        { source: "x", target: "B", amount: 1 },
        { source: "x", target: "B", amount: 1 },
      ],
    ])
      expect(() => assign(state, release, "A", allocations)).toThrow();
    expect(state).toEqual(before);
  });

  test("lifelink and incoming damage combine simultaneously; commander damage uses lineage", () => {
    const { state, release } = fixture();
    const commander = put(state, release, "x", "A", {
      power: 5,
      toughness: 5,
      keywords: ["lifelink"],
      commander: true,
    });
    put(state, release, "y", "A");
    put(state, release, "b", "B", {
      power: 3,
      toughness: 3,
      keywords: ["lifelink", "deathtouch", "indestructible"],
    });
    player(state, "B").life = 4;
    player(state, "B").commanderDamage[commander.lineage] = 16;
    attack(state, release, [
      { attacker: "x", defender: "B" },
      { attacker: "y", defender: "B" },
    ]);
    block(state, release, [{ blocker: "b", attacker: "y" }]);
    startCombatDamage(state, release, false);
    assign(state, release, "A", [
      { source: "x", target: "B", amount: 5 },
      { source: "y", target: "b", amount: 2 },
    ]);
    assign(state, release, "B", [{ source: "b", target: "y", amount: 3 }]);
    applyCombatDamage(state, release);
    expect(player(state, "A").life).toBe(45);
    expect(player(state, "B").life).toBe(2);
    expect(player(state, "B").commanderDamage).toEqual({ [commander.lineage]: 21 });
    expect(state.objects.y?.deathtouchDamage).toBe(true);
    expect(state.objects.b?.damage).toBe(2); // Indestructible never prevents damage.
    expect(player(state, "B").lost).toBe(false); // Caller now applies the commander-damage SBA.
  });

  test("pending compound damage choices survive schema serialization", () => {
    const { state, release } = fixture();
    put(state, release, "x", "A", { power: 5, keywords: ["trample"] });
    put(state, release, "b", "B");
    attack(state, release, [{ attacker: "x", defender: "B" }]);
    block(state, release, [{ blocker: "b", attacker: "x" }]);
    startCombatDamage(state, release, false);
    const resumed = RulesState.parse(JSON.parse(JSON.stringify(state)));
    for (const current of [state, resumed]) {
      assign(current, release, "A", [
        { source: "x", target: "b", amount: 2 },
        { source: "x", target: "B", amount: 3 },
      ]);
      assign(current, release, "B", [{ source: "b", target: "x", amount: 2 }]);
      applyCombatDamage(current, release);
    }
    expect(resumed).toEqual(state);
  });
});
