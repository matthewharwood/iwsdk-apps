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
import source from "./attachment-source.json";

export const ATTACHMENT_STORAGE_DRIVER = "ordinary-attachment-durability/1";
// First qualified seed in the retained1..10000 ordinary-deal screen (463 attempts).
export const ATTACHMENT_STORAGE_SEED = 463;
export const ATTACHMENT_STORAGE_PARENT = source.parentReleaseHash;
const definitions = Object.fromEntries(
  source.cards.map((row) => {
    const card = CardDefinition.parse(row.definition);
    return [card.id, card];
  }),
);
export function attachmentStorageCard(name: string) {
  const card = Object.values(definitions).find((x) => x.name === name);
  if (!card) throw new Error(`Missing attachment storage source ${name}`);
  return card;
}
export async function attachmentStorageRelease(): Promise<ContentRelease> {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-attachment-durability/1",
    sourceBundle: source.sourceBundle,
    rulesHash: source.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "authenticated-attachment-durability/1",
    processorAbi: ENGINE_VERSION,
  };
  return { ...body, hash: await semanticHash(body) };
}
async function deck(actor: "A" | "B"): Promise<DeckRevision> {
  const names =
    actor === "A"
      ? ["Sliver Hivelord", "Memnite", "Holy Strength", "Shuko"]
      : ["Sliver Hivelord", "Repulse"];
  const body = {
    id: `ordinary-attachment:${actor}`,
    commander: attachmentStorageCard("Sliver Hivelord").id,
    entries: [
      ...names.map((name) => ({ definition: attachmentStorageCard(name).id, count: 1 })),
      {
        definition: attachmentStorageCard(actor === "A" ? "Plains" : "Island").id,
        count: 100 - names.length,
      },
    ],
  };
  return { ...body, hash: await semanticHash(body) };
}
/** Actual source cards, legal100-card lists and ordinary shuffled/dealt setup. */
export async function storageAttachmentFixture(
  id: string,
  resolver: MatchManifest["resolver"] = "prepared-indexed",
  seed = ATTACHMENT_STORAGE_SEED,
) {
  const release = await attachmentStorageRelease();
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
    driverVersion: ATTACHMENT_STORAGE_DRIVER,
    mode: "two-seat",
    resolver,
    ...(artifact ? { preparedArtifactHash: artifact.hash } : {}),
    seats: decks.map((deck, i) => ({ id: i === 0 ? "A" : "B", deck })),
  };
  return { release, manifest, artifact };
}
export function attachmentStorageCommand(state: RulesState, response: Response): GameCommand {
  const d = state.decision;
  if (!d) throw new Error("Attachment durability has no pending decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: state.manifest.id,
    commandId: `attachment-storage:${state.revision}`,
    actor: d.actor,
    revision: state.revision,
    decisionId: d.id,
    response,
  };
}
function priority(view: PlayerObservation): Response {
  const d = view.decision,
    actor = view.players.find((x) => x.id === view.player);
  if (!d || !actor) throw new Error("Attachment policy needs an owned observation");
  if (view.stack.length) return { kind: "pass" };
  const available = view.objects.filter((x) => d.cards.includes(x.id));
  const land = available.find((x) => x.card?.types.includes("Land"));
  if (land) return { kind: "land", card: land.id };
  const permanent = (name: string) =>
    view.objects.find(
      (x) => x.zone === "battlefield" && x.controller === "A" && x.card?.name === name,
    );
  const target = permanent("Memnite"),
    aura = permanent("Holy Strength"),
    equipment = permanent("Shuko");
  let name: string;
  if (view.player === "B") {
    if (
      !target ||
      !aura ||
      !equipment ||
      !view.attachments?.some((link) => link.source === equipment.id && link.target === target.id)
    )
      return { kind: "pass" };
    name = "Repulse";
  } else if (!target) name = "Memnite";
  else if (!aura) name = "Holy Strength";
  else if (!equipment) name = "Shuko";
  else {
    if (view.attachments?.some((link) => link.source === equipment.id)) return { kind: "pass" };
    const descriptor = d.activations?.find((entry) => entry.source === equipment.id);
    return descriptor
      ? { kind: "activate", source: descriptor.source, programIndex: descriptor.programIndex }
      : { kind: "pass" };
  }
  const candidate = available.find((x) => x.card?.name === name),
    cost = candidate && d.cardCosts[candidate.id];
  return candidate && cost && findPayment(cost, actor.mana, d.manaSources)
    ? { kind: "cast", card: candidate.id }
    : { kind: "pass" };
}
/** All scenario policy decisions use only the acting player's entitled projection. */
export async function attachmentStorageResponse(view: PlayerObservation): Promise<Response> {
  const d = view.decision;
  if (!d) throw new Error("Missing owned attachment policy decision");
  switch (d.kind) {
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
        (x) => x.controller === "A" && x.card?.name === "Memnite" && d.cards.includes(x.id),
      );
      if (!target) throw new Error("No legal entitled Memnite attachment/return target");
      return { kind: "target", target: target.id };
    }
    case "discard": {
      const protectedNames = new Set(["Memnite", "Holy Strength", "Shuko", "Repulse"]);
      const keep = (id: string) =>
        protectedNames.has(view.objects.find((x) => x.id === id)?.card?.name ?? "");
      return {
        kind: "discard",
        cards: [...d.cards].sort((a, b) => Number(keep(a)) - Number(keep(b))).slice(0, d.count),
      };
    }
    default:
      return heuristicDriver(view, 1);
  }
}
export async function submitAttachmentResponse(c: Coordinator, response?: Response) {
  const actor = c.pendingActor;
  if (!actor) throw new Error("No active attachment scenario actor");
  const input = attachmentStorageCommand(
    c.current(),
    response ?? (await attachmentStorageResponse(c.view(actor))),
  );
  const result = await c.submit(input.actor, input);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  return { input, result };
}
