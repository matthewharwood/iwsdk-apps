import { expect, test } from "bun:test";
import { bindStrictProctorPermanent, STRICT_PROCTOR_PERMANENTS } from "@iwsdk-apps/card-programs";
import { CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  CardDefinition,
  ContentRelease,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import sourceRows from "../../card-programs/test-fixtures/strict-proctor.json";
import { admitDeck } from "../../engine/src/index";
import older from "../test-fixtures/conditional-self-entry-decks.json";
import {
  buildDevelopmentMatchPlan,
  SELF_ENTRY_CORE_CAPABILITIES,
  STRICT_PROCTOR_CORE_CAPABILITIES,
} from "./plan";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
  verifySourceRelease,
} from "./prepared";
import { REVIEWED_BINDING_SNAPSHOT, REVIEWED_SOURCE_BINDINGS } from "./reviewed-source-bindings";

async function rehash<T extends { hash: string }>(input: T): Promise<T> {
  const { hash: _hash, ...body } = input;
  return { ...body, hash: await semanticHash(body) } as T;
}
async function fixture() {
  const names = new Set([
    "Tobias Andrion",
    "Jasmine Boreal",
    "Island",
    "Plains",
    "Forest",
    "Soul Warden",
    "Jaddi Offshoot",
    "Elvish Visionary",
    "Queen's Commission",
    "Scholar of Stars",
    "Memnite",
    "Repulse",
  ]);
  const definitions: Record<string, CardDefinition> = Object.fromEntries(
    Object.values(older.definitions)
      .filter((d) => names.has(d.name))
      .map((d) => [d.id, CardDefinition.parse(d)]),
  );
  expect(Object.keys(definitions)).toHaveLength(names.size);
  for (const row of sourceRows.records) {
    const d = bindStrictProctorPermanent(CatalogCardSchema.parse(row));
    if (d) definitions[d.id] = d;
  }
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-strict-proctor/1",
    sourceBundle: sourceRows.sourceBundle,
    rulesHash: sourceRows.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    tokenTemplates: structuredClone(older.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "strict-proctor-closure-unit/1",
    processorAbi: ENGINE_VERSION,
  };
  return ContentRelease.parse({ ...body, hash: await semanticHash(body) });
}
function named(source: ContentRelease, name: string): CardDefinition {
  const d = Object.values(source.definitions).find((d) => d.name === name);
  if (!d) throw new Error(`Missing source: ${name}`);
  return d;
}
async function deck(source: ContentRelease, commander: "Tobias Andrion" | "Jasmine Boreal") {
  const names = [
    commander,
    "Strict Proctor",
    "Soul Warden",
    "Queen's Commission",
    ...(commander === "Tobias Andrion"
      ? ["Scholar of Stars", "Memnite", "Repulse"]
      : ["Jaddi Offshoot", "Elvish Visionary"]),
  ];
  const otherBasic = commander === "Tobias Andrion" ? "Island" : "Forest";
  const body = {
    id: `proctor-closure:${commander}`,
    commander: named(source, commander).id,
    entries: [
      ...names.map((name) => ({ definition: named(source, name).id, count: 1 })),
      { definition: named(source, "Plains").id, count: 47 },
      { definition: named(source, otherBasic).id, count: 53 - names.length },
    ].sort((a, b) => a.definition.localeCompare(b.definition)),
  };
  return DeckRevision.parse({ ...body, hash: await semanticHash(body) });
}
test("closed1198 registry binds the whole Proctor source and no external definition dependency", async () => {
  const source = await fixture();
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1198);
  expect(await semanticHash(REVIEWED_SOURCE_BINDINGS)).toBe(REVIEWED_BINDING_SNAPSHOT.bindingsHash);
  const full = await createFullExecutionRegistry(source);
  expect(Object.keys(full.definitions)).toHaveLength(13);
  for (const recipe of STRICT_PROCTOR_PERMANENTS) {
    const d = named(source, recipe.name);
    expect(d.keywords).toContain("flying");
    expect(await semanticHash(d)).toBe(
      REVIEWED_SOURCE_BINDINGS[recipe.identity]?.definitionHash ?? "missing-binding",
    );
    expect(Object.isFrozen(full.definitions[d.id]?.triggerPrograms)).toBe(true);
    const body = {
      id: `proctor-dependency:${recipe.identity}`,
      commander: d.id,
      entries: [{ definition: d.id, count: 1 }],
    };
    // This checks dependency closure only, not Commander deck eligibility.
    const plan = await buildDevelopmentMatchPlan(source, [
      { ...body, hash: await semanticHash(body) },
    ]);
    expect(plan.closure.retained).toEqual([d.id]);
    expect(plan.closure.blockers).toEqual([]);
    expect(plan.closure.widened).toEqual([]);
    expect(plan.closure.excluded).toContain(named(source, "Soul Warden").id);
  }
});
for (const commander of ["Tobias Andrion", "Jasmine Boreal"] as const)
  test(`${commander}: legal roots retain exact token producer edges and every Proctor capability`, async () => {
    const source = await fixture();
    const d = await deck(source, commander);
    admitDeck(d, await createFullExecutionRegistry(source));
    const artifact = await createPreparedMatchArtifact(source, [d, d]);
    const prepared = await admitPreparedMatchArtifact(artifact, source, [d, d]);
    expect(Object.keys(prepared.definitions).sort()).toEqual(
      d.entries.map((e) => e.definition).sort(),
    );
    const producer = named(source, "Queen's Commission");
    const templates =
      producer.spellProgram?.effects.flatMap((e) =>
        e.kind === "create-token" ? [e.templateId] : [],
      ) ?? [];
    expect(templates).toHaveLength(1);
    expect(Object.keys(prepared.tokenTemplates)).toEqual(templates);
    expect(artifact.compilerVersion).toBe("development-match-plan/13");
    for (const cap of [...STRICT_PROCTOR_CORE_CAPABILITIES, ...SELF_ENTRY_CORE_CAPABILITIES]) {
      expect(artifact.requiredCoreCapabilities).toContain(cap);
      const changed = structuredClone(artifact);
      changed.requiredCoreCapabilities = changed.requiredCoreCapabilities.filter((c) => c !== cap);
      changed.closure.retainedCoreCapabilities = changed.closure.retainedCoreCapabilities.filter(
        (c) => c !== cap,
      );
      await expect(
        admitPreparedMatchArtifact(await rehash(changed), source, [d, d]),
      ).rejects.toThrow("does not match");
    }
    for (const field of ["recipeRegistryHash", "analysisHash"] as const)
      await expect(
        admitPreparedMatchArtifact(await rehash({ ...artifact, [field]: "0".repeat(64) }), source, [
          d,
          d,
        ]),
      ).rejects.toThrow("does not match");
  });
