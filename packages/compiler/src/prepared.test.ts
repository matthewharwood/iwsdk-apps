import { expect, test } from "bun:test";
import {
  CardDefinition,
  type ContentRelease,
  type DeckRevision,
  type PreparedMatchArtifact,
  semanticHash,
} from "@iwsdk-apps/contracts";
import records from "../test-fixtures/reviewed-bindings.json";
import {
  buildDevelopmentMatchPlan,
  SELF_ENTRY_CORE_CAPABILITIES,
  SELF_ENTRY_PROCESSOR_ABI,
} from "./plan";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "./prepared";

const COMMANDER = records.definitions["Jasmine Boreal"].id;
const LAND = records.definitions.Forest.id;
const UNUSED = records.definitions.Divination.id;
async function fixture(subject?: "Lone Missionary" | "Canopy Spider") {
  const definitions: Record<string, CardDefinition> = {};
  for (const name of ["Jasmine Boreal", "Forest", "Divination", ...(subject ? [subject] : [])]) {
    const card = CardDefinition.parse((records.definitions as Record<string, unknown>)[name]);
    definitions[card.id] = card;
  }
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-subset-closure-fixture",
    sourceBundle: records.sourceBundle,
    rulesHash: records.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "unit-fixture/1",
    processorAbi: SELF_ENTRY_PROCESSOR_ABI,
  };
  const source: ContentRelease = { ...body, hash: await semanticHash(body) };
  const subjectId = subject
    ? CardDefinition.parse((records.definitions as Record<string, unknown>)[subject]).id
    : null;
  const decks: DeckRevision[] = [];
  for (const label of ["a", "b"]) {
    // Source-authenticated dependency fixture, not a claim of a completed legal-deck game.
    const body = {
      id: `closure-fixture:${label}`,
      commander: COMMANDER,
      entries: [
        { definition: COMMANDER, count: 1 },
        { definition: LAND, count: subject ? 98 : 99 },
        ...(subjectId ? [{ definition: subjectId, count: 1 }] : []),
      ],
    };
    decks.push({ ...body, hash: await semanticHash(body) });
  }
  return { source, decks, subjectId };
}
async function rehash<T extends { hash: string }>(input: T): Promise<T> {
  const { hash: _hash, ...body } = input;
  return { ...body, hash: await semanticHash(body) } as T;
}

test("prepared admission returns a distinct immutable subset lookup while preserving authenticated full source identity", async () => {
  const { source, decks } = await fixture();
  const before = structuredClone(source);
  const artifact = await createPreparedMatchArtifact(source, decks);
  const prepared = await admitPreparedMatchArtifact(artifact, source, decks);
  const full = await createFullExecutionRegistry(source);
  expect(source).toEqual(before);
  expect(Object.keys(full.definitions)).toEqual([COMMANDER, LAND, UNUSED].sort());
  expect(Object.keys(prepared.definitions)).toEqual([COMMANDER, LAND].sort());
  expect(prepared.sourceReleaseHash).toBe(source.hash);
  expect(prepared.preparedArtifactHash).toBe(artifact.hash);
  expect(full.preparedArtifactHash).toBeNull();
  expect(artifact.fullRegistryAvailable).toBe(false);
  expect(artifact.closure.excluded).toEqual([UNUSED]);
  expect(artifact.requiredCoreCapabilities.length).toBeGreaterThan(0);
  expect(await createPreparedMatchArtifact(source, decks)).toEqual(artifact);
  source.definitions[COMMANDER] = {
    ...(before.definitions[COMMANDER] as CardDefinition),
    power: 77,
  };
  expect(prepared.definitions[COMMANDER]?.power).toBe(before.definitions[COMMANDER]?.power);
  expect(() => {
    prepared.definitions[UNUSED] = before.definitions[UNUSED] as CardDefinition;
  }).toThrow();
});

test("artifact checksum and strict schema reject corruption and unknown fields before admission", async () => {
  const { source, decks } = await fixture();
  const artifact = await createPreparedMatchArtifact(source, decks);
  await expect(
    admitPreparedMatchArtifact({ ...artifact, hash: "0".repeat(64) }, source, decks),
  ).rejects.toThrow("artifact hash mismatch");
  await expect(
    admitPreparedMatchArtifact({ ...artifact, trustMe: true }, source, decks),
  ).rejects.toThrow();
});

