import { describe, expect, test } from "bun:test";
import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  ENGINE_VERSION,
  type ExecutionRegistry,
  emptyMana,
  type Mana,
  type MatchManifest,
  type Response,
  RulesState,
  SERIALIZER_VERSION,
  SpellProgram,
} from "@iwsdk-apps/contracts";
import { move, player, requireActivePlayer } from "./common";
import { legalSpellTargets } from "./effects";
import { createMatch, observe, transition } from "./index";
import { givePriority } from "./turns";

// Oracle identities, text and version hashes were checked against the frozen catalog.
// The board/decks below are isolated unit preconditions, not source-backed full games.
// Expectations derive from CR 601.2c/f/h, 608.2b/c/n, 121.2, 120.3e, 704.4,
// 702.11b and 702.18a in the pinned 2026-08-07 Comprehensive Rules.
const sources = [
  {
    key: "divination",
    oracleId: "273b339c-964b-4a18-8eb5-ceb8abcdfd9e",
    name: "Divination",
    sourceVersion: "00d836618ec785082d7ed41e79f928fd91f7d0d4533f8364856c9349b6271111",
    type: "Sorcery",
    color: "U",
    generic: 2,
    colored: 1,
    text: "Draw two cards.",
    program: {
      schema: "commander-spell/1",
      target: null,
      effects: [{ kind: "draw", recipient: "controller", amount: 2 }],
    },
  },
  {
    key: "inspiration",
    oracleId: "8f32ceb2-92c2-4dde-bf73-40bb79c3fcef",
    name: "Inspiration",
    sourceVersion: "5027154446951c932a29f443e58f0c460fddb2e8cfdde09b794d952886515e7b",
    type: "Instant",
    color: "U",
    generic: 3,
    colored: 1,
    text: "Target player draws two cards.",
    program: {
      schema: "commander-spell/1",
      target: "player",
      effects: [{ kind: "draw", recipient: "target", amount: 2 }],
    },
  },
  {
    key: "slash",
    oracleId: "8d98d674-6811-4d45-b22a-63792e272a2b",
    name: "Flame Slash",
    sourceVersion: "b721f5cd16dd0022b25263d63370733655604485b0171cfadb049cbfd30b3b7a",
    type: "Sorcery",
    color: "R",
    generic: 0,
    colored: 1,
    text: "Flame Slash deals 4 damage to target creature.",
    program: {
      schema: "commander-spell/1",
      target: "creature",
      effects: [{ kind: "damage", amount: 4 }],
    },
  },
  {
    key: "nectar",
    oracleId: "30870ee5-6ad7-48a9-983e-d3b018f2344f",
    name: "Sacred Nectar",
    sourceVersion: "bb5769a40aeefe2133158550beb137a5eb3f6336cec08803fde46c700d9f6af7",
    type: "Sorcery",
    color: "W",
    generic: 1,
    colored: 1,
    text: "You gain 4 life.",
    program: {
      schema: "commander-spell/1",
      target: null,
      effects: [{ kind: "gain-life", recipient: "controller", amount: 4 }],
    },
  },
  {
    key: "revitalize",
    oracleId: "b1385b03-cb4b-4812-857f-7421f1df39af",
    name: "Revitalize",
    sourceVersion: "fb337595e5e3fe9197aed80a12cd72f5589c2db771395a9c332463d67e54b608",
    type: "Instant",
    color: "W",
    generic: 1,
    colored: 1,
    text: "You gain 3 life.\nDraw a card.",
    program: {
      schema: "commander-spell/1",
      target: null,
      effects: [
        { kind: "gain-life", recipient: "controller", amount: 3 },
        { kind: "draw", recipient: "controller", amount: 1 },
      ],
    },
  },
  {
    key: "hands",
    oracleId: "3cc48835-3ac0-4774-b380-f9b21d2dc974",
    name: "Healing Hands",
    sourceVersion: "af2404a81f140ec8ce239547591f32c21ca0f35a98f598d680e4820d9764da29",
    type: "Sorcery",
    color: "W",
    generic: 2,
    colored: 1,
    text: "Target player gains 4 life.\nDraw a card.",
    program: {
      schema: "commander-spell/1",
      target: "player",
      effects: [
        { kind: "gain-life", recipient: "target", amount: 4 },
        { kind: "draw", recipient: "controller", amount: 1 },
      ],
    },
  },
  {
    key: "thirst",
    oracleId: "ff27ff37-96c0-41af-8881-a078e884e67b",
    name: "Sorin's Thirst",
    sourceVersion: "54ce92b3ffdee84710e229293608d9ee2c474fdaeb277a1bc17934363c2e309d",
    type: "Instant",
    color: "B",
    generic: 0,
    colored: 2,
    text: "Sorin's Thirst deals 2 damage to target creature and you gain 2 life.",
    program: {
      schema: "commander-spell/1",
      target: "creature",
      effects: [
        { kind: "damage", amount: 2 },
        { kind: "gain-life", recipient: "controller", amount: 2 },
      ],
    },
  },
  {
    key: "murder",
    oracleId: "938b4e2c-88d9-4637-bc00-e228920c9a78",
    name: "Murder",
    sourceVersion: "e4cf556c8fd67d94dbca7e263d4478955e7e9bfc66b0383fbc57a21b05fdd53c",
    type: "Instant",
    color: "B",
    generic: 1,
    colored: 2,
    text: "Destroy target creature.",
    program: { schema: "commander-spell/1", target: "creature", effects: [{ kind: "destroy" }] },
  },
  {
    key: "reward",
    oracleId: "e654242f-c7c5-4713-bbd0-26d41de8e2e7",
    name: "Final Reward",
    sourceVersion: "2298f0dc5a690e0ce2de86f5be07426182f881cbd7e73f9f5d6031879ff60a9d",
    type: "Instant",
    color: "B",
    generic: 4,
    colored: 1,
    text: "Exile target creature.",
    program: { schema: "commander-spell/1", target: "creature", effects: [{ kind: "exile" }] },
  },
] as const;
type SpellKey = (typeof sources)[number]["key"];
function sourceDefinition(source: (typeof sources)[number]): CardDefinition {
  return {
    id: `oracle:${source.oracleId}`,
    oracleId: source.oracleId,
    sourceVersion: source.sourceVersion,
    name: source.name,
    typeLine: source.type,
    types: [source.type],
    subtypes: [],
    supertypes: [],
    colors: [source.color],
    colorIdentity: [source.color],
    manaCost: { ...emptyMana(), [source.color]: source.colored, generic: source.generic },
    manaValue: source.generic + source.colored,
    power: null,
    toughness: null,
    keywords: [],
    manaAbilities: [],
    oracleText: source.text,
    commanderEligible: false,
    deckLimit: 1,
    obligations: ["rule:608.2"],
    implementationRevision: "independent-spell-expectations/1",
    spellProgram: SpellProgram.parse(source.program),
  };
}
const spells = {
  divination: sourceDefinition(sources[0]),
  inspiration: sourceDefinition(sources[1]),
  slash: sourceDefinition(sources[2]),
  nectar: sourceDefinition(sources[3]),
  revitalize: sourceDefinition(sources[4]),
  hands: sourceDefinition(sources[5]),
  thirst: sourceDefinition(sources[6]),
  murder: sourceDefinition(sources[7]),
  reward: sourceDefinition(sources[8]),
} satisfies Record<SpellKey, CardDefinition>;
function fixture(count: 2 | 4 = 2) {
  const digest = "a".repeat(64);
  const body: CardDefinition = {
    id: "unit-body",
    oracleId: "unit-body",
    sourceVersion: digest,
    name: "Synthetic test body",
    typeLine: "Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: [],
    colors: [],
    colorIdentity: [],
    manaCost: { ...emptyMana(), generic: 2 },
    manaValue: 2,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: false,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "isolated-spell-board/1",
  };
  const commander: CardDefinition = {
    ...body,
    id: "unit-commander",
    oracleId: "unit-commander",
    name: "Synthetic five-color commander",
    supertypes: ["Legendary"],
    typeLine: "Legendary Creature",
    commanderEligible: true,
    colorIdentity: ["W", "U", "B", "R", "G"],
  };
  const land: CardDefinition = {
    ...body,
    id: "unit-land",
    oracleId: "unit-land",
    name: "Plains",
    types: ["Land"],
    supertypes: ["Basic"],
    subtypes: ["Plains"],
    typeLine: "Basic Land — Plains",
    manaCost: null,
    manaValue: 0,
    power: null,
    toughness: null,
    deckLimit: null,
    manaAbilities: ["W"],
  };
  const shields = ["shroud", "hexproof", "indestructible"] as const;
  const definitions = Object.fromEntries(
    [
      commander,
      land,
      body,
      ...Object.values(spells),
      ...shields.map((keyword) => ({
        ...body,
        id: `unit-${keyword}`,
        oracleId: `unit-${keyword}`,
        name: `Synthetic ${keyword} body`,
        keywords: [keyword],
      })),
    ].map((definition) => [definition.id, definition]),
  );
  const source: ContentRelease = {
    schema: "commander-content/1",
    id: "spell-unit-release",
    hash: digest,
    sourceBundle: "isolated-board-and-pinned-oracle-examples",
    rulesHash: "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f",
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "unit/1",
    processorAbi: "unit/1",
  };
  const entries = Object.keys(definitions).map((definition) => ({
    definition,
    count: definition === land.id ? 101 - Object.keys(definitions).length : 1,
  }));
  const release: ExecutionRegistry = {
    sourceReleaseHash: source.hash,
    preparedArtifactHash: null,
    tokenTemplates: {},
    definitions: source.definitions,
  };
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: "spell-unit",
    releaseHash: digest,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 7,
    driverSeed: 9,
    driverVersion: "manual-source-expectations/1",
    mode: count === 2 ? "two-seat" : "four-seat",
    resolver: "full-scan",
    seats: ["A", "B", "C", "D"].slice(0, count).map((id) => ({
      id,
      deck: { id: "unit-deck", hash: digest, commander: commander.id, entries },
    })),
  };
  const f = { release, state: createMatch(manifest, release) };
  answer(f, { kind: "starting-player", player: f.state.startingPlayerChooser });
  while (f.state.decision?.kind === "mulligan") answer(f, { kind: "mulligan", keep: true });
  return f;
}
type Fixture = ReturnType<typeof fixture>;
function command(f: Fixture, response: Response) {
  const decision = f.state.decision;
  if (!decision) throw new Error("Expected pending decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: f.state.manifest.id,
    commandId: `spell-test-${f.state.revision}`,
    actor: decision.actor,
    revision: f.state.revision,
    decisionId: decision.id,
    response,
  };
}
function answer(f: Fixture, response: Response) {
  const result = transition(f.state, command(f, response), f.release);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
}
function locate(f: Fixture, actor: string, definition: string) {
  const found = Object.values(f.state.objects).find(
    (entry) => entry.owner === actor && entry.definition === definition,
  );
  if (!found) throw new Error(`Missing unit object ${definition}`);
  return found;
}
function hold(f: Fixture, actor: string, key: SpellKey): string {
  const found = locate(f, actor, spells[key].id);
  return found.zone === "hand"
    ? found.id
    : move(f.state, found.id, "hand", "isolated test precondition").id;
}
function body(f: Fixture, actor: string, definition = "unit-body"): string {
  return move(f.state, locate(f, actor, definition).id, "battlefield", "isolated test precondition")
    .id;
}
function main(f: Fixture) {
  for (let n = 0; n < 12 && f.state.step !== "main1"; n++) answer(f, { kind: "pass" });
  expect(f.state.step).toBe("main1");
}
function spendFor(key: SpellKey): Mana {
  const source = sources.find((entry) => entry.key === key);
  if (!source) throw new Error("Unknown pinned spell");
  return { ...emptyMana(), [source.color]: source.colored, C: source.generic };
}
function announce(f: Fixture, actor: string, key: SpellKey): string {
  const id = hold(f, actor, key);
  player(f.state, actor).mana = spendFor(key); // Isolated mana precondition; payment itself is an ordinary command.
  givePriority(f.state, f.release, actor);
  answer(f, { kind: "cast", card: id });
  const stackId = f.state.stack.at(-1);
  if (stackId?.kind !== "spell") throw new Error("Spell was not put on the stack");
  return stackId.objectId;
}
function cast(f: Fixture, actor: string, key: SpellKey, target?: string) {
  const id = announce(f, actor, key);
  if (target) answer(f, { kind: "target", target });
  answer(f, { kind: "payment", sources: [], spend: spendFor(key) });
  return id;
}
function resolveOne(f: Fixture) {
  const count = f.state.stack.length;
  for (let n = 0; n < 5 && f.state.stack.length === count; n++) answer(f, { kind: "pass" });
  expect(f.state.stack.length).toBeLessThan(count);
}

