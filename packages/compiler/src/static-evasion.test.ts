import { expect, test } from "bun:test";
import { STATIC_EVASION_PERMANENTS, STATIC_EVASION_VERSION } from "@iwsdk-apps/card-programs";
import { canonicalJson, ENGINE_VERSION, semanticHash } from "@iwsdk-apps/contracts";
import { admitDeck } from "../../engine/src/index";
import {
  evasionDefinitionShards,
  evasionFixtureMetadata,
  evasionFixtureSource,
  evasionPriorDecks,
} from "../test-fixtures/static-evasion";
import { makeStaticEvasionDecks } from "./development-static-evasion-decks";
import {
  buildDevelopmentMatchPlan,
  MATCH_PLAN_VERSION,
  STATIC_EVASION_CORE_CAPABILITIES,
} from "./plan";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "./prepared";
import { REVIEWED_SOURCE_BINDINGS } from "./reviewed-source-bindings";

async function rehash<T extends { hash: string }>(x: T): Promise<T> {
  const { hash: _hash, ...body } = x;
  return { ...body, hash: await semanticHash(body) } as T;
}
async function fixtures() {
  const source = await evasionFixtureSource();
  const result = await makeStaticEvasionDecks(source, evasionPriorDecks());
  const chosen = result.decks.slice(63, 65);
  return { source, result, chosen };
}
test("authenticated combined inventory preserves1437 source tuples and146 whole evasion definitions", async () => {
  const source = await evasionFixtureSource();
  const { hash, ...body } = evasionFixtureMetadata;
  expect(await semanticHash(body)).toBe(hash);
  expect(evasionFixtureMetadata.originPrimaryCount).toBe(1583);
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1789);
  expect(evasionFixtureMetadata.originAuxiliaryCount).toBe(20);
  for (const [i, shard] of evasionDefinitionShards.entries())
    expect(await semanticHash(shard)).toBe(
      evasionFixtureMetadata.definitionShards[i]?.semanticHash ?? "missing",
    );
  for (const raw of STATIC_EVASION_PERMANENTS) {
    const d = source.definitions[`oracle:${raw.identity}`];
    if (!d) throw Error(raw.name);
    expect(d.sourceVersion).toBe(raw.sourceVersion);
    expect(await semanticHash(d)).toBe(
      REVIEWED_SOURCE_BINDINGS[d.oracleId]?.definitionHash ?? "missing",
    );
  }
});
test("six legal profiles preserve63 exact revisions; all47 commanders prove145 coverage and the RU gap", async () => {
  const { source, result } = await fixtures();
  const full = await createFullExecutionRegistry(source);
  expect(result.decks).toHaveLength(69);
  expect(canonicalJson(result.decks.slice(0, 63))).toBe(canonicalJson(evasionPriorDecks()));
  expect(
    canonicalJson(result.decks.slice(63).map(({ commander, entries }) => ({ commander, entries }))),
  ).toBe(canonicalJson(evasionFixtureMetadata.expectedSupplements));
  expect(result.report.coveredBindings).toBe(145);
  expect(result.report.commanderInventory).toHaveLength(47);
  expect(result.report.excluded.map((d) => d.name)).toEqual(["Storm Fleet Sprinter"]);
  expect(result.report.excluded[0]?.compatibleCommanderIds).toEqual([]);
  expect(
    new Set(result.decks.map((d) => canonicalJson({ commander: d.commander, entries: d.entries })))
      .size,
  ).toBe(69);
  for (const d of result.decks) {
    admitDeck(d, full);
    const { hash, ...body } = d;
    expect(await semanticHash(body)).toBe(hash);
    expect(d.entries.reduce((n, r) => n + r.count, 0)).toBe(100);
  }
  for (const d of result.decks.slice(63)) {
    expect(
      d.entries
        .filter((r) => source.definitions[r.definition]?.supertypes.includes("Basic"))
        .reduce((n, r) => n + r.count, 0),
    ).toBe(39);
    const artifact = await createPreparedMatchArtifact(source, [d, d]);
    const registry = await admitPreparedMatchArtifact(artifact, source, [d, d]);
    admitDeck(d, registry);
    expect(artifact.retainedDefinitions.length).toBeLessThan(
      Object.keys(source.definitions).length,
    );
  }
});
for (const capability of STATIC_EVASION_CORE_CAPABILITIES)
  test(`rehashed removal of ${capability} cannot authorize a prepared evasion match`, async () => {
    const { source, chosen } = await fixtures();
    const artifact = await createPreparedMatchArtifact(source, chosen);
    expect(MATCH_PLAN_VERSION).toBe("development-match-plan/17");
    expect(artifact.requiredCoreCapabilities).toContain(capability);
    artifact.requiredCoreCapabilities = artifact.requiredCoreCapabilities.filter(
      (c) => c !== capability,
    );
    artifact.closure.retainedCoreCapabilities = artifact.closure.retainedCoreCapabilities.filter(
      (c) => c !== capability,
    );
    await expect(
      admitPreparedMatchArtifact(await rehash(artifact), source, chosen),
    ).rejects.toThrow();
  });
