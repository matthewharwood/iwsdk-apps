import { expect, test } from "bun:test";
import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type CreatureModifier,
  canonicalJson,
  ENGINE_VERSION,
  type ExecutionRegistry,
  emptyMana,
  type Keyword,
  type MatchManifest,
  type Response,
  RulesState,
  SERIALIZER_VERSION,
} from "@iwsdk-apps/contracts";
import { characteristics } from "./characteristics";
import { move, player } from "./common";
import { legalSpellTargets } from "./effects";
import { assertInvariants, createMatch, observe, transition } from "./index";
import { availableMana, selectedObjects } from "./selection";
import { finishCleanup, givePriority } from "./turns";

// Independently derived from the pinned rules SHA4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f:
// CR611.2a/c,613.1f/4c/5,514.2/3a,800.4a/j,510.4,702.4d/7c.
// Synthetic legal-size deck setup, then explicitly constructed hands/board/control/counters.
// Commands, damage, resolution and checkpoints are real. These are neither source-card games nor G2 manifests.
const digest = "a".repeat(64);
function modifier(keywords: Keyword[] = [], powerDelta = 0, toughnessDelta = 0): CreatureModifier {
  return {
    kind: "modify-creature",
    keywords,
    powerDelta,
    toughnessDelta,
    duration: "until-end-of-turn",
  };
}
function definition(id: string, patch: Partial<CardDefinition> = {}): CardDefinition {
  return {
    id,
    oracleId: id,
    sourceVersion: digest,
    name: id,
    typeLine: "Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: [],
    colors: [],
    colorIdentity: [],
    manaCost: { ...emptyMana(), generic: 0 },
    manaValue: 0,
    power: 2,
    toughness: 4,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: false,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "synthetic-continuous-audit/1",
    ...patch,
  };
}
function fixture(
  modifiers: Record<string, CreatureModifier>,
  options: { seats?: 2 | 4; unit?: Partial<CardDefinition>; other?: Partial<CardDefinition> } = {},
) {
  const definitions: ExecutionRegistry["definitions"] = {
    commander: definition("commander", {
      commanderEligible: true,
      typeLine: "Legendary Creature",
      supertypes: ["Legendary"],
    }),
    unit: definition("unit", options.unit),
    other: definition("other", options.other),
    land: definition("land", {
      typeLine: "Basic Land — Forest",
      types: ["Land"],
      subtypes: ["Forest"],
      supertypes: ["Basic"],
      manaCost: null,
      power: null,
      toughness: null,
      manaAbilities: ["G"],
      deckLimit: null,
    }),
  };
  for (const [name, effect] of Object.entries(modifiers))
    definitions[name] = definition(name, {
      typeLine: "Instant",
      types: ["Instant"],
      power: null,
      toughness: null,
      spellProgram: { schema: "commander-spell/1", target: "creature", effects: [effect] },
    });
  const registry: ExecutionRegistry = {
    definitions,
    sourceReleaseHash: digest,
    preparedArtifactHash: null,
  };
  const ids = ["A", "B", "C", "D"].slice(0, options.seats ?? 2);
  const entries = Object.keys(definitions).map((id) => ({
    definition: id,
    count: id === "land" ? 101 - Object.keys(definitions).length : 1,
  }));
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: "continuous-audit",
    releaseHash: digest,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 121,
    driverSeed: 99,
    driverVersion: "independent-modifier-scenario/1",
    mode: ids.length === 2 ? "two-seat" : "four-seat",
    resolver: "full-scan",
    seats: ids.map((id) => ({
      id,
      deck: { id: "synthetic", hash: digest, commander: "commander", entries },
    })),
  };
  const f = { registry, state: createMatch(manifest, registry) };
  answer(f, { kind: "starting-player", player: "A" });
  while (f.state.decision?.kind === "mulligan") answer(f, { kind: "mulligan", keep: true });
  for (let n = 0; n < 20 && f.state.step !== "main1"; n++) answer(f, { kind: "pass" });
  if (f.state.step !== "main1") throw new Error("Fixture failed to reach first main");
  for (const owner of ids)
    for (const name of Object.keys(modifiers)) {
      const id = locate(f, owner, name);
      if (f.state.objects[id]?.zone !== "hand") move(f.state, id, "hand", "constructed audit hand");
    }
  givePriority(f.state, registry, "A");
  return f;
}
type Fixture = ReturnType<typeof fixture>;
function command(f: Fixture, response: Response) {
  const decision = f.state.decision;
  if (!decision) throw new Error("Missing decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: f.state.manifest.id,
    commandId: `audit-${f.state.revision}`,
    actor: decision.actor,
    revision: f.state.revision,
    decisionId: decision.id,
    response,
  };
}
function answer(f: Fixture, response: Response): void {
  const result = transition(f.state, command(f, response), f.registry);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
}
function reject(f: Fixture, response: Response): void {
  const before = canonicalJson(f.state);
  expect(transition(f.state, command(f, response), f.registry).status).toBe("rejected");
  expect(canonicalJson(f.state)).toBe(before);
}
function locate(f: Fixture, owner: string, name: string): string {
  const found = Object.values(f.state.objects).find(
    (object) => object.owner === owner && object.definition === name,
  );
  if (!found) throw new Error(`Missing physical ${owner}/${name}`);
  return found.id;
}
function enter(f: Fixture, owner: string, name = "unit", old = true): string {
  const found = move(f.state, locate(f, owner, name), "battlefield", "constructed audit board");
  if (old) found.controlledSinceTurn = 0;
  return found.id;
}
function cast(f: Fixture, actor: string, name: string, target: string): string {
  for (let n = 0; n < 4 && f.state.decision?.actor !== actor; n++) answer(f, { kind: "pass" });
  if (f.state.decision?.kind !== "priority" || f.state.decision.actor !== actor)
    throw new Error("Casting outside owned priority");
  answer(f, { kind: "cast", card: locate(f, actor, name) });
  answer(f, { kind: "target", target });
  answer(f, { kind: "payment", sources: [], spend: emptyMana() });
  const top = f.state.stack.at(-1);
  if (top?.kind !== "spell") throw new Error("Missing cast spell");
  return top.objectId;
}
function resolveOne(f: Fixture): void {
  const depth = f.state.stack.length;
  for (let n = 0; n < 5 && f.state.stack.length === depth; n++) answer(f, { kind: "pass" });
  expect(f.state.stack.length).toBe(depth - 1);
}
function passStep(f: Fixture): void {
  const step = f.state.step;
  for (let n = 0; n < 5 && f.state.step === step; n++) answer(f, { kind: "pass" });
  expect(f.state.step).not.toBe(step);
}
function attackUnblocked(f: Fixture, attackers: string[]): void {
  passStep(f); // main1 → beginning of combat
  passStep(f); // beginning → owned attack declaration
  answer(f, {
    kind: "attack",
    attacks: attackers.map((attacker) => ({ attacker, defender: "B" })),
  });
  passStep(f);
  answer(f, { kind: "block", blocks: [] });
  passStep(f);
}
function cleanupEntry(f: Fixture): void {
  f.state.step = "cleanup";
  f.state.decision = null;
  finishCleanup(f.state, f.registry);
}
function assignToPlayer(f: Fixture): void {
  const domain = f.state.decision?.damageDomain;
  if (!domain) throw new Error("Missing damage domain");
  answer(f, {
    kind: "damage",
    allocations: domain.map((entry) => ({
      source: entry.source,
      target: "B",
      amount: entry.power,
    })),
  });
}

