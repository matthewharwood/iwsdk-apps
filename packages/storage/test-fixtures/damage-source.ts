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
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { findPayment, heuristicDriver } from "../../simulation/src/driver";
import type { Coordinator } from "../src/index";
import snapshot from "./damage-source.json";

export const DAMAGE_STORAGE_DRIVER = "ordinary-damage-durability/2";
export type DamageFamily = "two-doublers" | "affected-controller";
// First qualifying ordinary shuffles in the separately retained offline search (positions <9).
export const DAMAGE_STORAGE_SEEDS: Record<DamageFamily, number> = {
  "two-doublers": 12139,
  "affected-controller": 12139,
};
const definitions = Object.fromEntries(
  snapshot.definitions.map((raw) => {
    const card = CardDefinition.parse(raw);
    return [card.id, card];
  }),
);
export function damageStorageCard(name: string): CardDefinition {
  const card = Object.values(definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing authenticated damage storage card: ${name}`);
  return card;
}
export function damageStorageNames(family: DamageFamily, actor: string): string[] {
  if (actor === "A")
    return family === "two-doublers"
      ? ["Furnace of Rath", "Dictate of the Twin Gods", "Sorin's Thirst"]
      : ["Furnace of Rath", "Sorin's Thirst"];
  if (actor === "B" && family === "affected-controller") return ["Benevolent Unicorn"];
  if (actor === (family === "two-doublers" ? "B" : "C")) return ["Indomitable Ancients"];
  return [];
}
async function deck(family: DamageFamily, actor: string): Promise<DeckRevision> {
  const names = damageStorageNames(family, actor);
  const commander =
    actor === "A"
      ? "Lady Orca"
      : actor === (family === "two-doublers" ? "B" : "C")
        ? "Jasmine Boreal"
        : actor === "B"
          ? "Isamaru, Hound of Konda"
          : "Tobias Andrion";
  const basicCount = 99 - names.length;
  const lands =
    actor === "A"
      ? [
          { name: "Mountain", count: Math.ceil(basicCount / 2) },
          { name: "Swamp", count: Math.floor(basicCount / 2) },
        ]
      : [{ name: "Plains", count: basicCount }];
  const body = {
    id: `ordinary-damage:${family}:${actor}`,
    commander: damageStorageCard(commander).id,
    entries: [
      { definition: damageStorageCard(commander).id, count: 1 },
      ...names.map((name) => ({ definition: damageStorageCard(name).id, count: 1 })),
      ...lands.map((row) => ({ definition: damageStorageCard(row.name).id, count: row.count })),
    ],
  };
  return { ...body, hash: await semanticHash(body) };
}
export async function storageDamageFixture(
  family: DamageFamily,
  id: string,
  resolver: MatchManifest["resolver"] = "prepared-indexed",
  seed = DAMAGE_STORAGE_SEEDS[family],
) {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-damage-durability/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "authenticated-damage-durability/1",
    processorAbi: ENGINE_VERSION,
  };
  const release: ContentRelease = { ...body, hash: await semanticHash(body) };
  const actors = family === "two-doublers" ? ["A", "B"] : ["A", "B", "C", "D"];
  const decks = await Promise.all(actors.map((actor) => deck(family, actor)));
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
    driverVersion: DAMAGE_STORAGE_DRIVER,
    mode: family === "two-doublers" ? "two-seat" : "four-seat",
    resolver,
    ...(artifact ? { preparedArtifactHash: artifact.hash } : {}),
    seats: decks.map((deck, index) => ({ id: actors[index] ?? "", deck })),
  };
  return { release, manifest, artifact };
}
function battlefield(view: PlayerObservation, name: string, actor: string) {
  return view.objects.some(
    (row) => row.zone === "battlefield" && row.controller === actor && row.card?.name === name,
  );
}
function ready(view: PlayerObservation, family: DamageFamily) {
  return (
    battlefield(view, "Furnace of Rath", "A") &&
    battlefield(view, "Indomitable Ancients", family === "two-doublers" ? "B" : "C") &&
    (family === "two-doublers"
      ? battlefield(view, "Dictate of the Twin Gods", "A")
      : battlefield(view, "Benevolent Unicorn", "B"))
  );
}
function priority(view: PlayerObservation, family: DamageFamily): Response {
  const decision = view.decision;
  const actor = view.players.find((row) => row.id === view.player);
  if (!decision || !actor) throw new Error("Missing owned damage policy priority");
  const available = view.objects.filter((row) => decision.cards.includes(row.id));
  const land = available
    .filter((row) => row.card?.types.includes("Land"))
    .sort((a, b) => {
      const count = (name: string | undefined) =>
        view.objects.filter(
          (row) =>
            row.zone === "battlefield" && row.controller === view.player && row.card?.name === name,
        ).length;
      return count(a.card?.name) - count(b.card?.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    })[0];
  if (land) return { kind: "land", card: land.id };
  if (view.stack.length) return { kind: "pass" };
  for (const name of damageStorageNames(family, view.player)) {
    if (name === "Sorin's Thirst" && !ready(view, family)) continue;
    const card = available.find((row) => row.card?.name === name);
    const cost = card && decision.cardCosts[card.id];
    if (card && cost && findPayment(cost, actor.mana, decision.manaSources))
      return { kind: "cast", card: card.id };
  }
  return { kind: "pass" };
}
/** Only the current actor's entitled observation selects actions; offline seed selection is separate. */
export async function damageStorageResponse(
  view: PlayerObservation,
  family: DamageFamily,
  order: "multiply-first" | "other-first" = "multiply-first",
): Promise<Response> {
  const decision = view.decision;
  if (!decision) throw new Error("No owned damage workflow decision");
  switch (decision.kind) {
    case "starting-player":
      return { kind: "starting-player", player: "A" };
    case "mulligan":
      return { kind: "mulligan", keep: true };
    case "priority":
      return priority(view, family);
    case "target": {
      const target = view.objects.find(
        (row) => decision.cards.includes(row.id) && row.card?.name === "Indomitable Ancients",
      );
      if (!target) throw new Error("No legal observed Indomitable Ancients target");
      return { kind: "target", target: target.id };
    }
    case "damage-replacement": {
      const choice = decision.damageReplacement;
      if (!choice) throw new Error("No typed replacement choices");
      const occurrence = choice.occurrences[0];
      if (!occurrence) throw new Error("No owned damage occurrence");
      const effects = [...occurrence.effects].sort((a, b) => {
        const preferred = (id: string) => {
          const name = view.objects.find((row) => row.id === id)?.card?.name;
          return order === "multiply-first"
            ? name === "Furnace of Rath"
            : name !== "Furnace of Rath";
        };
        return (
          Number(preferred(b.provider)) - Number(preferred(a.provider)) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        );
      });
      const effect = effects[0];
      if (!effect) throw new Error("No applicable replacement");
      return {
        kind: "damage-replacement",
        eventId: choice.eventId,
        eventVersion: choice.version,
        occurrenceId: occurrence.id,
        effectId: effect.id,
      };
    }
    case "attack":
      return { kind: "attack", attacks: [] };
    case "discard": {
      const protectedNames = damageStorageNames(family, view.player);
      return {
        kind: "discard",
        cards: [...decision.cards]
          .sort((a, b) => {
            const protectedCard = (id: string) =>
              protectedNames.includes(view.objects.find((row) => row.id === id)?.card?.name ?? "");
            return (
              Number(protectedCard(a)) - Number(protectedCard(b)) || (a < b ? -1 : a > b ? 1 : 0)
            );
          })
          .slice(0, decision.count),
      };
    }
    default:
      return heuristicDriver(view, 1);
  }
}
export function damageStorageCommand(view: PlayerObservation, response: Response): GameCommand {
  if (!view.decision) throw new Error("No owned command decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: view.matchId,
    commandId: `damage-storage:${view.revision}`,
    actor: view.player,
    revision: view.revision,
    decisionId: view.decision.id,
    response,
  };
}
export async function submitDamageResponse(c: Coordinator, response: Response) {
  const actor = c.pendingActor;
  if (!actor) throw new Error("Damage history ended before its checkpoint");
  const input = damageStorageCommand(c.view(actor), response);
  const result = await c.submit(actor, input);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  return { input, result };
}