test("rehashed forged exclusions, extra retained definitions, duplicate refs, and omitted core cannot bypass recomputation", async () => {
  const { source, decks } = await fixture();
  const original = await createPreparedMatchArtifact(source, decks);
  for (const change of [
    "missing-root",
    "extra-definition",
    "duplicate-reference",
    "missing-core",
    "wrong-definition-digest",
    "wrong-abi",
    "wrong-recipe-registry",
    "wrong-analysis",
  ]) {
    const artifact = structuredClone(original);
    if (change === "missing-root") {
      artifact.closure.retained = [LAND];
      artifact.retainedDefinitions = artifact.retainedDefinitions.filter(
        (ref) => ref.identity !== COMMANDER,
      );
    }
    if (change === "extra-definition") artifact.closure.retained.push(UNUSED);
    if (change === "duplicate-reference")
      artifact.retainedDefinitions.push({
        ...(artifact
          .retainedDefinitions[0] as PreparedMatchArtifact["retainedDefinitions"][number]),
      });
    if (change === "missing-core") {
      artifact.requiredCoreCapabilities = [];
      artifact.closure.retainedCoreCapabilities = [];
    }
    if (change === "wrong-definition-digest") {
      const ref = artifact.retainedDefinitions[0];
      if (ref) ref.definitionHash = "0".repeat(64);
    }
    if (change === "wrong-abi") artifact.processorAbi = "unavailable-abi/1";
    if (change === "wrong-recipe-registry") artifact.recipeRegistryHash = "0".repeat(64);
    if (change === "wrong-analysis") artifact.analysisHash = "0".repeat(64);
    await expect(admitPreparedMatchArtifact(await rehash(artifact), source, decks)).rejects.toThrow(
      "recomputed source, deck, closure",
    );
  }
});

test("altered source data and changed source pins never inherit a prior prepared artifact", async () => {
  const { source, decks } = await fixture();
  const artifact = await createPreparedMatchArtifact(source, decks);
  const changed = structuredClone(source);
  const card = changed.definitions[COMMANDER];
  if (!card) throw Error("Missing fixture");
  card.power = 77;
  await expect(admitPreparedMatchArtifact(artifact, changed, decks)).rejects.toThrow(
    "source release hash mismatch",
  );
  const revised = await rehash(changed);
  await expect(admitPreparedMatchArtifact(artifact, revised, decks)).rejects.toThrow(
    "Unauthenticated definition",
  );
  artifact.sourceReleaseHash = revised.hash;
  await expect(admitPreparedMatchArtifact(await rehash(artifact), revised, decks)).rejects.toThrow(
    "Unauthenticated definition",
  );
  for (const field of ["sourceBundle", "rulesHash"] as const) {
    const altered = structuredClone(source);
    altered[field] = "f".repeat(64);
    await expect(createFullExecutionRegistry(await rehash(altered))).rejects.toThrow(
      "Unauthenticated source bundle or rules",
    );
  }
});

test("deck revision, deck order, and missing definition roots are checked independently", async () => {
  const { source, decks } = await fixture();
  const artifact = await createPreparedMatchArtifact(source, decks);
  await expect(admitPreparedMatchArtifact(artifact, source, [...decks].reverse())).rejects.toThrow(
    "recomputed source, deck, closure",
  );
  const altered = structuredClone(decks);
  const first = altered[0];
  if (!first) throw Error("Missing deck");
  first.id = "changed";
  await expect(admitPreparedMatchArtifact(artifact, source, altered)).rejects.toThrow(
    "Deck hash mismatch",
  );
  first.entries.push({ definition: "missing", count: 1 });
  altered[0] = await rehash(first);
  await expect(createPreparedMatchArtifact(source, altered)).rejects.toThrow(
    "unavailable-definition:missing",
  );
});

