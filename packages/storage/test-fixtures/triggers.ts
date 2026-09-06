import { createFullExecutionRegistry } from "@iwsdk-apps/compiler/prepared";
import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  emptyMana,
  type GameCommand,
  type MatchManifest,
  type Response,
  type RulesState,
  SERIALIZER_VERSION,
  type SelfEntryProgram,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { createMatch, transition } from "../../engine/src/index";

// Synthetic programs isolate persistence from acquisition. They are not Oracle records
// or evidence of any source card's compilation; all ordinary commands remain real.
export function entryProgram(kind: "draw" | "gain-life", amount: number): SelfEntryProgram {
  return {
    schema: "commander-trigger/1",
    id: `fixture-entry-${kind}`,
    trigger: {
      kind: "self-enters-battlefield",
      view: "post-committed-event",
      placementClass: "ordinary",
    },
    choice: { kind: "mandatory" },
    effect: { kind, recipient: "trigger-controller", amount },
  };
}
export async function triggerFixtures(id: string) {
  const base: CardDefinition = {
    id: "synthetic-entry-commander",
    oracleId: "synthetic-entry-commander",
    sourceVersion: "0".repeat(64),
    name: "Synthetic entry storage commander",
    typeLine: "Legendary Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: ["Legendary"],
    colors: ["G"],
    colorIdentity: ["G"],
    manaCost: { ...emptyMana(), generic: 0 },
    manaValue: 0,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "Synthetic mandatory entry life program",
    commanderEligible: true,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "self-entry-creature/1",
    triggerPrograms: [entryProgram("gain-life", 3)],
  };
  const { triggerPrograms: _programs, ...plain } = base;
  const land: CardDefinition = {
    ...plain,
    id: "synthetic-forest",
    oracleId: "synthetic-forest",
    name: "Synthetic Forest",
    typeLine: "Basic Land — Forest",
    types: ["Land"],
    subtypes: ["Forest"],
    supertypes: ["Basic"],
    manaCost: null,
    power: null,
    toughness: null,
    manaAbilities: ["G"],
    commanderEligible: false,
    deckLimit: null,
    oracleText: "",
    implementationRevision: "commander-development-recipes/1",
  };
  const removal: CardDefinition = {
    ...plain,
    id: "synthetic-removal",
    oracleId: "synthetic-removal",
    name: "Synthetic free removal",
    typeLine: "Instant",
    types: ["Instant"],
    supertypes: [],
    power: null,
    toughness: null,
    commanderEligible: false,
    oracleText: "Synthetic target creature destruction",
    implementationRevision: "spell-text-families/1",
    spellProgram: {
      schema: "commander-spell/1",
      target: "creature",
      effects: [{ kind: "destroy" }],
    },
  };
  const draw: CardDefinition = {
    ...base,
    id: "synthetic-entry-draw",
    oracleId: "synthetic-entry-draw",
    name: "Synthetic entry draw",
    typeLine: "Creature",
    supertypes: [],
    commanderEligible: false,
    oracleText: "Synthetic mandatory entry draw program",
    triggerPrograms: [entryProgram("draw", 1)],
  };
  const payload = {
    schema: "commander-content/1" as const,
    id: "synthetic-trigger-storage/1",
    sourceBundle: "0".repeat(64),
    rulesHash: "0".repeat(64),
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: Object.fromEntries(
      [base, land, removal, draw].map((definition) => [definition.id, definition]),
    ),
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "synthetic-trigger-storage/1",
    processorAbi: ENGINE_VERSION,
  };
  const release: ContentRelease = { ...payload, hash: await semanticHash(payload) };
  const deckPayload = {
    id: "synthetic-trigger-storage-deck",
    commander: base.id,
    entries: [
      { definition: base.id, count: 1 },
      { definition: land.id, count: 97 },
      { definition: removal.id, count: 1 },
      { definition: draw.id, count: 1 },
    ],
  };
  const deck: DeckRevision = { ...deckPayload, hash: await semanticHash(deckPayload) };
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id,
    releaseHash: release.hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 1,
    driverSeed: 1,
    driverVersion: "synthetic-trigger-storage/1",
    mode: "two-seat",
    resolver: "full-scan",
    seats: ["A", "B"].map((seat) => ({ id: seat, deck })),
  };
  return { release, manifest, registry: await createFullExecutionRegistry(release) };
}
export function triggerCommand(state: RulesState, response?: Response): GameCommand {
  const decision = state.decision;
  if (!decision) throw new Error("Scenario has no pending decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: state.manifest.id,
    commandId: `trigger-storage:${state.revision}`,
    actor: decision.actor,
    revision: state.revision,
    decisionId: decision.id,
    response:
      response ??
      (decision.kind === "starting-player"
        ? { kind: "starting-player", player: "A" }
        : decision.kind === "mulligan"
          ? { kind: "mulligan", keep: true }
          : { kind: "pass" }),
  };
}
export function reachFirstMain(
  manifest: MatchManifest,
  registry: Awaited<ReturnType<typeof createFullExecutionRegistry>>,
) {
  let state = createMatch(manifest, registry);
  for (let i = 0; i < 20 && state.step !== "main1"; i++) {
    const result = transition(state, triggerCommand(state), registry);
    if (result.status !== "accepted") throw new Error(JSON.stringify(result));
    state = result.state;
  }
  if (state.step !== "main1" || state.decision?.actor !== "A")
    throw new Error("First main was not reached");
  return state;
}
