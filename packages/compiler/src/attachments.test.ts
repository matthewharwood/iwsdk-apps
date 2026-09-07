import { expect, test } from "bun:test";
import { ATTACHMENT_PERMANENTS, ATTACHMENT_VERSION } from "@iwsdk-apps/card-programs";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { admitDeck } from "../../engine/src/index";
import {
  attachmentFixtureMetadata,
  attachmentFixtureSource,
  attachmentPriorDecks,
} from "../test-fixtures/attachments";
import { makeAttachmentDecks } from "./development-attachment-decks";
import {
  ATTACHMENT_CORE_CAPABILITIES,
  buildDevelopmentMatchPlan,
  MATCH_PLAN_VERSION,
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
  const source = await attachmentFixtureSource();
  const result = await makeAttachmentDecks(source, attachmentPriorDecks());
  return { source, result, chosen: result.decks.slice(74, 76) };
}
test("closed membership adds151 exact attachment definitions and preserves all1638 old definitions plus20 token templates", async () => {
  const { hash, ...body } = attachmentFixtureMetadata;
  expect(await semanticHash(body)).toBe(hash);
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1789);
  const identities = new Set(ATTACHMENT_PERMANENTS.map((row) => row.identity));
  const prior = Object.fromEntries(
    Object.entries(REVIEWED_SOURCE_BINDINGS).filter(([id]) => !identities.has(id)),
  );
  expect(Object.keys(prior)).toHaveLength(1638);
  expect(await semanticHash(prior)).toBe(attachmentFixtureMetadata.priorBindingsHash);
  const source = await attachmentFixtureSource();
  expect(Object.keys(source.definitions)).toHaveLength(1789);
  expect(Object.keys(source.tokenTemplates ?? {})).toHaveLength(20);
  const oldDefinitions = Object.fromEntries(
    Object.entries(source.definitions).filter(([, d]) => !identities.has(d.oracleId)),
  );
  expect(await semanticHash(oldDefinitions)).toBe(attachmentFixtureMetadata.priorDefinitionsHash);
  let auras = 0,
    equipment = 0;
  for (const row of ATTACHMENT_PERMANENTS) {
    const d = source.definitions[`oracle:${row.identity}`];
    if (!d) throw Error(row.name);
    expect(d.sourceVersion).toBe(row.sourceVersion);
    expect(d.implementationRevision).toBe(ATTACHMENT_VERSION);
    expect(d.attachmentProgram).toEqual(row.program);
    expect(await semanticHash(d)).toBe(
      REVIEWED_SOURCE_BINDINGS[row.identity]?.definitionHash ?? "missing",
    );
    if (d.attachmentProgram?.schema === "commander-aura/1") auras++;
    if (d.attachmentProgram?.schema === "commander-equipment/1") equipment++;
  }
  expect({ auras, equipment }).toEqual({ auras: 87, equipment: 64 });
});
test("six legal profiles preserve74 complete revisions and cover every attachment once with creatures and interaction support", async () => {
  const { source, result } = await fixtures();
  const full = await createFullExecutionRegistry(source);
  expect(result.decks).toHaveLength(80);
  expect(canonicalJson(result.decks.slice(0, 74))).toBe(canonicalJson(attachmentPriorDecks()));
  expect(result.report.coveredBindings).toBe(151);
  expect(result.report.excluded).toEqual([]);
  expect(result.report.commanderInventory).toHaveLength(51);
  expect(result.report.coverage.every((row) => row.supplementalDeckHashes.length === 1)).toBe(true);
  expect(
    new Set(
      result.decks.map((deck) =>
        canonicalJson({ commander: deck.commander, entries: deck.entries }),
      ),
    ).size,
  ).toBe(80);
  for (const deck of result.decks) {
    admitDeck(deck, full);
    const { hash, ...body } = deck;
    expect(await semanticHash(body)).toBe(hash);
    expect(deck.entries.reduce((n, row) => n + row.count, 0)).toBe(100);
  }
  for (const deck of result.decks.slice(74)) {
    const definitions = deck.entries.map((row) => source.definitions[row.definition]);
    expect(
      deck.entries
        .filter((row) => source.definitions[row.definition]?.supertypes.includes("Basic"))
        .reduce((n, row) => n + row.count, 0),
    ).toBe(39);
    const attachments = definitions.filter((d) => d?.attachmentProgram);
    expect(attachments.length).toBeGreaterThanOrEqual(20);
    expect(attachments.length).toBeLessThanOrEqual(30);
    expect(attachments.some((d) => d?.attachmentProgram?.schema === "commander-aura/1")).toBe(true);
    expect(attachments.some((d) => d?.attachmentProgram?.schema === "commander-equipment/1")).toBe(
      true,
    );
    expect(definitions.filter((d) => d?.types.includes("Creature")).length).toBeGreaterThanOrEqual(
      20,
    );
    const prepared = await createPreparedMatchArtifact(source, [deck, deck]);
    const registry = await admitPreparedMatchArtifact(prepared, source, [deck, deck]);
    admitDeck(deck, registry);
    expect(prepared.retainedDefinitions.length).toBeLessThan(1789);
    for (const capability of ATTACHMENT_CORE_CAPABILITIES)
      expect(prepared.requiredCoreCapabilities).toContain(capability);
  }
});
for (const capability of ATTACHMENT_CORE_CAPABILITIES)
  test(`rehashed prepared artifact cannot erase ${capability}`, async () => {
    const { source, chosen } = await fixtures();
    const artifact = await createPreparedMatchArtifact(source, chosen);
    expect(MATCH_PLAN_VERSION).toBe("development-match-plan/17");
    artifact.requiredCoreCapabilities = artifact.requiredCoreCapabilities.filter(
      (row) => row !== capability,
    );
    artifact.closure.retainedCoreCapabilities = artifact.closure.retainedCoreCapabilities.filter(
      (row) => row !== capability,
    );
    await expect(
      admitPreparedMatchArtifact(await rehash(artifact), source, chosen),
    ).rejects.toThrow();
  });