describe("source-reviewed spell instructions and casting", () => {
  test("typed programs reject an unused/missing target and creature draw/gain recipients", () => {
    expect(
      SpellProgram.safeParse({
        schema: "commander-spell/1",
        target: null,
        effects: [{ kind: "damage", amount: 4 }],
      }).success,
    ).toBe(false);
    expect(
      SpellProgram.safeParse({
        schema: "commander-spell/1",
        target: "player",
        effects: [{ kind: "draw", recipient: "controller", amount: 2 }],
      }).success,
    ).toBe(false);
    expect(
      SpellProgram.safeParse({
        schema: "commander-spell/1",
        target: "creature",
        effects: [{ kind: "draw", recipient: "target", amount: 2 }],
      }).success,
    ).toBe(false);
  });
  test("Divination pays {2}{U}, waits for passes, draws two separate cards and finishes in its graveyard", () => {
    const f = fixture();
    main(f);
    const actor = requireActivePlayer(f.state);
    const spell = announce(f, actor, "divination");
    const before = player(f.state, actor).hand.length;
    const invalid = command(f, { kind: "payment", sources: [], spend: { ...emptyMana(), U: 1 } });
    expect(transition(f.state, invalid, f.release).status).toBe("rejected");
    expect(f.state.objects[spell]?.zone).toBe("stack");
    answer(f, { kind: "payment", sources: [], spend: { ...emptyMana(), U: 1, C: 2 } });
    expect(player(f.state, actor).hand).toHaveLength(before);
    answer(f, { kind: "pass" });
    expect(f.state.objects[spell]?.zone).toBe("stack");
    answer(f, { kind: "pass" });
    expect(player(f.state, actor).hand).toHaveLength(before + 2);
    expect(f.state.events.filter((event) => event.type === "CardDrawn")).toHaveLength(2);
    expect(
      f.state.events
        .filter((event) => event.type === "CardDrawn")
        .every((event) => JSON.stringify(event.visibility) === JSON.stringify([actor])),
    ).toBe(true);
    expect(locate(f, actor, spells.divination.id).zone).toBe("graveyard");
    expect(f.state.decision?.actor).toBe(actor);
  });
  test("Inspiration casts at nonactive upkeep priority; target and payment decisions serialize with public chosen targets", () => {
    const f = fixture(4);
    const caster = f.state.players.find((seat) => seat.id !== requireActivePlayer(f.state))?.id;
    if (!caster) throw new Error("Missing opponent");
    const target = requireActivePlayer(f.state);
    const spell = announce(f, caster, "inspiration");
    expect(f.state.step).toBe("upkeep");
    expect(f.state.decision).toMatchObject({ kind: "target", actor: caster, count: 1 });
    expect(f.state.decision?.players).toEqual(["A", "B", "C", "D"]);
    const before = structuredClone(f.state);
    const input = command(f, { kind: "target", target });
    expect(transition(f.state, { ...input, actor: target }, f.release).status).toBe("rejected");
    expect(transition(f.state, { ...input, revision: input.revision - 1 }, f.release).status).toBe(
      "rejected",
    );
    expect(
      transition(f.state, command(f, { kind: "target", target: "unit-body" }), f.release).status,
    ).toBe("rejected");
    expect(f.state).toEqual(before);
    f.state = RulesState.parse(JSON.parse(JSON.stringify(f.state)));
    expect(f.state).toEqual(before);
    answer(f, { kind: "target", target });
    expect(f.state.decision?.kind).toBe("payment");
    expect(observe(f.state, f.release, target).decision).toBeNull();
    expect(
      observe(f.state, f.release, target).objects.find((entry) => entry.id === spell)?.spellState,
    ).toEqual({ target });
    const payment = structuredClone(f.state);
    f.state = RulesState.parse(JSON.parse(JSON.stringify(f.state)));
    expect(f.state).toEqual(payment);
    answer(f, { kind: "payment", sources: [], spend: { ...emptyMana(), U: 1, C: 3 } });
    const targetHand = player(f.state, target).hand.length;
    const casterHand = player(f.state, caster).hand.length;
    resolveOne(f);
    expect(player(f.state, target).hand).toHaveLength(targetHand + 2);
    expect(player(f.state, caster).hand).toHaveLength(casterHand);
  });
  test("sorcery timing and missing creature targets reject before changing the stack", () => {
    const f = fixture();
    const actor = requireActivePlayer(f.state);
    const divination = hold(f, actor, "divination");
    givePriority(f.state, f.release, actor);
    expect(
      transition(f.state, command(f, { kind: "cast", card: divination }), f.release).status,
    ).toBe("rejected");
    main(f);
    const slash = hold(f, actor, "slash");
    givePriority(f.state, f.release, actor);
    const before = structuredClone(f.state);
    expect(transition(f.state, command(f, { kind: "cast", card: slash }), f.release).status).toBe(
      "rejected",
    );
    expect(f.state).toEqual(before);
  });
  for (const afterTarget of [false, true]) {
    test(`cancelling ${afterTarget ? "after target selection" : "at target choice"} restores original identity and hand order`, () => {
      const f = fixture();
      const actor = requireActivePlayer(f.state);
      const original = hold(f, actor, "inspiration");
      const hand = [...player(f.state, actor).hand];
      const before = structuredClone(f.state.objects[original]);
      announce(f, actor, "inspiration");
      if (afterTarget) answer(f, { kind: "target", target: actor });
      answer(f, { kind: "cancel-cast" });
      expect(player(f.state, actor).hand).toEqual(hand);
      expect(f.state.objects[original]).toEqual(before);
      expect(f.state.stack).toHaveLength(0);
      expect(f.state.frames).toHaveLength(0);
    });
  }
});

