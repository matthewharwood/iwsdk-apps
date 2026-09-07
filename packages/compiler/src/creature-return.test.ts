import { expect, test } from "bun:test";
import { CREATURE_RETURN_SPELLS } from "@iwsdk-apps/card-programs";
import {
  type CardDefinition,
  ContentRelease,
  canonicalJson,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import frozen from "../test-fixtures/creature-return-decks.json";
import { makeCreatureReturnDecks } from "./creature-return-decks";
import { buildDevelopmentMatchPlan, CREATURE_RETURN_CORE_CAPABILITIES } from "./plan";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
  verifySourceRelease,
} from "./prepared";
import { REVIEWED_BINDING_SNAPSHOT, REVIEWED_SOURCE_BINDINGS } from "./reviewed-source-bindings";

async function fixture() {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-creature-return-fixture",
    sourceBundle: frozen.sourceBundle,
    rulesHash: frozen.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: structuredClone(frozen.definitions),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(frozen.definitions).length,
    compilerVersion: "creature-return-unit/1",
    processorAbi: ENGINE_VERSION,
  };
  return {
    source: ContentRelease.parse({ ...body, hash: await semanticHash(body) }),
    decks: frozen.decks.map((deck) => DeckRevision.parse(deck)),
  };
}
async function rehash(source: ContentRelease) {
  const { hash: _hash, ...body } = source;
  return { ...body, hash: await semanticHash(body) };
}

test("five creature-return identities are authenticated against the closed1129 registry and preserve exact frozen decks", async () => {
  const { source, decks } = await fixture();
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1129);
  expect(await semanticHash(REVIEWED_SOURCE_BINDINGS)).toBe(REVIEWED_BINDING_SNAPSHOT.bindingsHash);
  await verifySourceRelease(source);
  const result = await makeCreatureReturnDecks(source, decks);
  expect(result.decks).toHaveLength(4);
  expect(canonicalJson(result.decks.slice(0, 2))).toBe(canonicalJson(decks));
  expect(result.report.coveredCreatureReturns).toBe(5);
  expect(result.report.excluded).toEqual([]);
  for (const deck of result.decks.slice(2)) {
    expect(deck.entries.reduce((sum, row) => sum + row.count, 0)).toBe(100);
    expect(
      deck.entries
        .filter((row) => source.definitions[row.definition]?.supertypes.includes("Basic"))
        .reduce((sum, row) => sum + row.count, 0),
    ).toBe(39);
    for (const recipe of CREATURE_RETURN_SPELLS) {
      const id = `oracle:${recipe.identity}`;
      expect(deck.entries.find((row) => row.definition === id)?.count).toBe(1);
      expect(await semanticHash(source.definitions[id])).toBe(
        REVIEWED_SOURCE_BINDINGS[recipe.identity]?.definitionHash ??
          "missing-authenticated-binding",
      );
    }
  }
});

test("prepared creature-return closure retains exact suspension capabilities and rejects forged omissions", async () => {
  const { source, decks } = await fixture();
  const selected = (await makeCreatureReturnDecks(source, decks)).decks.slice(2);
  const artifact = await createPreparedMatchArtifact(source, selected);
  const registry = await admitPreparedMatchArtifact(artifact, source, selected);
  expect(artifact.closure.blockers).toEqual([]);
  expect(artifact.closure.widened).toEqual([]);
  expect(Object.keys(registry.definitions)).toHaveLength(111);
  expect(artifact.closure.excluded).toHaveLength(10);
  for (const capability of CREATURE_RETURN_CORE_CAPABILITIES) {
    expect(artifact.requiredCoreCapabilities).toContain(capability);
    const altered = structuredClone(artifact);
    altered.requiredCoreCapabilities = altered.requiredCoreCapabilities.filter(
      (id) => id !== capability,
    );
    altered.closure.retainedCoreCapabilities = altered.closure.retainedCoreCapabilities.filter(
      (id) => id !== capability,
    );
    const { hash: _hash, ...body } = altered;
    await expect(
      admitPreparedMatchArtifact({ ...body, hash: await semanticHash(body) }, source, selected),
    ).rejects.toThrow("does not match");
  }
  const priorAbi = await rehash({ ...source, processorAbi: "commander-engine/0.10.0" });
  const plan = await buildDevelopmentMatchPlan(priorAbi, selected);
  expect(plan.closure.blockers.length).toBeGreaterThan(0);
  expect(plan.closure.retained).toHaveLength(121);
  await expect(createPreparedMatchArtifact(priorAbi, selected)).rejects.toThrow(
    "Prepared execution blocked",
  );
});

