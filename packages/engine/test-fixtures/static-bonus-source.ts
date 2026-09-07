import {
  CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  type ExecutionRegistry,
  type GameCommand,
  type Response,
  type RulesState,
  SERIALIZER_VERSION,
  semanticHash,
  TokenTemplate,
} from "@iwsdk-apps/contracts";
import { createFullExecutionRegistry } from "../../compiler/src/prepared";
import { move, player } from "../src/common";
import { assertInvariants, createMatch, transition } from "../src/index";
import { givePriority } from "../src/turns";
import snapshot from "./static-bonus-source.json";
import { tokenSourcePayment } from "./token-source";

export { snapshot as staticSourceSnapshot };

const definitions = Object.fromEntries(
  snapshot.cards.map((row) => {
    const card = CardDefinition.parse(row.definition);
    return [card.id, card];
  }),
);
export function staticSourceCard(name: string): CardDefinition {
  const card = Object.values(definitions).find((card) => card.name === name);
  if (!card) throw new Error(`Missing authenticated static fixture card: ${name}`);
  return card;
}
export async function staticSourceRelease(): Promise<ContentRelease> {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-static-source-fixture/1",
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
    eligibleDenominator: 0,
    compilerVersion: "authenticated-static-source-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  return { ...body, hash: await semanticHash(body) };
}
let admitted: Promise<{ release: ContentRelease; registry: ExecutionRegistry }> | undefined;
function sourceRegistry() {
  admitted ??= staticSourceRelease().then(async (release) => ({
    release,
    registry: await createFullExecutionRegistry(release),
  }));
  return admitted;
}
export async function staticSourceDeck(commander: string, names: string[]): Promise<DeckRevision> {
  const leader = staticSourceCard(commander);
  const basicByColor: Record<string, string> = {
    W: "Plains",
    U: "Island",
    B: "Swamp",
    R: "Mountain",
    G: "Forest",
  };
  const basics = leader.colorIdentity
    .map((color) => basicByColor[color])
    .filter((name): name is string => !!name);
  if (!basics.length) throw new Error("This fixture requires an ordinary basic land color");
  const unique = [...new Set([commander, ...names])];
  const remaining = 100 - unique.length;
  const body = {
    id: `static-source:${commander}:${names.join(":")}`,
    commander: leader.id,
    entries: [
      ...unique.map((name) => ({ definition: staticSourceCard(name).id, count: 1 })),
      ...basics.map((name, index) => ({
        definition: staticSourceCard(name).id,
        count: Math.floor(remaining / basics.length) + Number(index < remaining % basics.length),
      })),
    ],
  };
  return { ...body, hash: await semanticHash(body) };
}
export type StaticSourceFixture = {
  state: RulesState;
  registry: ExecutionRegistry;
  release: ContentRelease;
  source: string;
  lands: Record<string, Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", string[]>>>;
};
export function staticSourceObject(f: StaticSourceFixture, actor: string, name: string) {
  const entry = Object.values(f.state.objects).find(
    (entry) => entry.owner === actor && entry.definition === staticSourceCard(name).id,
  );
  if (!entry) throw new Error(`Missing owned source card ${actor}/${name}`);
  return entry;
}
export function staticSourceCommand(f: StaticSourceFixture, response: Response): GameCommand {
  const decision = f.state.decision;
  if (!decision) throw new Error("No pending source scenario decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: f.state.manifest.id,
    commandId: `source:${f.state.revision}`,
    actor: decision.actor,
    revision: f.state.revision,
    decisionId: decision.id,
    response,
  };
}
export function staticSourceAnswer(f: StaticSourceFixture, response: Response) {
  const result = transition(f.state, staticSourceCommand(f, response), f.registry);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
  assertInvariants(f.state, f.registry);
  return result;
}
/** Actual cards and legal100-card lists; selected hands/lands are declared constructed preconditions. */
export async function staticSourceFixture(
  commander: string,
  names: string[],
  opponent = "Tobias Andrion",
  otherNames: string[] = [],
): Promise<StaticSourceFixture> {
  const { release, registry } = await sourceRegistry();
  const decks = await Promise.all([
    staticSourceDeck(commander, names),
    staticSourceDeck(opponent, otherNames),
  ]);
  const f: StaticSourceFixture = {
    release,
    registry,
    source: "",
    lands: {},
    state: createMatch(
      {
        schema: "commander-match/1",
        id: "authenticated-static-scenario",
        releaseHash: release.hash,
        engineVersion: ENGINE_VERSION,
        serializer: SERIALIZER_VERSION,
        chance: CHANCE_VERSION,
        gameSeed: 4,
        driverSeed: 1,
        driverVersion: "authenticated-static-scenarios/1",
        mode: "two-seat",
        resolver: "full-scan",
        seats: decks.map((deck, index) => ({ id: index === 0 ? "A" : "B", deck })),
      },
      registry,
    ),
  };
  staticSourceAnswer(f, { kind: "starting-player", player: "A" });
  while (f.state.decision?.kind === "mulligan")
    staticSourceAnswer(f, { kind: "mulligan", keep: true });
  for (let n = 0; n < 16 && f.state.step !== "main1"; n++) staticSourceAnswer(f, { kind: "pass" });
  if (f.state.step !== "main1") throw new Error("Source scenario did not reach main phase");
  for (const [actor, hand] of [
    ["A", names],
    ["B", otherNames],
  ] as const) {
    for (const name of hand) {
      const entry = staticSourceObject(f, actor, name);
      if (entry.zone !== "hand" && !entry.commander)
        move(f.state, entry.id, "hand", "constructed authenticated source hand");
    }
    const kept = new Set(hand.map((name) => staticSourceCard(name).id));
    for (const id of [...player(f.state, actor).hand])
      if (!kept.has(f.state.objects[id]?.definition ?? ""))
        move(f.state, id, "library", "constructed undeclared hand isolation");
    const lands: StaticSourceFixture["lands"][string] = {};
    for (const color of ["W", "U", "B", "R", "G"] as const) {
      const candidates = Object.values(f.state.objects)
        .filter(
          (entry) =>
            entry.owner === actor &&
            registry.definitions[entry.definition]?.manaAbilities.includes(color),
        )
        .slice(0, 10);
      lands[color] = candidates.map(
        (entry) =>
          move(f.state, entry.id, "battlefield", "constructed authenticated basic lands").id,
      );
    }
    f.lands[actor] = lands;
  }
  givePriority(f.state, registry, "A");
  assertInvariants(f.state, registry);
  return f;
}
export function staticSourceCast(
  f: StaticSourceFixture,
  actor: string,
  name: string,
  target?: string,
) {
  for (let n = 0; n < f.state.players.length && f.state.decision?.actor !== actor; n++)
    staticSourceAnswer(f, { kind: "pass" });
  if (f.state.decision?.actor !== actor) throw new Error("Source caster lacks ordinary priority");
  const before = staticSourceObject(f, actor, name);
  staticSourceAnswer(f, { kind: "cast", card: before.id });
  if (target) staticSourceAnswer(f, { kind: "target", target });
  const printedCost = (snapshot.printedCosts as Record<string, string>)[name];
  if (printedCost === undefined) throw new Error("Missing pinned printed mana cost");
  const payment = tokenSourcePayment(f, actor, printedCost);
  const paid = staticSourceAnswer(f, payment);
  const top = f.state.stack.at(-1);
  if (top?.kind !== "spell") throw new Error("Paid source is not on stack");
  return {
    id: top.objectId,
    payment,
    event: paid.state.events.find((event) => event.type === "SpellCast"),
  };
}
export function staticSourceResolve(f: StaticSourceFixture) {
  const depth = f.state.stack.length;
  for (let n = 0; n < f.state.players.length && f.state.stack.length === depth; n++)
    staticSourceAnswer(f, { kind: "pass" });
  if (f.state.stack.length !== depth - 1) throw new Error("Source did not resolve");
}
export function staticSourceInventory(f: StaticSourceFixture, actor: string) {
  return Object.values(f.state.objects)
    .filter((entry) => entry.owner === actor && !entry.token)
    .map((entry) => `${entry.lineage}:${entry.definition}`)
    .sort();
}
