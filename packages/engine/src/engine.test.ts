import { describe, expect, test } from "bun:test";
import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  canonicalJson,
  ENGINE_VERSION,
  type ExecutionRegistry,
  emptyMana,
  type MatchManifest,
  type Response,
  RulesState,
  SERIALIZER_VERSION,
} from "@iwsdk-apps/contracts";
import { manaSources, priorityCards } from "./casting";
import { creatures, move, player, requireActivePlayer } from "./common";
import { assertInvariants, createMatch, observe, transition } from "./index";
import { battlefieldCreatures, selectObjectCandidates } from "./selection";
import { givePriority } from "./turns";

/** Synthetic engine fixtures are isolated assertions, never reported as source-backed games. */
function fixture(count: 2 | 4 = 2) {
  const digest = "a".repeat(64);
  const commander: CardDefinition = {
    id: "commander",
    oracleId: "unit-commander",
    sourceVersion: digest,
    name: "Unit commander",
    typeLine: "Legendary Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: ["Legendary"],
    colors: ["G"],
    colorIdentity: ["G"],
    manaCost: { ...emptyMana(), G: 1, generic: 0 },
    manaValue: 1,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: true,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "isolated-tests/1",
  };
  const land: CardDefinition = {
    ...commander,
    id: "land",
    oracleId: "unit-land",
    name: "Unit Forest",
    typeLine: "Basic Land — Forest",
    types: ["Land"],
    subtypes: ["Forest"],
    supertypes: ["Basic"],
    manaCost: null,
    manaValue: 0,
    colors: [],
    power: null,
    toughness: null,
    manaAbilities: ["G"],
    commanderEligible: false,
    deckLimit: null,
  };
  const source: ContentRelease = {
    schema: "commander-content/1",
    id: "engine-units",
    hash: digest,
    sourceBundle: "synthetic-unit-fixture",
    rulesHash: digest,
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions: { commander, land },
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "unit/1",
    processorAbi: "unit/1",
  };
  const release: ExecutionRegistry = {
    sourceReleaseHash: source.hash,
    preparedArtifactHash: null,
    definitions: source.definitions,
  };
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: "engine-unit",
    releaseHash: digest,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 9,
    driverSeed: 3,
    driverVersion: "manual-unit-commands/1",
    mode: count === 2 ? "two-seat" : "four-seat",
    resolver: "full-scan",
    seats: ["A", "B", "C", "D"].slice(0, count).map((id) => ({
      id,
      deck: {
        id: "unit-deck",
        hash: digest,
        commander: "commander",
        entries: [
          { definition: "commander", count: 1 },
          { definition: "land", count: 99 },
        ],
      },
    })),
  };
  const f = { release, manifest, state: createMatch(manifest, release) };
  selectStartingPlayer(f);
  return f;
}
type Fixture = ReturnType<typeof fixture>;
function command(state: RulesState, response: Response) {
  if (!state.decision) throw new Error("Expected pending decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: state.manifest.id,
    commandId: `unit-${state.revision}`,
    actor: state.decision.actor,
    revision: state.revision,
    decisionId: state.decision.id,
    response,
  };
}
function answer(f: Fixture, response: Response): void {
  const result = transition(f.state, command(f.state, response), f.release);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
}
function selectStartingPlayer(f: Fixture): void {
  if (f.state.decision?.kind === "starting-player")
    answer(f, { kind: "starting-player", player: f.state.decision.actor });
}
function keep(f: Fixture): void {
  selectStartingPlayer(f);
  while (f.state.decision?.kind === "mulligan") answer(f, { kind: "mulligan", keep: true });
}
function main(f: Fixture): void {
  keep(f);
  for (let n = 0; n < 20 && f.state.step !== "main1"; n++) answer(f, { kind: "pass" });
  expect(f.state.step).toBe("main1");
}
function announce(f: Fixture): string {
  main(f);
  const active = requireActivePlayer(f.state);
  const heldLand = player(f.state, active).hand[0];
  if (!heldLand) throw new Error("No unit land");
  answer(f, { kind: "land", card: heldLand });
  const commander = Object.values(f.state.objects).find(
    (object) => object.owner === active && object.commander,
  );
  if (!commander) throw new Error("No commander");
  answer(f, { kind: "cast", card: commander.id });
  return commander.id;
}