const mutations = [
  "erase-keywords",
  "erase-restrictions",
  "legacy-downgrade",
  "all-identifiers",
  "unknown-unused",
  "dictionary",
  "body",
  "source-version",
] as const;
for (const change of mutations)
  test(`full and prepared factories reject rehashed ${change}`, async () => {
    const { source, chosen } = await fixtures();
    const copy = structuredClone(source);
    const card = Object.values(copy.definitions).find((d) => d.name === "Nezumi Cutthroat");
    if (!card) throw Error("Missing authentic combined body");
    switch (change) {
      case "erase-keywords":
        card.keywords = [];
        break;
      case "erase-restrictions":
        delete card.blockingRestrictions;
        break;
      case "legacy-downgrade":
        card.implementationRevision = "commander-development-recipes/1";
        card.keywords = [];
        delete card.blockingRestrictions;
        card.oracleText = "";
        break;
      case "all-identifiers":
        delete copy.definitions[card.id];
        card.id = "oracle:invented";
        card.oracleId = "invented";
        card.sourceVersion = "1".repeat(64);
        copy.definitions[card.id] = card;
        break;
      case "unknown-unused":
        copy.definitions["oracle:invented"] = {
          ...card,
          id: "oracle:invented",
          oracleId: "invented",
          sourceVersion: "2".repeat(64),
        };
        break;
      case "dictionary":
        copy.definitions["oracle:wrong"] = card;
        break;
      case "body":
        card.oracleText += "\nDraw a card.";
        break;
      case "source-version":
        card.sourceVersion = "3".repeat(64);
        break;
    }
    const bad = await rehash(copy);
    await expect(createFullExecutionRegistry(bad)).rejects.toThrow();
    await expect(createPreparedMatchArtifact(bad, chosen)).rejects.toThrow();
  });
test("incompatible ABI and unknown constructor leave execution blocked with conservative closure", async () => {
  const { source, chosen } = await fixtures();
  expect(ENGINE_VERSION).toBe("commander-engine/0.21.0");
  for (const processorAbi of ["commander-engine/0.20.0", "commander-engine/0.22.0"]) {
    const bad = await rehash({ ...source, processorAbi });
    await expect(createFullExecutionRegistry(bad)).rejects.toThrow("ABI");
    await expect(createPreparedMatchArtifact(bad, chosen)).rejects.toThrow("ABI");
  }
  const d = Object.values(source.definitions).find(
    (d) => d.implementationRevision === STATIC_EVASION_VERSION,
  );
  if (!d) throw Error("Missing definition");
  d.implementationRevision = "unknown/1";
  const changed = await rehash(source);
  const roots = [...chosen.map((x) => structuredClone(x))];
  const first = roots[0];
  if (!first) throw Error("Missing deck");
  first.entries.push({ definition: d.id, count: 1 });
  const plan = await buildDevelopmentMatchPlan(changed, [await rehash(first)]);
  expect(plan.closure.blockers).toContain(`unimplemented-definition:${d.id}`);
  expect(plan.closure.blockers).toContain(`unresolved-dependencies:${d.id}`);
});
