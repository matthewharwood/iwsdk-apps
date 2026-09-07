import { expect, test } from "bun:test";
import { bindEntryObserverPermanent, ENTRY_OBSERVER_PERMANENTS } from "@iwsdk-apps/card-programs";
import { CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  CardDefinition,
  ContentRelease,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import sourceRows from "../../card-programs/test-fixtures/entry-observer.json";
import { admitDeck } from "../../engine/src/index";
import older from "../test-fixtures/static-bonus-decks.json";
import {
  buildDevelopmentMatchPlan,
  ENTRY_OBSERVER_CORE_CAPABILITIES,
  SELF_ENTRY_CORE_CAPABILITIES,
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
  const names = new Set([
    "Jasmine Boreal",
    "Plains",
    "Forest",
    "Island",
    "Raise the Alarm",
    "Gaea's Anthem",
    "Memnite",
  ]);
  const definitions: Record<string, CardDefinition> = Object.fromEntries(
    Object.values(older.definitions)
      .filter((d) => names.has(d.name))
      .map((d) => [d.id, CardDefinition.parse(d)]),
  );
  expect(Object.keys(definitions)).toHaveLength(names.size);
  for (const row of sourceRows.records) {
    const definition = bindEntryObserverPermanent(CatalogCardSchema.parse(row));
    if (definition) definitions[definition.id] = definition;
  }
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-entry-observer-closure/1",
    sourceBundle: sourceRows.sourceBundle,
    rulesHash: sourceRows.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    tokenTemplates: structuredClone(older.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "entry-observer-closure-unit/1",
    processorAbi: ENGINE_VERSION,
  };
  return ContentRelease.parse({ ...body, hash: await semanticHash(body) });
}
function named(source: ContentRelease, name: string): CardDefinition {
  const definition = Object.values(source.definitions).find((d) => d.name === name);
  if (!definition) throw new Error(`Missing authenticated source: ${name}`);
  return definition;
}
async function rehash<T extends { hash: string }>(input: T): Promise<T> {
  const { hash: _hash, ...body } = input;
  return { ...body, hash: await semanticHash(body) } as T;
}
async function legalDeck(source: ContentRelease, mode: "gw" | "gu") {
  const names =
    mode === "gw"
      ? [
          "Jasmine Boreal",
          "Soul Warden",
          "Eidolon of Blossoms",
          "Ajani's Welcome",
          "Gaea's Anthem",
          "Raise the Alarm",
        ]
      : ["Tatyova, Benthic Druid", "Fateful Discovery", "Memnite", "Woodland Liege"];
  const commander = named(source, names[0] ?? "missing");
  const remaining = 100 - names.length;
  const entries = [
    ...names.map((name) => ({ definition: named(source, name).id, count: 1 })),
    { definition: named(source, "Forest").id, count: remaining / 2 },
    { definition: named(source, mode === "gw" ? "Plains" : "Island").id, count: remaining / 2 },
  ].sort((a, b) => a.definition.localeCompare(b.definition));
  const body = { id: `legal-entry-observer-closure:${mode}`, commander: commander.id, entries };
  return DeckRevision.parse({ ...body, hash: await semanticHash(body) });
}

test("the closed current primary registry preserves and authenticates all20 observer programs", async () => {
  const source = await fixture();
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1789);
  expect(await semanticHash(REVIEWED_SOURCE_BINDINGS)).toBe(REVIEWED_BINDING_SNAPSHOT.bindingsHash);
  const full = await createFullExecutionRegistry(source);
  expect(Object.keys(full.definitions)).toHaveLength(27);
  expect(Object.keys(full.tokenTemplates)).toHaveLength(20);
  for (const recipe of ENTRY_OBSERVER_PERMANENTS) {
    const d = named(source, recipe.name);
    expect(await semanticHash(d)).toBe(
      REVIEWED_SOURCE_BINDINGS[recipe.identity]?.definitionHash ?? "missing-binding",
    );
    expect(d.sourceVersion).toBe(recipe.sourceVersion);
    expect(Object.isFrozen(full.definitions[d.id]?.triggerPrograms)).toBe(true);
  }
});