test("CR702.7c granting first strike after first damage preserves a regular creature's normal damage assignment", () => {
  const f = fixture(
    { grant: modifier(["first-strike"]) },
    { other: { keywords: ["first-strike"] } },
  );
  const regular = enter(f, "A");
  const first = enter(f, "A", "other");
  attackUnblocked(f, [regular, first]);
  expect(f.state.step).toBe("first-strike-damage");
  expect(f.state.decision?.cards).toEqual([first]);
  assignToPlayer(f);
  expect(player(f.state, "B").life).toBe(38);
  cast(f, "A", "grant", regular);
  resolveOne(f);
  expect(f.state.combat.firstStrikeParticipants).toEqual([first]);
  passStep(f);
  expect(f.state.step).toBe("combat-damage");
  expect(f.state.decision?.cards).toEqual([regular]);
  assignToPlayer(f);
  expect(player(f.state, "B").life).toBe(36);
});

test("CR702.4d a first striker gaining double strike between damage steps assigns damage again", () => {
  const f = fixture(
    { grant: modifier(["double-strike"]) },
    { unit: { keywords: ["first-strike"] } },
  );
  const attacker = enter(f, "A");
  attackUnblocked(f, [attacker]);
  assignToPlayer(f);
  cast(f, "A", "grant", attacker);
  resolveOne(f);
  passStep(f);
  expect(f.state.decision?.cards).toEqual([attacker]);
  assignToPlayer(f);
  expect(player(f.state, "B").life).toBe(36);
});