test("Proctor body, flying, cost and causal constructor cannot be erased or replaced by an ordinary ETB", async () => {
  const source = await fixture();
  const d = await deck(source, "Tobias Andrion");
  const mutations: ((card: CardDefinition) => void)[] = [
    (card) => {
      card.triggerPrograms = [
        {
          schema: "commander-trigger/1",
          id: "forged-ordinary-etb",
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
    (card) => {
      delete card.triggerPrograms;
    },
    (card) => {
      delete card.triggerPrograms;
      card.oracleText = "Flying";
      card.implementationRevision = "commander-development-recipes/1";
    },
    (card) => {
      card.keywords = [];
    },
    (card) => {
      if (!card.manaCost) throw new Error("Missing printed Proctor mana cost");
      card.manaCost.generic = 0;
    },
    (card) => {
      card.sourceVersion = "0".repeat(64);
    },
    (card) => {
      card.oracleId = "forged-proctor-identity";
    },
  ];
  for (const mutate of mutations) {
    const altered = structuredClone(source);
    mutate(named(altered, "Strict Proctor"));
    const changed = await rehash(altered);
    await expect(createFullExecutionRegistry(changed)).rejects.toThrow(
      /Unauthenticated definition|Definition dictionary identity mismatch/,
    );
    await expect(createPreparedMatchArtifact(changed, [d, d])).rejects.toThrow(
      /Unauthenticated definition|Definition dictionary identity mismatch/,
    );
  }
});
test("Proctor source inspection survives old/future ABIs but runtime admission does not", async () => {
  const source = await fixture();
  const d = await deck(source, "Tobias Andrion");
  for (const processorAbi of ["commander-engine/0.16.0", "commander-engine/0.18.0"]) {
    const altered = await rehash({ ...source, processorAbi });
    expect((await verifySourceRelease(altered)).processorAbi).toBe(processorAbi);
    await expect(createFullExecutionRegistry(altered)).rejects.toThrow("incompatible");
    await expect(createPreparedMatchArtifact(altered, [d, d])).rejects.toThrow("incompatible");
    expect((await buildDevelopmentMatchPlan(altered, [d, d])).closure.blockers).toContain(
      `unimplemented-definition:${named(source, "Strict Proctor").id}`,
    );
  }
});
