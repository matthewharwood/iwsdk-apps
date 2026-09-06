import { expect, test } from "bun:test";
import type { CatalogCard } from "@iwsdk-apps/catalog";
import { bindDevelopmentCard, proposeSelfEntryBody } from "./index";

function fixture(text: string): CatalogCard {
  return {
    identity: "00000000-0000-4000-8000-000000000001",
    versionHash: "1".repeat(64),
    sourceArchiveHash: "2".repeat(64),
    sourceOrdinal: 1,
    bundleHash: "3".repeat(64),
    eligibility: [
      {
        role: "main-deck",
        status: "candidate",
        reason: "synthetic binding fixture",
        sourceHash: "4".repeat(64),
      },
    ],
    oracle: {
      object: "card",
      id: "00000000-0000-4000-8000-000000000002",
      oracle_id: "00000000-0000-4000-8000-000000000001",
      name: "Synthetic self-entry fixture",
      layout: "normal",
      lang: "en",
      released_at: "2020-01-01",
      set: "test",
      collector_number: "1",
      legalities: { commander: "legal" },
      games: ["paper"],
      color_identity: ["G"],
      colors: ["G"],
      keywords: [],
      type_line: "Creature — Elf",
      mana_cost: "{1}{G}",
      cmc: 2,
      power: "1",
      toughness: "1",
      oracle_text: text,
    },
  };
}
test("opt-in self-entry constructors retain source pins and capture-controller semantics with existing complete abilities", () => {
  const card = fixture("When this creature enters, draw a card.\n{T}: Add {G}.");
  expect(bindDevelopmentCard(card).kind).toBe("unsupported");
  const result = bindDevelopmentCard(card, { selfEntryTriggers: true });
  if (result.kind !== "bound") throw Error(result.reason);
  expect(result.definition.sourceVersion).toBe(card.versionHash);
  expect(result.definition.manaAbilities).toEqual(["G"]);
  expect(result.definition.triggerPrograms).toMatchObject([
    {
      choice: { kind: "mandatory" },
      effect: { kind: "draw", recipient: "trigger-controller", amount: 1 },
    },
  ]);
  expect(result.definition.spellProgram).toBeUndefined();
  for (const amount of [1, 2, 3, 4, 5]) {
    const result = bindDevelopmentCard(
      fixture(`Flying, deathtouch\nWhen this creature enters, you gain ${amount} life.`),
      { selfEntryTriggers: true },
    );
    if (result.kind !== "bound") throw Error(result.reason);
    expect(result.definition.keywords).toEqual(["flying", "deathtouch"]);
    expect(result.definition.triggerPrograms?.[0]?.effect).toEqual({
      kind: "gain-life",
      recipient: "trigger-controller",
      amount,
    });
  }
});
test("optional, conditional, different-source, combined, multi-trigger and reminder-bearing bodies stay unsupported", () => {
  for (const text of [
    "When this creature enters, you may draw a card.",
    "When this creature enters, draw two cards.",
    "When this creature enters, you gain 6 life.",
    "When this creature enters, you gain 2 life and draw a card.",
    "When this creature enters, if you control a Forest, draw a card.",
    "Whenever another creature enters, draw a card.",
    "When this creature enters, draw a card. Then discard a card.",
    "When this creature enters, draw a card.\nWhen this creature enters, you gain 3 life.",
    "Flying (This creature can fly.)\nWhen this creature enters, draw a card.",
    "When this creature enters, draw a card.\n{T}: Add one mana of any color.",
    "When this creature enters, draw a card.\n",
    "\nWhen this creature enters, draw a card.",
    "When this creature enters, draw a card. ",
  ])
    expect(bindDevelopmentCard(fixture(text), { selfEntryTriggers: true }).kind).toBe(
      "unsupported",
    );
  expect(proposeSelfEntryBody("When this creature enters, you may draw a card.")).toBeNull();
});
test("trigger constructor does not bypass ordinary layout, metadata, type, cost, or statistic checks", () => {
  const card = fixture("When this creature enters, draw a card.");
  for (const changes of [
    { layout: "transform" },
    { mana_cost: "{G/U}{G/U}" },
    { power: "*" },
    { type_line: "Sorcery" },
    { type_line: "Snow Creature — Elf" },
    { keywords: ["Evoke"] },
    { oracle_id: "00000000-0000-4000-8000-000000000003" },
  ])
    expect(
      bindDevelopmentCard(
        { ...card, oracle: { ...card.oracle, ...changes } },
        { selfEntryTriggers: true },
      ).kind,
    ).toBe("unsupported");
});