for (const change of [
  "program-erasure",
  "legacy-downgrade",
  "all-identifiers",
  "known-version-renaming",
  "unknown-unused",
  "attached-modifier",
  "grant-keyword",
  "intrinsic-keyword",
  "equip-cost",
  "equip-timing",
  "equip-target",
  "equip-effect",
  "body",
  "source-version",
  "dictionary",
  "bundle",
  "rules",
] as const)
  test(`source factories reject rehashed attachment ${change}`, async () => {
    const { source, chosen } = await fixtures();
    const d = Object.values(source.definitions).find((row) => row.name === "Darksteel Plate");
    if (!d || d.attachmentProgram?.schema !== "commander-equipment/1")
      throw Error("Missing exact Plate");
    const p = d.attachmentProgram;
    switch (change) {
      case "program-erasure":
        delete d.attachmentProgram;
        break;
      case "legacy-downgrade":
        delete d.attachmentProgram;
        d.implementationRevision = "commander-development-recipes/1";
        d.oracleText = "";
        break;
      case "all-identifiers":
      case "known-version-renaming":
        delete source.definitions[d.id];
        d.oracleId = "invented";
        d.id = "oracle:invented";
        if (change === "all-identifiers") d.sourceVersion = "1".repeat(64);
        source.definitions[d.id] = d;
        break;
      case "unknown-unused":
        source.definitions["oracle:invented"] = {
          ...d,
          id: "oracle:invented",
          oracleId: "invented",
          sourceVersion: "2".repeat(64),
        };
        break;
      case "attached-modifier":
        p.attachedModifier.powerDelta++;
        break;
      case "grant-keyword":
        p.attachedModifier.keywords = ["shroud"];
        break;
      case "intrinsic-keyword":
        d.keywords = [];
        break;
      case "equip-cost":
        p.equip.cost.mana.generic++;
        break;
      case "equip-timing":
        Object.assign(p.equip, { timing: "priority" });
        break;
      case "equip-target":
        Object.assign(p.equip, { target: "creature" });
        break;
      case "equip-effect":
        Object.assign(p.equip, { effects: [{ kind: "draw", recipient: "controller", amount: 1 }] });
        break;
      case "body":
        d.oracleText += "\nDraw a card.";
        break;
      case "source-version":
        d.sourceVersion = "3".repeat(64);
        break;
      case "dictionary":
        delete source.definitions[d.id];
        source.definitions["oracle:invented"] = d;
        break;
      case "bundle":
        source.sourceBundle = "4".repeat(64);
        break;
      case "rules":
        source.rulesHash = "5".repeat(64);
        break;
    }
    const bad = await rehash(source);
    await expect(createFullExecutionRegistry(bad)).rejects.toThrow();
    await expect(createPreparedMatchArtifact(bad, chosen)).rejects.toThrow();
  });
test("unknown attachment dependencies widen and block; incompatible ABI rejects even with legacy-only roots", async () => {
  const { source, chosen } = await fixtures();
  for (const processorAbi of ["commander-engine/0.20.0", "commander-engine/0.22.0"]) {
    const bad = await rehash({ ...source, processorAbi });
    const legacy = attachmentPriorDecks().slice(0, 2);
    await expect(createFullExecutionRegistry(bad)).rejects.toThrow("ABI");
    await expect(createPreparedMatchArtifact(bad, legacy)).rejects.toThrow("ABI");
  }
  const card =
    source.definitions[
      chosen[0]?.entries.find((row) => source.definitions[row.definition]?.attachmentProgram)
        ?.definition ?? ""
    ];
  if (!card) throw Error("Missing chosen attachment");
  card.implementationRevision = "unreviewed/1";
  const plan = await buildDevelopmentMatchPlan(await rehash(source), chosen);
  expect(plan.closure.blockers).toContain(`unimplemented-definition:${card.id}`);
  expect(plan.closure.blockers).toContain(`unresolved-dependencies:${card.id}`);
});
test("fixture builder rejects corrupt prior hash, missing known attachment and illegal historical composition", async () => {
  const source = await attachmentFixtureSource(),
    prior = attachmentPriorDecks();
  const first = prior[0];
  if (!first) throw Error("Missing prior");
  await expect(makeAttachmentDecks(source, [{ ...first, hash: "0".repeat(64) }])).rejects.toThrow(
    "hash",
  );
  const missing = structuredClone(source);
  const id = `oracle:${ATTACHMENT_PERMANENTS[0]?.identity}`;
  delete missing.definitions[id];
  await expect(makeAttachmentDecks(await rehash(missing), prior)).rejects.toThrow(
    "Missing authenticated",
  );
  const changed = structuredClone(first);
  const row = changed.entries[0];
  if (!row) throw Error("Missing row");
  row.count++;
  await expect(makeAttachmentDecks(source, [await rehash(changed)])).rejects.toThrow("composition");
});
