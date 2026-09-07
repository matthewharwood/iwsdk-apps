import { expect, test } from "bun:test";
import { STATIC_KEYWORD_GRANT_VERSION, STATIC_KEYWORD_GRANTS } from "@iwsdk-apps/card-programs";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { admitDeck } from "../../engine/src/index";
import {
  staticKeywordFixtureMetadata,
  staticKeywordFixtureSource,
  staticKeywordPriorDecks,
} from "../test-fixtures/static-keyword-grant";
import { makeStaticKeywordGrantDecks } from "./development-static-keyword-grant-decks";
import {
  buildDevelopmentMatchPlan,
  MATCH_PLAN_VERSION,
  STATIC_KEYWORD_GRANT_CORE_CAPABILITIES,
} from "./plan";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "./prepared";
import { REVIEWED_SOURCE_BINDINGS } from "./reviewed-source-bindings";

async function rehash<T extends { hash: string }>(value: T): Promise<T> {
  const { hash: _hash, ...body } = value;
  return { ...body, hash: await semanticHash(body) } as T;
}
async function fixtures() {
  const source = await staticKeywordFixtureSource();
  const result = await makeStaticKeywordGrantDecks(source, staticKeywordPriorDecks());
  return { source, result, chosen: result.decks.slice(69, 71) };
}
test("closed source membership adds55 exact grants while preserving all1583 prior definition digests", async () => {
  const { hash, ...body } = staticKeywordFixtureMetadata;
  expect(await semanticHash(body)).toBe(hash);
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1638);
  const newIds = new Set(STATIC_KEYWORD_GRANTS.map((row) => row.identity));
  const prior = Object.fromEntries(
    Object.entries(REVIEWED_SOURCE_BINDINGS).filter(([id]) => !newIds.has(id)),
  );
  expect(Object.keys(prior)).toHaveLength(1583);
  expect(await semanticHash(prior)).toBe(staticKeywordFixtureMetadata.priorBindingsHash);
  const source = await staticKeywordFixtureSource();
  for (const row of STATIC_KEYWORD_GRANTS) {
    const d = source.definitions[`oracle:${row.identity}`];
    if (!d) throw Error(row.name);
    expect(d.sourceVersion).toBe(row.sourceVersion);
    expect(await semanticHash(d)).toBe(
      REVIEWED_SOURCE_BINDINGS[row.identity]?.definitionHash ?? "missing",
    );
  }
});
test("five legal source profiles preserve69 exact decks, cover55 grant identities and all27 previous commander-color gaps", async () => {
  const { source, result } = await fixtures();
  const full = await createFullExecutionRegistry(source);
  expect(result.decks).toHaveLength(74);
  expect(canonicalJson(result.decks.slice(0, 69))).toBe(canonicalJson(staticKeywordPriorDecks()));
  expect(result.report.coveredBindings).toBe(55);
  expect(result.report.excluded).toEqual([]);
  expect(result.report.priorCommanderCount).toBe(47);
  expect(result.report.commanderInventory).toHaveLength(51);
  expect(result.report.newlyCoveredPriorColorGaps.map((row) => row.name).sort()).toEqual(
    staticKeywordFixtureMetadata.priorColorGaps.map((row) => row.name).sort(),
  );
  expect(result.report.newlyCoveredPriorColorGaps).toHaveLength(27);
  expect(
    result.report.newlyCoveredPriorColorGaps.every((row) => row.supplementalDeckHashes.length > 0),
  ).toBe(true);
  expect(
    new Set(
      result.decks.map((deck) =>
        canonicalJson({ commander: deck.commander, entries: deck.entries }),
      ),
    ).size,
  ).toBe(74);
  for (const deck of result.decks) {
    admitDeck(deck, full);
    const { hash, ...body } = deck;
    expect(await semanticHash(body)).toBe(hash);
    expect(deck.entries.reduce((n, row) => n + row.count, 0)).toBe(100);
  }
  for (const deck of result.decks.slice(69)) {
    expect(
      deck.entries
        .filter((row) => source.definitions[row.definition]?.supertypes.includes("Basic"))
        .reduce((n, row) => n + row.count, 0),
    ).toBe(39);
    const artifact = await createPreparedMatchArtifact(source, [deck, deck]);
    const registry = await admitPreparedMatchArtifact(artifact, source, [deck, deck]);
    admitDeck(deck, registry);
    expect(artifact.retainedDefinitions.length).toBeLessThan(
      Object.keys(source.definitions).length,
    );
  }
  const hivelord = result.decks[69];
  if (!hivelord) throw Error("Missing full grant profile");
  expect(
    STATIC_KEYWORD_GRANTS.every((row) =>
      hivelord.entries.some((e) => e.definition === `oracle:${row.identity}`),
    ),
  ).toBe(true);
});
for (const capability of STATIC_KEYWORD_GRANT_CORE_CAPABILITIES)
  test(`rehashed prepared capability omission rejects ${capability}`, async () => {
    const { source, chosen } = await fixtures();
    const artifact = await createPreparedMatchArtifact(source, chosen);
    expect(MATCH_PLAN_VERSION).toBe("development-match-plan/16");
    expect(artifact.requiredCoreCapabilities).toContain(capability);
    artifact.requiredCoreCapabilities = artifact.requiredCoreCapabilities.filter(
      (x) => x !== capability,
    );
    artifact.closure.retainedCoreCapabilities = artifact.closure.retainedCoreCapabilities.filter(
      (x) => x !== capability,
    );
    await expect(
      admitPreparedMatchArtifact(await rehash(artifact), source, chosen),
    ).rejects.toThrow();
  });
