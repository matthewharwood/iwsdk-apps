import { expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  type CardDefinition,
  canonicalJson,
  EntryCausedTriggerProgram,
  semanticHash,
} from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/strict-proctor.json";
import { bindDevelopmentCard } from "./index";
import {
  bindStrictProctorPermanent,
  reviewedStrictProctorDefinition,
  STRICT_PROCTOR_PERMANENTS,
  STRICT_PROCTOR_RESEARCH_HASH,
  STRICT_PROCTOR_SOURCE_REVIEW_HASH,
  STRICT_PROCTOR_VERSION,
} from "./strict-proctor";

const records = fixture.records.map((row) => CatalogCardSchema.parse(row));
const previousOptions = {
  conditionalSelfEntryTriggers: true,
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
const options = { ...previousOptions, strictProctorTriggers: true };
function source(): CatalogCard {
  const row = records.find((card) => card.oracle.name === "Strict Proctor");
  if (!row) throw new Error("Missing authenticated source");
  return structuredClone(row);
}
function bound(): CardDefinition {
  const result = bindStrictProctorPermanent(source());
  if (!result) throw new Error("Missing complete binding");
  return result;
}
const expectedProgram: EntryCausedTriggerProgram = {
  schema: "commander-entry-caused-trigger/1",
  id: "strict-proctor:b967870d-9773-4ad5-bf06-c3be5465dab9:0",
  trigger: {
    kind: "ability-triggered",
    immediateCause: "battlefield-entry",
    sourceZone: "battlefield",
    view: "post-committed-event",
    placementClass: "triggered-by-trigger",
  },
  effect: {
    kind: "counter-referenced-trigger-unless-paid",
    reference: "triggering-ability",
    payer: "referenced-ability-controller",
    cost: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
  },
};

test("exact whole Strict Proctor source retains flying and independently proposed causal reference plus owned generic tax", async () => {
  const { hash, ...body } = fixture;
  expect(await semanticHash(body)).toBe(hash);
  expect(hash).toBe("7c6b2e1dc79fbcd172d443a35ae7630dd20c12843f9e80455953757c30e3562e");
  expect(fixture.researchManifestSha256).toBe(STRICT_PROCTOR_RESEARCH_HASH);
  expect(fixture.sourceReviewHash).toBe(STRICT_PROCTOR_SOURCE_REVIEW_HASH);
  expect(STRICT_PROCTOR_PERMANENTS).toHaveLength(1);
  expect(records).toHaveLength(12);
  const input = source();
  expect(await semanticHash(input.oracle)).toBe(input.versionHash);
  expect(bindDevelopmentCard(input, previousOptions).kind).toBe("unsupported");
  const result = bindDevelopmentCard(input, options);
  expect(result.kind).toBe("bound");
  if (result.kind !== "bound") throw new Error(result.reason);
  expect(result.recipes).toEqual([STRICT_PROCTOR_VERSION]);
  const card = result.definition;
  expect(card).toMatchObject({
    id: `oracle:${input.identity}`,
    oracleId: input.identity,
    sourceVersion: input.versionHash,
    name: "Strict Proctor",
    typeLine: "Creature — Spirit Cleric",
    types: ["Creature"],
    subtypes: ["Spirit", "Cleric"],
    supertypes: [],
    colors: ["W"],
    colorIdentity: ["W"],
    manaCost: { generic: 1, W: 1, U: 0, B: 0, R: 0, G: 0, C: 0 },
    manaValue: 2,
    power: 1,
    toughness: 3,
    keywords: ["flying"],
    manaAbilities: [],
    commanderEligible: false,
    deckLimit: 1,
    oracleText: input.oracle.oracle_text,
  });
  expect(card.triggerPrograms).toEqual([expectedProgram]);
  expect(card.spellProgram).toBeUndefined();
  expect(card.staticPrograms).toBeUndefined();
  expect(reviewedStrictProctorDefinition(card)).toBe(true);
  for (const rule of [
    "603.3b",
    "118.12a",
    "118.3c",
    "608.2g",
    "608.2h",
    "800.4f",
    "115.10a",
    "701.6a",
  ])
    expect(card.obligations).toContain(`rule:${rule}`);
  expect(fixture.rulings).toHaveLength(3);
  for (const ruling of fixture.rulings) expect(ruling.payload.oracle_id).toBe(input.identity);
});

test("all11 authenticated contrast bodies remain excluded from the single complete meta-tax constructor", async () => {
  expect(fixture.contrasts).toHaveLength(11);
  for (const contrast of fixture.contrasts) {
    const card = records.find((row) => row.identity === contrast.identity);
    if (!card) throw new Error("Missing full contrast");
    expect(card.oracle.oracle_text).toBe(contrast.wholeOracleBody);
    expect(await semanticHash(card.oracle)).toBe(card.versionHash);
    expect(bindStrictProctorPermanent(card)).toBeNull();
    expect(bindDevelopmentCard(card, options).kind).toBe("unsupported");
  }
});
const sourceChanges: Record<string, (card: CatalogCard) => void> = {
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
    c.oracle.name += " changed";
  },
  body: (c) => {
    c.oracle.oracle_text += "\nDraw a card.";
  },
  whitespace: (c) => {
    c.oracle.oracle_text += " ";
  },
  missingBody: (c) => {
    delete c.oracle.oracle_text;
  },
  cost: (c) => {
    c.oracle.mana_cost = "{W/W}";
  },
  xCost: (c) => {
    c.oracle.mana_cost = "{X}{W}";
  },
  missingCost: (c) => {
    delete c.oracle.mana_cost;
  },
  manaValue: (c) => {
    c.oracle.cmc = 3;
  },
  power: (c) => {
    c.oracle.power = "*";
  },
  toughness: (c) => {
    c.oracle.toughness = "4";
  },
  type: (c) => {
    c.oracle.type_line += " Planeswalker";
  },
  subtype: (c) => {
    c.oracle.type_line = "Creature — Spirit";
  },
  legendary: (c) => {
    c.oracle.type_line = "Legendary Creature — Spirit Cleric";
  },
  keywords: (c) => {
    c.oracle.keywords = [];
  },
  extraKeyword: (c) => {
    c.oracle.keywords.push("Ward");
  },
  colors: (c) => {
    c.oracle.colors = [];
  },
  identityColor: (c) => {
    c.oracle.color_identity = ["B"];
  },
  layout: (c) => {
    c.oracle.layout = "transform";
  },
  faces: (c) => {
    c.oracle.card_faces = [];
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
  handModifier: (c) => {
    c.oracle.hand_modifier = "1";
  },
  lifeModifier: (c) => {
    c.oracle.life_modifier = "1";
  },
  digital: (c) => {
    c.oracle.digital = true;
  },
  games: (c) => {
    c.oracle.games = ["mtgo"];
  },
  legality: (c) => {
    c.oracle.legalities.commander = "banned";
  },
};
for (const [name, change] of Object.entries(sourceChanges))
  test(`Strict Proctor source rejects altered ${name}`, () => {
    const card = source();
    change(card);
    expect(bindStrictProctorPermanent(card)).toBeNull();
    expect(bindDevelopmentCard(card, options).kind).toBe("unsupported");
  });

test("erased or altered complete tax body cannot downgrade known identity or known version into legacy keywords", () => {
  const original = source().oracle.oracle_text ?? "";
  for (const body of [
    "",
    "Flying",
    original.replace("unless its controller pays {2}", ""),
    original.replace("{2}", "{3}"),
    original.replace("counter that ability", "counter target ability"),
    original.replace("a permanent entering", "an artifact entering"),
    original.replace("its controller", "you"),
    `${original}\nYou gain 1 life.`,
  ]) {
    const card = source();
    card.oracle.oracle_text = body;
    card.oracle.keywords = body.includes("Flying") ? ["Flying"] : [];
    for (const opts of [previousOptions, options])
      expect(bindDevelopmentCard(card, opts).kind).toBe("unsupported");
    card.identity = "00000000-0000-4000-8000-000000000000";
    card.oracle.oracle_id = card.identity;
    expect(bindDevelopmentCard(card, options).kind).toBe("unsupported");
  }
});

test("exact definition reconstruction rejects relabeling, removed typed marker and altered printed characteristics", () => {
  const mutations: ((d: CardDefinition) => void)[] = [
    (d) => {
      delete d.triggerPrograms;
    },
    (d) => {
      d.implementationRevision = "commander-development-recipes/1";
    },
    (d) => {
      d.oracleText = "Flying";
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
      d.toughness = 4;
    },
    (d) => {
      d.types.push("Artifact");
    },
    (d) => {
      d.subtypes = [];
    },
    (d) => {
      d.supertypes = ["Legendary"];
    },
    (d) => {
      d.commanderEligible = true;
    },
    (d) => {
      d.manaCost = null;
    },
    (d) => {
      d.manaValue = 3;
    },
    (d) => {
      d.keywords = [];
    },
    (d) => {
      d.colorIdentity = ["B"];
    },
    (d) => {
      d.obligations = [];
    },
    (d) => {
      d.deckLimit = null;
    },
    (d) => {
      d.spellProgram = {
        schema: "commander-spell/1",
        target: null,
        effects: [{ kind: "draw", recipient: "controller", amount: 1 }],
      };
    },
  ];
  for (const change of mutations) {
    const card = bound();
    change(card);
    expect(reviewedStrictProctorDefinition(card)).toBe(false);
  }
  const card = bound();
  const program = EntryCausedTriggerProgram.parse(card.triggerPrograms?.[0]);
  program.id += "-changed";
  card.triggerPrograms = [program];
  expect(reviewedStrictProctorDefinition(card)).toBe(false);
});

test("strict causal meta schema rejects ancestry, target substitution, wrong payer or phase and non-generic payment", () => {
  const original = EntryCausedTriggerProgram.parse(expectedProgram);
  const mutations: unknown[] = [
    { ...original, choice: { kind: "optional" } },
    { ...original, trigger: { ...original.trigger, immediateCause: "any-descendant-of-entry" } },
    { ...original, trigger: { ...original.trigger, kind: "permanent-enters-battlefield" } },
    { ...original, trigger: { ...original.trigger, sourceZone: "graveyard" } },
    { ...original, trigger: { ...original.trigger, view: "pre-committed-event" } },
    { ...original, trigger: { ...original.trigger, placementClass: "ordinary" } },
    { ...original, effect: { ...original.effect, reference: "target-ability" } },
    { ...original, effect: { ...original.effect, payer: "trigger-controller" } },
    {
      ...original,
      effect: { ...original.effect, cost: { ...original.effect.cost, generic: 0, C: 2 } },
    },
    { ...original, effect: { ...original.effect, cost: { ...original.effect.cost, generic: 3 } } },
    { ...original, effect: { ...original.effect, cost: { ...original.effect.cost, U: 1 } } },
    { ...original, effect: { ...original.effect, skipIfReferenceAbsent: true } },
    { ...original, effect: { ...original.effect, refundIfAbsent: true } },
    { ...original, effect: { ...original.effect, target: "triggering-ability" } },
  ];
  for (const value of mutations) {
    expect(canonicalJson(value)).not.toBe(canonicalJson(original));
    expect(EntryCausedTriggerProgram.safeParse(value).success).toBe(false);
  }
});
