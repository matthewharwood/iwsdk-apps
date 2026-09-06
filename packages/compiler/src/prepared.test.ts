import { expect, test } from "bun:test";
import { proposeSelfEntryBody } from "@iwsdk-apps/card-programs";
import {
  type CardDefinition,
  type ContentRelease,
  type DeckRevision,
  emptyMana,
  type PreparedMatchArtifact,
  semanticHash,
} from "@iwsdk-apps/contracts";
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

async function fixture() {
  const commander: CardDefinition = {
    id: "commander",
    oracleId: "synthetic-commander",
    sourceVersion: "1".repeat(64),
    name: "Artifact fixture commander",
    typeLine: "Legendary Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: ["Legendary"],
    colors: ["G"],
    colorIdentity: ["G"],
    manaCost: { ...emptyMana(), generic: 1, G: 1 },
    manaValue: 2,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: true,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "commander-development-recipes/1",
  };
  const land: CardDefinition = {
    ...commander,
    id: "land",
    oracleId: "synthetic-land",
    name: "Artifact fixture Forest",
    types: ["Land"],
    subtypes: ["Forest"],
    supertypes: ["Basic"],
    power: null,
    toughness: null,
    manaCost: null,
    manaValue: 0,
    manaAbilities: ["G"],
    deckLimit: null,
    commanderEligible: false,
  };
  const sourceBody = {
    schema: "commander-content/1" as const,
    id: "prepared-synthetic-source",
    sourceBundle: "2".repeat(64),
    rulesHash: "3".repeat(64),
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: {
      commander,
      land,
      unused: {
        ...commander,
        id: "unused",
        oracleId: "synthetic-unused",
        name: "Unused fixture creature",
      },
    },
    unsupportedOracleIds: ["unimplemented-source-card"],
    eligibleDenominator: 4,
    compilerVersion: "unit-test/1",
    processorAbi: "synthetic-tested-abi/1",
  };
  const source: ContentRelease = { ...sourceBody, hash: await semanticHash(sourceBody) };
  const decks: DeckRevision[] = [];
  for (const name of ["a", "b"]) {
    const body = {
      id: `synthetic-deck:${name}`,
      commander: "commander",
      entries: [
        { definition: "commander", count: 1 },
        { definition: "land", count: 99 },
      ],
    };
    decks.push({ ...body, hash: await semanticHash(body) });
  }
  return { source, decks };
}
async function rehashArtifact(artifact: PreparedMatchArtifact) {
  const { hash: _hash, ...body } = artifact;
  return { ...body, hash: await semanticHash(body) };
}
async function rehashSource(source: ContentRelease) {
  const { hash: _hash, ...body } = source;
  return { ...body, hash: await semanticHash(body) };
}

test("prepared admission returns a distinct immutable subset lookup while preserving authenticated full source identity", async () => {
  const { source, decks } = await fixture();
  const sourceBefore = structuredClone(source);
  const artifact = await createPreparedMatchArtifact(source, decks);
  const prepared = await admitPreparedMatchArtifact(artifact, source, decks);
  const full = await createFullExecutionRegistry(source);
  expect(source).toEqual(sourceBefore);
  expect(Object.keys(full.definitions)).toEqual(["commander", "land", "unused"]);
  expect(Object.keys(prepared.definitions)).toEqual(["commander", "land"]);
  expect(prepared.sourceReleaseHash).toBe(source.hash);
  expect(prepared.preparedArtifactHash).toBe(artifact.hash);
  expect(full.preparedArtifactHash).toBeNull();
  expect(artifact.fullRegistryAvailable).toBe(false);
  expect(artifact.closure.excluded).toEqual(["unused"]);
  expect(artifact.requiredCoreCapabilities.length).toBeGreaterThan(0);
  expect(await createPreparedMatchArtifact(source, decks)).toEqual(artifact);
  source.definitions.commander = {
    ...(sourceBefore.definitions.commander as CardDefinition),
    power: 7,
  };
  expect(prepared.definitions.commander?.power).toBe(2);
  expect(() => {
    prepared.definitions.unused = sourceBefore.definitions.unused as CardDefinition;
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
      artifact.closure.retained = ["land"];
      artifact.retainedDefinitions = artifact.retainedDefinitions.filter(
        (ref) => ref.identity !== "commander",
      );
    }
    if (change === "extra-definition") artifact.closure.retained.push("unused");
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
    await expect(
      admitPreparedMatchArtifact(await rehashArtifact(artifact), source, decks),
    ).rejects.toThrow("recomputed source, deck, closure");
  }
});

test("altered source data and changed source pins never inherit a prior prepared artifact", async () => {
  const { source, decks } = await fixture();
  const artifact = await createPreparedMatchArtifact(source, decks);
  const changed = structuredClone(source);
  const definition = changed.definitions.commander;
  if (!definition) throw new Error("Missing fixture definition");
  definition.power = 4;
  await expect(admitPreparedMatchArtifact(artifact, changed, decks)).rejects.toThrow(
    "source release hash mismatch",
  );
  const changedSource = await rehashSource(changed);
  await expect(admitPreparedMatchArtifact(artifact, changedSource, decks)).rejects.toThrow(
    "different full source release",
  );
  artifact.sourceReleaseHash = changedSource.hash;
  await expect(
    admitPreparedMatchArtifact(await rehashArtifact(artifact), changedSource, decks),
  ).rejects.toThrow("recomputed source, deck, closure");
});