test("CR510.4 double strike granted after the only damage step does not create a retroactive extra step", () => {
  const f = fixture({ grant: modifier(["double-strike"]) });
  const attacker = enter(f, "A");
  attackUnblocked(f, [attacker]);
  expect(f.state.step).toBe("combat-damage");
  assignToPlayer(f);
  cast(f, "A", "grant", attacker);
  resolveOne(f);
  passStep(f);
  expect(f.state.step).toBe("end-combat");
  expect(player(f.state, "B").life).toBe(38);
});

test("temporary haste and vigilance jointly change real attack eligibility and tapping", () => {
  const f = fixture({ grant: modifier(["haste", "vigilance"]) });
  const attacker = enter(f, "A", "unit", false);
  cast(f, "A", "grant", attacker);
  resolveOne(f);
  passStep(f);
  passStep(f);
  expect(f.state.decision?.cards).toContain(attacker);
  answer(f, { kind: "attack", attacks: [{ attacker, defender: "B" }] });
  expect(f.state.objects[attacker]?.tapped).toBe(false);
});

test("temporary flying, reach and menace affect whole blocking declarations rather than only UI labels", () => {
  const f = fixture({
    evasion: modifier(["flying", "menace"]),
    reach1: modifier(["reach"]),
    reach2: modifier(["reach"]),
  });
  const attacker = enter(f, "A");
  const blocker1 = enter(f, "B");
  const blocker2 = enter(f, "B", "other");
  cast(f, "A", "evasion", attacker);
  resolveOne(f);
  cast(f, "B", "reach1", blocker1);
  resolveOne(f);
  cast(f, "B", "reach2", blocker2);
  resolveOne(f);
  passStep(f);
  passStep(f);
  answer(f, { kind: "attack", attacks: [{ attacker, defender: "B" }] });
  passStep(f);
  reject(f, { kind: "block", blocks: [{ attacker, blocker: blocker1 }] });
  answer(f, {
    kind: "block",
    blocks: [
      { attacker, blocker: blocker1 },
      { attacker, blocker: blocker2 },
    ],
  });
  expect(f.state.combat.blocked).toEqual([attacker]);
  expect(f.state.combat.blocks).toHaveLength(2);
});

test("temporary power, trample, deathtouch and lifelink reach damage domains, simultaneous damage and SBAs", () => {
  const f = fixture({ grant: modifier(["trample", "deathtouch", "lifelink"], 2) });
  const attacker = enter(f, "A");
  const blocker = enter(f, "B");
  cast(f, "A", "grant", attacker);
  resolveOne(f);
  passStep(f);
  passStep(f);
  answer(f, { kind: "attack", attacks: [{ attacker, defender: "B" }] });
  passStep(f);
  answer(f, { kind: "block", blocks: [{ attacker, blocker }] });
  passStep(f);
  expect(f.state.decision?.damageDomain[0]).toMatchObject({
    source: attacker,
    power: 4,
    tramplePlayer: "B",
    targets: [
      { id: blocker, kind: "creature", lethal: 1 },
      { id: "B", kind: "player", lethal: 0 },
    ],
  });
  answer(f, {
    kind: "damage",
    allocations: [
      { source: attacker, target: blocker, amount: 1 },
      { source: attacker, target: "B", amount: 3 },
    ],
  });
  expect(player(f.state, "A").life).toBe(40);
  answer(f, { kind: "damage", allocations: [{ source: blocker, target: attacker, amount: 2 }] });
  expect(player(f.state, "A").life).toBe(44);
  expect(player(f.state, "B").life).toBe(37);
  expect(f.state.objects[attacker]?.damage).toBe(2);
  expect(f.state.objects[blocker]).toBeUndefined();
  expect(f.state.objects[locate(f, "B", "unit")]?.zone).toBe("graveyard");
});

