import { expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  type CardDefinition,
  canonicalJson,
  Keyword,
  StaticCreatureBonus,
  semanticHash,
} from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/static-bonus.json";
import { bindDevelopmentCard } from "./index";
import {
  bindStaticBonusPermanent,
  reviewedStaticBonusDefinition,
  STATIC_BONUS_PERMANENTS,
  STATIC_BONUS_RESEARCH_HASH,
  STATIC_BONUS_VERSION,
} from "./static-bonus";

const records = fixture.records.map((row) => CatalogCardSchema.parse(row));
const previousOptions = {
  fixedTokenSpells: true,
  creatureReturnSpells: true,
  counterSpells: true,
  spellFamilies: true,
  selfEntryTriggers: true,
  selfEntrySequences: true,
  temporaryCreatureSpells: true,
  keywordReminders: true,
};
const options = { ...previousOptions, staticBonusPermanents: true };
function candidate(name: string): CatalogCard {
  const card = records.find((row) => row.oracle.name === name);
  if (!card) throw new Error(`Missing authenticated static source: ${name}`);
  return structuredClone(card);
}
function bound(name: string): CardDefinition {
  const definition = bindStaticBonusPermanent(candidate(name));
  if (!definition) throw new Error(`Unbound reviewed static source: ${name}`);
  return definition;
}

test("all41 authenticated complete source tuples bind only by explicit static opt-in", async () => {
  expect(STATIC_BONUS_PERMANENTS).toHaveLength(41);
  expect(records).toHaveLength(68);
  expect(fixture.researchManifestSha256).toBe(STATIC_BONUS_RESEARCH_HASH);
  let creatures = 0;
  let enchantments = 0;
  for (const recipe of STATIC_BONUS_PERMANENTS) {
    const card = candidate(recipe.name);
    expect(await semanticHash(card.oracle)).toBe(card.versionHash);
    expect(bindDevelopmentCard(card, previousOptions).kind).toBe("unsupported");
    const result = bindDevelopmentCard(card, options);
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw new Error(result.reason);
    const definition = result.definition;
    expect(result.recipes).toEqual([STATIC_BONUS_VERSION]);
    expect(definition.staticPrograms?.[0]).toEqual(
      StaticCreatureBonus.parse(
        fixture.expectedPrograms[recipe.identity as keyof typeof fixture.expectedPrograms][0],
      ),
    );
    expect(definition).toMatchObject({
      id: `oracle:${card.identity}`,
      oracleId: card.identity,
      sourceVersion: card.versionHash,
      name: card.oracle.name,
      typeLine: card.oracle.type_line,
      oracleText: card.oracle.oracle_text,
      colors: card.oracle.colors,
      colorIdentity: card.oracle.color_identity,
      manaValue: card.oracle.cmc,
      manaAbilities: [],
      deckLimit: 1,
    });
    const typeParts = definition.typeLine.split(" — ");
    expect([...definition.supertypes, ...definition.types].join(" ")).toBe(typeParts[0] ?? "");
    expect(definition.subtypes.join(" ")).toBe(typeParts[1] ?? "");
    expect(card.oracle.power).toBe(
      definition.power === null ? undefined : String(definition.power),
    );
    expect(card.oracle.toughness).toBe(
      definition.toughness === null ? undefined : String(definition.toughness),
    );
    expect([...definition.keywords].sort()).toEqual(
      card.oracle.keywords
        .map((keyword) => Keyword.parse(keyword.toLowerCase().replaceAll(" ", "-")))
        .sort(),
    );
    expect(Object.values(definition.manaCost ?? {}).reduce((a, b) => a + b, 0)).toBe(
      card.oracle.cmc ?? -1,
    );
    expect(definition.spellProgram).toBeUndefined();
    expect(definition.triggerPrograms).toBeUndefined();
    expect(definition.commanderEligible).toBe(
      definition.types.includes("Creature") && definition.supertypes.includes("Legendary"),
    );
    expect(reviewedStaticBonusDefinition(definition)).toBe(true);
    expect(definition.obligations).not.toContain("rule:undefined");
    if (definition.types.includes("Creature")) creatures++;
    else enchantments++;
  }
  expect([creatures, enchantments]).toEqual([30, 11]);
});

test("all27 authenticated whole-body contrasts remain unsupported with all prior options enabled", async () => {
  expect(fixture.excluded).toHaveLength(27);
  for (const excluded of fixture.excluded) {
    const card = candidate(excluded.name);
    expect(await semanticHash(card.oracle)).toBe(excluded.sourceVersion);
    expect(card.oracle.oracle_text).toBe(excluded.body);
    expect(excluded.reasons.length).toBeGreaterThan(0);
    expect(bindStaticBonusPermanent(card)).toBeNull();
    expect(bindDevelopmentCard(card, options).kind).toBe("unsupported");
  }
});

test("intrinsic abilities and source predicates are separate for Arvad, flash enchantments and self-affecting Slivers", () => {
  const arvad = bound("Arvad the Cursed");
  expect(arvad).toMatchObject({
    keywords: ["deathtouch", "lifelink"],
    power: 3,
    toughness: 3,
    colors: ["B", "W"],
    colorIdentity: ["B", "W"],
    commanderEligible: true,
    manaCost: { generic: 3, W: 1, B: 1 },
  });
  expect(arvad.staticPrograms).toEqual([
    {
      schema: "static-creature-bonus/1",
      kind: "static-creature-bonus",
      activeZone: "battlefield",
      controller: "source-current",
      excludeSource: true,
      predicate: { kind: "legendary" },
      powerDelta: 2,
      toughnessDelta: 2,
      layer: "7c",
    },
  ]);
  expect(bound("Day of Destiny").commanderEligible).toBe(false);
  for (const name of ["Turtle Power!", "Dictate of Heliod"])
    expect(bound(name)).toMatchObject({
      types: ["Enchantment"],
      keywords: ["flash"],
      power: null,
      toughness: null,
    });
  for (const name of [
    "Megantic Sliver",
    "Predatory Sliver",
    "Cleaving Sliver",
    "Steelform Sliver",
    "Battle Sliver",
  ])
    expect(bound(name).staticPrograms?.[0]).toMatchObject({
      excludeSource: false,
      predicate: { kind: "subtype", subtype: "Sliver" },
    });
  expect(bound("Legion Lieutenant").staticPrograms?.[0].predicate).toEqual({
    kind: "subtype",
    subtype: "Vampire",
  });
  expect(bound("White Lotus Reinforcements").keywords).toEqual(["vigilance"]);
});