describe("legal target revalidation and uninterrupted resolution", () => {
  test("creature targets exclude shroud and opponents' hexproof while allowing own hexproof", () => {
    const f = fixture();
    main(f);
    const actor = requireActivePlayer(f.state);
    const other = f.state.players.find((seat) => seat.id !== actor)?.id;
    if (!other) throw new Error("Missing opponent");
    const ownHex = body(f, actor, "unit-hexproof");
    const otherHex = body(f, other, "unit-hexproof");
    const shroud = body(f, actor, "unit-shroud");
    const plain = body(f, other);
    const program = spells.slash.spellProgram;
    if (!program) throw new Error("Missing program");
    expect(legalSpellTargets(f.state, f.release, actor, program).cards).toEqual(
      [ownHex, plain].sort(),
    );
    announce(f, actor, "slash");
    for (const target of [otherHex, shroud, actor])
      expect(transition(f.state, command(f, { kind: "target", target }), f.release).status).toBe(
        "rejected",
      );
    answer(f, { kind: "target", target: ownHex });
    expect(f.state.decision?.kind).toBe("payment");
  });
  test("Flame Slash marks four damage; indestructible survives while an ordinary 2/2 dies at the next checkpoint", () => {
    for (const indestructible of [false, true]) {
      const f = fixture();
      main(f);
      const actor = requireActivePlayer(f.state);
      const target = body(f, actor, indestructible ? "unit-indestructible" : "unit-body");
      cast(f, actor, "slash", target);
      resolveOne(f);
      if (indestructible)
        expect(f.state.objects[target]).toMatchObject({ zone: "battlefield", damage: 4 });
      else {
        expect(f.state.objects[target]).toBeUndefined();
        const types = f.state.events.map((event) => event.type);
        expect(types.indexOf("SpellResolved")).toBeLessThan(types.indexOf("CreaturesDiedBatch"));
      }
      expect(player(f.state, actor).commanderDamage).toEqual({});
    }
  });
  test("Sorin's Thirst completes life gain before lethal-damage SBAs; a response killing its sole target cancels all lower effects (CR608.2b example)", () => {
    const f = fixture();
    const caster = requireActivePlayer(f.state);
    const opponent = f.state.players.find((seat) => seat.id !== caster)?.id;
    if (!opponent) throw new Error("Missing opponent");
    const target = body(f, opponent);
    cast(f, caster, "thirst", target);
    answer(f, { kind: "pass" });
    cast(f, opponent, "thirst", target);
    resolveOne(f);
    expect(player(f.state, opponent).life).toBe(42);
    expect(player(f.state, caster).life).toBe(40);
    const types = f.state.events.map((event) => event.type);
    expect(types.indexOf("LifeGained")).toBeLessThan(types.indexOf("CreaturesDiedBatch"));
    resolveOne(f);
    expect(player(f.state, caster).life).toBe(40);
    expect(f.state.events.some((event) => event.type === "SpellDidNotResolve")).toBe(true);
  });
  test("a target leaving and returning is a new object and does not receive the old spell's damage", () => {
    const f = fixture();
    main(f);
    const actor = requireActivePlayer(f.state);
    const target = body(f, actor);
    cast(f, actor, "slash", target);
    const departed = move(f.state, target, "exile", "isolated revalidation precondition");
    const returned = move(
      f.state,
      departed.id,
      "battlefield",
      "isolated revalidation precondition",
    );
    resolveOne(f);
    expect(f.state.objects[returned.id]?.damage).toBe(0);
    expect(f.state.events.some((event) => event.type === "SpellDidNotResolve")).toBe(true);
  });
  test("Healing Hands does not draw for its controller after its target player leaves a four-seat game", () => {
    const f = fixture(4);
    main(f);
    const caster = requireActivePlayer(f.state);
    const target = f.state.players.find((seat) => seat.id !== caster)?.id;
    if (!target) throw new Error("Missing target");
    cast(f, caster, "hands", target);
    const hand = player(f.state, caster).hand.length;
    player(f.state, target).life = 0; // Isolated departure precondition; no invented damage spell.
    givePriority(f.state, f.release, caster);
    expect(player(f.state, target).lost).toBe(true);
    resolveOne(f);
    expect(player(f.state, caster).hand).toHaveLength(hand);
    expect(f.state.events.some((event) => event.type === "SpellDidNotResolve")).toBe(true);
  });
  test("Sacred Nectar and Revitalize change the controller's life by printed amounts; Revitalize then draws one", () => {
    const f = fixture();
    main(f);
    const actor = requireActivePlayer(f.state);
    cast(f, actor, "nectar");
    resolveOne(f);
    expect(player(f.state, actor).life).toBe(44);
    cast(f, actor, "revitalize");
    const hand = player(f.state, actor).hand.length;
    resolveOne(f);
    expect(player(f.state, actor).life).toBe(47);
    expect(player(f.state, actor).hand).toHaveLength(hand + 1);
    const types = f.state.events.map((event) => event.type);
    expect(types.indexOf("LifeGained")).toBeLessThan(types.indexOf("CardDrawn"));
  });
  test("Divination attempts the second draw from an empty library, finishes resolving, then its controller loses", () => {
    const f = fixture();
    main(f);
    const actor = requireActivePlayer(f.state);
    cast(f, actor, "divination");
    for (const id of [...player(f.state, actor).library].slice(1))
      move(f.state, id, "graveyard", "isolated one-card-library precondition");
    resolveOne(f);
    expect(player(f.state, actor).lost).toBe(true);
    expect(player(f.state, actor).lossReason).toBe("empty-library-draw");
    const types = f.state.events.map((event) => event.type);
    expect(types.filter((type) => type === "CardDrawn")).toHaveLength(1);
    expect(types.filter((type) => type === "DrawFromEmptyLibrary")).toHaveLength(1);
    expect(types.indexOf("SpellResolved")).toBeLessThan(types.indexOf("PlayersLostBatch"));
  });
});