test("all20 observer selectors have zero external-definition dependencies", async () => {
  const source = await fixture();
  const commander = named(source, "Tatyova, Benthic Druid");
  for (const recipe of ENTRY_OBSERVER_PERMANENTS) {
    const root = named(source, recipe.name);
    const roots = [...new Set([commander.id, root.id])].sort();
    // Dependency-only roots deliberately do not claim legal Commander construction or gameplay.
    const body = {
      id: `entry-dependency:${recipe.identity}`,
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
  }
});

for (const mode of ["gw", "gu"] as const)
  test(`legal ${mode} observer roots retain only deck cards and exact produced token templates`, async () => {
    const source = await fixture();
    const deck = await legalDeck(source, mode);
    const full = await createFullExecutionRegistry(source);
    admitDeck(deck, full);
    const artifact = await createPreparedMatchArtifact(source, [deck, deck]);
    const prepared = await admitPreparedMatchArtifact(artifact, source, [deck, deck]);
    expect(Object.keys(prepared.definitions).sort()).toEqual(
      deck.entries.map((e) => e.definition).sort(),
    );
    const effect = named(source, "Raise the Alarm").spellProgram?.effects[0];
    if (effect?.kind !== "create-token") throw new Error("Missing Soldier template");
    expect(Object.keys(prepared.tokenTemplates)).toEqual(mode === "gw" ? [effect.templateId] : []);
    expect(artifact.compilerVersion).toBe("development-match-plan/17");
    for (const capability of [
      ...ENTRY_OBSERVER_CORE_CAPABILITIES,
      ...SELF_ENTRY_CORE_CAPABILITIES,
      ...STATIC_ENCHANTMENT_CORE_CAPABILITIES,
    ]) {
      expect(artifact.requiredCoreCapabilities).toContain(capability);
      const changed = structuredClone(artifact);
      changed.requiredCoreCapabilities = changed.requiredCoreCapabilities.filter(
        (id) => id !== capability,
      );
      changed.closure.retainedCoreCapabilities = changed.closure.retainedCoreCapabilities.filter(
        (id) => id !== capability,
      );
      await expect(
        admitPreparedMatchArtifact(await rehash(changed), source, [deck, deck]),
      ).rejects.toThrow("does not match");
    }
    for (const field of ["recipeRegistryHash", "analysisHash"] as const)
      await expect(
        admitPreparedMatchArtifact(await rehash({ ...artifact, [field]: "0".repeat(64) }), source, [
          deck,
          deck,
        ]),
      ).rejects.toThrow("does not match");
  });

for (const recipe of ENTRY_OBSERVER_PERMANENTS)
  test(`${recipe.name} rejects rehashed trigger, controller, identity and body erasure`, async () => {
    const source = await fixture();
    const deck = await legalDeck(source, "gw");
    const mutations: ((d: CardDefinition) => void)[] = [
      (d) => {
        const p = d.triggerPrograms?.[0];
        if (p?.schema !== "commander-entry-observer/1") throw new Error("Missing program");
        p.trigger.subject.filter.controller =
          p.trigger.subject.filter.controller === "any" ? "source-controller" : "any";
      },
      (d) => {
        const p = d.triggerPrograms?.[0];
        if (p?.schema !== "commander-entry-observer/1") throw new Error("Missing program");
        p.trigger.subject = {
          kind: "filter",
          filter: { types: ["Artifact"], controller: "any", excludeSource: false, token: "any" },
        };
      },
      (d) => {
        const p = d.triggerPrograms?.[0];
        if (p?.schema !== "commander-entry-observer/1") throw new Error("Missing program");
        p.effects = [{ kind: "gain-life", recipient: "trigger-controller", amount: 2 }];
      },
      (d) => {
        delete d.triggerPrograms;
      },
      (d) => {
        delete d.triggerPrograms;
        d.implementationRevision = "commander-development-recipes/1";
        d.oracleText = "";
      },
      (d) => {
        d.sourceVersion = "0".repeat(64);
      },
    ];
    for (const mutate of mutations) {
      const altered = structuredClone(source);
      const d = named(altered, recipe.name);
      const before = await semanticHash(d);
      mutate(d);
      // Healer of the Pride already gains two; force a changed effect for that source.
      if ((await semanticHash(d)) === before) {
        const p = d.triggerPrograms?.[0];
        if (p?.schema !== "commander-entry-observer/1") throw new Error("Missing program");
        p.effects = [{ kind: "draw", recipient: "trigger-controller", amount: 1 }];
      }
      const changed = await rehash(altered);
      await expect(createFullExecutionRegistry(changed)).rejects.toThrow(
        "Unauthenticated definition",
      );
      await expect(createPreparedMatchArtifact(changed, [deck, deck])).rejects.toThrow(
        "Unauthenticated definition",
      );
      const roots = {
        id: `mutated-entry:${recipe.identity}`,
        commander: d.id,
        entries: [{ definition: d.id, count: 1 }],
      };
      const plan = await buildDevelopmentMatchPlan(changed, [
        { ...roots, hash: await semanticHash(roots) },
      ]);
      expect(plan.closure.blockers).toContain(`unimplemented-definition:${d.id}`);
      expect(plan.closure.blockers).toContain(`unresolved-dependencies:${d.id}`);
    }
  });

test("observer programs reject older and future execution ABIs while retaining source inspection", async () => {
  const source = await fixture();
  const deck = await legalDeck(source, "gu");
  for (const processorAbi of ["commander-engine/0.20.0", "commander-engine/0.22.0"]) {
    const changed = await rehash({ ...source, processorAbi });
    expect((await verifySourceRelease(changed)).processorAbi).toBe(processorAbi);
    await expect(createFullExecutionRegistry(changed)).rejects.toThrow("incompatible");
    await expect(createPreparedMatchArtifact(changed, [deck, deck])).rejects.toThrow(
      "incompatible",
    );
    const plan = await buildDevelopmentMatchPlan(changed, [deck, deck]);
    expect(plan.closure.blockers).toContain(`unimplemented-definition:${deck.commander}`);
  }
});