test("unknown reachable recipe dependencies widen availability and production source admission blocks the altered binding", async () => {
  const { source, decks } = await fixture();
  const card = source.definitions[COMMANDER];
  if (!card) throw Error("Missing fixture");
  card.implementationRevision = "unknown-dynamic-generation/1";
  const altered = await rehash(source);
  const plan = await buildDevelopmentMatchPlan(altered, decks);
  expect(plan.closure.excluded).toEqual([]);
  expect(plan.closure.retained).toEqual([COMMANDER, LAND, UNUSED].sort());
  expect(plan.closure.blockers).toContain(`unresolved-dependencies:${COMMANDER}`);
  await expect(createPreparedMatchArtifact(altered, decks)).rejects.toThrow(
    "Unauthenticated definition",
  );
});

test("browser prepared entrypoint builds without importing the native SQLite/compiler index", async () => {
  const result = await Bun.build({
    entrypoints: [new URL("./prepared.ts", import.meta.url).pathname],
    target: "browser",
    format: "esm",
  });
  expect(result.success).toBe(true);
  expect(result.logs.filter((log) => log.level === "error")).toEqual([]);
  const text = await result.outputs[0]?.text();
  expect(text).not.toContain("bun:sqlite");
  expect(text).not.toContain("node:fs");
});

test("source-authenticated self-entry and reminder closures retain exact programs and reject changed bodies, types or ABI", async () => {
  for (const subject of ["Lone Missionary", "Canopy Spider"] as const) {
    const { source, decks, subjectId } = await fixture(subject);
    if (!subjectId) throw Error("Missing subject");
    const artifact = await createPreparedMatchArtifact(source, decks);
    const registry = await admitPreparedMatchArtifact(
      JSON.parse(JSON.stringify(artifact)),
      source,
      decks,
    );
    expect(artifact.compilerVersion).toBe("development-match-plan/8");
    expect(artifact.closure.excluded).toEqual([UNUSED]);
    expect(artifact.closure.blockers).toEqual([]);
    for (const capability of SELF_ENTRY_CORE_CAPABILITIES)
      expect(artifact.requiredCoreCapabilities).toContain(capability);
    expect(registry.definitions[subjectId]).toEqual(source.definitions[subjectId]);
    for (const change of [
      "old-abi",
      "future-abi",
      "recipe",
      "optional",
      "remainder",
      "program",
      "keywords",
      "missing-program",
      "null-power",
      "mixed-type",
      "null-cost",
      "mana-value",
      "subtypes",
    ]) {
      const altered = structuredClone(source);
      const card = altered.definitions[subjectId];
      if (!card) throw Error("Missing source");
      mutateSource(altered, card, change);
      const revised = await rehash(altered);
      const plan = await buildDevelopmentMatchPlan(revised, decks);
      expect(plan.closure.blockers.length).toBeGreaterThan(0);
      expect(plan.closure.retained).toContain(UNUSED);
      await expect(createPreparedMatchArtifact(revised, decks)).rejects.toThrow(
        change.includes("abi") ? "Prepared execution blocked" : "Unauthenticated definition",
      );
    }
  }
});

function mutateSource(altered: ContentRelease, card: CardDefinition, change: string) {
  if (change === "old-abi") altered.processorAbi = "commander-engine/0.6.0";
  if (change === "future-abi") altered.processorAbi = "commander-engine/unsupported-future";
  if (change === "recipe") card.implementationRevision = "commander-development-recipes/1";
  if (change === "optional") card.oracleText = "When this creature enters, you may draw a card.";
  if (change === "remainder") card.oracleText += "\nCreatures you control get +1/+1.";
  if (change === "program") {
    if (card.triggerPrograms?.[0]?.schema === "commander-trigger/1")
      card.triggerPrograms[0].effect.amount = 99;
    else card.oracleText = "Reach (Changed reminder.)";
  }
  if (change === "keywords") card.keywords = ["flying"];
  if (change === "missing-program") {
    delete card.triggerPrograms;
    card.keywords = [];
  }
  if (change === "null-power") card.power = null;
  if (change === "mixed-type") {
    card.types.push("Planeswalker");
    card.typeLine += " Planeswalker";
  }
  if (change === "null-cost") card.manaCost = null;
  if (change === "mana-value") card.manaValue += 1;
  if (change === "subtypes") card.subtypes = ["Changed"];
}