test("both source factories reject rehashed creature-return target, marker, identity and fully fabricated source mutations", async () => {
  const { source, decks } = await fixture();
  const selected = (await makeCreatureReturnDecks(source, decks)).decks.slice(2);
  const changes: ((card: CardDefinition) => void)[] = [
    (card) => {
      card.spellProgram = {
        schema: "commander-spell/1",
        target: "spell",
        effects: [{ kind: "counter" }],
      };
    },
    (card) => {
      card.implementationRevision = "commander-development-recipes/1";
      card.spellProgram = {
        schema: "commander-spell/1",
        target: null,
        effects: [{ kind: "draw", recipient: "controller", amount: 1 }],
      };
      card.oracleText = "Draw a card.";
    },
    (card) => {
      delete card.spellProgram;
      card.implementationRevision = "commander-development-recipes/1";
      card.oracleText = "";
    },
    (card) => {
      card.sourceVersion = "0".repeat(64);
    },
  ];
  for (const recipe of CREATURE_RETURN_SPELLS)
    for (const change of changes) {
      const changed = structuredClone(source);
      const card = changed.definitions[`oracle:${recipe.identity}`];
      if (!card) throw new Error("Missing source fixture");
      change(card);
      const altered = await rehash(changed);
      await expect(createFullExecutionRegistry(altered)).rejects.toThrow(
        "Unauthenticated definition",
      );
      await expect(createPreparedMatchArtifact(altered, selected)).rejects.toThrow(
        "Unauthenticated definition",
      );
    }
  for (const keepVersion of [true, false]) {
    const changed = structuredClone(source);
    const original = CREATURE_RETURN_SPELLS[0];
    if (!original) throw new Error("Missing source recipe");
    const card = changed.definitions[`oracle:${original.identity}`];
    if (!card) throw new Error("Missing definition");
    delete changed.definitions[card.id];
    card.oracleId = "00000000-0000-0000-0000-000000000000";
    card.id = `oracle:${card.oracleId}`;
    if (!keepVersion) card.sourceVersion = "0".repeat(64);
    card.oracleText = "Draw a card.";
    card.implementationRevision = "commander-development-recipes/1";
    card.spellProgram = {
      schema: "commander-spell/1",
      target: null,
      effects: [{ kind: "draw", recipient: "controller", amount: 1 }],
    };
    changed.definitions[card.id] = card;
    const altered = await rehash(changed);
    await expect(createFullExecutionRegistry(altered)).rejects.toThrow(
      "Unauthenticated definition",
    );
    await expect(createPreparedMatchArtifact(altered, selected)).rejects.toThrow(
      "Unauthenticated definition",
    );
  }
});

test("creature-return fixture construction rejects absent commanders, missing source bindings and corrupt historical revisions", async () => {
  const { source, decks } = await fixture();
  await expect(makeCreatureReturnDecks(source, decks.slice(0, 1))).rejects.toThrow(
    "Missing frozen blue fixture commander",
  );
  const bad = structuredClone(decks);
  if (!bad[0]) throw new Error("Missing deck");
  bad[0].hash = "0".repeat(64);
  await expect(makeCreatureReturnDecks(source, bad)).rejects.toThrow("Frozen deck hash mismatch");
  const missing = structuredClone(source);
  const first = CREATURE_RETURN_SPELLS[0];
  if (!first) throw new Error("Missing recipe");
  delete missing.definitions[`oracle:${first.identity}`];
  await expect(makeCreatureReturnDecks(await rehash(missing), decks)).rejects.toThrow(
    "Missing authenticated creature-return",
  );
});
