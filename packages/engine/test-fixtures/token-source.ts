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
  type ManaColor,
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
import snapshot from "./token-source.json";

export { snapshot as tokenSourceSnapshot };
export const tokenSourceCards = snapshot.cards.map((row) => ({
  hash: row.definitionHash,
  definition: CardDefinition.parse(row.definition),
}));
export const tokenSourceCases = snapshot.sourceRecords.flatMap((row) => {
  if (!("expected" in row) || !row.expected) return [];
  const { count, ...characteristics } = row.expected;
  return [
    { ...row, expected: { count, ...TokenTemplate.shape.characteristics.parse(characteristics) } },
  ];
});
export function tokenSourceCard(name: string): CardDefinition {
  const result = tokenSourceCards.find((row) => row.definition.name === name)?.definition;
  if (!result) throw new Error(`Missing authenticated token fixture card: ${name}`);
  return result;
}
export async function tokenSourceRelease(): Promise<ContentRelease> {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-token-source-fixture/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: Object.fromEntries(
      tokenSourceCards.map((row) => [row.definition.id, row.definition]),
    ),
    tokenTemplates: Object.fromEntries(
      snapshot.tokenTemplates.map((row) => [row.id, TokenTemplate.parse(row)]),
    ),
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "authenticated-token-source-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  return { ...body, hash: await semanticHash(body) };
}
export async function tokenSourceDeck(commander: string, names: string[]): Promise<DeckRevision> {
  const leader = tokenSourceCard(commander);
  const basicNames: Record<string, string> = {
    W: "Plains",
    U: "Island",
    B: "Swamp",
    R: "Mountain",
    G: "Forest",
  };
  const basics = leader.colorIdentity
    .map((color) => basicNames[color])
    .filter((name): name is string => !!name);
  if (!basics.length) throw new Error("Fixture commander needs an available basic land color");
  const unique = [...new Set([commander, ...names])];
  const remaining = 100 - unique.length;
  const body = {
    id: `token-source:${commander}:${names.join(":")}`,
    commander: leader.id,
    entries: [
      ...unique.map((name) => ({ definition: tokenSourceCard(name).id, count: 1 })),
      ...basics.map((name, index) => ({
        definition: tokenSourceCard(name).id,
        count: Math.floor(remaining / basics.length) + Number(index < remaining % basics.length),
      })),
    ],
  };
  return { ...body, hash: await semanticHash(body) };
}
export type TokenSourceFixture = {
  state: RulesState;
  registry: ExecutionRegistry;
  release: ContentRelease;
  source: string;
  lands: Record<string, Partial<Record<ManaColor, string[]>>>;
};
export function tokenSourceCommand(
  f: Pick<TokenSourceFixture, "state">,
  response: Response,
): GameCommand {
  const decision = f.state.decision;
  if (!decision) throw new Error("Missing actual token-source decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: f.state.manifest.id,
    commandId: `token-source:${f.state.revision}`,
    actor: decision.actor,
    revision: f.state.revision,
    decisionId: decision.id,
    response,
  };
}
export function tokenSourceAnswer(f: TokenSourceFixture, response: Response) {
  const result = transition(f.state, tokenSourceCommand(f, response), f.registry);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
  assertInvariants(f.state, f.registry);
  return result;
}
export function tokenSourceObject(f: TokenSourceFixture, actor: string, name: string) {
  const found = Object.values(f.state.objects).find(
    (row) => row.owner === actor && row.definition === tokenSourceCard(name).id,
  );
  if (!found) throw new Error(`Missing owned source fixture card: ${actor} ${name}`);
  return found;
}
function fixtureCommander(name: string): string {
  const colors = tokenSourceCard(name).colorIdentity;
  if (colors.includes("B") && colors.includes("W"))
    throw new Error("No authenticated WB commander is implemented for Call to the Feast");
  if (colors.includes("U")) return "Tobias Andrion";
  if (colors.includes("R"))
    return name === "Ral's Reinforcements" ? "Rorix Bladewing" : "The Lady of the Mountain";
  return "Jasmine Boreal";
}

