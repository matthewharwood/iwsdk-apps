import { expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  canonicalJson,
  type Keyword,
  SelfEntryProgram,
  selfEntryEffects,
} from "@iwsdk-apps/contracts";
import {
  bindDevelopmentCard,
  KEYWORD_REMINDER_RECIPE_VERSION,
  KEYWORD_REMINDER_REGISTRY,
  reviewedKeywordReminderDefinition,
} from "./index";

function candidate(text: string, keywords: Keyword[]): CatalogCard {
  return CatalogCardSchema.parse({
    identity: "00000000-0000-4000-8000-000000000001",
    versionHash: "1".repeat(64),
    sourceArchiveHash: "2".repeat(64),
    sourceOrdinal: 1,
    bundleHash: "3".repeat(64),
    oracle: {
      object: "card",
      id: "00000000-0000-4000-8000-000000000002",
      oracle_id: "00000000-0000-4000-8000-000000000001",
      name: "Annotation fixture",
      layout: "normal",
      lang: "en",
      released_at: "2020-01-01",
      set: "fixture",
      collector_number: "1",
      legalities: { commander: "legal" },
      games: ["paper"],
      color_identity: ["G"],
      colors: ["G"],
      keywords: keywords.map((word) => word.replaceAll("-", " ")),
      type_line: "Creature — Elf",
      mana_cost: "{1}{G}",
      cmc: 2,
      power: "2",
      toughness: "3",
      oracle_text: text,
    },
    eligibility: [
      { role: "main-deck", status: "candidate", reason: "synthetic", sourceHash: "4".repeat(64) },
    ],
  });
}
const flags = { keywordReminders: true, selfEntryTriggers: true };

test("all twenty exact reviewed annotations preserve complete source and bind only their declared keyword", () => {
  expect(KEYWORD_REMINDER_REGISTRY).toHaveLength(20);
  for (const recipe of KEYWORD_REMINDER_REGISTRY) {
    const input = candidate(recipe.text, [recipe.keyword]);
    expect(bindDevelopmentCard(input).kind).toBe("unsupported");
    const result = bindDevelopmentCard(input, flags);
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw Error("Expected complete annotation binding");
    expect(result.definition.oracleText).toBe(recipe.text);
    expect(result.definition.sourceVersion).toBe(input.versionHash);
    expect(result.definition.keywords).toEqual([recipe.keyword]);
    expect(result.definition.implementationRevision).toBe(KEYWORD_REMINDER_RECIPE_VERSION);
    expect(result.definition.obligations).toContain("rule:207.2a");
    expect(reviewedKeywordReminderDefinition(result.definition)).toBe(true);
    for (const text of [
      `${recipe.text} extra`,
      ` ${recipe.text}`,
      `${recipe.text} `,
      recipe.text.replace("(", "(Changed reminder: "),
      recipe.text.replace(".)", ")"),
      `${recipe.text}\nThis creature can't block.`,
      `${recipe.text}\n${recipe.text}`,
      `${recipe.text}\n({T}: Add {G}{G}.)`,
    ])
      expect(bindDevelopmentCard(candidate(text, [recipe.keyword]), flags).kind).toBe(
        "unsupported",
      );
  }
});

test("known annotation composition accounts for every keyword, mana clause and optional supported trigger", () => {
  const reach = KEYWORD_REMINDER_REGISTRY.find((row) => row.keyword === "reach");
  if (!reach) throw Error("Missing reach annotation");
  const input = candidate(
    `Flying\n${reach.text}\n{T}: Add {G}.\nWhen this creature enters, draw a card.`,
    ["flying", "reach"],
  );
  expect(bindDevelopmentCard(input, { keywordReminders: true }).kind).toBe("unsupported");
  const result = bindDevelopmentCard(input, flags);
  expect(result.kind).toBe("bound");
  if (result.kind !== "bound") throw Error("Expected composite");
  expect(result.definition.keywords).toEqual(["flying", "reach"]);
  expect(result.definition.manaAbilities).toEqual(["G"]);
  expect(
    result.definition.triggerPrograms?.[0]
      ? selfEntryEffects(SelfEntryProgram.parse(result.definition.triggerPrograms[0]))[0]
      : undefined,
  ).toMatchObject({ kind: "draw", amount: 1 });
  expect(reviewedKeywordReminderDefinition(result.definition)).toBe(true);
  for (const keywords of [["reach"], ["reach", "flying", "haste"]] as Keyword[][])
    expect(
      bindDevelopmentCard(candidate(input.oracle.oracle_text ?? "", keywords), flags).kind,
    ).toBe("unsupported");
  for (const text of [
    input.oracle.oracle_text?.replace("draw a card.", "you may draw a card."),
    input.oracle.oracle_text?.replace("draw a card.", "draw two cards."),
    input.oracle.oracle_text?.replace("Add {G}.", "Add {G}{G}."),
  ])
    expect(bindDevelopmentCard(candidate(text ?? "", ["flying", "reach"]), flags).kind).toBe(
      "unsupported",
    );
});

test("reminder constructor rejects changed identity, layout, costs, stats, types and unexplained provider keywords", () => {
  const row = KEYWORD_REMINDER_REGISTRY[0];
  if (!row) throw Error("Missing annotation");
  const input = candidate(row.text, [row.keyword]);
  for (const changes of [
    { oracle_id: "00000000-0000-4000-8000-000000000999" },
    { layout: "transform" },
    { mana_cost: "{G/W}" },
    { cmc: 3 },
    { power: "*" },
    { toughness: "1+*" },
    { type_line: "Creature Planeswalker — Elf" },
    { type_line: "Snow Creature — Elf" },
    { keywords: [] },
    { keywords: [row.keyword, "Prowess"] },
  ])
    expect(
      bindDevelopmentCard({ ...input, oracle: { ...input.oracle, ...changes } }, flags).kind,
    ).toBe("unsupported");
});

test("prepared reminder reconstruction rejects altered typed programs and unsupported characteristics", () => {
  const row = KEYWORD_REMINDER_REGISTRY.find((entry) => entry.keyword === "reach");
  if (!row) throw Error("Missing annotation");
  const bound = bindDevelopmentCard(candidate(row.text, [row.keyword]), flags);
  if (bound.kind !== "bound") throw Error("Missing binding");
  for (const change of [
    { power: null },
    { types: ["Creature", "Planeswalker"], typeLine: "Creature Planeswalker — Elf" },
    { subtypes: ["Goblin"] },
    { manaCost: null },
    { manaValue: 9 },
    { commanderEligible: true },
    { deckLimit: null },
    { keywords: ["flying"] },
    { manaAbilities: ["G"] },
    { implementationRevision: "keyword-reminder-creature/2" },
    { id: "changed-id" },
    { oracleText: `${row.text}\nThis creature can't block.` },
    { triggerPrograms: [] },
  ])
    expect(
      reviewedKeywordReminderDefinition({
        ...bound.definition,
        ...change,
      } as typeof bound.definition),
    ).toBe(false);
});

test("opt-in preserves existing plain-body definition bytes and constructor revision", () => {
  for (const text of [
    "",
    "Flying",
    "Flying\n{T}: Add {G}.",
    "When this creature enters, draw a card.",
  ]) {
    const input = candidate(text, text.includes("Flying") ? ["flying"] : []);
    const baseline = bindDevelopmentCard(input, { selfEntryTriggers: true });
    const expanded = bindDevelopmentCard(input, flags);
    expect(canonicalJson(expanded)).toBe(canonicalJson(baseline));
  }
});
