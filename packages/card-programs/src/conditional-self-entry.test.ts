import { expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  type CardDefinition,
  ConditionalSelfEntryProgram,
  canonicalJson,
  semanticHash,
} from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/conditional-self-entry.json";
import {
  bindConditionalSelfEntryPermanent,
  CONDITIONAL_SELF_ENTRY_PERMANENTS,
  CONDITIONAL_SELF_ENTRY_RESEARCH_HASH,
  CONDITIONAL_SELF_ENTRY_SOURCE_PACK_HASH,
  CONDITIONAL_SELF_ENTRY_VERSION,
  reviewedConditionalSelfEntryDefinition,
} from "./conditional-self-entry";
import { bindDevelopmentCard } from "./index";

const records = fixture.records.map((row) => CatalogCardSchema.parse(row));
const previousOptions = {
  entryObserverTriggers: true,
  staticBonusPermanents: true,
  fixedTokenSpells: true,
  creatureReturnSpells: true,
  counterSpells: true,
  spellFamilies: true,
  selfEntryTriggers: true,
  selfEntrySequences: true,
  temporaryCreatureSpells: true,
  keywordReminders: true,
};
const options = { ...previousOptions, conditionalSelfEntryTriggers: true };
function candidate(name: string): CatalogCard {
  const card = records.find((row) => row.oracle.name === name);
  if (!card) throw new Error(`Missing conditional source: ${name}`);
  return structuredClone(card);
}
function bound(name: string): CardDefinition {
  const card = bindConditionalSelfEntryPermanent(candidate(name));
  if (!card) throw new Error(`Missing exact binding: ${name}`);
  return card;
}
function program(card: CardDefinition): ConditionalSelfEntryProgram {
  return ConditionalSelfEntryProgram.parse(card.triggerPrograms?.[0]);
}

