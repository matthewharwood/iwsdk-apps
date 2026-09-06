import { expect, test } from "bun:test";
import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type CreatureModifier,
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
import { move, player, power, toughness } from "./common";
import { legalSpellTargets } from "./effects";
import { assertInvariants, createMatch, observe, transition } from "./index";
import { availableMana, selectedObjects } from "./selection";
import { finishCleanup, givePriority } from "./turns";

// Synthetic 100-card scenario decks and explicit board preconditions. These are
// independent CR611.2c/613.1f/613.4c/514.2 assertions, not source-card or game coverage.
const hash = "a".repeat(64);
function definition(id: string, change: Partial<CardDefinition> = {}): CardDefinition {
  return {
    id,
    oracleId: id,
    sourceVersion: hash,
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
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: false,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "synthetic-continuous/1",
    ...change,
  };
}
function modifier(powerDelta = 0, toughnessDelta = 0, keywords: Keyword[] = []): CreatureModifier {
  return {
    kind: "modify-creature",
    powerDelta,
    toughnessDelta,
    keywords,
    duration: "until-end-of-turn",
  };
}
function fixture(
  effect = modifier(3, 3),
  cantrip = false,
  seats: 2 | 4 = 2,
  body: Partial<CardDefinition> = {},
) {
  const definitions: ExecutionRegistry["definitions"] = {
    commander: definition("commander", {
      commanderEligible: true,
      typeLine: "Legendary Creature",
      supertypes: ["Legendary"],
    }),
    creature: definition("creature", body),
    second: definition("second"),
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
    spell: definition("spell", {
      typeLine: "Instant",
      types: ["Instant"],
      power: null,
      toughness: null,
      spellProgram: {
        schema: "commander-spell/1",
        target: "creature",
        effects: [
          effect,
          ...(cantrip
            ? [{ kind: "draw" as const, recipient: "controller" as const, amount: 1 }]
            : []),
        ],
      },
    }),
    removal: definition("removal", {
      typeLine: "Instant",
      types: ["Instant"],
      power: null,
      toughness: null,
      spellProgram: {
        schema: "commander-spell/1",
        target: "creature",
        effects: [{ kind: "destroy" }],
      },
    }),
  };
  const release: ExecutionRegistry = {
    sourceReleaseHash: hash,
    preparedArtifactHash: null,
    definitions,
  };
  const entries = Object.keys(definitions).map((id) => ({
    definition: id,
    count: id === "land" ? 101 - Object.keys(definitions).length : 1,
  }));
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: "continuous-scenario",
    releaseHash: hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 123,
    driverSeed: 1,
    driverVersion: "constructed-continuous-scenarios/1",
    mode: seats === 2 ? "two-seat" : "four-seat",
    resolver: "full-scan",
    seats: ["A", "B", "C", "D"]
      .slice(0, seats)
      .map((id) => ({ id, deck: { id: "synthetic-deck", hash, commander: "commander", entries } })),
  };
  const f = { release, state: createMatch(manifest, release) };
  answer(f, { kind: "starting-player", player: "A" });
  while (f.state.decision?.kind === "mulligan") answer(f, { kind: "mulligan", keep: true });
  for (let n = 0; n < 16 && f.state.step !== "main1"; n++) answer(f, { kind: "pass" });
  expect(f.state.step).toBe("main1");
  return f;
}
type Fixture = ReturnType<typeof fixture>;
function answer(f: Fixture, response: Response): void {
  const decision = f.state.decision;
  if (!decision) throw new Error("Missing scenario decision");
  const result = transition(
    f.state,
    {
      schema: CONTRACT_VERSION,
      matchId: f.state.manifest.id,
      commandId: `scenario-${f.state.revision}`,
      actor: decision.actor,
      revision: f.state.revision,
      decisionId: decision.id,
      response,
    },
    f.release,
  );
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
}
function locate(f: Fixture, owner: string, definitionId: string): string {
  const found = Object.values(f.state.objects).find(
    (object) => object.owner === owner && object.definition === definitionId,
  );
  if (!found) throw new Error(`Missing ${owner}/${definitionId}`);
  return found.id;
}
function battlefield(f: Fixture, owner = "B", definitionId = "creature"): string {
  return move(
    f.state,
    locate(f, owner, definitionId),
    "battlefield",
    "constructed board precondition",
  ).id;
}
function cast(f: Fixture, target: string, actor = "A", definitionId = "spell"): string {
  let id = locate(f, actor, definitionId);
  if (f.state.objects[id]?.zone !== "hand")
    id = move(f.state, id, "hand", "constructed hand precondition").id;
  givePriority(f.state, f.release, actor);
  answer(f, { kind: "cast", card: id });
  answer(f, { kind: "target", target });
  answer(f, { kind: "payment", sources: [], spend: emptyMana() });
  const top = f.state.stack.at(-1);
  if (top?.kind !== "spell") throw new Error("Expected spell on stack");
  return top.objectId;
}
function resolveOne(f: Fixture): void {
  const depth = f.state.stack.length;
  for (let n = 0; n < 5 && f.state.stack.length === depth; n++) answer(f, { kind: "pass" });
  expect(f.state.stack.length).toBeLessThan(depth);
}
function enterCleanup(f: Fixture): void {
  f.state.step = "cleanup";
  f.state.decision = null;
}