describe("destroy and exile instructions (CR701.8a,701.13a,702.12b,903.9a)", () => {
  test("removal programs reject player/no targets and unimplemented post-move references", () => {
    for (const kind of ["destroy", "exile"] as const) {
      for (const target of [null, "player"])
        expect(
          SpellProgram.safeParse({ schema: "commander-spell/1", target, effects: [{ kind }] })
            .success,
        ).toBe(false);
      expect(
        SpellProgram.safeParse({
          schema: "commander-spell/1",
          target: "creature",
          effects: [{ kind }, { kind: "damage", amount: 2 }],
        }).success,
      ).toBe(false);
      expect(
        SpellProgram.safeParse({
          schema: "commander-spell/1",
          target: "creature",
          effects: [{ kind }, { kind: "draw", recipient: "controller", amount: 1 }],
        }).success,
      ).toBe(true);
    }
  });
  test("Murder destroys without damage, creates a new graveyard object, and records the battlefield last-known state", () => {
    const f = fixture();
    const actor = requireActivePlayer(f.state);
    const owner = f.state.players.find((seat) => seat.id !== actor)?.id;
    if (!owner) throw new Error("Missing opponent");
    const target = body(f, owner);
    const before = f.state.objects[target];
    if (!before) throw new Error("Missing creature");
    before.tapped = true;
    before.damage = 1;
    before.counters = { "+1/+1": 2 };
    const expectedLastKnown = structuredClone(before);
    cast(f, actor, "murder", target);
    resolveOne(f);
    const grave = locate(f, owner, "unit-body");
    expect(grave).toMatchObject({
      id: `${before.lineage}@${before.generation + 1}`,
      lineage: before.lineage,
      zone: "graveyard",
      owner,
      controller: owner,
      counters: {},
      damage: 0,
      tapped: false,
    });
    expect(f.state.objects[target]).toBeUndefined();
    expect(player(f.state, owner).graveyard).toContain(grave.id);
    const moved = f.state.events.find(
      (event) => event.type === "ObjectMoved" && event.cause === "destroy spell effect",
    );
    expect(moved?.data).toMatchObject({
      before: expectedLastKnown,
      after: { id: grave.id, zone: "graveyard" },
    });
    expect(f.state.events.some((event) => event.type === "NoncombatDamageDealt")).toBe(false);
    expect(locate(f, actor, spells.murder.id).zone).toBe("graveyard");
    expect(f.state.coverage["rule:701.8a"]).toBe(1);
    expect(f.state.coverage["rule:700.4"]).toBe(1);
  });
  test("indestructible stops Murder's destruction but it remains a legal target and the spell resolves", () => {
    const f = fixture();
    const actor = requireActivePlayer(f.state);
    const target = body(f, actor, "unit-indestructible");
    const before = structuredClone(f.state.objects[target]);
    cast(f, actor, "murder", target);
    resolveOne(f);
    expect(f.state.objects[target]).toEqual(before);
    expect(f.state.events.some((event) => event.type === "DestructionDidNotOccur")).toBe(true);
    expect(f.state.events.some((event) => event.type === "SpellResolved")).toBe(true);
    expect(f.state.events.some((event) => event.type === "SpellDidNotResolve")).toBe(false);
    expect(f.state.coverage["rule:702.12b"]).toBe(1);
    expect(f.state.coverage["rule:701.8a"]).toBeUndefined();
  });
  test("Final Reward exiles an indestructible creature; exile is neither destruction nor dying", () => {
    const f = fixture();
    const actor = requireActivePlayer(f.state);
    const target = body(f, actor, "unit-indestructible");
    const original = f.state.objects[target];
    if (!original) throw new Error("Missing creature");
    cast(f, actor, "reward", target);
    resolveOne(f);
    const exiled = locate(f, actor, "unit-indestructible");
    expect(exiled).toMatchObject({
      id: `${original.lineage}@${original.generation + 1}`,
      zone: "exile",
      owner: actor,
    });
    expect(f.state.objects[target]).toBeUndefined();
    expect(player(f.state, actor).graveyard).not.toContain(exiled.id);
    expect(f.state.events.some((event) => event.type === "CreatureExiled")).toBe(true);
    expect(f.state.events.some((event) => event.type === "CreatureDestroyed")).toBe(false);
    expect(f.state.coverage["rule:701.13a"]).toBe(1);
    expect(f.state.coverage[`card:${exiled.definition}:dies`]).toBeUndefined();
  });
  for (const key of ["murder", "reward"] as const) {
    for (const returnToCommand of [false, true]) {
      test(`${key} visits its destination and finishes resolving before the commander owner ${returnToCommand ? "accepts" : "declines"} the SBA move`, () => {
        const f = fixture(4);
        const caster = requireActivePlayer(f.state);
        const owner = f.state.players.find((seat) => seat.id !== caster)?.id;
        if (!owner) throw new Error("Missing commander owner");
        const target = body(f, owner, "unit-commander");
        const original = structuredClone(f.state.objects[target]);
        if (!original) throw new Error("Missing commander");
        cast(f, caster, key, target);
        resolveOne(f);
        const destination = key === "murder" ? "graveyard" : "exile";
        const movedCommander = locate(f, owner, "unit-commander");
        expect(movedCommander).toMatchObject({
          zone: destination,
          commander: true,
          lineage: original.lineage,
          generation: original.generation + 1,
        });
        expect(f.state.stack).toHaveLength(0);
        expect(locate(f, caster, spells[key].id).zone).toBe("graveyard");
        expect(f.state.events.some((event) => event.type === "SpellResolved")).toBe(true);
        expect(f.state.decision).toMatchObject({
          kind: "commander-zone",
          actor: owner,
          cards: [movedCommander.id],
        });
        expect(f.state.frames.some((frame) => frame.kind === "casting")).toBe(false);
        answer(f, { kind: "commander-zone", move: returnToCommand });
        const final = locate(f, owner, "unit-commander");
        expect(final.zone).toBe(returnToCommand ? "command" : destination);
        expect(final.lineage).toBe(original.lineage);
        expect(final.commander).toBe(true);
        expect(f.state.decision?.kind).toBe("priority");
        expect(f.state.coverage["rule:903.9a"]).toBe(1);
      });
    }
  }
  test("Final Reward responding to Murder exiles the target and the original Murder does not resolve", () => {
    const f = fixture();
    const caster = requireActivePlayer(f.state);
    const opponent = f.state.players.find((seat) => seat.id !== caster)?.id;
    if (!opponent) throw new Error("Missing opponent");
    const target = body(f, opponent);
    cast(f, caster, "murder", target);
    answer(f, { kind: "pass" });
    cast(f, opponent, "reward", target);
    resolveOne(f);
    const exiled = locate(f, opponent, "unit-body");
    expect(exiled.zone).toBe("exile");
    resolveOne(f);
    expect(locate(f, opponent, "unit-body")).toEqual(exiled);
    expect(f.state.events.some((event) => event.type === "SpellDidNotResolve")).toBe(true);
    expect(f.state.events.some((event) => event.type === "CreatureDestroyed")).toBe(false);
    expect(locate(f, caster, spells.murder.id).zone).toBe("graveyard");
  });
});