test("two exact source bodies require opt-in and retain independently proposed conditional programs and every characteristic", async () => {
  const { hash, ...body } = fixture;
  expect(await semanticHash(body)).toBe(hash);
  expect(hash).toBe("475674e3d5d291eb8032d49cb6da43ed1ca47b2e9f4dc301e2418627eef7d1d9");
  expect(fixture.sourcePackHash).toBe(CONDITIONAL_SELF_ENTRY_SOURCE_PACK_HASH);
  expect(fixture.researchManifestSha256).toBe(CONDITIONAL_SELF_ENTRY_RESEARCH_HASH);
  expect(records).toHaveLength(33);
  expect(CONDITIONAL_SELF_ENTRY_PERMANENTS).toHaveLength(2);
  for (const recipe of CONDITIONAL_SELF_ENTRY_PERMANENTS) {
    const source = candidate(recipe.name);
    expect(await semanticHash(source.oracle)).toBe(source.versionHash);
    expect(bindDevelopmentCard(source, previousOptions).kind).toBe("unsupported");
    const result = bindDevelopmentCard(source, options);
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw new Error(result.reason);
    expect(result.recipes).toEqual([CONDITIONAL_SELF_ENTRY_VERSION]);
    const card = result.definition;
    expect(program(card)).toEqual(
      ConditionalSelfEntryProgram.parse(
        fixture.expectedPrograms[recipe.identity as keyof typeof fixture.expectedPrograms],
      ),
    );
    expect(card).toMatchObject({
      id: `oracle:${recipe.identity}`,
      oracleId: recipe.identity,
      sourceVersion: recipe.sourceVersion,
      name: recipe.name,
      oracleText: source.oracle.oracle_text,
      typeLine: source.oracle.type_line,
      types: ["Creature"],
      subtypes: recipe.subtypes,
      supertypes: recipe.commanderEligible ? ["Legendary"] : [],
      colors: ["U"],
      colorIdentity: ["U"],
      manaCost: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0, generic: 3 },
      manaValue: 4,
      power: 3,
      toughness: recipe.toughness,
      keywords: [],
      manaAbilities: [],
      commanderEligible: recipe.commanderEligible,
      deckLimit: 1,
    });
    expect(card.triggerPrograms).toHaveLength(1);
    expect(card.spellProgram).toBeUndefined();
    expect(card.staticPrograms).toBeUndefined();
    expect(reviewedConditionalSelfEntryDefinition(card)).toBe(true);
    const proof = fixture.sourceProofs.find((row) => row.identity === recipe.identity);
    expect(proof?.rawRecordHash).toBe(recipe.rawRecordHash);
    expect(proof?.ordinal).toBe(recipe.sourceOrdinal);
    for (const rule of ["603.4", "608.2a", "109.5"])
      expect(card.obligations).toContain(`rule:${rule}`);
  }
  const donatello = bound("Donatello, Turtle Techie");
  expect(donatello.obligations).toContain("rule:201.5c");
  expect(donatello.commanderEligible).toBe(true);
  const noCommander = candidate(donatello.name);
  noCommander.eligibility = noCommander.eligibility.filter((row) => row.role !== "commander");
  expect(bindConditionalSelfEntryPermanent(noCommander)).toBeNull();
  expect(fixture.rulings).toHaveLength(1);
  expect(fixture.rulings[0]?.payload.oracle_id).toBe(donatello.oracleId);
});
test("all31 authenticated related whole bodies remain excluded from the narrow artifact condition", () => {
  expect(fixture.contrasts).toHaveLength(31);
  for (const contrast of fixture.contrasts) {
    const source = candidate(contrast.name);
    expect(source.oracle.oracle_text).toBe(contrast.wholeOracleBody);
    expect(bindConditionalSelfEntryPermanent(source)).toBeNull();
    expect(bindDevelopmentCard(source, options).kind).toBe("unsupported");
  }
});
const sourceMutations: Record<string, (card: CatalogCard) => void> = {
  identity: (c) => {
    c.identity = "unknown";
  },
  oracleIdentity: (c) => {
    c.oracle.oracle_id = "00000000-0000-4000-8000-000000000000";
  },
  version: (c) => {
    c.versionHash = "0".repeat(64);
  },
  archive: (c) => {
    c.sourceArchiveHash = "0".repeat(64);
  },
  ordinal: (c) => {
    c.sourceOrdinal++;
  },
  bundle: (c) => {
    c.bundleHash = "0".repeat(64);
  },
  eligibility: (c) => {
    c.eligibility = [];
  },
  name: (c) => {
    c.oracle.name += " altered";
  },
  layout: (c) => {
    c.oracle.layout = "transform";
  },
  faces: (c) => {
    c.oracle.card_faces = [];
  },
  body: (c) => {
    c.oracle.oracle_text += "\nDraw a card.";
  },
  missingBody: (c) => {
    delete c.oracle.oracle_text;
  },
  bodyWhitespace: (c) => {
    c.oracle.oracle_text += " ";
  },
  cost: (c) => {
    c.oracle.mana_cost = "{X}";
  },
  hybrid: (c) => {
    c.oracle.mana_cost = "{W/B}";
  },
  missingCost: (c) => {
    delete c.oracle.mana_cost;
  },
  costValue: (c) => {
    c.oracle.cmc = (c.oracle.cmc ?? 0) + 1;
  },
  type: (c) => {
    c.oracle.type_line += " Planeswalker";
  },
  aura: (c) => {
    c.oracle.type_line = "Enchantment — Aura";
  },
  power: (c) => {
    c.oracle.power = "*";
  },
  toughness: (c) => {
    c.oracle.toughness = "*";
  },
  colors: (c) => {
    c.oracle.colors = ["C"];
  },
  colorIdentity: (c) => {
    c.oracle.color_identity = ["C"];
  },
  keyword: (c) => {
    c.oracle.keywords = [...c.oracle.keywords, "Haste"];
  },
  loyalty: (c) => {
    c.oracle.loyalty = "3";
  },
  defense: (c) => {
    c.oracle.defense = "3";
  },
  indicator: (c) => {
    c.oracle.color_indicator = ["R"];
  },
  legality: (c) => {
    c.oracle.legalities.commander = "banned";
  },
  digital: (c) => {
    c.oracle.digital = !c.oracle.digital;
  },
  games: (c) => {
    c.oracle.games = [];
  },
};

