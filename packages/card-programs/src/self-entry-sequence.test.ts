import { expect, test } from "bun:test";
import type { CatalogCard } from "@iwsdk-apps/catalog";
import { OrderedSelfEntryProgram } from "@iwsdk-apps/contracts";
import { bindDevelopmentCard, reviewedSelfEntryDefinition, SELF_ENTRY_SEQUENCES } from "./index";

// Exact reviewed source tuples, with minimal constructor-only Oracle envelopes.
// Actual complete Oracle payload/archived-record hashes are checked by the compilation proof.
function cardFor(recipe: (typeof SELF_ENTRY_SEQUENCES)[number]): CatalogCard {
  return {
    identity: recipe.identity,
    versionHash: recipe.sourceVersion,
    sourceArchiveHash: recipe.sourceArchiveHash,
    sourceOrdinal: recipe.sourceOrdinal,
    bundleHash: recipe.sourceBundle,
    eligibility: [
      {
        role: "main-deck",
        status: "candidate",
        reason: "reviewed source tuple unit fixture",
        sourceHash: recipe.sourceArchiveHash,
      },
    ],
    oracle: {
      object: "card",
      id: recipe.identity,
      oracle_id: recipe.identity,
      name: recipe.name,
      layout: "normal",
      lang: "en",
      released_at: "2020-01-01",
      set: "unit",
      collector_number: "1",
      legalities: { commander: "legal" },
      games: ["paper"],
      colors: [...recipe.colors],
      color_identity: [...recipe.colorIdentity],
      keywords: [...recipe.keywords],
      type_line: recipe.typeLine,
      mana_cost: recipe.manaCost,
      cmc: recipe.manaValue,
      power: String(recipe.power),
      toughness: String(recipe.toughness),
      oracle_text: recipe.oracleText,
    },
  };
}
for (const recipe of SELF_ENTRY_SEQUENCES)
  test(`${recipe.name}: complete identity/source/text/characteristics retain exact ordered instructions`, () => {
    const input = cardFor(recipe);
    expect(bindDevelopmentCard(input, { selfEntryTriggers: true }).kind).toBe("unsupported");
    const bound = bindDevelopmentCard(input, { selfEntrySequences: true });
    if (bound.kind !== "bound") throw new Error(bound.reason);
    expect(bound.definition.triggerPrograms).toEqual([
      OrderedSelfEntryProgram.parse(recipe.program),
    ]);
    expect(bound.definition.keywords).toEqual(recipe.keywords.length ? ["flying"] : []);
    expect(bound.definition.manaCost).toEqual(recipe.cost);
    expect(reviewedSelfEntryDefinition(bound.definition)).toBe(true);
    for (const oracle of [
      { ...input.oracle, oracle_text: `${recipe.oracleText}\n{T}: Add {W}.` },
      { ...input.oracle, oracle_text: recipe.oracleText.replace("gain", "may gain") },
      { ...input.oracle, keywords: [] },
      { ...input.oracle, mana_cost: "{1}{W}" },
      { ...input.oracle, power: "3" },
      { ...input.oracle, layout: "transform" },
    ]) {
      if (JSON.stringify(oracle) === JSON.stringify(input.oracle)) continue;
      expect(bindDevelopmentCard({ ...input, oracle }, { selfEntrySequences: true }).kind).toBe(
        "unsupported",
      );
    }
    for (const mutation of [
      { identity: "another-card" },
      { versionHash: "0".repeat(64) },
      { sourceOrdinal: 0 },
      { sourceArchiveHash: "0".repeat(64) },
    ])
      expect(
        bindDevelopmentCard({ ...input, ...mutation }, { selfEntrySequences: true }).kind,
      ).toBe("unsupported");
    const altered = structuredClone(bound.definition);
    const program = altered.triggerPrograms?.[0];
    if (program?.schema !== "commander-trigger/2") throw new Error("Missing ordered program");
    program.effects.reverse();
    expect(reviewedSelfEntryDefinition(altered)).toBe(false);
    expect(
      reviewedSelfEntryDefinition({
        ...bound.definition,
        manaCost: { ...recipe.cost, W: 0, B: 1 },
      }),
    ).toBe(false);
    expect(reviewedSelfEntryDefinition({ ...bound.definition, keywords: ["haste"] })).toBe(false);
  });