for (const change of [
  "program-erasure",
  "recipe-downgrade",
  "all-identifiers",
  "unknown-unused",
  "controller-domain",
  "source-exclusion",
  "type-conjunction",
  "color-filter",
  "grant-keyword",
  "source-version",
  "bundle",
  "rules",
] as const)
  test(`full/prepared source factories reject rehashed ${change}`, async () => {
    const { source, chosen } = await fixtures();
    const copy = structuredClone(source);
    const d = Object.values(copy.definitions).find((row) => row.name === "Sliver Hivelord");
    if (!d) throw Error("Missing Hivelord");
    const program = d.staticKeywordPrograms?.[0];
    if (!program) throw Error("Missing whole program");
    switch (change) {
      case "program-erasure":
        delete d.staticKeywordPrograms;
        break;
      case "recipe-downgrade":
        d.implementationRevision = "commander-development-recipes/1";
        delete d.staticKeywordPrograms;
        d.oracleText = "";
        break;
      case "all-identifiers":
        delete copy.definitions[d.id];
        d.oracleId = "invented";
        d.id = "oracle:invented";
        d.sourceVersion = "1".repeat(64);
        copy.definitions[d.id] = d;
        break;
      case "unknown-unused":
        copy.definitions["oracle:invented"] = {
          ...d,
          id: "oracle:invented",
          oracleId: "invented",
          sourceVersion: "2".repeat(64),
        };
        break;
      case "controller-domain":
        program.filter.controller = "any";
        break;
      case "source-exclusion":
        program.filter.excludeSource = true;
        break;
      case "type-conjunction":
        program.filter.types = ["Artifact", "Creature"];
        break;
      case "color-filter":
        program.filter.color = "U";
        break;
      case "grant-keyword":
        program.grant = ["flying"];
        break;
      case "source-version":
        d.sourceVersion = "3".repeat(64);
        break;
      case "bundle":
        copy.sourceBundle = "4".repeat(64);
        break;
      case "rules":
        copy.rulesHash = "5".repeat(64);
        break;
    }
    const bad = await rehash(copy);
    await expect(createFullExecutionRegistry(bad)).rejects.toThrow();
    await expect(createPreparedMatchArtifact(bad, chosen)).rejects.toThrow();
  });
test("wrong ABI and unresolved grant constructors block admission and conservative closure", async () => {
  const { source, chosen } = await fixtures();
  for (const processorAbi of ["commander-engine/0.19.0", "commander-engine/0.21.0"]) {
    const bad = await rehash({ ...source, processorAbi });
    await expect(createFullExecutionRegistry(bad)).rejects.toThrow("ABI");
    await expect(createPreparedMatchArtifact(bad, chosen)).rejects.toThrow("ABI");
  }
  const d = Object.values(source.definitions).find((row) => row.name === "Sliver Hivelord");
  if (!d) throw Error("Missing source");
  expect(d.implementationRevision).toBe(STATIC_KEYWORD_GRANT_VERSION);
  d.implementationRevision = "unknown/1";
  const plan = await buildDevelopmentMatchPlan(await rehash(source), chosen);
  expect(plan.closure.blockers).toContain(`unimplemented-definition:${d.id}`);
  expect(plan.closure.blockers).toContain(`unresolved-dependencies:${d.id}`);
});

for (const implementationRevision of ["toString", "__proto__", "hasOwnProperty"])
  test(`inherited object property ${implementationRevision} is not a constructor declaration`, async () => {
    const { source, chosen } = await fixtures();
    const old = Object.values(source.definitions).find((d) => d.name === "Sliver Hivelord");
    if (!old) throw Error("Missing source");
    const unknown = {
      ...old,
      id: "oracle:unreviewed-constructor",
      oracleId: "unreviewed-constructor",
      sourceVersion: "a".repeat(64),
      implementationRevision,
    };
    delete source.definitions[old.id];
    source.definitions[unknown.id] = unknown;
    const roots = await Promise.all(
      chosen.map(async (deck) =>
        rehash({
          ...deck,
          commander: deck.commander === old.id ? unknown.id : deck.commander,
          entries: deck.entries.map((row) =>
            row.definition === old.id ? { ...row, definition: unknown.id } : row,
          ),
        }),
      ),
    );
    const plan = await buildDevelopmentMatchPlan(await rehash(source), roots);
    expect(plan.closure.blockers).toContain(`unimplemented-definition:${unknown.id}`);
    expect(plan.closure.blockers).toContain(`unresolved-dependencies:${unknown.id}`);
  });