test("deck revision, deck order, and missing definition roots are checked independently", async () => {
  const { source, decks } = await fixture();
  const artifact = await createPreparedMatchArtifact(source, decks);
  await expect(admitPreparedMatchArtifact(artifact, source, [...decks].reverse())).rejects.toThrow(
    "recomputed source, deck, closure",
  );
  const altered = structuredClone(decks);
  const first = altered[0];
  if (!first) throw new Error("Missing deck");
  first.id = "changed-deck";
  await expect(admitPreparedMatchArtifact(artifact, source, altered)).rejects.toThrow(
    "Deck hash mismatch",
  );
  first.entries.push({ definition: "missing", count: 1 });
  const { hash: _hash, ...body } = first;
  first.hash = await semanticHash(body);
  await expect(createPreparedMatchArtifact(source, altered)).rejects.toThrow(
    "unavailable-definition:missing",
  );
});

test("unknown reachable recipe dependencies widen availability and block executable pruning", async () => {
  const { source, decks } = await fixture();
  const commander = source.definitions.commander;
  if (!commander) throw new Error("Missing commander");
  commander.implementationRevision = "unknown-dynamic-generation/1";
  const unknown = await rehashSource(source);
  const plan = await buildDevelopmentMatchPlan(unknown, decks);
  expect(plan.closure.excluded).toEqual([]);
  expect(plan.closure.retained).toEqual(["commander", "land", "unused"]);
  expect(plan.closure.blockers).toContain("unresolved-dependencies:commander");
  await expect(createPreparedMatchArtifact(unknown, decks)).rejects.toThrow(
    "Prepared execution blocked",
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

test("self-entry closure retains all trigger processors and serialized programs only under the exact reviewed ABI", async () => {
  const { source, decks } = await fixture();
  const commander = source.definitions.commander;
  const proposal = proposeSelfEntryBody("When this creature enters, draw a card.");
  if (!commander || !proposal) throw new Error("Missing fixture source");
  commander.oracleText = "When this creature enters, draw a card.";
  commander.triggerPrograms = [proposal.program];
  commander.implementationRevision = "self-entry-creature/1";
  source.processorAbi = SELF_ENTRY_PROCESSOR_ABI;
  const revised = await rehashSource(source);
  const artifact = await createPreparedMatchArtifact(revised, decks);
  const registry = await admitPreparedMatchArtifact(
    JSON.parse(JSON.stringify(artifact)),
    revised,
    decks,
  );
  expect(artifact.compilerVersion).toBe("development-match-plan/3");
  expect(artifact.closure.excluded).toEqual(["unused"]);
  expect(artifact.closure.blockers).toEqual([]);
  for (const capability of SELF_ENTRY_CORE_CAPABILITIES)
    expect(artifact.requiredCoreCapabilities).toContain(capability);
  expect(registry.definitions.commander?.triggerPrograms).toEqual([proposal.program]);
  expect(Object.keys(registry.definitions)).toEqual(["commander", "land"]);
});

function alterTriggerFixture(altered: ContentRelease, card: CardDefinition, change: string) {
  if (change === "old-abi") altered.processorAbi = "commander-engine/0.6.0";
  if (change === "future-abi") altered.processorAbi = "commander-engine/unsupported-future";
  if (change === "future-recipe") card.implementationRevision = "self-entry-creature/2";
  if (change === "old-recipe") card.implementationRevision = "commander-development-recipes/1";
  if (change === "optional") card.oracleText = "When this creature enters, you may draw a card.";
  if (change === "unknown-remainder") card.oracleText += "\nCreatures you control get +1/+1.";
  if (change === "altered-program" && card.triggerPrograms?.[0]?.schema === "commander-trigger/1")
    card.triggerPrograms[0].effect.amount = 2;
  if (change === "extra-keyword") card.keywords = ["flying"];
  if (change === "missing-program") delete card.triggerPrograms;
  if (change === "unknown-characteristic") card.power = null;
  if (change === "unknown-type") {
    card.types.push("Planeswalker");
    card.typeLine += " Planeswalker";
  }
  if (change === "null-cost") card.manaCost = null;
  if (change === "wrong-mana-value") card.manaValue += 1;
  if (change === "type-discrepancy") card.subtypes = ["Elf"];
}

test("unknown trigger recipe, ABI, body, remainder, or program cannot inherit an empty dependency declaration", async () => {
  const { source, decks } = await fixture();
  const commander = source.definitions.commander;
  const proposal = proposeSelfEntryBody("When this creature enters, draw a card.");
  if (!commander || !proposal) throw new Error("Missing fixture source");
  commander.oracleText = "When this creature enters, draw a card.";
  commander.triggerPrograms = [proposal.program];
  commander.implementationRevision = "self-entry-creature/1";
  source.processorAbi = SELF_ENTRY_PROCESSOR_ABI;
  for (const change of [
    "old-abi",
    "future-abi",
    "future-recipe",
    "old-recipe",
    "optional",
    "unknown-remainder",
    "altered-program",
    "extra-keyword",
    "missing-program",
    "unknown-characteristic",
    "unknown-type",
    "null-cost",
    "wrong-mana-value",
    "type-discrepancy",
  ]) {
    const altered = structuredClone(source);
    const card = altered.definitions.commander;
    if (!card) throw new Error("Missing fixture commander");
    alterTriggerFixture(altered, card, change);
    const revised = await rehashSource(altered);
    const plan = await buildDevelopmentMatchPlan(revised, decks);
    expect(plan.closure.excluded).toEqual([]);
    expect(plan.closure.retained).toEqual(["commander", "land", "unused"]);
    expect(plan.closure.blockers).toContain("unresolved-dependencies:commander");
    await expect(createPreparedMatchArtifact(revised, decks)).rejects.toThrow(
      "Prepared execution blocked",
    );
  }
});