test("Kobold Taskmaster uses authenticated paper availability without pretending its representative Oracle printing is paper", () => {
  const source = candidate("Kobold Taskmaster");
  expect(source.oracle.digital).toBe(true);
  expect(source.oracle.games).not.toContain("paper");
  const paper = fixture.historicalPaperPrintingRecords[0];
  expect(paper?.payload.oracle_id).toBe(source.identity);
  expect(paper?.payload.id).toBe("1b9c63eb-8d4e-4d8b-8637-308459ef036b");
  expect(paper?.payload.games).toContain("paper");
  expect(paper?.payload.oracle_text).toBe(source.oracle.oracle_text);
  expect(bindStaticBonusPermanent(source)).not.toBeNull();
  source.eligibility = source.eligibility.filter((row) => row.role !== "main-deck");
  expect(bindStaticBonusPermanent(source)).toBeNull();
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
test("each static source rejects altered complete body, provenance, costs and characteristics", () => {
  for (const recipe of STATIC_BONUS_PERMANENTS)
    for (const change of Object.values(sourceMutations)) {
      const card = candidate(recipe.name);
      change(card);
      expect(bindStaticBonusPermanent(card)).toBeNull();
      expect(bindDevelopmentCard(card, options).kind).toBe("unsupported");
    }
});

test("known identity or version cannot fall through to a legacy vanilla definition after body and marker erasure", () => {
  for (const recipe of STATIC_BONUS_PERMANENTS) {
    const card = candidate(recipe.name);
    card.oracle.oracle_text = "";
    card.oracle.keywords = [];
    for (const opts of [previousOptions, options])
      expect(bindDevelopmentCard(card, opts).kind).toBe("unsupported");
    card.identity = "00000000-0000-4000-8000-000000000000";
    card.oracle.oracle_id = card.identity;
    expect(bindDevelopmentCard(card, options).kind).toBe("unsupported");
  }
});

test("exact reconstructed definitions reject static predicate, intrinsic keyword and characteristic downgrades", () => {
  const changes: ((d: CardDefinition) => void)[] = [
    (d) => {
      delete d.staticPrograms;
    },
    (d) => {
      d.implementationRevision = "commander-development-recipes/1";
    },
    (d) => {
      d.oracleText = "";
    },
    (d) => {
      d.id = "other";
    },
    (d) => {
      d.oracleId = "other";
    },
    (d) => {
      d.sourceVersion = "0".repeat(64);
    },
    (d) => {
      d.manaCost = null;
    },
    (d) => {
      d.manaValue++;
    },
    (d) => {
      d.types = ["Creature", "Planeswalker"];
    },
    (d) => {
      d.subtypes = [];
      d.typeLine += " altered";
    },
    (d) => {
      d.supertypes = ["Legendary", "Snow"];
    },
    (d) => {
      d.commanderEligible = !d.commanderEligible;
    },
    (d) => {
      d.power = 99;
    },
    (d) => {
      d.toughness = 99;
    },
    (d) => {
      d.keywords = [...d.keywords, "haste"];
    },
    (d) => {
      d.manaAbilities = ["W"];
    },
    (d) => {
      d.deckLimit = null;
    },
    (d) => {
      d.obligations = [];
    },
    (d) => {
      const p = d.staticPrograms?.[0];
      if (p) p.excludeSource = !p.excludeSource;
    },
    (d) => {
      const p = d.staticPrograms?.[0];
      if (p) p.powerDelta = p.powerDelta === 3 ? 2 : 3;
    },
    (d) => {
      const p = d.staticPrograms?.[0];
      if (p) p.toughnessDelta = p.toughnessDelta === 3 ? 2 : 3;
    },
    (d) => {
      const p = d.staticPrograms?.[0];
      if (p) p.predicate = p.predicate.kind === "all" ? { kind: "legendary" } : { kind: "all" };
    },
    (d) => {
      d.triggerPrograms = [
        {
          schema: "commander-trigger/1",
          id: "unexpected-trigger",
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
  for (const recipe of STATIC_BONUS_PERMANENTS)
    for (const change of changes) {
      const d = bound(recipe.name);
      const old = canonicalJson(d);
      change(d);
      expect(canonicalJson(d)).not.toBe(old);
      expect(reviewedStaticBonusDefinition(d)).toBe(false);
    }
  const p = bound("Arvad the Cursed").staticPrograms?.[0];
  for (const invalid of [
    { ...p, controller: "source-owner" },
    { ...p, activeZone: "command" },
    { ...p, layer: "7b" },
    { ...p, excludeSource: "other" },
    { ...p, predicate: { kind: "subtype", subtype: "Green" } },
    { ...p, predicate: { kind: "legendary", subtype: "Vampire" } },
    { ...p, powerDelta: 0, toughnessDelta: 0 },
    { ...p, powerDelta: -1 },
  ])
    expect(StaticCreatureBonus.safeParse(invalid).success).toBe(false);
});
