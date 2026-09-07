import { expect, test } from "bun:test";
import { CatalogCardSchema } from "@iwsdk-apps/catalog";
import { type CardDefinition, canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/static-evasion.json";
import { bindDevelopmentCard } from "./index";
import {
  bindStaticEvasionPermanent,
  reviewedStaticEvasionDefinition,
  STATIC_EVASION_PERMANENTS,
  STATIC_EVASION_VERSION,
} from "./static-evasion";

const records = fixture.records.map((r) => CatalogCardSchema.parse(r));
function bound(index: number) {
  const row = records[index];
  if (!row) throw Error("Missing raw source");
  const definition = bindStaticEvasionPermanent(row);
  if (!definition) throw Error(row.oracle.name);
  return { row, definition };
}
test("146 complete raw tuples preserve source versions, whole bodies, intrinsic keywords and printed restrictions", async () => {
  expect(records).toHaveLength(146);
  expect(Object.keys(fixture.wholeBodyMappings)).toHaveLength(25);
  expect(STATIC_EVASION_PERMANENTS).toHaveLength(146);
  for (let i = 0; i < records.length; i++) {
    const { row, definition } = bound(i);
    const expected = fixture.expected[i];
    if (!expected) throw Error("Missing expected");
    expect(await semanticHash(row.oracle)).toBe(expected.sourceVersion);
    expect(row.versionHash).toBe(expected.sourceVersion);
    expect(row.sourceArchiveHash).toBe(fixture.sourceArchive);
    expect(row.sourceOrdinal).toBe(expected.sourceOrdinal);
    expect(row.bundleHash).toBe(fixture.sourceBundle);
    expect(definition).toMatchObject({
      name: expected.name,
      oracleText: expected.oracleText,
      oracleId: expected.identity,
      sourceVersion: expected.sourceVersion,
      typeLine: expected.typeLine,
      types: expected.types,
      supertypes: expected.supertypes,
      subtypes: expected.subtypes,
      power: expected.power,
      toughness: expected.toughness,
      manaCost: expected.manaCost,
      manaValue: expected.manaValue,
      colors: expected.colors,
      colorIdentity: expected.colorIdentity,
      keywords: expected.keywords,
    });
    expect(canonicalJson(definition.blockingRestrictions ?? [])).toBe(
      canonicalJson(expected.blockingRestrictions),
    );
    expect(definition.implementationRevision).toBe(STATIC_EVASION_VERSION);
    expect(definition.manaAbilities).toEqual([]);
    expect(definition.spellProgram).toBeUndefined();
    expect(definition.triggerPrograms).toBeUndefined();
    expect(definition.staticPrograms).toBeUndefined();
    expect(definition.damagePrograms).toBeUndefined();
    expect(reviewedStaticEvasionDefinition(definition)).toBe(true);
    expect(bindDevelopmentCard(row, { staticEvasionPermanents: true })).toEqual({
      kind: "bound",
      definition,
      recipes: [STATIC_EVASION_VERSION],
    });
    expect(bindDevelopmentCard(row).kind).toBe("unsupported");
  }
});
const sourceMutations: [string, (row: (typeof records)[number]) => void][] = [
  [
    "body remainder",
    (r) => {
      r.oracle.oracle_text += "\nDraw a card.";
    },
  ],
  [
    "body removal",
    (r) => {
      r.oracle.oracle_text = "";
    },
  ],
  [
    "reminder alteration",
    (r) => {
      r.oracle.oracle_text += " ";
    },
  ],
  [
    "identity",
    (r) => {
      r.identity = "other";
    },
  ],
  [
    "oracle identity",
    (r) => {
      r.oracle.oracle_id = "other";
    },
  ],
  [
    "version",
    (r) => {
      r.versionHash = "f".repeat(64);
    },
  ],
  [
    "archive",
    (r) => {
      r.sourceArchiveHash = "f".repeat(64);
    },
  ],
  [
    "ordinal",
    (r) => {
      r.sourceOrdinal++;
    },
  ],
  [
    "bundle",
    (r) => {
      r.bundleHash = "f".repeat(64);
    },
  ],
  [
    "noncandidate",
    (r) => {
      r.eligibility = [];
    },
  ],
  [
    "cost",
    (r) => {
      r.oracle.mana_cost = "{0}";
    },
  ],
  [
    "types",
    (r) => {
      r.oracle.type_line += " Planeswalker";
    },
  ],
  [
    "power",
    (r) => {
      r.oracle.power = "*";
    },
  ],
  [
    "toughness",
    (r) => {
      r.oracle.toughness = "*";
    },
  ],
  [
    "mana value",
    (r) => {
      r.oracle.cmc = 99;
    },
  ],
  [
    "keywords",
    (r) => {
      r.oracle.keywords.push("Defender");
    },
  ],
  [
    "colors",
    (r) => {
      r.oracle.colors = ["C"];
    },
  ],
  [
    "color identity",
    (r) => {
      r.oracle.color_identity = ["W", "U", "B", "R", "G"];
    },
  ],
  [
    "layout",
    (r) => {
      r.oracle.layout = "transform";
    },
  ],
  [
    "digital",
    (r) => {
      r.oracle.digital = !r.oracle.digital;
    },
  ],
  [
    "games",
    (r) => {
      r.oracle.games = ["arena"];
    },
  ],
];
for (const [name, mutate] of sourceMutations)
  test(`whole-source guard rejects ${name} for every evasion identity`, () => {
    for (const original of records) {
      const r = structuredClone(original);
      mutate(r);
      expect(bindStaticEvasionPermanent(r)).toBeNull();
      expect(bindDevelopmentCard(r, { staticEvasionPermanents: true }).kind).toBe("unsupported");
    }
  });
const definitionMutations: [string, (d: CardDefinition) => void][] = [
  [
    "body",
    (d) => {
      d.oracleText = "";
    },
  ],
  [
    "recipe downgrade",
    (d) => {
      d.implementationRevision = "commander-development-recipes/1";
    },
  ],
  [
    "keyword erasure",
    (d) => {
      d.keywords = ["defender"];
    },
  ],
  [
    "restriction substitution",
    (d) => {
      d.blockingRestrictions = ["cannot-block", "cannot-be-blocked"];
    },
  ],
  [
    "power",
    (d) => {
      d.power = null;
    },
  ],
  [
    "toughness",
    (d) => {
      d.toughness = null;
    },
  ],
  [
    "mana",
    (d) => {
      d.manaCost = null;
    },
  ],
  [
    "hybrid type",
    (d) => {
      d.types.push("Planeswalker");
    },
  ],
  [
    "identity substitution",
    (d) => {
      d.id = "oracle:other";
      d.oracleId = "other";
    },
  ],
  [
    "version substitution",
    (d) => {
      d.sourceVersion = "f".repeat(64);
    },
  ],
  [
    "commander",
    (d) => {
      d.commanderEligible = !d.commanderEligible;
    },
  ],
  [
    "unknown obligations",
    (d) => {
      d.obligations.push("rule:unknown");
    },
  ],
];
for (const [name, mutate] of definitionMutations)
  test(`reconstructed definition rejects ${name} without reading runtime English`, () => {
    for (let i = 0; i < records.length; i++) {
      const d = structuredClone(bound(i).definition);
      mutate(d);
      expect(reviewedStaticEvasionDefinition(d)).toBe(false);
    }
  });
test("intrinsic combinations and the two legendary commanders retain all printed clauses", () => {
  for (const name of [
    "Inkwell Leviathan",
    "Rancid Rats",
    "Invisible Stalker",
    "Gloomwidow",
    "Lady Zhurong, Warrior Queen",
    "Lu Meng, Wu General",
  ]) {
    const i = records.findIndex((r) => r.oracle.name === name);
    const { definition } = bound(i);
    expect(canonicalJson(definition)).not.toContain("undefined");
  }
  const inkwell = bound(records.findIndex((r) => r.oracle.name === "Inkwell Leviathan")).definition;
  expect(inkwell.keywords).toEqual(["trample", "islandwalk", "shroud"]);
  expect(inkwell.types).toEqual(["Artifact", "Creature"]);
  expect(inkwell.toughness).toBe(11);
  const legends = records.map((_, i) => bound(i).definition).filter((d) => d.commanderEligible);
  expect(legends.map((d) => d.name)).toEqual([
    "Lady Zhurong, Warrior Queen",
    "Lu Meng, Wu General",
  ]);
});