test("CR514.3a a modifier cast during cleanup priority lasts only until the repeated cleanup action", () => {
  const f = fixture(
    { sustain: modifier([], 0, 2), later: modifier([], 0, 3) },
    { unit: { toughness: 0 } },
  );
  const fragile = enter(f, "B");
  const survivor = enter(f, "A", "other");
  const initial = f.state.objects[fragile];
  if (!initial) throw new Error("Missing constructed zero-toughness creature");
  initial.counters["+1/+1"] = 1;
  cast(f, "A", "sustain", fragile);
  resolveOne(f);
  const live = f.state.objects[fragile];
  if (!live) throw new Error("Missing sustained creature");
  live.counters = {}; // Explicit isolated precondition: its only remaining toughness comes from the expiring modifier.
  const turn = f.state.turn;
  cleanupEntry(f);
  let cleanupActions = f.state.events.filter((event) => event.type === "CleanupPerformed").length;
  expect(f.state.objects[fragile]).toBeUndefined();
  expect(f.state.cleanupPriority).toBe(true);
  expect(f.state.decision?.actor).toBe("A");
  expect(f.state.continuousEffects).toHaveLength(0);
  cast(f, "A", "later", survivor);
  resolveOne(f);
  expect(characteristics(f.state, f.registry, survivor).toughness).toBe(7);
  expect(f.state.continuousEffects[0]?.expiresAfterTurn).toBe(turn);
  for (let n = 0; n < 10 && f.state.turn === turn; n++) {
    const decision = f.state.decision;
    answer(
      f,
      decision?.kind === "discard"
        ? { kind: "discard", cards: decision.cards.slice(0, decision.count) }
        : { kind: "pass" },
    );
    cleanupActions += f.state.events.filter((event) => event.type === "CleanupPerformed").length;
  }
  expect(f.state.turn).toBe(turn + 1);
  expect(f.state.activePlayer).toBe("B");
  expect(characteristics(f.state, f.registry, survivor).toughness).toBe(4);
  expect(f.state.continuousEffects).toHaveLength(0);
  expect(cleanupActions).toBe(2);
  assertInvariants(f.state, f.registry);
});

test("CR611.2a and800.4j a departed active caster's effect survives until that turn actually ends", () => {
  const f = fixture({ grant: modifier([], 3, 3) }, { seats: 4 });
  const target = enter(f, "B");
  const source = cast(f, "A", "grant", target);
  resolveOne(f);
  const turn = f.state.turn;
  player(f.state, "A").life = 0; // Isolated losing-life precondition; actual checkpoint performs departure.
  givePriority(f.state, f.registry, "A");
  expect(player(f.state, "A").lost).toBe(true);
  expect(f.state.decision?.actor).toBe("B");
  expect(f.state.objects[source]).toBeUndefined();
  expect(characteristics(f.state, f.registry, target).power).toBe(5);
  expect(f.state.continuousEffects[0]?.controller).toBe("A");
  assertInvariants(RulesState.parse(JSON.parse(JSON.stringify(f.state))), f.registry);
  for (let n = 0; n < 60 && f.state.turn === turn; n++) {
    expect(f.state.decision?.kind).toBe("priority");
    answer(f, { kind: "pass" });
    if (f.state.turn === turn) expect(characteristics(f.state, f.registry, target).power).toBe(5);
  }
  expect(f.state.turn).toBe(turn + 1);
  expect(f.state.activePlayer).toBe("B");
  expect(characteristics(f.state, f.registry, target).power).toBe(2);
  expect(f.state.continuousEffects).toHaveLength(0);
});

test("departed source and affected owners leave an inert captured effect rather than retargeting another incarnation", () => {
  const f = fixture({ grant: modifier(["haste"], 3, 3) }, { seats: 4 });
  const removed = enter(f, "B");
  const survivor = enter(f, "C");
  cast(f, "A", "grant", removed);
  resolveOne(f);
  player(f.state, "A").life = 0;
  player(f.state, "B").life = 0;
  givePriority(f.state, f.registry, "A");
  expect(f.state.objects[removed]).toBeUndefined();
  expect(f.state.continuousEffects[0]?.affectedObject).toBe(removed);
  expect(f.state.continuousEffects[0]?.source.owner).toBe("A");
  expect(characteristics(f.state, f.registry, survivor)).toEqual({
    power: 2,
    toughness: 4,
    keywords: [],
  });
  expect(f.state.decision?.actor).toBe("C");
  expect(observe(f.state, f.registry, "C").objects.some((object) => object.id === removed)).toBe(
    false,
  );
  assertInvariants(f.state, f.registry);
});

