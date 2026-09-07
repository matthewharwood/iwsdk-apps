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
import snapshot from "./entry-observer-source.json";
export const OBSERVER_STORAGE_DRIVER = "ordinary-entry-observer-durability/1";
// First qualifying deal in the retained ordinary seed 1..2000 search (14 inspected).
export const OBSERVER_STORAGE_SEED = 14;
const definitions = Object.fromEntries(
  snapshot.definitions.map((row) => {
    const card = CardDefinition.parse(row);
    return [card.id, card];
  }),
);
export function observerStorageCard(name: string): CardDefinition {
  const card = Object.values(definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing authenticated observer storage source: ${name}`);
  return card;
}
async function deck(commander: string, cards: [string, number][]): Promise<DeckRevision> {
  const body = {
    id: `ordinary-observer:${commander}`,
    commander: observerStorageCard(commander).id,
    entries: [
      { definition: observerStorageCard(commander).id, count: 1 },
      ...cards.map(([name, count]) => ({ definition: observerStorageCard(name).id, count })),
    ],
  };
  return { ...body, hash: await semanticHash(body) };
}
export async function storageObserverFixture(
  id: string,
  resolver: MatchManifest["resolver"] = "prepared-indexed",
  seed = OBSERVER_STORAGE_SEED,
) {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-observer-durability/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "authenticated-observer-durability/1",
    processorAbi: ENGINE_VERSION,
  };
  const release: ContentRelease = { ...body, hash: await semanticHash(body) };
  const decks = await Promise.all([
    deck("Tatyova, Benthic Druid", [
      ["Jaddi Offshoot", 1],
      ["Forest", 49],
      ["Island", 49],
    ]),
    deck("Isamaru, Hound of Konda", [["Plains", 99]]),
  ]);
  const artifact =
    resolver === "full-scan" ? undefined : await createPreparedMatchArtifact(release, decks);
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id,
    releaseHash: release.hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: seed,
    driverSeed: 1,
    driverVersion: OBSERVER_STORAGE_DRIVER,
    mode: "two-seat",
    resolver,
    ...(artifact ? { preparedArtifactHash: artifact.hash } : {}),
    seats: decks.map((deck, index) => ({ id: index === 0 ? "A" : "B", deck })),
  };
  return { release, manifest, artifact };
}
export function observerStorageCommand(state: RulesState, response: Response): GameCommand {
  const decision = state.decision;
  if (!decision) throw new Error("Observer durability scenario has no decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: state.manifest.id,
    commandId: `observer-storage:${state.revision}`,
    actor: decision.actor,
    revision: state.revision,
    decisionId: decision.id,
    response,
  };
}
function priority(view: PlayerObservation): Response {
  const decision = view.decision,
    actor = view.players.find((row) => row.id === view.player);
  if (!decision || !actor) throw new Error("Missing observer scenario priority");
  const available = view.objects.filter((row) => decision.cards.includes(row.id));
  const lands = available.filter((row) => row.card?.types.includes("Land"));
  const controlled = view.objects.filter(
    (row) => row.zone === "battlefield" && row.controller === view.player,
  );
  const needed = view.player === "A" ? ["Forest", "Island"] : ["Plains"];
  const missing = needed.find((name) => !controlled.some((row) => row.card?.name === name));
  const land = lands.find((row) => row.card?.name === missing) ?? lands[0];
  if (land) return { kind: "land", card: land.id };
  if (view.player !== "A") return { kind: "pass" };
  for (const name of ["Jaddi Offshoot", "Tatyova, Benthic Druid"]) {
    const candidate = available.find((row) => row.card?.name === name),
      cost = candidate && decision.cardCosts[candidate.id];
    if (candidate && cost && findPayment(cost, actor.mana, decision.manaSources))
      return { kind: "cast", card: candidate.id };
  }
  return { kind: "pass" };
}
/** The policy sees only the current actor's legal observation, never a library or hidden opponent hand. */
export async function observerStorageResponse(view: PlayerObservation): Promise<Response> {
  const decision = view.decision;
  if (!decision) throw new Error("Observer policy lacks owned decision");
  switch (decision.kind) {
    case "starting-player":
      return { kind: "starting-player", player: "A" };
    case "mulligan":
      return { kind: "mulligan", keep: true };
    case "priority":
      return priority(view);
    case "attack":
      return { kind: "attack", attacks: [] };
    case "discard":
      return {
        kind: "discard",
        cards: [...decision.cards]
          .sort(
            (a, b) =>
              Number(view.objects.find((row) => row.id === a)?.card?.name === "Jaddi Offshoot") -
              Number(view.objects.find((row) => row.id === b)?.card?.name === "Jaddi Offshoot"),
          )
          .slice(0, decision.count),
      };
    default:
      return heuristicDriver(view, 1);
  }
}
export async function submitObserverResponse(coordinator: Coordinator, response: Response) {
  const input = observerStorageCommand(coordinator.current(), response);
  const result = await coordinator.submit(input.actor, input);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  return { input, result };
}
export async function reachObserverLand(coordinator: Coordinator, limit = 1000): Promise<Response> {
  for (let step = 0; step < limit; step++) {
    const actor = coordinator.pendingActor;
    if (!actor) throw new Error("Observer scenario ended before its land entry");
    const view = coordinator.view(actor),
      response = await observerStorageResponse(view);
    if (
      response.kind === "land" &&
      actor === "A" &&
      ["Tatyova, Benthic Druid", "Jaddi Offshoot"].every((name) =>
        view.objects.some(
          (row) => row.zone === "battlefield" && row.controller === "A" && row.card?.name === name,
        ),
      )
    )
      return response;
    await submitObserverResponse(coordinator, response);
  }
  throw new Error(`Observer scenario exceeded ${limit} commands before entry`);
}
