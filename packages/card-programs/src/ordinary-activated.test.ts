import { expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  type CardDefinition,
  canonicalJson,
  OrdinaryActivatedProgram,
  semanticHash,
} from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/ordinary-activated.json";
import shard1 from "../test-fixtures/ordinary-activated-records-1.json";
import shard2 from "../test-fixtures/ordinary-activated-records-2.json";
import shard3 from "../test-fixtures/ordinary-activated-records-3.json";
import shard4 from "../test-fixtures/ordinary-activated-records-4.json";
import { bindDevelopmentCard } from "./index";
import {
  bindOrdinaryActivatedPermanent,
  ORDINARY_ACTIVATED_PERMANENTS,
  ORDINARY_ACTIVATED_VERSION,
  reviewedOrdinaryActivatedDefinition,
} from "./ordinary-activated";

const records = [...shard1, ...shard2, ...shard3, ...shard4].map((row) =>
  CatalogCardSchema.parse(row),
);
const byIdentity = new Map(records.map((row) => [row.identity, row]));
const options = {
  damageReplacementPermanents: true,
  strictProctorTriggers: true,
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
  ordinaryActivatedAbilities: true,
};
function source(identity: string): CatalogCard {
  const found = byIdentity.get(identity);
  if (!found) throw new Error(`Missing authenticated source: ${identity}`);
  return structuredClone(found);
}
function bound(name: string) {
  const row = records.find((record) => record.oracle.name === name);
  if (!row) throw new Error(`Missing source: ${name}`);
  const result = bindOrdinaryActivatedPermanent(row);
  if (!result) throw new Error(`Missing binding: ${name}`);
  return result;
}

test("raw source shard inventory is complete and matches its archived file bytes", async () => {
  let count = 0;
  for (const shard of fixture.recordShards) {
    const data = Bun.file(new URL(`../test-fixtures/${shard.path}`, import.meta.url));
    const bytes = await data.arrayBuffer();
    expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(shard.sha256);
    const rows: unknown[] = await data.json();
    expect(rows).toHaveLength(shard.records);
    count += rows.length;
  }
  expect(count).toBe(321);
  expect(byIdentity.size).toBe(321);
});

test("239 complete activated bodies preserve all source pins, characteristics and reviewed typed expectations", async () => {
  expect(ORDINARY_ACTIVATED_PERMANENTS).toHaveLength(239);
  expect(records).toHaveLength(321);
  const counts: Record<string, number> = {};
  for (const expected of fixture.expected) {
    const input = source(expected.identity);
    expect(await semanticHash(input.oracle)).toBe(expected.sourceVersion);
    expect(input.versionHash).toBe(expected.sourceVersion);
    expect(input.sourceArchiveHash).toBe(fixture.sourceArchive);
    expect(input.sourceOrdinal).toBe(expected.sourceOrdinal);
    expect(input.bundleHash).toBe(fixture.sourceBundle);
    const card = bindOrdinaryActivatedPermanent(input);
    expect(card).not.toBeNull();
    if (!card) throw new Error(expected.name);
    expect(card).toMatchObject({
      name: expected.name,
      oracleId: expected.identity,
      sourceVersion: expected.sourceVersion,
      oracleText: input.oracle.oracle_text,
      typeLine: input.oracle.type_line,
      colors: input.oracle.colors,
      colorIdentity: input.oracle.color_identity,
      power: expected.power,
      toughness: expected.toughness,
      types: expected.types,
      subtypes: expected.subtypes,
      supertypes: expected.supertypes,
      manaCost: expected.manaCost,
      manaValue: expected.manaValue,
      keywords: expected.keywords,
      activatedPrograms: [OrdinaryActivatedProgram.parse(expected.program)],
      manaAbilities: [],
      deckLimit: 1,
    });
    expect(card.commanderEligible).toBe(
      expected.supertypes.some((value) => value === "Legendary") &&
        expected.types.includes("Creature"),
    );
    expect(reviewedOrdinaryActivatedDefinition(card)).toBe(true);
    expect(bindDevelopmentCard(input, options)).toEqual({
      kind: "bound",
      definition: card,
      recipes: [ORDINARY_ACTIVATED_VERSION],
    });
    expect(bindDevelopmentCard(input, { ...options, ordinaryActivatedAbilities: false }).kind).toBe(
      "unsupported",
    );
    expect(card.spellProgram).toBeUndefined();
    expect(card.triggerPrograms).toBeUndefined();
    counts[expected.category] = (counts[expected.category] ?? 0) + 1;
  }
  expect(counts).toEqual({
    "self-pt": 118,
    "self-keyword": 57,
    "target-pt": 22,
    "tap-creature": 22,
    draw: 11,
    "gain-life": 9,
  });
});