describe("normal setup and command invariants", () => {
  test("same pinned setup repeats physical cards and chance state; observations never expose any library or another hand", () => {
    const f = fixture(4);
    expect(fixture(4).state).toEqual(f.state);
    for (const seat of f.state.players) {
      expect([seat.life, seat.hand.length, seat.library.length]).toEqual([40, 7, 92]);
      const view = observe(f.state, f.release, seat.id);
      expect(view.objects.filter((object) => object.zone === "library")).toHaveLength(0);
      expect(
        view.objects.filter((object) => object.zone === "hand" && object.owner !== seat.id),
      ).toHaveLength(0);
      expect(view.objects.filter((object) => object.zone === "command")).toHaveLength(4);
      if (seat.id !== requireActivePlayer(f.state)) expect(view.decision).toBeNull();
    }
    assertInvariants(f.state, f.release);
  });
  for (const count of [2, 4] as const) {
    test(`${count} seats collect mulligan declarations before redraw and enforce the correct first bottom count`, () => {
      const f = fixture(count);
      const actor = requireActivePlayer(f.state);
      const original = [...player(f.state, actor).hand];
      answer(f, { kind: "mulligan", keep: false });
      expect(player(f.state, actor).hand).toEqual(original);
      for (let n = 1; n < count; n++) answer(f, { kind: "mulligan", keep: true });
      expect(player(f.state, actor).hand).not.toEqual(original);
      if (count === 2) {
        expect(f.state.decision).toMatchObject({ kind: "bottom", count: 1, actor });
        const selected = player(f.state, actor).hand[0];
        if (!selected) throw new Error("Missing hand");
        answer(f, { kind: "bottom", cards: [selected] });
        expect(player(f.state, actor).hand).toHaveLength(6);
      } else expect(player(f.state, actor).hand).toHaveLength(7);
      expect(f.state.decision).toMatchObject({ kind: "mulligan", actor });
      answer(f, { kind: "mulligan", keep: true });
      expect(f.state.step).toBe("upkeep");
    });
    test(`${count} seats bottom every paid redraw before another mulligan declaration and keepers cannot rejoin`, () => {
      // Pinned CR 103.5 (20260819 TXT, effective August 7): a mulligan
      // includes bottoming before the declaration process repeats; 103.5c
      // makes only the first multiplayer mulligan free.
      const f = fixture(count);
      const actor = requireActivePlayer(f.state);
      answer(f, { kind: "mulligan", keep: false });
      for (let n = 1; n < count; n++) answer(f, { kind: "mulligan", keep: true });
      const keepers = f.state.players.filter((seat) => seat.id !== actor);
      const keptHands = keepers.map((seat) => [...seat.hand]);
      for (let round = 1; round <= 3; round++) {
        const amount = Math.max(0, round - (count === 4 ? 1 : 0));
        if (amount) {
          expect(f.state.decision).toMatchObject({ kind: "bottom", actor, count: amount });
          const before = structuredClone(f.state);
          expect(
            transition(f.state, command(f.state, { kind: "mulligan", keep: true }), f.release)
              .status,
          ).toBe("rejected");
          expect(f.state).toEqual(before);
          const selected = [...player(f.state, actor).hand].slice(-amount).reverse();
          const lineages = selected.map((id) => f.state.objects[id]?.lineage);
          answer(f, { kind: "bottom", cards: selected });
          expect(
            player(f.state, actor)
              .library.slice(-amount)
              .map((id) => f.state.objects[id]?.lineage),
          ).toEqual(lineages);
        }
        expect(player(f.state, actor).hand).toHaveLength(7 - amount);
        expect(player(f.state, actor).library).toHaveLength(92 + amount);
        expect(f.state.decision).toMatchObject({ kind: "mulligan", actor });
        expect(keepers.map((seat) => player(f.state, seat.id).hand)).toEqual(keptHands);
        const other = keepers[0];
        if (!other) throw new Error("Missing keeper");
        expect(
          transition(
            f.state,
            { ...command(f.state, { kind: "mulligan", keep: false }), actor: other.id },
            f.release,
          ).status,
        ).toBe("rejected");
        answer(f, { kind: "mulligan", keep: round === 3 });
      }
      expect(f.state.step).toBe("upkeep");
    });
    test(`${count} seats apply the proper starting-player draw rule`, () => {
      const f = fixture(count);
      keep(f);
      const active = requireActivePlayer(f.state);
      for (let n = 0; n < count; n++) answer(f, { kind: "pass" });
      expect(f.state.step).toBe(count === 2 ? "main1" : "draw");
      expect(player(f.state, active).hand).toHaveLength(count === 2 ? 7 : 8);
    });
  }
  test("four-seat paid redraws finish every bottom choice before the next declaration round", () => {
    const f = fixture(4);
    const first = f.state.decision?.actor;
    if (!first) throw new Error("Missing starting player");
    answer(f, { kind: "mulligan", keep: false });
    const second = f.state.decision?.actor;
    if (!second) throw new Error("Missing second player");
    answer(f, { kind: "mulligan", keep: false });
    answer(f, { kind: "mulligan", keep: true });
    answer(f, { kind: "mulligan", keep: true });
    expect(f.state.decision).toMatchObject({ kind: "mulligan", actor: first });
    const firstHand = [...player(f.state, first).hand];
    const secondHand = [...player(f.state, second).hand];
    answer(f, { kind: "mulligan", keep: false });
    expect(player(f.state, first).hand).toEqual(firstHand);
    expect(player(f.state, second).hand).toEqual(secondHand);
    answer(f, { kind: "mulligan", keep: false });
    for (const actor of [first, second]) {
      expect(f.state.decision).toMatchObject({ kind: "bottom", actor, count: 1 });
      const chosen = player(f.state, actor).hand[0];
      if (!chosen) throw new Error("Missing bottom choice");
      answer(f, { kind: "bottom", cards: [chosen] });
    }
    expect(player(f.state, first).hand).toHaveLength(6);
    expect(player(f.state, second).hand).toHaveLength(6);
    expect(f.state.decision).toMatchObject({ kind: "mulligan", actor: first });
    answer(f, { kind: "mulligan", keep: true });
    expect(f.state.decision).toMatchObject({ kind: "mulligan", actor: second });
    answer(f, { kind: "mulligan", keep: true });
    expect(f.state.step).toBe("upkeep");
  });
  test("bad owner, malformed payload and illegal move leave state and chance untouched", () => {
    const f = fixture();
    const before = structuredClone(f.state);
    const input = command(f.state, { kind: "pass" });
    expect(transition(f.state, { ...input, actor: "unknown" }, f.release).status).toBe("rejected");
    expect(transition(f.state, { ...input, unexpected: true }, f.release).status).toBe("rejected");
    expect(transition(f.state, input, f.release).status).toBe("rejected");
    expect(f.state).toEqual(before);
  });
  test("all three resolver modes preserve exact setup, decisions, staged casts, reversal, and transitions", () => {
    const states: RulesState[] = [];
    for (const resolver of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
      const f = fixture(4);
      f.manifest.resolver = resolver;
      if (resolver !== "full-scan") {
        f.manifest.preparedArtifactHash = "b".repeat(64);
        f.release.preparedArtifactHash = f.manifest.preparedArtifactHash;
      }
      f.state = createMatch(f.manifest, f.release);
      announce(f);
      answer(f, { kind: "cancel-cast" });
      for (let i = 0; i < 16; i++)
        answer(
          f,
          f.state.decision?.kind === "attack" ? { kind: "attack", attacks: [] } : { kind: "pass" },
        );
      const normalized = structuredClone(f.state);
      normalized.manifest.resolver = "full-scan";
      delete normalized.manifest.preparedArtifactHash;
      states.push(normalized);
    }
    expect(states[1]).toEqual(states[0]);
    expect(states[2]).toEqual(states[0]);
  });
  test("core entry points reject a wrong source or prepared registry pin without advancing state", () => {
    const f = fixture();
    const before = structuredClone(f.state);
    const wrongSource = { ...f.release, sourceReleaseHash: "c".repeat(64) };
    const input = command(f.state, { kind: "mulligan", keep: true });
    expect(transition(f.state, input, wrongSource).status).toBe("rejected");
    expect(() => observe(f.state, wrongSource, requireActivePlayer(f.state))).toThrow(
      "Source release pin",
    );
    expect(() => assertInvariants(f.state, wrongSource)).toThrow("Source release pin");
    expect(() => createMatch({ ...f.manifest, resolver: "prepared-scan" }, f.release)).toThrow(
      "matching full or prepared",
    );
    const prepared = { ...f.release, preparedArtifactHash: "b".repeat(64) };
    expect(() => createMatch(f.manifest, prepared)).toThrow("Prepared artifact pin");
    expect(() =>
      createMatch(
        { ...f.manifest, resolver: "prepared-indexed", preparedArtifactHash: "d".repeat(64) },
        prepared,
      ),
    ).toThrow("Prepared artifact pin");
    expect(f.state).toEqual(before);
  });
  test("resolver candidates track control, tap state, zone generations, and active timing exactly", () => {
    const f = fixture();
    main(f);
    const commander = Object.values(f.state.objects).find(
      (entry) => entry.commander && entry.owner === "A",
    );
    const land = player(f.state, "A").hand[0];
    if (!commander || !land) throw new Error("Missing candidate fixture");
    const creature = move(f.state, commander.id, "battlefield", "selector unit fixture");
    const mana = move(f.state, land, "battlefield", "selector unit fixture");
    const snapshots = [];
    for (const resolver of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
      const state = structuredClone(f.state);
      state.manifest.resolver = resolver;
      expect(creatures(state, f.release).map((entry) => entry.id)).toEqual([creature.id]);
      expect(manaSources(state, f.release, "A")).toEqual([{ object: mana.id, colors: ["G"] }]);
      const selected = selectObjectCandidates(state, f.release, battlefieldCreatures);
      expect(selected.stats.mode).toBe(resolver);
      if (resolver !== "full-scan")
        expect(selected.stats.exactChecks).toBeLessThan(selected.stats.universe);
      const source = state.objects[mana.id];
      if (!source) throw new Error("Missing source");
      source.controller = "B";
      // The view is rebuilt even before any event advances the mutation epoch.
      expect(manaSources(state, f.release, "A")).toEqual([]);
      expect(manaSources(state, f.release, "B")).toEqual([{ object: mana.id, colors: ["G"] }]);
      source.tapped = true;
      expect(manaSources(state, f.release, "B")).toEqual([]);
      move(state, creature.id, "graveyard", "selector unit movement");
      expect(creatures(state, f.release)).toEqual([]);
      snapshots.push(priorityCards(state, f.release, requireActivePlayer(state)));
    }
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(snapshots[2]).toEqual(snapshots[0]);
  });
  test("canonical checkpoint round trips preserve candidate, observation, and transition ordering", () => {
    for (const resolver of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
      const original = fixture(4);
      original.manifest.resolver = resolver;
      if (resolver !== "full-scan") {
        original.manifest.preparedArtifactHash = "b".repeat(64);
        original.release.preparedArtifactHash = original.manifest.preparedArtifactHash;
      }
      original.state = createMatch(original.manifest, original.release);
      main(original);
      const restored = {
        ...original,
        state: RulesState.parse(JSON.parse(canonicalJson(original.state))),
      };
      expect(
        priorityCards(restored.state, restored.release, requireActivePlayer(restored.state)),
      ).toEqual(
        priorityCards(original.state, original.release, requireActivePlayer(original.state)),
      );
      for (const seat of original.state.players)
        expect(observe(restored.state, restored.release, seat.id)).toEqual(
          observe(original.state, original.release, seat.id),
        );
      for (let i = 0; i < 20; i++) {
        const response: Response =
          original.state.decision?.kind === "attack"
            ? { kind: "attack", attacks: [] }
            : { kind: "pass" };
        answer(original, response);
        answer(restored, response);
        expect(restored.state).toEqual(original.state);
        restored.state = RulesState.parse(JSON.parse(canonicalJson(restored.state)));
      }
    }
  });
});

