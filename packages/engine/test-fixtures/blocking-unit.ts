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
import { emptyCombat } from "../src/common";

const digest = "a".repeat(64);

/** Deliberate isolated rule-unit states, not admitted decks or full-game evidence. */
export function fixture(seats: 2 | 4 = 2) {
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
    tokenTemplates: {},
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
    continuousEffects: [],
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

export function put(
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
    colors?: CardDefinition["colors"];
    subtypes?: string[];
    blockingRestrictions?: CardDefinition["blockingRestrictions"];
  } = {},
): GameObject {
  const definition: CardDefinition = {
    id: `definition:${id}`,
    oracleId: `unit:${id}`,
    sourceVersion: digest,
    name: `Rule fixture ${id}`,
    typeLine: "Creature",
    types: options.types ?? ["Creature"],
    subtypes: options.subtypes ?? [],
    supertypes: [],
    colors: options.colors ?? [],
    colorIdentity: [],
    manaCost: { ...emptyMana(), generic: 2 },
    manaValue: 2,
    power: options.power ?? 2,
    toughness: options.toughness ?? 2,
    keywords: options.keywords ?? [],
    ...(options.blockingRestrictions ? { blockingRestrictions: options.blockingRestrictions } : {}),
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