test("captured hexproof and haste follow the same incarnation across a control change in every selector mode", () => {
  const f = fixture({ grant: modifier(["hexproof", "haste"]) }, { unit: { manaAbilities: ["G"] } });
  const target = enter(f, "B", "unit", false);
  cast(f, "B", "grant", target);
  resolveOne(f);
  const current = f.state.objects[target];
  if (!current) throw new Error("Missing controlled target");
  current.controller = "A"; // A separately constructed control-change precondition, not a claim of a control-effect processor.
  current.controlledSinceTurn = f.state.turn;
  const program = f.registry.definitions.grant?.spellProgram;
  if (!program) throw new Error("Missing typed program");
  for (const resolver of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
    const state = structuredClone(f.state);
    state.manifest.resolver = resolver;
    expect(legalSpellTargets(state, f.registry, "A", program).cards).toContain(target);
    expect(legalSpellTargets(state, f.registry, "B", program).cards).not.toContain(target);
    for (const actor of ["A", "B"]) {
      const mana = selectedObjects(state, f.registry, availableMana, {
        actor,
        lastTurn: player(state, actor).lastTurnStarted,
      }).map((object) => object.id);
      expect(mana.includes(target)).toBe(actor === "A");
    }
  }
  expect(
    observe(f.state, f.registry, "B").objects.find((object) => object.id === target)
      ?.characteristics.keywords,
  ).toEqual(["hexproof", "haste"]);
  const exiled = move(f.state, target, "exile", "constructed old-incarnation removal");
  const returned = move(f.state, exiled.id, "battlefield", "constructed new incarnation");
  expect(characteristics(f.state, f.registry, returned.id).keywords).toEqual([]);
  expect(f.state.continuousEffects[0]?.affectedObject).toBe(target);
  expect(f.state.continuousEffects[0]?.controller).toBe("B");
  assertInvariants(f.state, f.registry);
});

test("CR509.1h flying and menace granted after blockers do not undo an already legal block", () => {
  const f = fixture({ grant: modifier(["flying", "menace"]) });
  const attacker = enter(f, "A");
  const blocker = enter(f, "B");
  passStep(f);
  passStep(f);
  answer(f, { kind: "attack", attacks: [{ attacker, defender: "B" }] });
  passStep(f);
  answer(f, { kind: "block", blocks: [{ attacker, blocker }] });
  cast(f, "A", "grant", attacker);
  resolveOne(f);
  expect(f.state.combat.blocked).toEqual([attacker]);
  passStep(f);
  expect(f.state.decision?.damageDomain[0]?.targets).toEqual([
    { id: blocker, kind: "creature", lethal: 4 },
  ]);
  answer(f, { kind: "damage", allocations: [{ source: attacker, target: blocker, amount: 2 }] });
  answer(f, { kind: "damage", allocations: [{ source: blocker, target: attacker, amount: 2 }] });
  expect(player(f.state, "B").life).toBe(40);
  expect(f.state.objects[attacker]?.damage).toBe(2);
  expect(f.state.objects[blocker]?.damage).toBe(2);
});

test("CR510.4 a zero-power first striker cannot acquire normal damage merely by receiving a later power boost", () => {
  const f = fixture(
    { shrink: modifier([], -2), boost: modifier([], 2) },
    { unit: { keywords: ["first-strike"] } },
  );
  const first = enter(f, "A");
  const regular = enter(f, "A", "other");
  cast(f, "A", "shrink", first);
  resolveOne(f);
  attackUnblocked(f, [first, regular]);
  expect(f.state.step).toBe("first-strike-damage");
  expect(f.state.decision?.kind).toBe("priority");
  expect(f.state.combat.firstStrikeParticipants).toEqual([first]);
  expect(player(f.state, "B").life).toBe(40);
  cast(f, "A", "boost", first);
  resolveOne(f);
  expect(characteristics(f.state, f.registry, first).power).toBe(2);
  passStep(f);
  expect(f.state.decision?.cards).toEqual([regular]);
  assignToPlayer(f);
  expect(player(f.state, "B").life).toBe(38);
});