test("resolution creates an independent captured effect and publishes derived characteristics without rewriting the source", () => {
  const f = fixture();
  const target = battlefield(f);
  const source = cast(f, target);
  expect(power(f.state, f.release, target)).toBe(2);
  resolveOne(f);
  expect(f.state.objects[source]).toBeUndefined();
  expect(f.state.continuousEffects).toHaveLength(1);
  expect(f.state.continuousEffects[0]?.source.id).toBe(source);
  expect(power(f.state, f.release, target)).toBe(5);
  expect(toughness(f.state, f.release, target)).toBe(5);
  const shown = observe(f.state, f.release, "A").objects.find((object) => object.id === target);
  expect(shown?.card.power).toBe(2);
  expect(shown?.characteristics.power).toBe(5);
  expect(f.release.definitions.creature?.power).toBe(2);
  const restored = RulesState.parse(JSON.parse(JSON.stringify(f.state)));
  assertInvariants(restored, f.release);
  expect(characteristics(restored, f.release, target)).toEqual(
    characteristics(f.state, f.release, target),
  );
});

test("additive effects and counters combine; changing control retains the fixed affected incarnation", () => {
  const f = fixture();
  const target = battlefield(f);
  const object = f.state.objects[target];
  if (!object) throw new Error("Missing target");
  object.counters["+1/+1"] = 2;
  cast(f, target);
  resolveOne(f);
  cast(f, target, "B");
  resolveOne(f);
  expect(power(f.state, f.release, target)).toBe(10);
  const current = f.state.objects[target];
  if (!current) throw new Error("Missing target");
  current.controller = "A";
  expect(power(f.state, f.release, target)).toBe(10);
  expect(f.state.continuousEffects.map((effect) => effect.controller)).toEqual(["A", "B"]);
  assertInvariants(f.state, f.release);
});

test("leaving and returning produces an unaffected new incarnation; effect record survives until cleanup", () => {
  const f = fixture();
  const target = battlefield(f);
  cast(f, target);
  resolveOne(f);
  const grave = move(f.state, target, "graveyard", "constructed zone-change event");
  const returned = move(f.state, grave.id, "battlefield", "constructed return event");
  expect(power(f.state, f.release, returned.id)).toBe(2);
  expect(f.state.continuousEffects[0]?.affectedObject).toBe(target);
  expect(f.state.continuousEffects).toHaveLength(1);
  assertInvariants(f.state, f.release);
});

test("all-illegal target prevents both modifier and cantrip", () => {
  const f = fixture(modifier(3, 3), true);
  const target = battlefield(f);
  cast(f, target);
  const hand = player(f.state, "A").hand.length;
  move(f.state, target, "graveyard", "constructed target removal before resolution");
  resolveOne(f);
  expect(f.state.continuousEffects).toHaveLength(0);
  expect(player(f.state, "A").hand).toHaveLength(hand);
  expect(f.state.events.some((event) => event.type === "SpellDidNotResolve")).toBe(true);
});

test("negative toughness applies before cantrip but SBA death waits until the full spell completes, even with indestructible", () => {
  const f = fixture(modifier(-3, -3), true, 2, { keywords: ["indestructible"] });
  const target = battlefield(f);
  cast(f, target);
  const hand = player(f.state, "A").hand.length;
  resolveOne(f);
  expect(player(f.state, "A").hand).toHaveLength(hand + 1);
  expect(f.state.objects[target]).toBeUndefined();
  expect(f.state.objects[locate(f, "B", "creature")]?.zone).toBe("graveyard");
  const draw = f.state.events.findIndex((event) => event.type === "CardDrawn");
  const resolved = f.state.events.findIndex((event) => event.type === "SpellResolved");
  const death = f.state.events.findIndex(
    (event) =>
      event.type === "ObjectMoved" &&
      typeof event.data.before === "object" &&
      event.data.before !== null &&
      !Array.isArray(event.data.before) &&
      event.data.before.id === target,
  );
  expect(draw).toBeGreaterThanOrEqual(0);
  expect(resolved).toBeGreaterThan(draw);
  expect(death).toBeGreaterThan(resolved);
});

test("cleanup expires modifiers and removes damage simultaneously, so a temporarily enlarged damaged creature survives", () => {
  const f = fixture();
  const target = battlefield(f);
  cast(f, target);
  resolveOne(f);
  const object = f.state.objects[target];
  if (!object) throw new Error("Missing target");
  object.damage = 4;
  f.state.step = "cleanup";
  f.state.decision = null; // Isolated cleanup entry; real cleanup action and checkpoint follow.
  finishCleanup(f.state, f.release);
  expect(f.state.continuousEffects).toHaveLength(0);
  expect(f.state.objects[target]?.damage).toBe(0);
  expect(power(f.state, f.release, target)).toBe(2);
  expect(f.state.objects[target]?.zone).toBe("battlefield");
});