/** All original cards belong to admitted 100-card decks; hand and land locations are explicit constructed preconditions. */
export async function tokenSourceFixture(
  name: string,
  options: { extra?: string[]; opponent?: "blue" | "black"; seats?: 2 | 4 } = {},
): Promise<TokenSourceFixture> {
  const release = await tokenSourceRelease();
  const registry = await createFullExecutionRegistry(release);
  const commander = fixtureCommander(name);
  const aNames = [name, ...(options.extra ?? [])];
  const bCommander = options.opponent === "black" ? "Lady Orca" : "Tobias Andrion";
  const bNames =
    options.opponent === "black"
      ? ["Murder", "Final Reward"]
      : ["Counterspell", "Repulse", "Silvercoat Lion"];
  const deckA = await tokenSourceDeck(commander, aNames);
  const deckB = await tokenSourceDeck(bCommander, bNames);
  const seats = options.seats ?? 2;
  const f: TokenSourceFixture = {
    state: createMatch(
      {
        schema: "commander-match/1",
        id: `token-source:${tokenSourceCard(name).oracleId}`,
        releaseHash: release.hash,
        engineVersion: ENGINE_VERSION,
        serializer: SERIALIZER_VERSION,
        chance: CHANCE_VERSION,
        gameSeed: 4,
        driverSeed: 1,
        driverVersion: "constructed-authenticated-token/1",
        mode: seats === 2 ? "two-seat" : "four-seat",
        resolver: "full-scan",
        seats: Array.from({ length: seats }, (_, index) => ({
          id: String.fromCharCode(65 + index),
          deck: index === 0 ? deckA : deckB,
        })),
      },
      registry,
    ),
    registry,
    release,
    source: "",
    lands: {},
  };
  tokenSourceAnswer(f, { kind: "starting-player", player: "A" });
  while (f.state.decision?.kind === "mulligan")
    tokenSourceAnswer(f, { kind: "mulligan", keep: true });
  for (let n = 0; n < 16 && f.state.step !== "main1"; n++) tokenSourceAnswer(f, { kind: "pass" });
  if (f.state.step !== "main1")
    throw new Error("Constructed source fixture did not reach first main");
  for (const [actor, names] of [
    ["A", aNames],
    ["B", bNames],
  ] as const) {
    for (const cardName of names) {
      const card = tokenSourceObject(f, actor, cardName);
      if (card.zone !== "hand")
        move(f.state, card.id, "hand", "constructed authenticated source hand");
    }
    const retained = new Set(names.map((cardName) => tokenSourceCard(cardName).id));
    for (const id of [...player(f.state, actor).hand]) {
      const card = f.state.objects[id];
      if (card && !retained.has(card.definition))
        move(f.state, id, "library", "constructed fixture keeps only declared hand cards");
    }
    const landSets: Partial<Record<ManaColor, string[]>> = {};
    for (const color of ["W", "U", "B", "R", "G"] as const) {
      const ids = Object.values(f.state.objects)
        .filter(
          (card) =>
            card.owner === actor &&
            f.registry.definitions[card.definition]?.manaAbilities.includes(color),
        )
        .slice(0, 8);
      landSets[color] = ids.map(
        (card) => move(f.state, card.id, "battlefield", "constructed authenticated mana land").id,
      );
    }
    f.lands[actor] = landSets;
  }
  f.source = tokenSourceObject(f, "A", name).id;
  givePriority(f.state, registry, "A");
  assertInvariants(f.state, registry);
  return f;
}