describe("casting checkpoints and player departure", () => {
  test("announcement moves to stack before payment; cancellation restores exact object identity and command zone", () => {
    const f = fixture();
    const original = announce(f);
    expect(f.state.objects[original]).toBeUndefined();
    expect(f.state.stack).toHaveLength(1);
    expect(f.state.decision?.kind).toBe("payment");
    answer(f, { kind: "cancel-cast" });
    expect(f.state.objects[original]?.zone).toBe("command");
    expect(f.state.stack).toHaveLength(0);
    expect(player(f.state, requireActivePlayer(f.state)).commanderCasts).toEqual({});
  });
  test("caster retains priority, all players pass, permanent resolves, then active player gets priority", () => {
    const f = fixture();
    announce(f);
    const active = requireActivePlayer(f.state);
    const source = f.state.decision?.manaSources[0];
    if (!source) throw new Error("No mana source");
    answer(f, {
      kind: "payment",
      sources: [{ object: source.object, color: "G" }],
      spend: { ...emptyMana(), G: 1 },
    });
    expect(f.state.decision?.actor).toBe(active);
    expect(f.state.stack).toHaveLength(1);
    answer(f, { kind: "pass" });
    expect(f.state.stack).toHaveLength(1);
    answer(f, { kind: "pass" });
    expect(f.state.stack).toHaveLength(0);
    expect(f.state.decision?.actor).toBe(active);
    const commander = Object.values(f.state.objects).find(
      (object) => object.owner === active && object.commander,
    );
    expect(commander?.zone).toBe("battlefield");
    expect(Object.values(player(f.state, active).commanderCasts)).toEqual([1]);
  });
  test("commander declines one graveyard SBA offer and receives another only after changing zones", () => {
    const f = fixture();
    keep(f);
    const active = requireActivePlayer(f.state);
    const commander = Object.values(f.state.objects).find(
      (object) => object.owner === active && object.commander,
    );
    if (!commander) throw new Error("No commander");
    const grave = move(f.state, commander.id, "graveyard", "isolated test setup");
    givePriority(f.state, f.release, active);
    expect(f.state.decision?.kind).toBe("commander-zone");
    answer(f, { kind: "commander-zone", move: false });
    expect(f.state.objects[grave.id]?.zone).toBe("graveyard");
    expect(f.state.decision?.kind).toBe("priority");
    answer(f, { kind: "pass" });
    expect(f.state.decision?.kind).toBe("priority");
    move(f.state, grave.id, "exile", "isolated second event");
    givePriority(f.state, f.release, active);
    expect(f.state.decision?.kind).toBe("commander-zone");
  });
  test("active player's loss does not begin another turn or give a dead player priority", () => {
    const f = fixture(4);
    keep(f);
    const active = requireActivePlayer(f.state);
    const step = f.state.step;
    player(f.state, active).life = 0; // Isolated SBA precondition, not a gameplay command.
    givePriority(f.state, f.release, active);
    expect(requireActivePlayer(f.state)).toBe(active);
    expect(f.state.turn).toBe(1);
    expect(f.state.step).toBe(step);
    expect(player(f.state, active).lost).toBe(true);
    expect(f.state.decision?.actor).not.toBe(active);
    expect(f.state.outcome.kind).toBe("ongoing");
    assertInvariants(f.state, f.release);
  });
});
