import { expect, test } from "bun:test";
import {
  bindDamageReplacementPermanent,
  DAMAGE_REPLACEMENT_PERMANENTS,
} from "@iwsdk-apps/card-programs";
import { CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  CardDefinition,
  ContentRelease,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import sourceRows from "../../card-programs/test-fixtures/damage-replacement.json";
import older from "../test-fixtures/strict-proctor-decks.json";
import { buildDevelopmentMatchPlan, DAMAGE_REPLACEMENT_CORE_CAPABILITIES } from "./plan";
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
    "Lady Orca",
    "Tobias Andrion",
    "Plains",
    "Island",
    "Swamp",
    "Mountain",
    "Sorin's Thirst",
    "Repulse",
  ]);
  const definitions: Record<string, CardDefinition> = Object.fromEntries(
    Object.values(older.definitions)
      .filter((d) => names.has(d.name))
      .map((d) => [d.id, CardDefinition.parse(d)]),
  );
  expect(Object.keys(definitions)).toHaveLength(names.size);
  for (const row of sourceRows.records) {
    const definition = bindDamageReplacementPermanent(CatalogCardSchema.parse(row));
    if (definition) definitions[definition.id] = definition;
  }
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-damage-replacement/1",
    sourceBundle: sourceRows.sourceBundle,
    rulesHash: sourceRows.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "damage-closure-unit/1",
    processorAbi: ENGINE_VERSION,
  };
  return ContentRelease.parse({ ...body, hash: await semanticHash(body) });
}
function named(source: ContentRelease, name: string) {
  const d = Object.values(source.definitions).find((d) => d.name === name);
  if (!d) throw new Error(`Missing source: ${name}`);
  return d;
}
async function deck(source: ContentRelease, red: boolean) {
  const commander = red ? "Lady Orca" : "Tobias Andrion";
  const names = red
    ? [
        commander,
        "Furnace of Rath",
        "Dictate of the Twin Gods",
        "Excruciator",
        "Urza's Armor",
        "Sorin's Thirst",
      ]
    : [commander, "Benevolent Unicorn", "Urza's Armor", "Repulse"];
  const body = {
    id: `damage-closure:${commander}`,
    commander: named(source, commander).id,
    entries: [
      ...names.map((name) => ({ definition: named(source, name).id, count: 1 })),
      { definition: named(source, red ? "Mountain" : "Plains").id, count: 47 },
      { definition: named(source, red ? "Swamp" : "Island").id, count: 53 - names.length },
    ].sort((a, b) => a.definition.localeCompare(b.definition)),
  };
  return DeckRevision.parse({ ...body, hash: await semanticHash(body) });
}
test("closed1198 membership authenticates all five whole damage bodies without inventing dependency roots", async () => {
  const source = await fixture();
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1198);
  expect(await semanticHash(REVIEWED_SOURCE_BINDINGS)).toBe(REVIEWED_BINDING_SNAPSHOT.bindingsHash);
  const full = await createFullExecutionRegistry(source);
  expect(Object.keys(full.definitions)).toHaveLength(13);
  for (const recipe of DAMAGE_REPLACEMENT_PERMANENTS) {
    const definition = named(source, recipe.name);
    expect(await semanticHash(definition)).toBe(
      REVIEWED_SOURCE_BINDINGS[recipe.identity]?.definitionHash ?? "missing",
    );
    expect(Object.isFrozen(full.definitions[definition.id]?.damagePrograms)).toBe(true);
    // One-root closure inspection is not deck eligibility or source execution.
    const body = {
      id: `damage-root:${recipe.identity}`,
      commander: definition.id,
      entries: [{ definition: definition.id, count: 1 }],
    };
    const plan = await buildDevelopmentMatchPlan(source, [
      { ...body, hash: await semanticHash(body) },
    ]);
    expect(plan.closure.retained).toEqual([definition.id]);
    expect(plan.closure.blockers).toEqual([]);
    expect(plan.closure.widened).toEqual([]);
  }
});
for (const red of [true, false])
  test(`${red ? "BR" : "WU"} roots retain exact definitions and every required damage capability`, async () => {
    const source = await fixture(),
      d = await deck(source, red);
    const artifact = await createPreparedMatchArtifact(source, [d, d]);
    const prepared = await admitPreparedMatchArtifact(artifact, source, [d, d]);
    expect(Object.keys(prepared.definitions).sort()).toEqual(
      d.entries.map((row) => row.definition).sort(),
    );
    expect(Object.keys(prepared.tokenTemplates)).toEqual([]);
    expect(artifact.compilerVersion).toBe("development-match-plan/13");
    for (const capability of DAMAGE_REPLACEMENT_CORE_CAPABILITIES) {
      expect(artifact.requiredCoreCapabilities).toContain(capability);
      const changed = structuredClone(artifact);
      changed.requiredCoreCapabilities = changed.requiredCoreCapabilities.filter(
        (c) => c !== capability,
      );
      changed.closure.retainedCoreCapabilities = changed.closure.retainedCoreCapabilities.filter(
        (c) => c !== capability,
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
test("source authentication rejects erased damage semantics, downgraded constructors and substituted identities", async () => {
  const source = await fixture(),
    d = await deck(source, true);
  const mutations: ((card: CardDefinition) => void)[] = [
    (card) => {
      delete card.damagePrograms;
    },
    (card) => {
      delete card.damagePrograms;
      card.implementationRevision = "commander-development-recipes/1";
    },
    (card) => {
      card.sourceVersion = "0".repeat(64);
    },
    (card) => {
      card.oracleText = "";
    },
    (card) => {
      if (!card.manaCost) throw new Error("Missing source cost");
      card.manaCost.generic++;
    },
    (card) => {
      card.oracleId = "forged-damage-source";
    },
  ];
  for (const recipe of DAMAGE_REPLACEMENT_PERMANENTS)
    for (const mutate of mutations) {
      const altered = structuredClone(source);
      mutate(named(altered, recipe.name));
      const changed = await rehash(altered);
      await expect(createFullExecutionRegistry(changed)).rejects.toThrow(
        /Unauthenticated definition|Definition dictionary identity mismatch/,
      );
      await expect(createPreparedMatchArtifact(changed, [d, d])).rejects.toThrow(
        /Unauthenticated definition|Definition dictionary identity mismatch/,
      );
    }
  const altered = structuredClone(source);
  named(altered, "Dictate of the Twin Gods").keywords = [];
  await expect(createFullExecutionRegistry(await rehash(altered))).rejects.toThrow(
    "Unauthenticated definition",
  );
});
test("whole identifiers cannot be remapped to escape dependency recognition, including a changed source version", async () => {
  const source = await fixture();
  const original = named(source, "Furnace of Rath");
  const altered = structuredClone(source),
    definition = structuredClone(original);
  delete altered.definitions[original.id];
  definition.id = "oracle:forged-furnace";
  definition.oracleId = "forged-furnace";
  definition.sourceVersion = "a".repeat(64);
  altered.definitions[definition.id] = definition;
  const changed = await rehash(altered);
  await expect(createFullExecutionRegistry(changed)).rejects.toThrow("Unauthenticated definition");
  const body = {
    id: "forged-root",
    commander: definition.id,
    entries: [{ definition: definition.id, count: 1 }],
  };
  const plan = await buildDevelopmentMatchPlan(changed, [
    { ...body, hash: await semanticHash(body) },
  ]);
  expect(plan.closure.blockers).toContain(`unimplemented-definition:${definition.id}`);
  expect(plan.closure.blockers).toContain(`unresolved-dependencies:${definition.id}`);
});
test("damage source inspection retains old/future ABI metadata but those releases cannot execute", async () => {
  const source = await fixture(),
    d = await deck(source, true);
  for (const processorAbi of ["commander-engine/0.16.0", "commander-engine/0.18.0"]) {
    const changed = await rehash({ ...source, processorAbi });
    expect((await verifySourceRelease(changed)).processorAbi).toBe(processorAbi);
    await expect(createFullExecutionRegistry(changed)).rejects.toThrow("incompatible");
    await expect(createPreparedMatchArtifact(changed, [d, d])).rejects.toThrow("incompatible");
    expect((await buildDevelopmentMatchPlan(changed, [d, d])).closure.blockers).toContain(
      `unimplemented-definition:${named(source, "Furnace of Rath").id}`,
    );
  }
});