test("both conditional sources reject altered provenance, full text, costs, types and source characteristics", () => {
  for (const recipe of CONDITIONAL_SELF_ENTRY_PERMANENTS)
    for (const change of Object.values(sourceMutations)) {
      const source = candidate(recipe.name);
      change(source);
      expect(bindConditionalSelfEntryPermanent(source)).toBeNull();
      expect(bindDevelopmentCard(source, options).kind).toBe("unsupported");
    }
});
test("erasing or changing the condition cannot downgrade a known source identity or source version", () => {
  for (const recipe of CONDITIONAL_SELF_ENTRY_PERMANENTS)
    for (const body of [
      "",
      "When this creature enters, draw a card.",
      recipe.oracleText.replace("an artifact", "an enchantment"),
      recipe.oracleText.replace("an artifact", "another artifact"),
      recipe.oracleText.replace("draw a card", "you may draw a card"),
      `${recipe.oracleText}\nFlying`,
    ]) {
      const source = candidate(recipe.name);
      source.oracle.oracle_text = body;
      source.oracle.keywords = [];
      for (const opts of [previousOptions, options])
        expect(bindDevelopmentCard(source, opts).kind).toBe("unsupported");
      source.identity = "00000000-0000-4000-8000-000000000000";
      source.oracle.oracle_id = source.identity;
      expect(bindDevelopmentCard(source, options).kind).toBe("unsupported");
    }
});
test("exact reconstruction rejects source relabeling, unconditional substitution and condition/program mutations", () => {
  const changes: ((card: CardDefinition) => void)[] = [
    (d) => {
      delete d.triggerPrograms;
    },
    (d) => {
      d.implementationRevision = "self-entry-creature/1";
    },
    (d) => {
      d.oracleText = "When this creature enters, draw a card.";
    },
    (d) => {
      d.id = "unknown";
    },
    (d) => {
      d.oracleId = "unknown";
    },
    (d) => {
      d.sourceVersion = "0".repeat(64);
    },
    (d) => {
      d.power = null;
    },
    (d) => {
      d.toughness = 99;
    },
    (d) => {
      d.types.push("Artifact");
    },
    (d) => {
      d.subtypes = [];
    },
    (d) => {
      d.supertypes = [];
    },
    (d) => {
      d.commanderEligible = !d.commanderEligible;
    },
    (d) => {
      d.colorIdentity.push("W");
    },
    (d) => {
      d.manaCost = null;
    },
    (d) => {
      d.keywords = ["flying"];
    },
    (d) => {
      d.obligations = [];
    },
    (d) => {
      d.triggerPrograms = [
        {
          schema: "commander-trigger/1",
          id: "self-entry-0",
          trigger: {
            kind: "self-enters-battlefield",
            view: "post-committed-event",
            placementClass: "ordinary",
          },
          choice: { kind: "mandatory" },
          effect: { kind: "draw", recipient: "trigger-controller", amount: 1 },
        },
      ];
    },
  ];
  for (const recipe of CONDITIONAL_SELF_ENTRY_PERMANENTS) {
    const original = bound(recipe.name);
    for (const change of changes) {
      const card = structuredClone(original);
      change(card);
      if (canonicalJson(card) === canonicalJson(original)) continue;
      expect(reviewedConditionalSelfEntryDefinition(card)).toBe(false);
    }
    const changed = structuredClone(original);
    const conditional = program(changed);
    conditional.id += "-changed";
    changed.triggerPrograms = [conditional];
    expect(reviewedConditionalSelfEntryDefinition(changed)).toBe(false);
  }
});
test("conditional schema accepts only current artifact-existence and one mandatory draw without hidden cached state", () => {
  const original = program(bound("Scholar of Stars"));
  const alternatives: unknown[] = [
    { ...original, interveningIf: undefined },
    { ...original, interveningIf: { kind: "controls-permanent", types: ["Enchantment"] } },
    { ...original, interveningIf: { kind: "controls-permanent", types: ["Artifact", "Creature"] } },
    { ...original, interveningIf: { kind: "controls-permanent", types: [] } },
    {
      ...original,
      interveningIf: { kind: "controls-permanent", types: ["Artifact"], controller: "opponent" },
    },
    {
      ...original,
      interveningIf: { kind: "controls-permanent", types: ["Artifact"], cached: true },
    },
    {
      ...original,
      interveningIf: { kind: "controls-permanent", types: ["Artifact"], witness: "object:1" },
    },
    { ...original, choice: { kind: "optional" } },
    { ...original, effects: [] },
    { ...original, effects: [...original.effects, ...original.effects] },
    { ...original, effects: [{ kind: "draw", recipient: "trigger-controller", amount: 2 }] },
    { ...original, effects: [{ kind: "draw", recipient: "source-controller", amount: 1 }] },
    { ...original, trigger: { ...original.trigger, view: "pre-committed-event" } },
    { ...original, trigger: { ...original.trigger, kind: "permanent-enters-battlefield" } },
  ];
  for (const value of alternatives)
    expect(ConditionalSelfEntryProgram.safeParse(value).success).toBe(false);
});
