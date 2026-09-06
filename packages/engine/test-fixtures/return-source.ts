import {
  CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  type ExecutionRegistry,
  type GameCommand,
  type MatchManifest,
  type Response,
  type RulesState,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { createFullExecutionRegistry } from "../../compiler/src/prepared";
import { move } from "../src/common";
import { assertInvariants, createMatch, transition } from "../src/index";
import { givePriority } from "../src/turns";
import snapshot from "./return-source.json";

export { snapshot as returnSourceSnapshot };
export const returnSourceCards = snapshot.cards.map((row) => ({
  hash: row.definitionHash,
  definition: CardDefinition.parse(row.definition),
}));
export function returnSourceCard(name: string): CardDefinition {
  const row = returnSourceCards.find((row) => row.definition.name === name);
  if (!row) throw new Error(`Missing authenticated return fixture ${name}`);
  return row.definition;
}
export async function returnSourceRelease(): Promise<ContentRelease> {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-return-source-fixture/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: Object.fromEntries(
      returnSourceCards.map((row) => [row.definition.id, row.definition]),
    ),
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "authenticated-return-source-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  return { ...body, hash: await semanticHash(body) };
}
export async function returnDeck(id: string, entries: [string, number][]): Promise<DeckRevision> {
  const body = {
    id,
    commander: returnSourceCard("Tobias Andrion").id,
    entries: entries.map(([name, count]) => ({ definition: returnSourceCard(name).id, count })),
  };
  return { ...body, hash: await semanticHash(body) };
}
export function returnManifest(
  release: ContentRelease,
  deck: DeckRevision,
  id: string,
  seed = 4,
): MatchManifest {
  return {
    schema: "commander-match/1",
    id,
    releaseHash: release.hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: seed,
    driverSeed: 1,
    driverVersion: "return-source-fixture/1",
    mode: "two-seat",
    resolver: "full-scan",
    seats: ["A", "B"].map((id) => ({ id, deck })),
  };
}
export type ReturnSourceFixture = {
  state: RulesState;
  registry: ExecutionRegistry;
  source: string;
  target: string;
  lands: string[];
};
export function returnSourceCommand(f: { state: RulesState }, response: Response): GameCommand {
  const decision = f.state.decision;
  if (!decision) throw new Error("Missing return source decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: f.state.manifest.id,
    commandId: `return-source:${f.state.revision}`,
    actor: decision.actor,
    revision: f.state.revision,
    decisionId: decision.id,
    response,
  };
}
export function returnSourceAnswer(f: ReturnSourceFixture, response: Response) {
  const result = transition(f.state, returnSourceCommand(f, response), f.registry);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
  assertInvariants(f.state, f.registry);
  return result;
}

/** Real authenticated definitions and legal decks; hand/land/target placement is constructed. */
export async function returnSourceFixture(name: string, commander: boolean) {
  const release = await returnSourceRelease();
  const registry = await createFullExecutionRegistry(release);
  const deck = await returnDeck(
    "source-return-scenarios",
    returnSourceCards.map(({ definition }) => [
      definition.name,
      definition.name === "Island" ? 46 : definition.name === "Plains" ? 47 : 1,
    ]),
  );
  const state = createMatch(returnManifest(release, deck, `source-return:${name}`), registry);
  const f: ReturnSourceFixture = { state, registry, source: "", target: "", lands: [] };
  returnSourceAnswer(f, { kind: "starting-player", player: "A" });
  while (f.state.decision?.kind === "mulligan")
    returnSourceAnswer(f, { kind: "mulligan", keep: true });
  for (let n = 0; n < 16 && f.state.step !== "main1"; n++) returnSourceAnswer(f, { kind: "pass" });
  if (f.state.step !== "main1") throw new Error("Source scenario main phase not reached");
  const find = (actor: string, card: string) => {
    const object = Object.values(f.state.objects).find(
      (row) => row.owner === actor && row.definition === returnSourceCard(card).id,
    );
    if (!object) throw new Error(`Missing scenario ${actor} ${card}`);
    return object;
  };
  f.source = move(f.state, find("A", name).id, "hand", "constructed source hand").id;
  f.target = move(
    f.state,
    find("B", commander ? "Tobias Andrion" : "Silvercoat Lion").id,
    "battlefield",
    "constructed source target",
  ).id;
  f.lands = Object.values(f.state.objects)
    .filter((row) => row.owner === "A" && row.definition === returnSourceCard("Island").id)
    .slice(0, 3)
    .map((row) => move(f.state, row.id, "battlefield", "constructed source mana land").id);
  givePriority(f.state, registry, "A");
  assertInvariants(f.state, registry);
  return f;
}
