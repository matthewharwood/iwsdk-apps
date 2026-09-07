import { createPreparedMatchArtifact } from "@iwsdk-apps/compiler/prepared";
import {
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  type GameCommand,
  type MatchManifest,
  type PlayerObservation,
  type Response,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { activationSourceCard } from "../../engine/test-fixtures/activation-source";
import snapshot from "../../engine/test-fixtures/activation-source.json";
import { findPayment } from "../../simulation/src/driver";
import type { Coordinator } from "../src/index";
export const ACTIVATION_STORAGE_DRIVER = "ordinary-activation-durability/1";
export const ACTIVATION_STORAGE_SEED = 14;
const names = [
  "Jasmine Boreal",
  "Tobias Andrion",
  "Nantuko Disciple",
  "Repulse",
  "Plains",
  "Forest",
  "Island",
];
const definitions = Object.fromEntries(
  names.map((name) => {
    const card = activationSourceCard(name);
    return [card.id, card];
  }),
);

export { activationSourceCard as activationStorageCard };

async function deck(
  id: string,
  commander: string,
  cards: [string, number][],
): Promise<DeckRevision> {
  const body = {
    id: `ordinary-activation:${id}`,
    commander: activationSourceCard(commander).id,
    entries: [[commander, 1] as [string, number], ...cards].map(([name, count]) => ({
      definition: activationSourceCard(name).id,
      count,
    })),
  };
  return { ...body, hash: await semanticHash(body) };
}
export async function storageActivationFixture(
  id: string,
  resolver: MatchManifest["resolver"] = "prepared-indexed",
  seed = ACTIVATION_STORAGE_SEED,
) {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-activation-durability/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    tokenTemplates: {},
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "authenticated-activation-durability/1",
    processorAbi: ENGINE_VERSION,
  };
  const release: ContentRelease = { ...body, hash: await semanticHash(body) };
  const decks = await Promise.all([
    deck("A", "Jasmine Boreal", [
      ["Nantuko Disciple", 1],
      ["Forest", 49],
      ["Plains", 49],
    ]),
    deck("B", "Tobias Andrion", [
      ["Repulse", 1],
      ["Island", 49],
      ["Plains", 49],
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
    driverVersion: ACTIVATION_STORAGE_DRIVER,
    mode: "two-seat",
    resolver,
    ...(artifact ? { preparedArtifactHash: artifact.hash } : {}),
    seats: decks.map((deck, index) => ({ id: index ? "B" : "A", deck })),
  };
  return { release, manifest, artifact };
}
/** Scripted policy sees only the entitled observation. Seed qualification is a separate retained host step. */
export function activationStorageResponse(view: PlayerObservation): Response {
  const decision = view.decision,
    self = view.players.find((player) => player.id === view.player);
  if (!decision || !self) throw new Error("Activation policy needs its owned decision");
  const disciple = view.objects.find(
    (object) =>
      object.zone === "battlefield" &&
      object.card?.name === "Nantuko Disciple" &&
      object.controller === "A",
  );
  switch (decision.kind) {
    case "starting-player":
      return { kind: "starting-player", player: "A" };
    case "mulligan":
      return { kind: "mulligan", keep: true };
    case "attack":
      return { kind: "attack", attacks: [] };
    case "discard":
      return { kind: "discard", cards: decision.cards.slice(0, decision.count) };
    case "priority": {
      const available = view.objects.filter((object) => decision.cards.includes(object.id));
      const land = available
        .filter((object) => object.card?.types.includes("Land"))
        .sort((a, b) => {
          const preferred = view.player === "A" ? "Forest" : "Island";
          return (
            Number(b.card?.name === preferred) - Number(a.card?.name === preferred) ||
            (a.id < b.id ? -1 : 1)
          );
        })[0];
      if (land) return { kind: "land", card: land.id };
      const source = available.find(
        (object) => object.card?.name === (view.player === "A" ? "Nantuko Disciple" : "Repulse"),
      );
      const cost = source && decision.cardCosts[source.id];
      if (
        source &&
        cost &&
        (view.player === "A" || (disciple?.characteristics.power ?? 0) > 2) &&
        findPayment(cost, self.mana, decision.manaSources)
      )
        return { kind: "cast", card: source.id };
      const activation = decision.activations?.find((entry) => entry.source === disciple?.id);
      if (
        activation &&
        (disciple?.characteristics.power ?? 0) === 2 &&
        !view.activatedAbilities?.length &&
        activation.cost.mana &&
        findPayment(activation.cost.mana, self.mana, decision.manaSources)
      )
        return { kind: "activate", source: activation.source, programIndex: 0 };
      return { kind: "pass" };
    }
    case "activation-target":
    case "target": {
      if (!disciple || !decision.cards.includes(disciple.id))
        throw new Error("Expected actual Disciple target");
      return { kind: decision.kind, target: disciple.id };
    }
    case "payment":
    case "activation-payment": {
      const cost = decision.cost;
      if (!cost) throw new Error("Expected actual printed mana cost");
      const result = findPayment(cost, self.mana, decision.manaSources);
      if (!result) throw new Error("Scripted source payment is unaffordable");
      return { ...result, kind: decision.kind };
    }
    default:
      throw new Error(`Unsupported scripted activation decision ${decision.kind}`);
  }
}
export async function submitActivationResponse(coordinator: Coordinator, response?: Response) {
  const actor = coordinator.pendingActor;
  if (!actor) throw new Error("No ordinary activation actor");
  const view = coordinator.view(actor),
    decision = view.decision;
  if (!decision) throw new Error("Owned view is missing its decision");
  const input: GameCommand = {
    schema: CONTRACT_VERSION,
    matchId: view.matchId,
    commandId: `activation-storage:${view.revision}`,
    actor,
    revision: view.revision,
    decisionId: decision.id,
    response: response ?? activationStorageResponse(view),
  };
  const result = await coordinator.submit(actor, input);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  return { input, receipt: result.receipt };
}
