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
  TokenTemplate,
} from "@iwsdk-apps/contracts";
import { findPayment, heuristicDriver } from "../../simulation/src/driver";
import type { Coordinator } from "../src/index";
import snapshot from "./proctor-source.json";
export const PROCTOR_STORAGE_DRIVER = "ordinary-proctor-durability/1";
// First qualifying normal shuffle among retained seeds1..5241 (privileged selection is separate).
export const PROCTOR_STORAGE_SEED = 5241;
const definitions = Object.fromEntries(
  snapshot.definitions.map((row) => {
    const card = CardDefinition.parse(row);
    return [card.id, card];
  }),
);
export function proctorStorageCard(name: string): CardDefinition {
  const card = Object.values(definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing actual Proctor storage source: ${name}`);
  return card;
}
async function deck(actor: string): Promise<DeckRevision> {
  const names =
    actor === "A"
      ? ["Soul Warden", "Strict Proctor", "Queen's Commission"]
      : ["Soul Warden", "Strict Proctor"];
  const body = {
    id: `ordinary-proctor:${actor}`,
    commander: proctorStorageCard("Tobias Andrion").id,
    entries: [
      { definition: proctorStorageCard("Tobias Andrion").id, count: 1 },
      ...names.map((name) => ({ definition: proctorStorageCard(name).id, count: 1 })),
      { definition: proctorStorageCard("Plains").id, count: 99 - names.length },
    ],
  };
  return { ...body, hash: await semanticHash(body) };
}
export async function storageProctorFixture(
  id: string,
  resolver: MatchManifest["resolver"] = "prepared-indexed",
  seed = PROCTOR_STORAGE_SEED,
) {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-proctor-durability/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    tokenTemplates: Object.fromEntries(
      snapshot.tokenTemplates.map((raw) => {
        const token = TokenTemplate.parse(raw);
        return [token.id, token];
      }),
    ),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "authenticated-proctor-durability/1",
    processorAbi: ENGINE_VERSION,
  };
  const release: ContentRelease = { ...body, hash: await semanticHash(body) };
  const decks = await Promise.all([deck("A"), deck("B")]);
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
    driverVersion: PROCTOR_STORAGE_DRIVER,
    mode: "two-seat",
    resolver,
    ...(artifact ? { preparedArtifactHash: artifact.hash } : {}),
    seats: decks.map((deck, index) => ({ id: index === 0 ? "A" : "B", deck })),
  };
  return { release, manifest, artifact };
}
export function proctorStorageCommand(state: RulesState, response: Response): GameCommand {
  const decision = state.decision;
  if (!decision) throw new Error("No pending Proctor decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: state.manifest.id,
    commandId: `proctor-storage:${state.revision}`,
    actor: decision.actor,
    revision: state.revision,
    decisionId: decision.id,
    response,
  };
}
function readyForTokens(view: PlayerObservation) {
  return (
    ["A", "B"].every((actor) =>
      ["Soul Warden", "Strict Proctor"].every((name) =>
        view.objects.some(
          (row) =>
            row.zone === "battlefield" && row.controller === actor && row.card?.name === name,
        ),
      ),
    ) &&
    view.objects.filter(
      (row) =>
        row.zone === "battlefield" && row.controller === view.player && row.card?.name === "Plains",
    ).length >= 7
  );
}
function priority(view: PlayerObservation): Response {
  const decision = view.decision,
    actor = view.players.find((row) => row.id === view.player);
  if (!decision || !actor) throw new Error("Missing Proctor owned priority");
  const available = view.objects.filter((row) => decision.cards.includes(row.id));
  const land = available.find((row) => row.card?.name === "Plains");
  if (land) return { kind: "land", card: land.id };
  const names =
    view.player === "A"
      ? ["Soul Warden", "Strict Proctor", "Queen's Commission"]
      : ["Soul Warden", "Strict Proctor"];
  for (const name of names) {
    if (name === "Queen's Commission" && (!readyForTokens(view) || view.stack.length)) continue;
    const card = available.find((row) => row.card?.name === name),
      cost = card && decision.cardCosts[card.id];
    if (card && cost && findPayment(cost, actor.mana, decision.manaSources))
      return { kind: "cast", card: card.id };
  }
  return { kind: "pass" };
}
/** Stateless setup policy reads only the current actor's entitled observation. Seed qualification is separate. */
export async function proctorStorageResponse(view: PlayerObservation): Promise<Response> {
  const decision = view.decision;
  if (!decision) throw new Error("Proctor policy has no owned decision");
  switch (decision.kind) {
    case "starting-player":
      return { kind: "starting-player", player: "A" };
    case "mulligan":
      return { kind: "mulligan", keep: true };
    case "priority":
      return priority(view);
    case "trigger-order":
      return { kind: "trigger-order", triggers: [...decision.triggers].sort() };
    case "trigger-payment":
      return { kind: "trigger-payment", pay: false };
    case "attack":
      return { kind: "attack", attacks: [] };
    case "discard":
      return {
        kind: "discard",
        cards: [...decision.cards]
          .sort((a, b) => {
            const protectedCard = (id: string) =>
              ["Soul Warden", "Strict Proctor", "Queen's Commission"].includes(
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
export async function submitProctorResponse(coordinator: Coordinator, response: Response) {
  const input = proctorStorageCommand(coordinator.current(), response),
    result = await coordinator.submit(input.actor, input);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  return { input, result };
}
export async function reachProctorEntry(coordinator: Coordinator, limit = 1500) {
  for (let step = 0; step < limit; step++) {
    const state = coordinator.current(),
      top = state.stack.at(-1);
    if (
      top?.kind === "spell" &&
      state.objects[top.objectId]?.definition === proctorStorageCard("Queen's Commission").id &&
      state.consecutivePasses === 1
    )
      return;
    const actor = coordinator.pendingActor;
    if (!actor) throw new Error("No owned action before token entry");
    await submitProctorResponse(coordinator, await proctorStorageResponse(coordinator.view(actor)));
  }
  throw new Error(`Proctor setup exceeded ${limit} ordinary commands`);
}