/** Payment is planned from the complete printed mana symbols, never the compiled effect/template. */
export function tokenSourcePayment(
  f: TokenSourceFixture,
  actor: string,
  printedCost: string,
): Extract<Response, { kind: "payment" }> {
  const spend = emptyMana();
  const sources: { object: string; color: ManaColor }[] = [];
  const symbols = [...printedCost.matchAll(/\{([^}]+)\}/g)].map((match) => match[1] ?? "");
  if (symbols.map((symbol) => `{${symbol}}`).join("") !== printedCost)
    throw new Error("Invalid printed fixture mana cost");
  let generic = 0;
  for (const symbol of symbols) {
    if (/^\d+$/.test(symbol)) generic += Number(symbol);
    else {
      if (!["W", "U", "B", "R", "G", "C"].includes(symbol))
        throw new Error("Unsupported fixture payment symbol");
      spend[symbol as ManaColor]++;
    }
  }
  const available = (color: ManaColor) =>
    (f.lands[actor]?.[color] ?? []).filter((id) => !f.state.objects[id]?.tapped);
  for (const color of ["W", "U", "B", "R", "G", "C"] as const) {
    for (const object of available(color).slice(0, spend[color])) sources.push({ object, color });
    if (sources.filter((source) => source.color === color).length !== spend[color])
      throw new Error("Insufficient constructed colored mana");
  }
  for (const color of ["W", "U", "B", "R", "G", "C"] as const) {
    for (const object of available(color)) {
      if (!generic || sources.some((source) => source.object === object)) continue;
      sources.push({ object, color });
      spend[color]++;
      generic--;
    }
  }
  if (generic) throw new Error("Insufficient constructed generic mana");
  return { kind: "payment", sources, spend };
}
export function tokenSourceCast(
  f: TokenSourceFixture,
  actor: string,
  name: string,
  printedCost: string,
  target?: string,
) {
  for (let n = 0; n < 4 && f.state.decision?.actor !== actor; n++)
    tokenSourceAnswer(f, { kind: "pass" });
  if (f.state.decision?.actor !== actor) throw new Error("Fixture actor lacks ordinary priority");
  const card = tokenSourceObject(f, actor, name);
  tokenSourceAnswer(f, { kind: "cast", card: card.id });
  if (target) tokenSourceAnswer(f, { kind: "target", target });
  const payment = tokenSourcePayment(f, actor, printedCost);
  tokenSourceAnswer(f, payment);
  const top = f.state.stack.at(-1);
  if (top?.kind !== "spell") throw new Error("Source spell absent from actual stack");
  return { source: top.objectId, payment };
}
export function resolveTokenSource(f: TokenSourceFixture) {
  const depth = f.state.stack.length;
  for (let n = 0; n < f.state.players.length && f.state.stack.length === depth; n++)
    tokenSourceAnswer(f, { kind: "pass" });
  if (f.state.stack.length !== depth - 1) throw new Error("Top source spell did not resolve");
  return Object.values(f.state.objects).filter((row) => !!row.token);
}
export function tokenSourceAutomatic(f: TokenSourceFixture): void {
  const decision = f.state.decision;
  if (decision?.kind === "priority") tokenSourceAnswer(f, { kind: "pass" });
  else if (decision?.kind === "attack") tokenSourceAnswer(f, { kind: "attack", attacks: [] });
  else if (decision?.kind === "discard")
    tokenSourceAnswer(f, { kind: "discard", cards: decision.cards.slice(0, decision.count) });
  else throw new Error(`Unexpected automatic source fixture decision: ${decision?.kind}`);
}
export function tokenSourceNextMain(f: TokenSourceFixture) {
  const turn = f.state.turn;
  for (let n = 0; n < 150; n++) {
    tokenSourceAutomatic(f);
    if (f.state.turn > turn && f.state.activePlayer === "A" && f.state.step === "main1") return;
  }
  throw new Error("Next own source fixture main not reached");
}
export function tokenSourceAttackChoice(f: TokenSourceFixture) {
  for (let n = 0; n < 16 && f.state.decision?.kind !== "attack"; n++) tokenSourceAutomatic(f);
  if (f.state.decision?.kind !== "attack")
    throw new Error("Source fixture attack choice not reached");
}
export function tokenSourcePassWindow(f: TokenSourceFixture) {
  for (let n = 0; n < f.state.players.length; n++) tokenSourceAnswer(f, { kind: "pass" });
}
export function tokenSourceInventory(f: TokenSourceFixture, actor: string) {
  return Object.values(f.state.objects)
    .filter((object) => object.owner === actor && !object.token)
    .map((object) => `${object.lineage}:${object.definition}`)
    .sort();
}
export function tokenSourceMana(f: TokenSourceFixture, actor: string) {
  return structuredClone(player(f.state, actor).mana);
}
