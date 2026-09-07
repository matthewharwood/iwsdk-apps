import { createPreparedMatchArtifact } from "@iwsdk-apps/compiler/prepared";
import {
  CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  type GameCommand,
  type MatchManifest,
  type PlayerObservation,
  type Response,
  type RulesState,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { findPayment, heuristicDriver } from "../../simulation/src/driver";
import type { Coordinator } from "../src/index";
import snapshot from "./static-bonus-source.json";

export const STATIC_STORAGE_DRIVER = "ordinary-static-durability/1";
// First qualifying deal in the retained seed 1..2000 search (14 deals inspected).
export const STATIC_STORAGE_SEED = 14;
const definitions = Object.fromEntries(
  snapshot.definitions.map((row) => {
    const card = CardDefinition.parse(row);
    return [card.id, card];
  }),
);
export function staticStorageCard(name: string): CardDefinition {
  const result = Object.values(definitions).find((card) => card.name === name);
  if (!result) throw new Error(`Missing authenticated static storage card: ${name}`);
  return result;
}
async function deck(commander: string, companion: string, basics: [string, string]) {
  const body = {
    id: `ordinary-static:${commander}`,
    commander: staticStorageCard(commander).id,
    entries: [
      { definition: staticStorageCard(commander).id, count: 1 },
      { definition: staticStorageCard(companion).id, count: 1 },
      ...basics.map((name) => ({ definition: staticStorageCard(name).id, count: 49 })),
    ],
  };
  return { ...body, hash: await semanticHash(body) } satisfies DeckRevision;
}
/** Legal ordinary decks and a closed authenticated subset; no hand, library or state edits. */
export async function storageStaticFixture(
  id: string,
  resolver: MatchManifest["resolver"] = "prepared-indexed",
  seed = STATIC_STORAGE_SEED,
) {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-static-durability/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "authenticated-static-durability/1",
    processorAbi: ENGINE_VERSION,
  };
  const release: ContentRelease = { ...body, hash: await semanticHash(body) };
  const [deckA, deckB] = await Promise.all([
    deck("Arvad the Cursed", "Isamaru, Hound of Konda", ["Plains", "Swamp"]),
    deck("Tobias Andrion", "Repulse", ["Island", "Plains"]),
  ]);
  const artifact =
    resolver === "full-scan"
      ? undefined
      : await createPreparedMatchArtifact(release, [deckA, deckB]);
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id,
    releaseHash: release.hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: seed,
    driverSeed: 1,
    driverVersion: STATIC_STORAGE_DRIVER,
    mode: "two-seat",
    resolver,
    ...(artifact ? { preparedArtifactHash: artifact.hash } : {}),
    seats: [
      { id: "A", deck: deckA },
      { id: "B", deck: deckB },
    ],
  };
  return { release, manifest, artifact };
}

export function staticStorageCommand(state: RulesState, response: Response): GameCommand {
  const decision = state.decision;
  if (!decision) throw new Error("Static durability scenario has no decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: state.manifest.id,
    commandId: `static-storage:${state.revision}`,
    actor: decision.actor,
    revision: state.revision,
    decisionId: decision.id,
    response,
  };
}
function onBattlefield(observation: PlayerObservation, name: string) {
  return observation.objects.some(
    (row) => row.zone === "battlefield" && row.card?.name === name && row.controller === "A",
  );
}
function priority(observation: PlayerObservation): Response {
  const decision = observation.decision;
  const actor = observation.players.find((row) => row.id === observation.player);
  if (!decision || !actor) throw new Error("Missing owned static scenario decision");
  const available = observation.objects.filter((row) => decision.cards.includes(row.id));
  const lands = available.filter((row) => row.card?.types.includes("Land"));
  const ownLands = observation.objects.filter(
    (row) => row.zone === "battlefield" && row.controller === observation.player,
  );
  const needed = observation.player === "A" ? ["Plains", "Swamp"] : ["Island"];
  const missing = needed.find((name) => !ownLands.some((row) => row.card?.name === name));
  const land = lands.find((row) => row.card?.name === missing) ?? lands[0];
  if (land) return { kind: "land", card: land.id };
  const dependentPresent = onBattlefield(observation, "Isamaru, Hound of Konda");
  let name = dependentPresent ? "Arvad the Cursed" : "Isamaru, Hound of Konda";
  if (observation.player === "B") {
    if (!dependentPresent || !onBattlefield(observation, "Arvad the Cursed"))
      return { kind: "pass" };
    name = "Repulse";
  }
  const candidate = available.find((row) => row.card?.name === name);
  const cost = candidate && decision.cardCosts[candidate.id];
  if (candidate && cost && findPayment(cost, actor.mana, decision.manaSources))
    return { kind: "cast", card: candidate.id };
  return { kind: "pass" };
}
/** Only entitled observations enter this deliberately quiet scenario policy. */
export async function staticStorageResponse(observation: PlayerObservation): Promise<Response> {
  const decision = observation.decision;
  if (!decision) throw new Error("Static policy lacks its owned decision");
  switch (decision.kind) {
    case "starting-player":
      return { kind: "starting-player", player: "A" };
    case "mulligan":
      return { kind: "mulligan", keep: true };
    case "priority":
      return priority(observation);
    case "attack":
      return { kind: "attack", attacks: [] };
    case "target": {
      const target = observation.objects.find(
        (row) => row.card?.name === "Arvad the Cursed" && decision.cards.includes(row.id),
      );
      if (!target) throw new Error("Repulse lacks a visible legal Arvad target");
      return { kind: "target", target: target.id };
    }
    case "discard": {
      const protectedNames = new Set(["Isamaru, Hound of Konda", "Repulse"]);
      const protect = (id: string) =>
        protectedNames.has(observation.objects.find((row) => row.id === id)?.card?.name ?? "");
      const cards = [...decision.cards].sort((a, b) => Number(protect(a)) - Number(protect(b)));
      return { kind: "discard", cards: cards.slice(0, decision.count) };
    }
    default:
      return heuristicDriver(observation, 1);
  }
}

export async function submitStaticResponse(coordinator: Coordinator, response: Response) {
  const input = staticStorageCommand(coordinator.current(), response);
  const result = await coordinator.submit(input.actor, input);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  return { input, result };
}
export async function reachStaticResolution(
  coordinator: Coordinator,
  name: "Arvad the Cursed" | "Repulse",
  limit = 2000,
): Promise<void> {
  for (let step = 0; step < limit; step++) {
    // Privileged harness qualification is separate from the observation-only driver.
    const state = coordinator.current();
    const top = state.stack.at(-1);
    const actor = coordinator.pendingActor;
    if (!actor) throw new Error(`Static scenario ended before ${name}`);
    if (
      top?.kind === "spell" &&
      state.decision?.kind === "priority" &&
      state.consecutivePasses === state.players.filter((seat) => !seat.lost).length - 1 &&
      coordinator.view(actor).objects.find((row) => row.id === top.objectId)?.card?.name === name
    )
      return;
    await submitStaticResponse(coordinator, await staticStorageResponse(coordinator.view(actor)));
  }
  throw new Error(`Static scenario exceeded ${limit} commands before ${name}`);
}
