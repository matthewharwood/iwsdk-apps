import { createPreparedMatchArtifact } from "@iwsdk-apps/compiler/prepared";
import {
  CHANCE_VERSION,
  CONTRACT_VERSION,
  ENGINE_VERSION,
  type GameCommand,
  type MatchManifest,
  type PlayerObservation,
  type Response,
  type RulesState,
  SERIALIZER_VERSION,
} from "@iwsdk-apps/contracts";
import { tokenSourceDeck, tokenSourceRelease } from "../../engine/test-fixtures/token-source";
import { findPayment, heuristicDriver } from "../../simulation/src/driver";
import type { Coordinator } from "../src/index";

export const TOKEN_STORAGE_DRIVER = "ordinary-token-durability/1";
/** Source-authenticated legal decks. No object, hand, mana, checkpoint or library is rewritten. */
export async function storageTokenFixture(
  id: string,
  resolver: MatchManifest["resolver"] = "prepared-indexed",
  seed = 14,
) {
  const release = await tokenSourceRelease();
  const deckA = await tokenSourceDeck("Tobias Andrion", ["Raise the Alarm"]);
  const deckB = await tokenSourceDeck("Tobias Andrion", ["Repulse"]);
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
    driverVersion: TOKEN_STORAGE_DRIVER,
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

export function tokenStorageCommand(state: RulesState, response: Response): GameCommand {
  const decision = state.decision;
  if (!decision) throw new Error("Token storage scenario has no decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: state.manifest.id,
    commandId: `token-storage:${state.revision}`,
    actor: decision.actor,
    revision: state.revision,
    decisionId: decision.id,
    response,
  };
}

function priority(observation: PlayerObservation): Response {
  const decision = observation.decision;
  const actor = observation.players.find((row) => row.id === observation.player);
  if (!decision || !actor) throw new Error("Missing observed token storage decision");
  const available = observation.objects.filter((row) => decision.cards.includes(row.id));
  // Land selection uses only visible colors. A needs W; B needs U for Repulse.
  const preferred = observation.player === "A" ? "Plains" : "Island";
  const lands = available.filter((row) => row.card?.types.includes("Land"));
  const land = lands.find((row) => row.card?.name === preferred) ?? lands[0];
  if (land) return { kind: "land", card: land.id };
  const name = observation.player === "A" ? "Raise the Alarm" : "Repulse";
  const spell = available.find((row) => row.card?.name === name);
  const cost = spell && decision.cardCosts[spell.id];
  if (
    spell &&
    cost &&
    (name !== "Repulse" ||
      observation.objects.some((row) => row.token && row.zone === "battlefield")) &&
    findPayment(cost, actor.mana, decision.manaSources)
  )
    return { kind: "cast", card: spell.id };
  return { kind: "pass" };
}

/** A deliberately quiet observation-only driver reaches two concrete durable events. */
export async function tokenStorageResponse(observation: PlayerObservation): Promise<Response> {
  const decision = observation.decision;
  if (!decision) throw new Error("Token storage driver lacks its owned decision");
  switch (decision.kind) {
    case "starting-player":
      return { kind: "starting-player", player: "A" };
    case "priority":
      return priority(observation);
    case "attack":
      return { kind: "attack", attacks: [] };
    case "target": {
      const token = observation.objects.find((row) => row.token && decision.cards.includes(row.id));
      if (!token) throw new Error("Repulse has no visible legal token target");
      return { kind: "target", target: token.id };
    }
    case "discard": {
      const cards = [...decision.cards].sort((a, b) => {
        const protect = (id: string) => {
          const name = observation.objects.find((row) => row.id === id)?.card?.name;
          return name === "Raise the Alarm" || name === "Repulse";
        };
        return Number(protect(a)) - Number(protect(b));
      });
      return { kind: "discard", cards: cards.slice(0, decision.count) };
    }
    default:
      return heuristicDriver(observation, 1);
  }
}

export function beforeTokenResolution(
  coordinator: Coordinator,
  name: "Raise the Alarm" | "Repulse",
): boolean {
  const state = coordinator.current();
  const top = state.stack.at(-1);
  const actor = coordinator.pendingActor;
  if (!actor || top?.kind !== "spell" || state.decision?.kind !== "priority") return false;
  return (
    state.consecutivePasses === state.players.filter((seat) => !seat.lost).length - 1 &&
    coordinator.view(actor).objects.find((row) => row.id === top.objectId)?.card?.name === name
  );
}

export async function reachTokenResolution(
  coordinator: Coordinator,
  name: "Raise the Alarm" | "Repulse",
  limit = 3000,
): Promise<void> {
  for (let step = 0; step < limit; step++) {
    if (beforeTokenResolution(coordinator, name)) return;
    const actor = coordinator.pendingActor;
    if (!actor) throw new Error(`Token scenario ended before ${name}`);
    const response = await tokenStorageResponse(coordinator.view(actor));
    const input = tokenStorageCommand(coordinator.current(), response);
    const result = await coordinator.submit(actor, input);
    if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  }
  throw new Error(`Token scenario exceeded ${limit} commands before ${name}`);
}
