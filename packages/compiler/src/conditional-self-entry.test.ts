import { expect, test } from "bun:test";
import {
  bindConditionalSelfEntryPermanent,
  CONDITIONAL_SELF_ENTRY_PERMANENTS,
} from "@iwsdk-apps/card-programs";
import { CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  CardDefinition,
  ContentRelease,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import sourceRows from "../../card-programs/test-fixtures/conditional-self-entry.json";
import { admitDeck } from "../../engine/src/index";
import older from "../test-fixtures/entry-observer-decks.json";
import {
  buildDevelopmentMatchPlan,
  CONDITIONAL_SELF_ENTRY_CORE_CAPABILITIES,
  SELF_ENTRY_CORE_CAPABILITIES,
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
    "Island",
    "Plains",
    "Memnite",
    "Darksteel Sentinel",
    "Repulse",
    "Counterspell",
  ]);
  const definitions: Record<string, CardDefinition> = Object.fromEntries(
    Object.values(older.definitions)
      .filter((d) => names.has(d.name))
      .map((d) => [d.id, CardDefinition.parse(d)]),
  );
  expect(Object.keys(definitions)).toHaveLength(names.size);
  for (const row of sourceRows.records) {
    const d = bindConditionalSelfEntryPermanent(CatalogCardSchema.parse(row));
    if (d) definitions[d.id] = d;
  }
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-conditional-self-entry/1",
    sourceBundle: sourceRows.sourceBundle,
    rulesHash: sourceRows.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    tokenTemplates: structuredClone(older.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "conditional-self-entry-closure-unit/1",
    processorAbi: ENGINE_VERSION,
  };
  return ContentRelease.parse({ ...body, hash: await semanticHash(body) });
}
function named(source: ContentRelease, name: string): CardDefinition {
  const d = Object.values(source.definitions).find((d) => d.name === name);
  if (!d) throw new Error(`Missing source: ${name}`);
  return d;
}
async function deck(
  source: ContentRelease,
  commanderName: "Donatello, Turtle Techie" | "Tobias Andrion",
) {
  const names = [
    commanderName,
    "Scholar of Stars",
    "Memnite",
    "Darksteel Sentinel",
    "Repulse",
    "Counterspell",
  ];
  if (commanderName === "Tobias Andrion") names.push("Donatello, Turtle Techie");
  const body = {
    id: `conditional-closure:${commanderName}`,
    commander: named(source, commanderName).id,
    entries: [
      ...names.map((name) => ({ definition: named(source, name).id, count: 1 })),
      { definition: named(source, "Island").id, count: 100 - names.length },
    ].sort((a, b) => a.definition.localeCompare(b.definition)),
  };
  return DeckRevision.parse({ ...body, hash: await semanticHash(body) });
}
test("closed current registry authenticates both complete conditional source programs", async () => {
  const source = await fixture();
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1789);
  expect(await semanticHash(REVIEWED_SOURCE_BINDINGS)).toBe(REVIEWED_BINDING_SNAPSHOT.bindingsHash);
  const full = await createFullExecutionRegistry(source);
  expect(Object.keys(full.definitions)).toHaveLength(9);
  for (const recipe of CONDITIONAL_SELF_ENTRY_PERMANENTS) {
    const d = named(source, recipe.name);
    expect(await semanticHash(d)).toBe(
      REVIEWED_SOURCE_BINDINGS[recipe.identity]?.definitionHash ?? "missing-binding",
    );
    expect(Object.isFrozen(full.definitions[d.id]?.triggerPrograms)).toBe(true);
    const body = {
      id: `conditional-dependency:${recipe.identity}`,
      commander: d.id,
      entries: [{ definition: d.id, count: 1 }],
    };
    // Dependency-only root is not claimed as a legal Commander deck.
    const plan = await buildDevelopmentMatchPlan(source, [
      { ...body, hash: await semanticHash(body) },
    ]);
    expect(plan.closure.retained).toEqual([d.id]);
    expect(plan.closure.blockers).toEqual([]);
    expect(plan.closure.widened).toEqual([]);
    expect(plan.closure.excluded).toContain(named(source, "Memnite").id);
  }
});
for (const commander of ["Donatello, Turtle Techie", "Tobias Andrion"] as const)
  test(`${commander}: legal roots retain exact cards, condition capabilities and no unrelated artifacts`, async () => {
    const source = await fixture();
    const d = await deck(source, commander);
    admitDeck(d, await createFullExecutionRegistry(source));
    const artifact = await createPreparedMatchArtifact(source, [d, d]);
    const prepared = await admitPreparedMatchArtifact(artifact, source, [d, d]);
    expect(Object.keys(prepared.definitions).sort()).toEqual(
      d.entries.map((e) => e.definition).sort(),
    );
    expect(Object.keys(prepared.tokenTemplates)).toHaveLength(0);
    expect(artifact.compilerVersion).toBe("development-match-plan/17");
    for (const cap of [
      ...CONDITIONAL_SELF_ENTRY_CORE_CAPABILITIES,
      ...SELF_ENTRY_CORE_CAPABILITIES,
    ]) {
      expect(artifact.requiredCoreCapabilities).toContain(cap);
      const altered = structuredClone(artifact);
      altered.requiredCoreCapabilities = altered.requiredCoreCapabilities.filter((c) => c !== cap);
      altered.closure.retainedCoreCapabilities = altered.closure.retainedCoreCapabilities.filter(
        (c) => c !== cap,
      );
      await expect(
        admitPreparedMatchArtifact(await rehash(altered), source, [d, d]),
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
for (const recipe of CONDITIONAL_SELF_ENTRY_PERMANENTS)
  test(`${recipe.name}: erasing the condition, body or identity cannot regain legacy admission`, async () => {
    const source = await fixture();
    const d = await deck(source, "Donatello, Turtle Techie");
    const mutations: ((card: CardDefinition) => void)[] = [
      (card) => {
        card.triggerPrograms = [
          {
            schema: "commander-trigger/1",
            id: "forged-unconditional",
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
        card.oracleText = "";
        card.implementationRevision = "commander-development-recipes/1";
      },
      (card) => {
        card.sourceVersion = "0".repeat(64);
      },
      (card) => {
        card.oracleId = "forged-conditional-identity";
      },
    ];
    for (const mutate of mutations) {
      const altered = structuredClone(source);
      const card = named(altered, recipe.name);
      mutate(card);
      const changed = await rehash(altered);
      await expect(createFullExecutionRegistry(changed)).rejects.toThrow(
        /Unauthenticated definition|Definition dictionary identity mismatch/,
      );
      await expect(createPreparedMatchArtifact(changed, [d, d])).rejects.toThrow(
        /Unauthenticated definition|Definition dictionary identity mismatch/,
      );
    }
  });
test("conditional programs reject old and future execution ABIs but retain source inspection", async () => {
  const source = await fixture();
  const d = await deck(source, "Donatello, Turtle Techie");
  for (const processorAbi of ["commander-engine/0.20.0", "commander-engine/0.22.0"]) {
    const altered = await rehash({ ...source, processorAbi });
    expect((await verifySourceRelease(altered)).processorAbi).toBe(processorAbi);
    await expect(createFullExecutionRegistry(altered)).rejects.toThrow("incompatible");
    await expect(createPreparedMatchArtifact(altered, [d, d])).rejects.toThrow("incompatible");
    expect((await buildDevelopmentMatchPlan(altered, [d, d])).closure.blockers).toContain(
      `unimplemented-definition:${d.commander}`,
    );
  }
});
