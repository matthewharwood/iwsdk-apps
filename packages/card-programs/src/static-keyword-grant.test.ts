import { expect, test } from "bun:test";
import { CatalogCardSchema } from "@iwsdk-apps/catalog";
import { type CardDefinition, canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/static-keyword-grant.json";
import { bindDevelopmentCard, KEYWORD_RULES } from "./index";
import {
  bindStaticKeywordGrant,
  reviewedStaticKeywordGrantDefinition,
  STATIC_KEYWORD_GRANT_VERSION,
  STATIC_KEYWORD_GRANTS,
} from "./static-keyword-grant";

const records = fixture.records.map((r) => CatalogCardSchema.parse(r));
function bound(index: number) {
  const row = records[index];
  if (!row) throw Error("Missing source");
  const definition = bindStaticKeywordGrant(row);
  if (!definition) throw Error(row.oracle.name);
  return { row, definition };
}
test("55 complete authenticated bodies preserve printed facts and separate intrinsic keywords from live grants", async () => {
  expect(records).toHaveLength(55);
  expect(STATIC_KEYWORD_GRANTS).toHaveLength(55);
  for (let i = 0; i < records.length; i++) {
    const { row, definition } = bound(i);
    const expected = fixture.expected[i];
    if (!expected) throw Error("Missing expectation");
    expect(await semanticHash(row.oracle)).toBe(expected.sourceVersion);
    expect(row.versionHash).toBe(expected.sourceVersion);
    expect(row.bundleHash).toBe(fixture.sourceBundle);
    expect(definition.oracleId).toBe(expected.identity);
    expect(definition.sourceVersion).toBe(expected.sourceVersion);
    expect(definition.oracleText).toBe(row.oracle.oracle_text ?? "missing complete Oracle text");
    expect(definition.typeLine).toBe(row.oracle.type_line ?? "missing complete type line");
    expect(definition.power).toBe(row.oracle.power === undefined ? null : Number(row.oracle.power));
    expect(definition.toughness).toBe(
      row.oracle.toughness === undefined ? null : Number(row.oracle.toughness),
    );
    expect(canonicalJson(definition.colors)).toBe(canonicalJson(row.oracle.colors));
    expect(canonicalJson(definition.colorIdentity)).toBe(canonicalJson(row.oracle.color_identity));
    expect(canonicalJson(definition.keywords)).toBe(canonicalJson(expected.intrinsicKeywords));
    expect(canonicalJson(definition.staticKeywordPrograms)).toBe(canonicalJson([expected.program]));
    expect(definition.implementationRevision).toBe(STATIC_KEYWORD_GRANT_VERSION);
    expect(definition.manaAbilities).toEqual([]);
    expect(definition.triggerPrograms).toBeUndefined();
    expect(definition.activatedPrograms).toBeUndefined();
    expect(definition.spellProgram).toBeUndefined();
    expect(reviewedStaticKeywordGrantDefinition(definition)).toBe(true);
    expect(bindDevelopmentCard(row, { staticKeywordGrants: true })).toEqual({
      kind: "bound",
      definition,
      recipes: [STATIC_KEYWORD_GRANT_VERSION],
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
  test(`whole-source guard rejects ${name} for every static-grant identity`, () => {
    for (const original of records) {
      const r = structuredClone(original);
      mutate(r);
      expect(bindStaticKeywordGrant(r)).toBeNull();
      expect(bindDevelopmentCard(r, { staticKeywordGrants: true }).kind).toBe("unsupported");
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
      d.power = 999;
    },
  ],
  [
    "toughness",
    (d) => {
      d.toughness = 999;
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
      expect(reviewedStaticKeywordGrantDefinition(d)).toBe(false);
    }
  });

const programMutations: [string, (d: CardDefinition) => void][] = [
  [
    "program erased",
    (d) => {
      delete d.staticKeywordPrograms;
    },
  ],
  [
    "controller domain",
    (d) => {
      const p = d.staticKeywordPrograms?.[0];
      if (p) p.filter.controller = p.filter.controller === "any" ? "source-controller" : "any";
    },
  ],
  [
    "source exclusion",
    (d) => {
      const p = d.staticKeywordPrograms?.[0];
      if (p) p.filter.excludeSource = !p.filter.excludeSource;
    },
  ],
  [
    "type conjunction",
    (d) => {
      const p = d.staticKeywordPrograms?.[0];
      if (p) p.filter.types = p.filter.types.length === 1 ? ["Artifact", "Creature"] : ["Creature"];
    },
  ],
  [
    "color predicate",
    (d) => {
      const p = d.staticKeywordPrograms?.[0];
      if (p) p.filter.color = p.filter.color === null ? "U" : null;
    },
  ],
  [
    "subtype predicate",
    (d) => {
      const p = d.staticKeywordPrograms?.[0];
      if (p) p.filter.subtype = p.filter.subtype === null ? "Sliver" : null;
    },
  ],
  [
    "granted keyword",
    (d) => {
      const p = d.staticKeywordPrograms?.[0];
      if (p) p.grant = ["defender"];
    },
  ],
];
for (const [name, mutate] of programMutations)
  test(`full constructor rejects ${name}`, () => {
    for (let i = 0; i < records.length; i++) {
      const d = structuredClone(bound(i).definition);
      mutate(d);
      expect(reviewedStaticKeywordGrantDefinition(d)).toBe(false);
    }
  });
test("whole legends and distinct source domains retain their complete semantics", () => {
  const byName = (name: string) =>
    bound(records.findIndex((r) => r.oracle.name === name)).definition;
  const hive = byName("Sliver Hivelord");
  expect(hive.keywords).toEqual([]);
  expect(hive.commanderEligible).toBe(true);
  expect(hive.colorIdentity).toEqual(["B", "G", "R", "U", "W"]);
  expect(hive.staticKeywordPrograms?.[0]).toMatchObject({
    filter: { subtype: "Sliver", excludeSource: false, controller: "source-controller" },
    grant: ["indestructible"],
  });
  const krang = byName("Krang, Utrom Warlord");
  expect(krang.keywords).toEqual(["flying", "trample", "indestructible", "haste"]);
  expect(krang.staticKeywordPrograms?.[0]).toMatchObject({
    filter: { types: ["Artifact", "Creature"], excludeSource: true },
    grant: krang.keywords,
  });
  expect(byName("Bellowing Tanglewurm").staticKeywordPrograms?.[0].filter.color).toBe("G");
  expect(byName("Bloodmark Mentor").staticKeywordPrograms?.[0].filter.color).toBe("R");
  expect(byName("Akroma's Devoted").staticKeywordPrograms?.[0].filter).toMatchObject({
    subtype: "Cleric",
    controller: "any",
  });
  expect(byName("Mass Hysteria").staticKeywordPrograms?.[0].filter).toMatchObject({
    types: ["Creature"],
    controller: "any",
    subtype: null,
  });
  const blurred = structuredClone(records.find((r) => r.oracle.name === "Blur Sliver"));
  if (!blurred) throw Error("Missing source");
  blurred.oracle.oracle_text = "Slivers you control have haste.";
  expect(bindStaticKeywordGrant(blurred)).toBeNull();
});

test("every intrinsic and granted keyword retains its precise source rule obligation", () => {
  for (let i = 0; i < records.length; i++) {
    const { definition } = bound(i);
    for (const keyword of [
      ...definition.keywords,
      ...(definition.staticKeywordPrograms?.[0].grant ?? []),
    ])
      expect(definition.obligations).toContain(`rule:${KEYWORD_RULES[keyword]}`);
  }
});
