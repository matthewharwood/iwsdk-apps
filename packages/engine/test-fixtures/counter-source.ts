import {
  CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  type ExecutionRegistry,
  emptyMana,
  type GameCommand,
  type Mana,
  type MatchManifest,
  type Response,
  type RulesState,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { createFullExecutionRegistry } from "../../compiler/src/prepared";
import { move, player } from "../src/common";
import { assertInvariants, createMatch, transition } from "../src/index";
import { givePriority } from "../src/turns";
import snapshot from "./counter-source.json";

export { snapshot as counterSourceSnapshot };
export const counterSourceCards = snapshot.cards.map((row) => ({
  hash: row.definitionHash,
  definition: CardDefinition.parse(row.definition),
}));
export function sourceCard(name: string): CardDefinition {
  const row = counterSourceCards.find((row) => row.definition.name === name);
  if (!row) throw new Error(`Missing authenticated fixture card ${name}`);
  return row.definition;
}
export async function counterSourceRelease(): Promise<ContentRelease> {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-counter-source-fixture/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: Object.fromEntries(
      counterSourceCards.map((row) => [row.definition.id, row.definition]),
    ),
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "authenticated-counter-source-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  return { ...body, hash: await semanticHash(body) };
}
export type SourceCounterFixture = {
  state: RulesState;
  registry: ExecutionRegistry;
  release: ContentRelease;
  counterName: string;
  targetName: string;
  targetHandId: string;
  counterHandId: string;
  blueLandIds: string[];
  whiteLandIds: string[];
  targetBlueLandIds: string[];
};
export async function sourceCounterFixture(
  counterName: string,
  targetName: string,
): Promise<SourceCounterFixture> {
  const release = await counterSourceRelease();
  // Real production authentication validates every unmodified source tuple against
  // the closed registry. This subset has its own identity, never the full release hash.
  const registry = await createFullExecutionRegistry(release);
  const deckBody = {
    id: "authentic-counter-scenario-deck",
    commander: sourceCard("Tobias Andrion").id,
    entries: counterSourceCards.map(({ definition }) => ({
      definition: definition.id,
      count: ["Island", "Plains"].includes(definition.name) ? 44 : 1,
    })),
  };
  const deck: DeckRevision = { ...deckBody, hash: await semanticHash(deckBody) };
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: `authentic-counter:${sourceCard(counterName).oracleId}`,
    releaseHash: release.hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 4,
    driverSeed: 1,
    driverVersion: "constructed-source-counter/1",
    mode: "two-seat",
    resolver: "full-scan",
    seats: ["A", "B"].map((id) => ({ id, deck })),
  };
  const f: SourceCounterFixture = {
    state: createMatch(manifest, registry),
    registry,
    release,
    counterName,
    targetName,
    targetHandId: "",
    counterHandId: "",
    blueLandIds: [],
    whiteLandIds: [],
    targetBlueLandIds: [],
  };
  sourceAnswer(f, { kind: "starting-player", player: "A" });
  while (f.state.decision?.kind === "mulligan") sourceAnswer(f, { kind: "mulligan", keep: true });
  for (let n = 0; n < 16 && f.state.step !== "main1"; n++) sourceAnswer(f, { kind: "pass" });
  if (f.state.step !== "main1") throw new Error("Main phase not reached");
  f.targetHandId = handPrecondition(f, "A", targetName);
  f.counterHandId = handPrecondition(f, "B", counterName);
  f.blueLandIds = landPrecondition(f, "B", "Island", 3);
  f.whiteLandIds = landPrecondition(f, "A", "Plains", 4);
  f.targetBlueLandIds = landPrecondition(f, "A", "Island", 4);
  givePriority(f.state, registry, "A");
  assertInvariants(f.state, registry);
  return f;
}
function handPrecondition(f: SourceCounterFixture, actor: string, name: string): string {
  const card = Object.values(f.state.objects).find(
    (row) => row.owner === actor && row.definition === sourceCard(name).id,
  );
  if (!card) throw new Error(`Missing scenario ${name}`);
  return card.zone === "hand"
    ? card.id
    : move(f.state, card.id, "hand", "constructed authenticated hand precondition").id;
}
function landPrecondition(
  f: SourceCounterFixture,
  actor: string,
  name: string,
  count: number,
): string[] {
  const lands = Object.values(f.state.objects)
    .filter((row) => row.owner === actor && row.definition === sourceCard(name).id)
    .slice(0, count);
  if (lands.length !== count) throw new Error("Missing authentic basic lands");
  return lands.map(
    (row) => move(f.state, row.id, "battlefield", "constructed authenticated land precondition").id,
  );
}
export function sourceCommand(f: SourceCounterFixture, response: Response): GameCommand {
  const decision = f.state.decision;
  if (!decision) throw new Error("Missing source-counter decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: f.state.manifest.id,
    commandId: `source-counter:${f.state.revision}`,
    actor: decision.actor,
    revision: f.state.revision,
    decisionId: decision.id,
    response,
  };
}
export function sourceAnswer(f: SourceCounterFixture, response: Response) {
  const result = transition(f.state, sourceCommand(f, response), f.registry);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
  assertInvariants(f.state, f.registry);
  return result;
}
export function sourcePayment(
  landIds: string[],
  color: "W" | "U",
  amount: number,
): Extract<Response, { kind: "payment" }> {
  return {
    kind: "payment",
    sources: landIds.slice(0, amount).map((object) => ({ object, color })),
    spend: { ...emptyMana(), [color]: amount } satisfies Mana,
  };
}
export function targetCast(
  f: SourceCounterFixture,
  color: "W" | "U",
  amount: number,
  chosenPlayer?: string,
): string {
  sourceAnswer(f, { kind: "cast", card: f.targetHandId });
  if (chosenPlayer) sourceAnswer(f, { kind: "target", target: chosenPlayer });
  sourceAnswer(
    f,
    sourcePayment(color === "W" ? f.whiteLandIds : f.targetBlueLandIds, color, amount),
  );
  const top = f.state.stack.at(-1);
  if (top?.kind !== "spell") throw new Error("No actual target spell");
  sourceAnswer(f, { kind: "pass" }); // caster A hands real priority to B.
  if (f.state.decision?.actor !== "B") throw new Error("Opponent priority not granted");
  return top.objectId;
}
export function seat(f: SourceCounterFixture, actor: string) {
  return player(f.state, actor);
}
