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
import snapshot from "./conditional-source.json";
export const CONDITIONAL_STORAGE_DRIVER = "ordinary-conditional-durability/1";
// First qualifying opening among the retained ordinary seeds 1..1354.
export const CONDITIONAL_STORAGE_SEED = 1354;
const definitions = Object.fromEntries(
  snapshot.definitions.map((row) => {
    const card = CardDefinition.parse(row);
    return [card.id, card];
  }),
);
export function conditionalStorageCard(name: string): CardDefinition {
  const card = Object.values(definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing authenticated conditional storage source: ${name}`);
  return card;
}
async function deck(actor: string, cards: [string, number][]): Promise<DeckRevision> {
  const body = {
    id: `ordinary-conditional:${actor}`,
    commander: conditionalStorageCard("Donatello, Turtle Techie").id,
    entries: [
      { definition: conditionalStorageCard("Donatello, Turtle Techie").id, count: 1 },
      ...cards.map(([name, count]) => ({ definition: conditionalStorageCard(name).id, count })),
    ],
  };
  return { ...body, hash: await semanticHash(body) };
}
export async function storageConditionalFixture(
  id: string,
  resolver: MatchManifest["resolver"] = "prepared-indexed",
  seed = CONDITIONAL_STORAGE_SEED,
) {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-conditional-durability/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "authenticated-conditional-durability/1",
    processorAbi: ENGINE_VERSION,
  };
  const release: ContentRelease = { ...body, hash: await semanticHash(body) };
  const decks = await Promise.all([
    deck("A", [
      ["Scholar of Stars", 1],
      ["Memnite", 1],
      ["Island", 97],
    ]),
    deck("B", [
      ["Repulse", 1],
      ["Island", 98],
    ]),
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
    driverVersion: CONDITIONAL_STORAGE_DRIVER,
    mode: "two-seat",
    resolver,
    ...(artifact ? { preparedArtifactHash: artifact.hash } : {}),
    seats: decks.map((deck, index) => ({ id: index === 0 ? "A" : "B", deck })),
  };
  return { release, manifest, artifact };
}
export function conditionalStorageCommand(state: RulesState, response: Response): GameCommand {
  const decision = state.decision;
  if (!decision) throw new Error("Conditional durability scenario has no decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: state.manifest.id,
    commandId: `conditional-storage:${state.revision}`,
    actor: decision.actor,
    revision: state.revision,
    decisionId: decision.id,
    response,
  };
}
function priority(view: PlayerObservation): Response {
  const decision = view.decision,
    actor = view.players.find((row) => row.id === view.player);
  if (!decision || !actor) throw new Error("Missing conditional scenario priority");
  const available = view.objects.filter((row) => decision.cards.includes(row.id));
  const land = available.find((row) => row.card?.name === "Island");
  if (land) return { kind: "land", card: land.id };
  const pendingScholar = view.abilities.some((row) => row.sourceCard.name === "Scholar of Stars");
  const candidates =
    view.player === "A"
      ? pendingScholar
        ? []
        : ["Memnite", "Scholar of Stars"]
      : pendingScholar
        ? ["Repulse"]
        : [];
  for (const name of candidates) {
    if (
      name === "Scholar of Stars" &&
      !view.objects.some(
        (row) =>
          row.zone === "battlefield" && row.controller === "A" && row.card?.name === "Memnite",
      )
    )
      continue;
    const candidate = available.find((row) => row.card?.name === name),
      cost = candidate && decision.cardCosts[candidate.id];
    if (candidate && cost && findPayment(cost, actor.mana, decision.manaSources))
      return { kind: "cast", card: candidate.id };
  }
  return { kind: "pass" };
}
/** All choices use the current actor's legal observation; no library or hidden opponent hand is inspected. */
export async function conditionalStorageResponse(view: PlayerObservation): Promise<Response> {
  const decision = view.decision;
  if (!decision) throw new Error("Conditional policy lacks owned decision");
  switch (decision.kind) {
    case "starting-player":
      return { kind: "starting-player", player: "A" };
    case "mulligan":
      return { kind: "mulligan", keep: true };
    case "priority":
      return priority(view);
    case "attack":
      return { kind: "attack", attacks: [] };
    case "target": {
      const target = view.objects.find(
        (row) =>
          decision.cards.includes(row.id) && row.controller === "A" && row.card?.name === "Memnite",
      );
      if (!target) throw new Error("Expected visible legal artifact return target");
      return { kind: "target", target: target.id };
    }
    case "discard":
      return {
        kind: "discard",
        cards: [...decision.cards]
          .sort((a, b) => {
            const protectedCard = (id: string) =>
              ["Memnite", "Scholar of Stars", "Repulse"].includes(
                view.objects.find((row) => row.id === id)?.card?.name ?? "",
              );
            return (
              Number(protectedCard(a)) - Number(protectedCard(b)) || (a < b ? -1 : a > b ? 1 : 0)
            );
          })
          .slice(0, decision.count),
      };
    default:
      return heuristicDriver(view, 1);
  }
}
export async function submitConditionalResponse(coordinator: Coordinator, response: Response) {
  const input = conditionalStorageCommand(coordinator.current(), response);
  const result = await coordinator.submit(input.actor, input);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  return { input, result };
}
export async function reachConditionalCapture(coordinator: Coordinator, limit = 1000) {
  for (let step = 0; step < limit; step++) {
    const state = coordinator.current(),
      top = state.stack.at(-1);
    if (
      top?.kind === "spell" &&
      state.objects[top.objectId]?.definition === conditionalStorageCard("Scholar of Stars").id &&
      state.consecutivePasses === 1
    )
      return;
    const actor = coordinator.pendingActor;
    if (!actor) throw new Error("Conditional scenario ended before capture");
    await submitConditionalResponse(
      coordinator,
      await conditionalStorageResponse(coordinator.view(actor)),
    );
  }
  throw new Error(`Conditional scenario exceeded ${limit} commands before capture`);
}