test("signed printed power, Snow, self-name, zero mana and tap-only costs retain distinct whole-card semantics", () => {
  const char = bound("Char-Rumbler");
  expect(char.power).toBe(-1);
  expect(char.toughness).toBe(3);
  expect(char.keywords).toEqual(["double-strike"]);
  expect(char.activatedPrograms?.[0].effects).toEqual([
    {
      kind: "modify-creature",
      recipient: "source",
      powerDelta: 1,
      toughnessDelta: 0,
      keywords: [],
      duration: "until-end-of-turn",
    },
  ]);
  expect(bound("Flowstone Hellion").activatedPrograms?.[0].cost).toEqual({
    mana: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    tapSource: false,
  });
  expect(bound("Soulmender").activatedPrograms?.[0].cost).toEqual({ mana: null, tapSource: true });
  expect(bound("Squall Drifter").supertypes).toEqual(["Snow"]);
  expect(bound("Pavel Maliki").activatedPrograms?.[0].target).toBeNull();
  for (const name of [
    "Advanced Hoverguard",
    "Giant Crab",
    "Glimmering Angel",
    "Horror of the Dim",
  ]) {
    const program = bound(name).activatedPrograms?.[0];
    expect(program?.target).toBeNull();
    expect(program?.effects[0]).toMatchObject({ kind: "modify-creature", recipient: "source" });
  }
  for (const row of fixture.expected.filter((card) => card.digital)) {
    const input = source(row.identity);
    expect(input.oracle.digital).toBe(true);
    expect(input.oracle.games).toEqual(row.games);
    expect(bindOrdinaryActivatedPermanent(input)).not.toBeNull();
    input.oracle.digital = false;
    expect(bindOrdinaryActivatedPermanent(input)).toBeNull();
  }
});

const sourceChanges: Record<string, (card: CatalogCard) => void> = {
  identity: (card) => {
    card.identity = "unknown";
  },
  oracleIdentity: (card) => {
    card.oracle.oracle_id = "00000000-0000-4000-8000-000000000000";
  },
  version: (card) => {
    card.versionHash = "0".repeat(64);
  },
  archive: (card) => {
    card.sourceArchiveHash = "0".repeat(64);
  },
  ordinal: (card) => {
    card.sourceOrdinal++;
  },
  bundle: (card) => {
    card.bundleHash = "0".repeat(64);
  },
  eligibility: (card) => {
    card.eligibility = [];
  },
  name: (card) => {
    card.oracle.name += " changed";
  },
  extraAbility: (card) => {
    card.oracle.oracle_text += "\nDraw a card.";
  },
  whitespace: (card) => {
    card.oracle.oracle_text += " ";
  },
  missingBody: (card) => {
    delete card.oracle.oracle_text;
  },
  cost: (card) => {
    card.oracle.mana_cost = "{X}";
  },
  manaValue: (card) => {
    card.oracle.cmc = (card.oracle.cmc ?? 0) + 1;
  },
  type: (card) => {
    card.oracle.type_line += " Planeswalker";
  },
  keywords: (card) => {
    card.oracle.keywords = [...card.oracle.keywords, "Ward"];
  },
  power: (card) => {
    card.oracle.power = "*";
  },
  toughness: (card) => {
    card.oracle.toughness = "*";
  },
  layout: (card) => {
    card.oracle.layout = "transform";
  },
  digital: (card) => {
    card.oracle.digital = !card.oracle.digital;
  },
  games: (card) => {
    card.oracle.games = [];
  },
  legality: (card) => {
    card.oracle.legalities.commander = "banned";
  },
};
for (const [name, mutate] of Object.entries(sourceChanges))
  test(`all 239 exact sources reject ${name} mutation without legacy fallback`, () => {
    for (const expected of fixture.expected) {
      const card = source(expected.identity);
      mutate(card);
      expect(bindOrdinaryActivatedPermanent(card)).toBeNull();
      expect(bindDevelopmentCard(card, options).kind).toBe("unsupported");
    }
  });

