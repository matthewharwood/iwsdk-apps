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
import source from "../../engine/test-fixtures/static-keyword-source.json";
import { findPayment, heuristicDriver } from "../../simulation/src/driver";
import type { Coordinator } from "../src/index";

export const KEYWORD_STORAGE_DRIVER = "ordinary-static-keyword-durability/1";
// First qualified seed in retained1..2000 deal screening;14 deals inspected.
export const KEYWORD_STORAGE_SEED = 14;
const names = [
  "Sliver Hivelord",
  "Metallic Sliver",
  "Sorin's Thirst",
  "Repulse",
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
];
const definitions = Object.fromEntries(
  names.map((name) => {
    const row = source.cards.find((x) => x.definition.name === name);
    if (!row) throw new Error(`Missing authenticated keyword durability source: ${name}`);
    const card = CardDefinition.parse(row.definition);
    return [card.id, card];
  }),
);
export function keywordStorageCard(name: string) {
  const card = Object.values(definitions).find((x) => x.name === name);
  if (!card) throw new Error(`Missing keyword storage card ${name}`);
  return card;
}
export async function keywordStorageRelease(): Promise<ContentRelease> {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-static-keyword-durability/1",
    sourceBundle: source.sourceBundle,
    rulesHash: source.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "authenticated-static-keyword-durability/1",
    processorAbi: ENGINE_VERSION,
  };
  return { ...body, hash: await semanticHash(body) };
}
function missingBasicCount(name: string): never {
  throw new Error(`Missing fixed basic count for ${name}`);
}
async function deck(actor: "A" | "B"): Promise<DeckRevision> {
  const spells =
    actor === "A"
      ? ["Sliver Hivelord", "Metallic Sliver"]
      : ["Sliver Hivelord", "Sorin's Thirst", "Repulse"];
  const basicCounts = actor === "A" ? [20, 20, 20, 19, 19] : [12, 30, 30, 13, 12];
  const body = {
    id: `ordinary-static-keyword:${actor}`,
    commander: keywordStorageCard("Sliver Hivelord").id,
    entries: [
      ...spells.map((name) => ({ definition: keywordStorageCard(name).id, count: 1 })),
      ...["Plains", "Island", "Swamp", "Mountain", "Forest"].map((name, i) => ({
        definition: keywordStorageCard(name).id,
        count: basicCounts[i] ?? missingBasicCount(name),
      })),
    ],
  };
  return { ...body, hash: await semanticHash(body) };
}
/** Actual authenticated subset and legal100-card lists. No state/hand/library mutation. */
export async function storageKeywordFixture(
  id: string,
  resolver: MatchManifest["resolver"] = "prepared-indexed",
  seed = KEYWORD_STORAGE_SEED,
) {
  const release = await keywordStorageRelease(),
    decks = await Promise.all([deck("A"), deck("B")]);
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
    driverVersion: KEYWORD_STORAGE_DRIVER,
    mode: "two-seat",
    resolver,
    ...(artifact ? { preparedArtifactHash: artifact.hash } : {}),
    seats: decks.map((deck, i) => ({ id: i === 0 ? "A" : "B", deck })),
  };
  return { release, manifest, artifact };
}
export function keywordStorageCommand(state: RulesState, response: Response): GameCommand {
  const d = state.decision;
  if (!d) throw new Error("Keyword durability has no pending decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: state.manifest.id,
    commandId: `keyword-storage:${state.revision}`,
    actor: d.actor,
    revision: state.revision,
    decisionId: d.id,
    response,
  };
}
function priority(view: PlayerObservation): Response {
  const d = view.decision,
    actor = view.players.find((x) => x.id === view.player);
  if (!d || !actor) throw new Error("Keyword policy needs an owned observation");
  if (view.stack.length) return { kind: "pass" };
  const available = view.objects.filter((x) => d.cards.includes(x.id));
  const lands = available.filter((x) => x.card?.types.includes("Land"));
  const ownLands = view.objects.filter(
    (x) =>
      x.zone === "battlefield" && x.controller === view.player && x.card?.types.includes("Land"),
  );
  const needed =
    view.player === "A"
      ? ["Plains", "Island", "Swamp", "Mountain", "Forest"]
      : ["Swamp", "Swamp", "Island"];
  const missing = needed.find(
    (name, index) =>
      ownLands.filter((x) => x.card?.name === name).length <
      needed.slice(0, index + 1).filter((x) => x === name).length,
  );
  const land = lands.find((x) => x.card?.name === missing) ?? lands[0];
  if (land) return { kind: "land", card: land.id };
  const provider = view.objects.find(
    (x) => x.zone === "battlefield" && x.controller === "A" && x.card?.name === "Sliver Hivelord",
  );
  const recipient = view.objects.find(
    (x) => x.zone === "battlefield" && x.controller === "A" && x.card?.name === "Metallic Sliver",
  );
  let name = provider ? "Metallic Sliver" : "Sliver Hivelord";
  if (view.player === "B") {
    if (!provider || !recipient) return { kind: "pass" };
    name = recipient.damage >= 2 ? "Repulse" : "Sorin's Thirst";
  }
  const candidate = available.find((x) => x.card?.name === name),
    cost = candidate && d.cardCosts[candidate.id];
  return candidate && cost && findPayment(cost, actor.mana, d.manaSources)
    ? { kind: "cast", card: candidate.id }
    : { kind: "pass" };
}
/** Scenario decisions depend only on the actor's entitled observation. */
export async function keywordStorageResponse(view: PlayerObservation): Promise<Response> {
  const d = view.decision;
  if (!d) throw new Error("Missing owned keyword policy decision");
  switch (d.kind) {
    case "starting-player":
      return { kind: "starting-player", player: "A" };
    case "mulligan":
      return { kind: "mulligan", keep: true };
    case "priority":
      return priority(view);
    case "attack":
      return { kind: "attack", attacks: [] };
    case "commander-replacement":
      return { kind: "commander-replacement", move: true };
    case "target": {
      const thirst = view.objects.some(
        (x) =>
          x.zone === "stack" && x.controller === view.player && x.card?.name === "Sorin's Thirst",
      );
      const name = thirst ? "Metallic Sliver" : "Sliver Hivelord";
      const target = view.objects.find(
        (x) => x.controller === "A" && x.card?.name === name && d.cards.includes(x.id),
      );
      if (!target) throw new Error(`No legal entitled keyword target ${name}`);
      return { kind: "target", target: target.id };
    }
    case "discard": {
      const protectedNames = new Set(["Metallic Sliver", "Sorin's Thirst", "Repulse"]);
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
export async function submitKeywordResponse(c: Coordinator, response?: Response) {
  const actor = c.pendingActor;
  if (!actor) throw new Error("No active keyword scenario actor");
  const input = keywordStorageCommand(
    c.current(),
    response ?? (await keywordStorageResponse(c.view(actor))),
  );
  const result = await c.submit(input.actor, input);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  return { input, result };
}
