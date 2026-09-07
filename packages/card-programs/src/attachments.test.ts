import { expect, test } from "bun:test";
import { CatalogCardSchema } from "@iwsdk-apps/catalog";
import { type CardDefinition, canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/attachments.json";
import contrasts from "../test-fixtures/attachments-contrasts.json";
import {
  ATTACHMENT_PERMANENTS,
  ATTACHMENT_VERSION,
  bindAttachmentPermanent,
  reviewedAttachmentDefinition,
} from "./attachments";
import { bindDevelopmentCard, KEYWORD_RULES } from "./index";

const records = fixture.records.map((r) => CatalogCardSchema.parse(r));
function bound(index: number) {
  const row = records[index];
  if (!row) throw Error("Missing source");
  const definition = bindAttachmentPermanent(row);
  if (!definition) throw Error(row.oracle.name);
  return { row, definition };
}
test("151 complete authenticated bodies preserve printed facts and separate intrinsic keywords from live grants", async () => {
  expect(records).toHaveLength(151);
  expect(ATTACHMENT_PERMANENTS).toHaveLength(151);
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
    expect(canonicalJson(definition.attachmentProgram)).toBe(canonicalJson(expected.program));
    expect(definition.implementationRevision).toBe(ATTACHMENT_VERSION);
    expect(definition.manaAbilities).toEqual([]);
    expect(definition.triggerPrograms).toBeUndefined();
    expect(definition.activatedPrograms).toBeUndefined();
    expect(definition.spellProgram).toBeUndefined();
    expect(reviewedAttachmentDefinition(definition)).toBe(true);
    expect(bindDevelopmentCard(row, { attachmentPermanents: true })).toEqual({
      kind: "bound",
      definition,
      recipes: [ATTACHMENT_VERSION],
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
      r.oracle.mana_cost = "{999}";
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
      r.oracle.games = [];
    },
  ],
];
for (const [name, mutate] of sourceMutations)
  test(`whole-source guard rejects ${name} for every attachment identity`, () => {
    for (const original of records) {
      const r = structuredClone(original);
      mutate(r);
      expect(bindAttachmentPermanent(r)).toBeNull();
      expect(bindDevelopmentCard(r, { attachmentPermanents: true }).kind).toBe("unsupported");
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
      expect(reviewedAttachmentDefinition(d)).toBe(false);
    }
  });

const programMutations: [string, (d: CardDefinition) => void][] = [
  [
    "program erased",
    (d) => {
      delete d.attachmentProgram;
    },
  ],
  [
    "power contribution",
    (d) => {
      if (d.attachmentProgram) d.attachmentProgram.attachedModifier.powerDelta++;
    },
  ],
  [
    "toughness contribution",
    (d) => {
      if (d.attachmentProgram) d.attachmentProgram.attachedModifier.toughnessDelta++;
    },
  ],
  [
    "granted keywords",
    (d) => {
      const p = d.attachmentProgram;
      if (p)
        p.attachedModifier.keywords = p.attachedModifier.keywords.includes("shadow")
          ? []
          : [...p.attachedModifier.keywords, "shadow"];
    },
  ],
  [
    "extra static instruction",
    (d) => {
      if (d.attachmentProgram)
        Object.assign(d.attachmentProgram, { extra: { kind: "draw", amount: 1 } });
    },
  ],
  [
    "legacy downgrade and marker erasure",
    (d) => {
      delete d.attachmentProgram;
      d.implementationRevision = "commander-development-recipes/1";
      d.oracleText = "";
    },
  ],
];
for (const [name, mutate] of programMutations)
  test(`whole attachment reconstruction rejects ${name}`, () => {
    for (let i = 0; i < records.length; i++) {
      const d = structuredClone(bound(i).definition);
      mutate(d);
      expect(reviewedAttachmentDefinition(d)).toBe(false);
    }
  });
test("all sixty-four nested equip programs retain exact source, timing, target and payment", () => {
  let equipment = 0;
  for (let i = 0; i < records.length; i++) {
    const { definition } = bound(i),
      program = definition.attachmentProgram;
    if (program?.schema !== "commander-equipment/1") continue;
    equipment++;
    expect(program.equip).toMatchObject({
      schema: "commander-equip/1",
      id: "equip:0",
      sourceZone: "battlefield",
      timing: "sorcery",
      target: "creature-you-control",
      cost: { tapSource: false },
      effects: [{ kind: "attach-source", recipient: "target" }],
    });
    for (const mutation of [
      (p: typeof program) => {
        p.equip.cost.mana.generic++;
      },
      (p: typeof program) => {
        Object.assign(p.equip.cost, { mana: null });
      },
      (p: typeof program) => {
        Object.assign(p.equip.cost, { tapSource: true });
      },
      (p: typeof program) => {
        Object.assign(p.equip, { timing: "priority" });
      },
      (p: typeof program) => {
        Object.assign(p.equip, { target: "creature" });
      },
      (p: typeof program) => {
        Object.assign(p.equip, { sourceZone: "hand" });
      },
      (p: typeof program) => {
        p.equip.id = "different:0";
      },
      (p: typeof program) => {
        Object.assign(p.equip, { effects: [{ kind: "draw", amount: 1, recipient: "controller" }] });
      },
    ]) {
      const mutant = structuredClone(definition);
      const p = mutant.attachmentProgram;
      if (p?.schema !== "commander-equipment/1") throw Error("Wrong fixture");
      mutation(p);
      expect(reviewedAttachmentDefinition(mutant)).toBe(false);
    }
  }
  expect(equipment).toBe(64);
});
test("all eighty-seven Auras retain creature enchant restriction distinct from equipped control", () => {
  let auras = 0;
  for (let i = 0; i < records.length; i++) {
    const { definition } = bound(i);
    if (definition.attachmentProgram?.schema !== "commander-aura/1") continue;
    auras++;
    for (const value of ["creature-you-control", "permanent", "player"]) {
      const d = structuredClone(definition);
      Object.assign(d.attachmentProgram ?? {}, { enchant: value });
      expect(reviewedAttachmentDefinition(d)).toBe(false);
    }
  }
  expect(auras).toBe(87);
});
const named = (name: string) => bound(records.findIndex((r) => r.oracle.name === name)).definition;
test("intrinsic indestructible and shroud never spill into the attached recipient", () => {
  const axe = named("Darksteel Axe"),
    plate = named("Darksteel Plate"),
    daggers = named("Vibranium Energy Daggers"),
    immunity = named("Diplomatic Immunity");
  expect(axe.keywords).toEqual(["indestructible"]);
  expect(axe.attachmentProgram?.attachedModifier).toEqual({
    powerDelta: 2,
    toughnessDelta: 0,
    keywords: [],
  });
  expect(daggers.keywords).toEqual(["indestructible"]);
  expect(daggers.attachmentProgram?.attachedModifier).toEqual({
    powerDelta: 2,
    toughnessDelta: 2,
    keywords: [],
  });
  expect(plate.keywords).toEqual(["indestructible"]);
  expect(plate.attachmentProgram?.attachedModifier.keywords).toEqual(["indestructible"]);
  expect(immunity.keywords).toEqual(["shroud"]);
  expect(immunity.attachmentProgram?.attachedModifier.keywords).toEqual(["shroud"]);
  expect(named("Alexi's Cloak").keywords).toEqual(["flash"]);
  expect(named("Alexi's Cloak").attachmentProgram?.attachedModifier.keywords).toEqual(["shroud"]);
});
test("printed extreme modifiers and explicit zero equip remain exact", () => {
  expect(named("Stoneskin").attachmentProgram?.attachedModifier.toughnessDelta).toBe(10);
  expect(named("Chant of the Skifsang").attachmentProgram?.attachedModifier.powerDelta).toBe(-13);
  const shuko = named("Shuko").attachmentProgram,
    greaves = named("Lightning Greaves").attachmentProgram;
  for (const p of [shuko, greaves]) {
    if (p?.schema !== "commander-equipment/1") throw Error("Missing equip");
    expect(p.equip.cost.mana.generic).toBe(0);
    expect(p.equip.cost.mana).not.toBeNull();
  }
  expect(named("Barbed Battlegear").attachmentProgram?.attachedModifier).toEqual({
    powerDelta: 4,
    toughnessDelta: -1,
    keywords: [],
  });
});
test("each intrinsic and attached keyword retains its precise rule obligation", () => {
  for (let i = 0; i < records.length; i++) {
    const { definition } = bound(i);
    for (const keyword of [
      ...definition.keywords,
      ...(definition.attachmentProgram?.attachedModifier.keywords ?? []),
    ])
      expect(definition.obligations).toContain(`rule:${KEYWORD_RULES[keyword]}`);
  }
});

test("nine complete contrast bodies remain unsupported with extra abilities intact", () => {
  expect(contrasts.records).toHaveLength(9);
  for (const r of contrasts.records) {
    const row = CatalogCardSchema.parse(r);
    expect(bindAttachmentPermanent(row)).toBeNull();
    expect(bindDevelopmentCard(row, { attachmentPermanents: true }).kind).toBe("unsupported");
  }
});