test("every explicitly reviewed reminder rejects unknown replacements and additional parenthetical clauses", () => {
  let checked = 0;
  for (const row of fixture.expected)
    for (const reminder of row.reviewedReminders) {
      checked++;
      const input = source(row.identity);
      input.oracle.oracle_text = row.oracleText.replace(
        reminder.literal,
        "This creature also draws a card.",
      );
      expect(bindDevelopmentCard(input, options).kind).toBe("unsupported");
      input.oracle.oracle_text = `${row.oracleText} (Draw a card.)`;
      expect(bindDevelopmentCard(input, options).kind).toBe("unsupported");
    }
  expect(checked).toBe(37);
});

const definitionChanges: Record<string, (card: CardDefinition) => void> = {
  erasedProgram: (card) => {
    delete card.activatedPrograms;
  },
  legacyDowngrade: (card) => {
    delete card.activatedPrograms;
    card.implementationRevision = "commander-development-recipes/1";
    card.oracleText = "";
  },
  identity: (card) => {
    card.id = "oracle:unknown";
  },
  source: (card) => {
    card.sourceVersion = "0".repeat(64);
  },
  body: (card) => {
    card.oracleText += "\nFlying";
  },
  type: (card) => {
    card.types.push("Planeswalker");
  },
  characteristics: (card) => {
    card.power = 999;
  },
  cost: (card) => {
    if (card.manaCost) card.manaCost.generic++;
  },
  commander: (card) => {
    card.commanderEligible = !card.commanderEligible;
  },
  tap: (card) => {
    const p = card.activatedPrograms?.[0];
    if (p) p.cost.tapSource = !p.cost.tapSource;
  },
  mana: (card) => {
    const p = card.activatedPrograms?.[0];
    if (p)
      p.cost.mana =
        p.cost.mana === null ? { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } : null;
  },
  target: (card) => {
    const p = card.activatedPrograms?.[0];
    if (p) p.target = p.target === null ? "creature" : null;
  },
  effect: (card) => {
    const p = card.activatedPrograms?.[0];
    if (p) p.effects[0] = { kind: "gain-life", recipient: "controller", amount: 5 };
  },
};
for (const [name, mutate] of Object.entries(definitionChanges))
  test(`all exact activated definitions reject ${name} semantic mutation`, () => {
    for (const row of fixture.expected) {
      const card = bound(row.name),
        before = canonicalJson(card);
      mutate(card);
      if (canonicalJson(card) === before) continue;
      expect(reviewedOrdinaryActivatedDefinition(card)).toBe(false);
    }
  });

test("62 complete mana/token contrasts remain outside this ordinary constructor and preserve prior binder results", async () => {
  expect(fixture.deferred).toHaveLength(62);
  for (const row of fixture.deferred) {
    const input = source(row.identity);
    expect(await semanticHash(input.oracle)).toBe(input.versionHash);
    expect(bindOrdinaryActivatedPermanent(input)).toBeNull();
    expect(bindDevelopmentCard(input, options)).toEqual(
      bindDevelopmentCard(input, { ...options, ordinaryActivatedAbilities: false }),
    );
  }
});

test("twenty complete contrast bodies preserve one prior binding and reject nineteen unsupported procedures", async () => {
  expect(fixture.additionalContrasts).toHaveLength(20);
  for (const expected of fixture.additionalContrasts) {
    const input = source(expected.identity);
    expect(input.oracle.oracle_text).toBe(expected.wholeOracleBody);
    expect(await semanticHash(input.oracle)).toBe(expected.sourceVersion);
    expect(input.sourceOrdinal).toBe(expected.sourceOrdinal);
    expect(bindOrdinaryActivatedPermanent(input)).toBeNull();
    const result = bindDevelopmentCard(input, options);
    expect(String(result.kind)).toBe(expected.priorDisposition);
    expect(result).toEqual(
      bindDevelopmentCard(input, { ...options, ordinaryActivatedAbilities: false }),
    );
    if (result.kind === "bound") {
      expect(result.definition.name).toBe("Dusk Imp");
      expect(await semanticHash(result.definition)).toBe(expected.definitionHash ?? "missing");
    }
  }
});
