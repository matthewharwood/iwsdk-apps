import { expect, test } from "bun:test";
import { bindStaticBonusPermanent, STATIC_BONUS_PERMANENTS } from "@iwsdk-apps/card-programs";
import { CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  CardDefinition,
  ContentRelease,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import staticSource from "../../card-programs/test-fixtures/static-bonus.json";
import { admitDeck } from "../../engine/src/index";
import frozenTokens from "../test-fixtures/fixed-token-decks.json";
import {
  buildDevelopmentMatchPlan,
  STATIC_BONUS_CORE_CAPABILITIES,
  STATIC_ENCHANTMENT_CORE_CAPABILITIES,
} from "./plan";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
  verifySourceRelease,
} from "./prepared";
import { REVIEWED_BINDING_SNAPSHOT, REVIEWED_SOURCE_BINDINGS } from "./reviewed-source-bindings";

async function fixture() {
  const definitions: Record<string, CardDefinition> = Object.fromEntries(
    Object.entries(frozenTokens.definitions).map(([id, value]) => [
      id,
      CardDefinition.parse(value),
    ]),
  );
  for (const row of staticSource.records) {
    const card = bindStaticBonusPermanent(CatalogCardSchema.parse(row));
    if (card) definitions[card.id] = card;
  }
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-static-bonus-closure-fixture/1",
    sourceBundle: staticSource.sourceBundle,
    rulesHash: staticSource.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    tokenTemplates: structuredClone(frozenTokens.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "static-bonus-closure-unit/1",
    processorAbi: ENGINE_VERSION,
  };
  return ContentRelease.parse({ ...body, hash: await semanticHash(body) });
}
function named(source: ContentRelease, name: string): CardDefinition {
  const card = Object.values(source.definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing authenticated source fixture: ${name}`);
  return card;
}
async function rehash<T extends { hash: string }>(input: T): Promise<T> {
  const { hash: _hash, ...body } = input;
  return { ...body, hash: await semanticHash(body) } as T;
}
async function legalDeck(source: ContentRelease) {
  const commander = named(source, "Arvad the Cursed");
  const body = {
    id: "legal-static-vampire-closure",
    commander: commander.id,
    entries: [
      { definition: commander.id, count: 1 },
      { definition: named(source, "Legion Lieutenant").id, count: 1 },
      { definition: named(source, "Call to the Feast").id, count: 1 },
      { definition: named(source, "Day of Destiny").id, count: 1 },
      { definition: named(source, "Plains").id, count: 48 },
      { definition: named(source, "Swamp").id, count: 48 },
    ].sort((a, b) => a.definition.localeCompare(b.definition)),
  };
  return DeckRevision.parse({ ...body, hash: await semanticHash(body) });
}

test("all 41 static source tuples authenticate within the 1190 primary registry", async () => {
  const source = await fixture();
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1190);
  expect(await semanticHash(REVIEWED_SOURCE_BINDINGS)).toBe(REVIEWED_BINDING_SNAPSHOT.bindingsHash);
  expect(await semanticHash(source.tokenTemplates)).toBe(
    REVIEWED_BINDING_SNAPSHOT.tokenTemplatesHash,
  );
  const registry = await createFullExecutionRegistry(source);
  expect(Object.keys(registry.definitions)).toHaveLength(360);
  expect(Object.keys(registry.tokenTemplates)).toHaveLength(20);
  for (const recipe of STATIC_BONUS_PERMANENTS) {
    const definition = named(source, recipe.name);
    expect(await semanticHash(definition)).toBe(
      REVIEWED_SOURCE_BINDINGS[recipe.identity]?.definitionHash ?? "missing-source-binding",
    );
    expect(definition.sourceVersion).toBe(recipe.sourceVersion);
    expect(Object.isFrozen(registry.definitions[definition.id]?.staticPrograms)).toBe(true);
  }
});

test("each static selector has zero external card dependencies and never widens to subtype catalog members", async () => {
  const source = await fixture();
  const commander = named(source, "Arvad the Cursed");
  for (const recipe of STATIC_BONUS_PERMANENTS) {
    const definition = named(source, recipe.name);
    const roots = [...new Set([commander.id, definition.id])].sort();
    // Dependency-only roots are not a legal Commander deck or execution evidence.
    const body = {
      id: `static-dependency:${recipe.identity}`,
      commander: commander.id,
      entries: roots.map((definition) => ({ definition, count: 1 })),
    };
    const plan = await buildDevelopmentMatchPlan(source, [
      { ...body, hash: await semanticHash(body) },
    ]);
    expect(plan.closure.retained).toEqual(roots);
    expect(plan.closure.blockers).toEqual([]);
    expect(plan.closure.widened).toEqual([]);
    expect(plan.closure.excluded.filter((id) => id.startsWith("token-template:"))).toHaveLength(20);
    expect(plan.closure.retained.some((id) => id.startsWith("subtype:"))).toBe(false);
  }
});

test("legal Arvad and Vampire roots retain only the exact Call to the Feast template with static core capabilities", async () => {
  const source = await fixture();
  const deck = await legalDeck(source);
  const full = await createFullExecutionRegistry(source);
  admitDeck(deck, full);
  const artifact = await createPreparedMatchArtifact(source, [deck, deck]);
  const prepared = await admitPreparedMatchArtifact(artifact, source, [deck, deck]);
  const effect = named(source, "Call to the Feast").spellProgram?.effects[0];
  if (effect?.kind !== "create-token") throw new Error("Missing authenticated Vampire creation");
  expect(Object.keys(prepared.definitions).sort()).toEqual(
    deck.entries.map((entry) => entry.definition).sort(),
  );
  expect(artifact.retainedDefinitions).toHaveLength(6);
  expect(Object.keys(prepared.tokenTemplates)).toEqual([effect.templateId]);
  expect(artifact.retainedTokenTemplates).toEqual([
    {
      identity: effect.templateId,
      templateHash: await semanticHash(full.tokenTemplates[effect.templateId]),
    },
  ]);
  expect(artifact.compilerVersion).toBe("development-match-plan/10");
  for (const capability of [
    ...STATIC_BONUS_CORE_CAPABILITIES,
    ...STATIC_ENCHANTMENT_CORE_CAPABILITIES,
  ]) {
    expect(artifact.requiredCoreCapabilities).toContain(capability);
    const altered = structuredClone(artifact);
    altered.requiredCoreCapabilities = altered.requiredCoreCapabilities.filter(
      (id) => id !== capability,
    );
    altered.closure.retainedCoreCapabilities = altered.closure.retainedCoreCapabilities.filter(
      (id) => id !== capability,
    );
    await expect(
      admitPreparedMatchArtifact(await rehash(altered), source, [deck, deck]),
    ).rejects.toThrow("does not match");
  }
  for (const field of ["recipeRegistryHash", "analysisHash"] as const) {
    const altered = { ...artifact, [field]: "0".repeat(64) };
    await expect(
      admitPreparedMatchArtifact(await rehash(altered), source, [deck, deck]),
    ).rejects.toThrow("does not match");
  }
});

for (const recipe of STATIC_BONUS_PERMANENTS)
  test(`${recipe.name} rejects rehashed static-program mutations`, async () => {
    const source = await fixture();
    const deck = await legalDeck(source);
    const mutations: ((card: CardDefinition) => void)[] = [
      (card) => {
        const p = card.staticPrograms?.[0];
        if (!p) throw new Error("Missing program");
        p.powerDelta = p.powerDelta === 3 ? 2 : 3;
      },
      (card) => {
        const p = card.staticPrograms?.[0];
        if (!p) throw new Error("Missing program");
        p.predicate = p.predicate.kind === "all" ? { kind: "legendary" } : { kind: "all" };
      },
      (card) => {
        const p = card.staticPrograms?.[0];
        if (!p) throw new Error("Missing program");
        p.excludeSource = !p.excludeSource;
      },
      (card) => {
        delete card.staticPrograms;
      },
      (card) => {
        delete card.staticPrograms;
        card.implementationRevision = "commander-development-recipes/1";
        card.oracleText = "";
      },
      (card) => {
        card.sourceVersion = "0".repeat(64);
      },
    ];
    for (const mutate of mutations) {
      const altered = structuredClone(source);
      mutate(named(altered, recipe.name));
      const rehashed = await rehash(altered);
      await expect(createFullExecutionRegistry(rehashed)).rejects.toThrow(
        "Unauthenticated definition",
      );
      await expect(createPreparedMatchArtifact(rehashed, [deck, deck])).rejects.toThrow(
        "Unauthenticated definition",
      );
      const roots = await legalDeck(source);
      const identity = named(source, recipe.name).id;
      if (!roots.entries.some((row) => row.definition === identity))
        roots.entries.push({ definition: identity, count: 1 });
      const plan = await buildDevelopmentMatchPlan(rehashed, [await rehash(roots)]);
      expect(plan.closure.blockers).toContain(`unimplemented-definition:${identity}`);
      expect(plan.closure.blockers).toContain(`unresolved-dependencies:${identity}`);
    }
  });

test("new source tuples cannot execute through an older or future engine ABI", async () => {
  const source = await fixture();
  const deck = await legalDeck(source);
  for (const processorAbi of ["commander-engine/0.13.0", "commander-engine/0.15.0"]) {
    const altered = await rehash({ ...source, processorAbi });
    expect((await verifySourceRelease(altered)).processorAbi).toBe(processorAbi);
    await expect(createFullExecutionRegistry(altered)).rejects.toThrow("incompatible");
    await expect(createPreparedMatchArtifact(altered, [deck, deck])).rejects.toThrow(
      "incompatible",
    );
    const plan = await buildDevelopmentMatchPlan(altered, [deck, deck]);
    expect(plan.closure.blockers).toContain(`unimplemented-definition:${deck.commander}`);
  }
});
