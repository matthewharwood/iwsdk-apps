import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  ENGINE_VERSION,
  type ExecutionRegistry,
  emptyMana,
  type GameCommand,
  type MatchManifest,
  OrderedSelfEntryProgram,
  type Response,
  SERIALIZER_VERSION,
} from "@iwsdk-apps/contracts";
import { SELF_ENTRY_SEQUENCE_VERSION, SELF_ENTRY_SEQUENCES } from "../../card-programs/src/index";
import { move, player } from "../src/common";
import { assertInvariants, createMatch, transition } from "../src/index";
import { givePriority } from "../src/turns";

// Reviewed source card definitions surrounded by explicitly synthetic unit deck,
// hand, mana and library preconditions. Full ordinary source-backed games are separate.
export function sequenceDefinition(index: number): CardDefinition {
  const recipe = SELF_ENTRY_SEQUENCES[index];
  if (!recipe) throw new Error("Unknown sequence fixture");
  return {
    id: `oracle:${recipe.identity}`,
    oracleId: recipe.identity,
    sourceVersion: recipe.sourceVersion,
    name: recipe.name,
    typeLine: recipe.typeLine,
    types: ["Creature"],
    subtypes: recipe.typeLine.split(" — ")[1]?.split(" ") ?? [],
    supertypes: [],
    colors: [...recipe.colors],
    colorIdentity: [...recipe.colorIdentity],
    manaCost: { ...recipe.cost },
    manaValue: recipe.manaValue,
    power: recipe.power,
    toughness: recipe.toughness,
    keywords: recipe.keywords.length ? ["flying"] : [],
    manaAbilities: [],
    oracleText: recipe.oracleText,
    commanderEligible: false,
    deckLimit: 1,
    obligations: [],
    implementationRevision: SELF_ENTRY_SEQUENCE_VERSION,
    triggerPrograms: [OrderedSelfEntryProgram.parse(recipe.program)],
  };
}
export function sequenceFixture(index = 0, reversed = false) {
  const cards = [0, 1, 2, 3].map(sequenceDefinition);
  if (reversed) {
    const card = cards[0];
    if (!card) throw new Error("No synthetic base");
    Object.assign(card, {
      id: "synthetic-reverse",
      oracleId: "synthetic-reverse",
      name: "Synthetic reverse-order sequence",
      sourceVersion: "f".repeat(64),
      oracleText: "Synthetic draw2 then gain3",
      implementationRevision: "synthetic-ordered/1",
    });
    const program = card.triggerPrograms?.[0];
    if (program?.schema !== "commander-trigger/2") throw new Error("No sequence");
    program.effects = [
      { kind: "draw", recipient: "trigger-controller", amount: 2 },
      { kind: "gain-life", recipient: "trigger-controller", amount: 3 },
    ];
  }
  const commander: CardDefinition = {
    id: "unit-commander",
    oracleId: "unit-commander",
    sourceVersion: "f".repeat(64),
    name: "Synthetic ordered-unit commander",
    typeLine: "Legendary Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: ["Legendary"],
    colors: ["W", "U"],
    colorIdentity: ["W", "U"],
    manaCost: { ...emptyMana(), generic: 0 },
    manaValue: 0,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: true,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "synthetic/1",
  };
  const land: CardDefinition = {
    ...commander,
    id: "unit-plains",
    oracleId: "unit-plains",
    name: "Synthetic Plains",
    typeLine: "Basic Land — Plains",
    types: ["Land"],
    subtypes: ["Plains"],
    supertypes: ["Basic"],
    colors: [],
    colorIdentity: ["W"],
    manaCost: null,
    manaValue: 0,
    power: null,
    toughness: null,
    manaAbilities: ["W"],
    commanderEligible: false,
    deckLimit: null,
  };
  const registry: ExecutionRegistry = {
    sourceReleaseHash: "e".repeat(64),
    preparedArtifactHash: null,
    definitions: Object.fromEntries([commander, land, ...cards].map((c) => [c.id, c])),
  };
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: "ordered-sequence-unit",
    releaseHash: registry.sourceReleaseHash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 19,
    driverSeed: 1,
    driverVersion: "sequence-scenario/1",
    mode: "two-seat",
    resolver: "full-scan",
    seats: ["A", "B"].map((id) => ({
      id,
      deck: {
        id: "unit-sequence-deck",
        hash: "d".repeat(64),
        commander: commander.id,
        entries: [
          { definition: commander.id, count: 1 },
          { definition: land.id, count: 95 },
          ...cards.map((card) => ({ definition: card.id, count: 1 })),
        ],
      },
    })),
  };
  let state = createMatch(manifest, registry);
  const input = (response: Response): GameCommand => {
    const d = state.decision;
    if (!d) throw new Error("No decision");
    return {
      schema: CONTRACT_VERSION,
      matchId: manifest.id,
      commandId: `sequence-unit:${state.revision}`,
      revision: state.revision,
      decisionId: d.id,
      actor: d.actor,
      response,
    };
  };
  const send = (response: Response) => {
    const result = transition(state, input(response), registry);
    if (result.status !== "accepted") throw new Error(JSON.stringify(result));
    state = result.state;
    assertInvariants(state, registry);
  };
  send({ kind: "starting-player", player: "A" });
  send({ kind: "mulligan", keep: true });
  send({ kind: "mulligan", keep: true });
  for (let i = 0; i < 12 && state.step !== "main1"; i++) send({ kind: "pass" });
  const definition = cards[index];
  if (!definition) throw new Error("Missing source card");
  const initial = Object.values(state.objects).find(
    (o) => o.owner === "A" && o.definition === definition.id,
  );
  if (!initial) throw new Error("Source missing");
  const inHand =
    initial.zone === "hand"
      ? initial
      : move(state, initial.id, "hand", "synthetic unit hand precondition");
  const cost = definition.manaCost;
  if (!cost) throw new Error("Source cost absent");
  const { generic, ...colors } = cost;
  const spend = { ...colors, C: colors.C + generic };
  player(state, "A").mana = spend;
  givePriority(state, registry, "A");
  const cast = () => {
    send({ kind: "cast", card: inHand.id });
    send({ kind: "payment", sources: [], spend });
    send({ kind: "pass" });
    send({ kind: "pass" });
  };
  const passCycle = () => {
    send({ kind: "pass" });
    send({ kind: "pass" });
  };
  return {
    registry,
    definition,
    send,
    input,
    cast,
    passCycle,
    get state() {
      return state;
    },
    limitedLibrary(count: number) {
      for (const id of [...player(state, "A").library].slice(count))
        move(state, id, "graveyard", "synthetic partial-library precondition");
    },
  };
}