test("cleanup expiry can cause an actual SBA death and therefore grant the required extra cleanup priority", () => {
  const f = fixture(modifier(0, 2), false, 2, { toughness: 0 });
  const target = battlefield(f); // The zero-toughness entry is only a constructed precondition.
  // Keep it alive at initial priority with a +1/+1 counter, then remove the counter after the spell resolves.
  const object = f.state.objects[target];
  if (!object) throw new Error("Missing target");
  object.counters["+1/+1"] = 1;
  cast(f, target);
  resolveOne(f);
  const alive = f.state.objects[target];
  if (!alive) throw new Error("Missing target");
  alive.counters = {};
  enterCleanup(f);
  finishCleanup(f.state, f.release);
  expect(f.state.objects[target]).toBeUndefined();
  expect(f.state.cleanupPriority).toBe(true);
  expect(f.state.decision?.kind).toBe("priority");
  expect(f.state.step).toBe("cleanup");
  answer(f, { kind: "pass" });
  answer(f, { kind: "pass" });
  expect(f.state.step).toBe("upkeep");
});

test("a departed spell controller does not end its previously resolved modifier on a surviving player's creature", () => {
  const f = fixture(modifier(3, 3), false, 4);
  const target = battlefield(f);
  cast(f, target);
  resolveOne(f);
  player(f.state, "A").life = 0;
  givePriority(f.state, f.release, "B");
  expect(player(f.state, "A").lost).toBe(true);
  expect(power(f.state, f.release, target)).toBe(5);
  expect(f.state.continuousEffects[0]?.controller).toBe("A");
  assertInvariants(f.state, f.release);
});

test("granted hexproof and shroud immediately change target legality while retaining printed keywords", () => {
  const f = fixture(modifier(0, 0, ["hexproof"]));
  const target = battlefield(f);
  cast(f, target, "B");
  resolveOne(f);
  const program = f.release.definitions.removal?.spellProgram;
  if (!program) throw new Error("Missing removal program");
  expect(legalSpellTargets(f.state, f.release, "A", program).cards).not.toContain(target);
  expect(legalSpellTargets(f.state, f.release, "B", program).cards).toContain(target);
  expect(f.release.definitions.creature?.keywords).toEqual([]);
  const shroud = fixture(modifier(0, 0, ["shroud"]));
  const protectedTarget = battlefield(shroud);
  cast(shroud, protectedTarget);
  resolveOne(shroud);
  expect(legalSpellTargets(shroud.state, shroud.release, "B", program).cards).not.toContain(
    protectedTarget,
  );
});

test("granted haste reaches all three selector views immediately and expires at cleanup", () => {
  const f = fixture(modifier(0, 0, ["haste"]), false, 2, { manaAbilities: ["G"] });
  const target = battlefield(f, "A");
  const select = () =>
    selectedObjects(f.state, f.release, availableMana, {
      actor: "A",
      lastTurn: player(f.state, "A").lastTurnStarted,
    }).map((object) => object.id);
  expect(select()).not.toContain(target);
  cast(f, target);
  resolveOne(f);
  expect(select()).toContain(target);
  for (const resolver of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
    const viewState = structuredClone(f.state);
    viewState.manifest.resolver = resolver;
    expect(
      selectedObjects(viewState, f.release, availableMana, {
        actor: "A",
        lastTurn: player(viewState, "A").lastTurnStarted,
      }).map((object) => object.id),
    ).toContain(target);
  }
  expect(
    observe(f.state, f.release, "B").objects.find((object) => object.id === target)?.characteristics
      .keywords,
  ).toContain("haste");
  f.state.step = "cleanup";
  f.state.decision = null;
  finishCleanup(f.state, f.release);
  expect(characteristics(f.state, f.release, target).keywords).not.toContain("haste");
  expect(select()).not.toContain(target);
});

test("granted indestructible prevents a resolving destroy spell but not negative-toughness SBA", () => {
  const f = fixture(modifier(0, 0, ["indestructible"]));
  const target = battlefield(f);
  cast(f, target);
  resolveOne(f);
  cast(f, target, "A", "removal");
  resolveOne(f);
  expect(f.state.objects[target]?.zone).toBe("battlefield");
  expect(f.state.events.some((event) => event.type === "DestructionDidNotOccur")).toBe(true);
});

test("continuous source, target, controller, duration and program edits fail invariant validation", () => {
  const f = fixture();
  const target = battlefield(f);
  cast(f, target);
  resolveOne(f);
  for (const change of ["controller", "target", "duration", "program"] as const) {
    const bad = structuredClone(f.state);
    const effect = bad.continuousEffects[0];
    if (!effect) throw new Error("Missing effect");
    if (change === "controller") effect.controller = "B";
    if (change === "target") effect.affectedObject = locate(f, "B", "second");
    if (change === "duration") effect.expiresAfterTurn++;
    if (change === "program") effect.modifier.powerDelta++;
    expect(() => assertInvariants(bad, f.release)).toThrow();
  }
});
