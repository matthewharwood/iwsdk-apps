import { type Keyword, SpellProgram, semanticHash, TokenTemplate } from "@iwsdk-apps/contracts";
import { admitDeck } from "../src/index";
import { answer, cast, counterFixture, resolveOne } from "./counterspells";

/** Constructed core programs; production admission has no synthetic-card exception. */
export async function tokenFixture(
  options: {
    count?: 1 | 2 | 3 | 4;
    keywords?: Keyword[];
    power?: number;
    toughness?: number;
    seats?: 2 | 4;
  } = {},
) {
  const f = counterFixture(options.seats ?? 2);
  const payload = {
    schema: "fixed-token-template/1" as const,
    rulesHash: "a".repeat(64),
    characteristics: {
      name: "Knight Ally Token",
      types: ["Creature"],
      subtypes: ["Knight", "Ally"],
      supertypes: [],
      colors: ["W"],
      manaCost: null,
      manaValue: 0,
      power: options.power ?? 2,
      toughness: options.toughness ?? 2,
      keywords: options.keywords ?? [],
    },
  };
  const template = TokenTemplate.parse({
    ...payload,
    id: `token-template:${await semanticHash(payload)}`,
  });
  f.registry.tokenTemplates[template.id] = template;
  const producer = f.registry.definitions["draw-spell"];
  if (!producer) throw new Error("Missing constructed producer slot");
  producer.spellProgram = SpellProgram.parse({
    schema: "commander-spell/1",
    target: null,
    effects: [
      {
        kind: "create-token",
        recipient: "controller",
        count: options.count ?? 2,
        templateId: template.id,
      },
    ],
  });
  for (const seat of f.state.manifest.seats) admitDeck(seat.deck, f.registry);
  return { ...f, template };
}
export type TokenFixture = Awaited<ReturnType<typeof tokenFixture>>;
export function createBatch(f: TokenFixture, actor = "A") {
  const source = cast(f, actor, "draw-spell");
  const existing = new Set(Object.keys(f.state.objects));
  resolveOne(f);
  const tokens = Object.values(f.state.objects).filter(
    (entry) => entry.token && !existing.has(entry.id),
  );
  return { source, tokens };
}
export function passAutomatic(f: TokenFixture): void {
  const decision = f.state.decision;
  if (decision?.kind === "priority") answer(f, { kind: "pass" });
  else if (decision?.kind === "attack") answer(f, { kind: "attack", attacks: [] });
  else if (decision?.kind === "discard")
    answer(f, { kind: "discard", cards: decision.cards.slice(0, decision.count) });
  else throw new Error(`Unexpected automatic fixture decision: ${decision?.kind}`);
}
export function nextOwnMain(f: TokenFixture): void {
  const turn = f.state.turn;
  for (let n = 0; n < 120; n++) {
    passAutomatic(f);
    if (f.state.turn > turn && f.state.activePlayer === "A" && f.state.step === "main1") return;
  }
  throw new Error("Next own main phase not reached");
}
export function attackDecision(f: TokenFixture): void {
  for (let n = 0; n < 12 && f.state.decision?.kind !== "attack"; n++) passAutomatic(f);
  if (f.state.decision?.kind !== "attack") throw new Error("Attack choice not reached");
}
export function passPriorityWindow(f: TokenFixture): void {
  for (let n = 0; n < f.state.players.length && f.state.decision?.kind === "priority"; n++)
    answer(f, { kind: "pass" });
}
