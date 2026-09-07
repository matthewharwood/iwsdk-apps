import { beforeAll, expect, test } from "bun:test";
import { FIXED_TOKEN_SPELLS, FIXED_TOKEN_TEMPLATES } from "@iwsdk-apps/card-programs";
import {
  type CardDefinition,
  ContentRelease,
  canonicalJson,
  DeckRevision,
  ENGINE_VERSION,
  type PreparedMatchArtifact,
  semanticHash,
  type TokenTemplate,
} from "@iwsdk-apps/contracts";
import { admitDeck } from "../../engine/src/index";
import frozen from "../test-fixtures/fixed-token-decks.json";
import { makeFixedTokenDecks } from "./fixed-token-decks";
import { buildDevelopmentMatchPlan, FIXED_TOKEN_CORE_CAPABILITIES } from "./plan";
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
    id: "authenticated-fixed-token-fixture/1",
    sourceBundle: frozen.sourceBundle,
    rulesHash: frozen.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: structuredClone(frozen.definitions),
    tokenTemplates: structuredClone(frozen.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(frozen.definitions).length,
    compilerVersion: "fixed-token-unit/1",
    processorAbi: ENGINE_VERSION,
  };
  return {
    source: ContentRelease.parse({ ...body, hash: await semanticHash(body) }),
    decks: frozen.decks.map((deck) => DeckRevision.parse(deck)),
  };
}
async function rehash<T extends { hash: string }>(value: T): Promise<T> {
  const { hash: _hash, ...body } = value;
  return { ...body, hash: await semanticHash(body) } as T;
}
function expectedTemplate(source: ContentRelease, name: string): TokenTemplate {
  const row = frozen.sourceRecords.find((record) => record.name === name);
  if (!row) throw new Error(`Missing independently transcribed token shape: ${name}`);
  const { count: _count, ...shape } = row.expected;
  const matches = Object.values(source.tokenTemplates ?? {}).filter(
    (template) =>
      canonicalJson({
        ...template.characteristics,
        colors: template.characteristics.colors.toSorted(),
      }) === canonicalJson({ ...shape, colors: shape.colors.toSorted() }),
  );
  if (matches.length !== 1 || !matches[0]) throw new Error(`Ambiguous expected template: ${name}`);
  return matches[0];
}
function tokenEffect(card: CardDefinition) {
  const effect = card.spellProgram?.effects[0];
  if (effect?.kind !== "create-token") throw new Error("Missing exact producer instruction");
  return effect;
}

beforeAll(async () => {
  const { hash, ...body } = frozen;
  expect(hash).toBe("705bca6e450618b52840e57f86c32de760b60fd90cad266216d2ae1e2ddbb5eb");
  expect(await semanticHash(body)).toBe(hash);
  expect(frozen.originReleaseHash).toBe(
    "fd5d52dc3d11284940cae72faace2ca0ead11deaa11508c12ea6b179967912a4",
  );
  expect(frozen.selectedIndices).toEqual([26, 27, 29, 33, 34]);
  expect(frozen.previousDeckHashes).toHaveLength(35);
  for (const [index, deck] of frozen.decks.entries())
    expect(deck.hash).toBe(
      frozen.previousDeckHashes[frozen.selectedIndices[index] ?? -1] ?? "missing-history",
    );
});

test("closed authentication counts 1170 primary cards separately from 20 canonical auxiliary token templates", async () => {
  const { source } = await fixture();
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1170);
  expect(await semanticHash(REVIEWED_SOURCE_BINDINGS)).toBe(REVIEWED_BINDING_SNAPSHOT.bindingsHash);
  expect(frozen.originPrimaryCount).toBe(1129);
  expect(frozen.originAuxiliaryCount).toBe(20);
  expect(Object.keys(FIXED_TOKEN_TEMPLATES)).toHaveLength(20);
  expect(FIXED_TOKEN_SPELLS).toHaveLength(27);
  const registry = await createFullExecutionRegistry(source);
  expect(Object.keys(registry.definitions)).toHaveLength(319);
  expect(Object.keys(registry.tokenTemplates)).toHaveLength(20);
  expect(Object.keys(registry.definitions).some((id) => id.startsWith("token-template:"))).toBe(
    false,
  );
  for (const [identity, template] of Object.entries(registry.tokenTemplates)) {
    const { id, ...payload } = template;
    expect(identity).toBe(id);
    expect(id).toBe(`token-template:${await semanticHash(payload)}`);
    expect(template.rulesHash).toBe(source.rulesHash);
    expect(Object.isFrozen(template.characteristics)).toBe(true);
    expect("oracleId" in template).toBe(false);
  }
});

test("all 27 source producer instructions have exactly their independently expected token dependency, including the nonexecuted WB gap", async () => {
  const { source } = await fixture();
  const commander = Object.values(source.definitions).find(
    (card) => card.name === "Jasmine Boreal",
  );
  if (!commander) throw new Error("Missing dependency analysis root");
  for (const row of frozen.sourceRecords) {
    const identity = `oracle:${row.identity}`;
    const card = source.definitions[identity];
    if (!card) throw new Error("Missing source producer");
    expect(card.sourceVersion).toBe(row.sourceVersion);
    expect(card.oracleText).toBe(row.oracle.oracle_text);
    const template = expectedTemplate(source, row.name);
    expect(canonicalJson(card.spellProgram)).toBe(
      canonicalJson({
        schema: "commander-spell/1",
        target: null,
        effects: [
          {
            kind: "create-token",
            recipient: "controller",
            count: row.expected.count,
            templateId: template.id,
          },
        ],
      }),
    );
    // Definition-only dependency analysis intentionally uses two roots, not a legal
    // game deck. Call to the Feast's missing legal commander is asserted separately.
    const body = {
      id: `dependency-analysis:${row.identity}`,
      commander: commander.id,
      entries: [
        { definition: commander.id, count: 1 },
        { definition: identity, count: 1 },
      ],
    };
    const deck = { ...body, hash: await semanticHash(body) };
    const plan = await buildDevelopmentMatchPlan(source, [deck]);
    expect(plan.closure.retained).toEqual([commander.id, identity, template.id].sort());
    expect(plan.closure.blockers).toEqual([]);
    expect(plan.closure.widened).toEqual([]);
    expect(plan.closure.excluded.filter((id) => id.startsWith("token-template:"))).toHaveLength(19);
  }
});

test("five token fixture supplements preserve selected historical bytes and 39 basics while covering 26 legal producers", async () => {
  const { source, decks } = await fixture();
  const before = canonicalJson(decks);
  const result = await makeFixedTokenDecks(source, decks);
  const full = await createFullExecutionRegistry(source);
  expect(result.decks).toHaveLength(10);
  expect(canonicalJson(result.decks.slice(0, 5))).toBe(before);
  expect(canonicalJson(decks)).toBe(before);
  expect(result.report.boundTokenProducers).toBe(27);
  expect(result.report.coveredTokenProducers).toBe(26);
  expect(result.report.auxiliaryTokenTemplates).toBe(20);
  expect(result.report.executedGames).toBe(0);
  expect(result.report.excluded).toEqual([
    {
      definition: "oracle:30536d1f-8b1a-474f-a508-d3426480a532",
      name: "Call to the Feast",
      reason: "no-compatible-implemented-commander",
      colorIdentity: ["B", "W"],
      reviewedCommanderDefinitions: 37,
      executed: false,
    },
  ]);
  const templates = new Set<string>();
  for (const deck of result.decks.slice(5)) {
    admitDeck(deck, full);
    const { hash, ...body } = deck;
    expect(await semanticHash(body)).toBe(hash);
    expect(deck.entries.reduce((sum, entry) => sum + entry.count, 0)).toBe(100);
    expect(
      deck.entries
        .filter((entry) => source.definitions[entry.definition]?.supertypes.includes("Basic"))
        .reduce((sum, entry) => sum + entry.count, 0),
    ).toBe(39);
    for (const entry of deck.entries) {
      expect(entry.definition.startsWith("oracle:")).toBe(true);
      const card = source.definitions[entry.definition];
      if (card?.spellProgram?.effects[0]?.kind === "create-token") {
        expect(entry.count).toBe(1);
        templates.add(card.spellProgram.effects[0].templateId);
      }
    }
  }
  expect(templates.size).toBe(20);
  const ral = Object.values(source.definitions).find(
    (card) => card.name === "Ral's Reinforcements",
  );
  const redBlack = result.decks
    .slice(5)
    .find((deck) => source.definitions[deck.commander]?.name === "Lady Orca");
  if (!ral || !redBlack) throw new Error("Missing red-only producer fixture");
  expect(ral.colorIdentity).toEqual(["R"]);
  expect(source.definitions[redBlack.commander]?.colorIdentity).not.toContain("U");
  expect(redBlack.entries.find((entry) => entry.definition === ral.id)?.count).toBe(1);
  expect(expectedTemplate(source, ral.name).characteristics.colors.toSorted()).toEqual(["R", "U"]);
  const { hash, ...body } = result.report;
  expect(await semanticHash(body)).toBe(hash);
});

test("prepared matches retain exactly reachable token templates separate from their primary-card roots", async () => {
  const { source, decks } = await fixture();
  const supplements = (await makeFixedTokenDecks(source, decks)).decks.slice(5);
  const allTemplates = new Set<string>();
  const full = await createFullExecutionRegistry(source);
  for (const deck of supplements) {
    const selected = [deck, deck];
    const artifact = await createPreparedMatchArtifact(source, selected);
    const prepared = await admitPreparedMatchArtifact(artifact, source, selected);
    const expected = [
      ...new Set(
        deck.entries.flatMap((row) => {
          const effect = source.definitions[row.definition]?.spellProgram?.effects[0];
          return effect?.kind === "create-token" ? [effect.templateId] : [];
        }),
      ),
    ].sort();
    expect(Object.keys(prepared.tokenTemplates).sort()).toEqual(expected);
    expect(artifact.retainedTokenTemplates.map((row) => row.identity).sort()).toEqual(expected);
    expect(
      artifact.retainedDefinitions.every((row) => !row.identity.startsWith("token-template:")),
    ).toBe(true);
    expect(Object.keys(prepared.definitions).sort()).toEqual(
      deck.entries.map((row) => row.definition).sort(),
    );
    expect(prepared.sourceReleaseHash).toBe(full.sourceReleaseHash);
    expect(prepared.preparedArtifactHash).toBe(artifact.hash);
    expect(artifact.closure.blockers).toEqual([]);
    expect(artifact.closure.widened).toEqual([]);
    for (const id of expected) {
      allTemplates.add(id);
      expect(prepared.tokenTemplates[id]).toEqual(full.tokenTemplates[id]);
      expect(artifact.retainedTokenTemplates.find((row) => row.identity === id)?.templateHash).toBe(
        await semanticHash(full.tokenTemplates[id]),
      );
    }
  }
  expect(allTemplates.size).toBe(20);
});

test("all 20 missing, changed, wrong-rules and canonically renamed token templates fail full and prepared authentication", async () => {
  const { source, decks } = await fixture();
  const selected = decks.slice(0, 2);
  for (const identity of Object.keys(source.tokenTemplates ?? {})) {
    for (const kind of ["missing", "power", "rules", "renamed-shape"] as const) {
      const changed = structuredClone(source);
      const template = changed.tokenTemplates?.[identity];
      if (!template || !changed.tokenTemplates) throw new Error("Missing mutation template");
      if (kind === "missing") delete changed.tokenTemplates[identity];
      if (kind === "power") template.characteristics.power++;
      if (kind === "rules") template.rulesHash = "0".repeat(64);
      if (kind === "renamed-shape") {
        template.characteristics.toughness++;
        const { id: _id, ...payload } = template;
        template.id = `token-template:${await semanticHash(payload)}`;
        changed.tokenTemplates[template.id] = template;
        delete changed.tokenTemplates[identity];
      }
      const altered = await rehash(changed);
      await expect(createFullExecutionRegistry(altered)).rejects.toThrow();
      await expect(createPreparedMatchArtifact(altered, selected)).rejects.toThrow();
    }
  }
});

test("each producer count, remapped template and erased constructor remains rejected after source rehash", async () => {
  const { source, decks } = await fixture();
  const templates = Object.keys(source.tokenTemplates ?? {});
  for (const row of frozen.sourceRecords) {
    for (const kind of [
      "count",
      "remapped-template",
      "erased-marker",
      "fully-fabricated",
    ] as const) {
      const changed = structuredClone(source);
      const identity = `oracle:${row.identity}`;
      const card = changed.definitions[identity];
      if (!card) throw new Error("Missing mutation producer");
      const effect = tokenEffect(card);
      if (kind === "count") effect.count = ({ 1: 2, 2: 3, 3: 4, 4: 1 } as const)[effect.count];
      if (kind === "remapped-template") {
        const other = templates.find((id) => id !== effect.templateId);
        if (!other) throw new Error("Missing alternate authentic template");
        effect.templateId = other;
      }
      if (kind === "erased-marker" || kind === "fully-fabricated") {
        card.implementationRevision = "commander-development-recipes/1";
        card.oracleText = "Draw a card.";
        card.spellProgram = {
          schema: "commander-spell/1",
          target: null,
          effects: [{ kind: "draw", recipient: "controller", amount: 1 }],
        };
      }
      if (kind === "fully-fabricated") {
        delete changed.definitions[identity];
        card.oracleId = "00000000-0000-0000-0000-000000000000";
        card.id = `oracle:${card.oracleId}`;
        card.sourceVersion = "0".repeat(64);
        changed.definitions[card.id] = card;
      }
      const altered = await rehash(changed);
      await expect(createFullExecutionRegistry(altered)).rejects.toThrow(
        "Unauthenticated definition",
      );
      await expect(createPreparedMatchArtifact(altered, decks.slice(0, 2))).rejects.toThrow(
        "Unauthenticated definition",
      );
    }
  }
});

test("missing required producer roots block prepared closure and the fixture builder without forbidding authenticated source subsets", async () => {
  const { source, decks } = await fixture();
  const supplement = (await makeFixedTokenDecks(source, decks)).decks[5];
  if (!supplement) throw new Error("Missing source supplement");
  const producer = supplement.entries.find(
    (entry) =>
      source.definitions[entry.definition]?.spellProgram?.effects[0]?.kind === "create-token",
  );
  if (!producer) throw new Error("Missing required producer root");
  const changed = structuredClone(source);
  delete changed.definitions[producer.definition];
  const altered = await rehash(changed);
  const partial = await createFullExecutionRegistry(altered);
  expect(partial.definitions[producer.definition]).toBeUndefined();
  expect(() => admitDeck(supplement, partial)).toThrow();
  await expect(createPreparedMatchArtifact(altered, [supplement, supplement])).rejects.toThrow(
    "unavailable-definition",
  );
  await expect(makeFixedTokenDecks(altered, decks)).rejects.toThrow(
    "Missing authenticated fixed-token spell",
  );
});

test("rehashed prepared token evidence cannot erase auxiliary dependencies, alter digests, or omit core capabilities", async () => {
  const { source, decks } = await fixture();
  const supplement = (await makeFixedTokenDecks(source, decks)).decks[5];
  if (!supplement) throw new Error("Missing source supplement");
  const selected = [supplement, supplement];
  const artifact = await createPreparedMatchArtifact(source, selected);
  const mutants: PreparedMatchArtifact[] = [];
  for (const capability of FIXED_TOKEN_CORE_CAPABILITIES) {
    expect(artifact.requiredCoreCapabilities).toContain(capability);
    const changed = structuredClone(artifact);
    changed.requiredCoreCapabilities = changed.requiredCoreCapabilities.filter(
      (id) => id !== capability,
    );
    changed.closure.retainedCoreCapabilities = changed.closure.retainedCoreCapabilities.filter(
      (id) => id !== capability,
    );
    mutants.push(changed);
  }
  for (const retained of artifact.retainedTokenTemplates) {
    const omitted = structuredClone(artifact);
    omitted.retainedTokenTemplates = omitted.retainedTokenTemplates.filter(
      (row) => row.identity !== retained.identity,
    );
    omitted.closure.retained = omitted.closure.retained.filter((id) => id !== retained.identity);
    omitted.closure.excluded.push(retained.identity);
    omitted.closure.excluded.sort();
    mutants.push(omitted);
    const wrongHash = structuredClone(artifact);
    const row = wrongHash.retainedTokenTemplates.find(
      (entry) => entry.identity === retained.identity,
    );
    if (!row) throw new Error("Missing retained template");
    row.templateHash = "0".repeat(64);
    mutants.push(wrongHash);
  }
  for (const changed of mutants)
    await expect(
      admitPreparedMatchArtifact(await rehash(changed), source, selected),
    ).rejects.toThrow("does not match");
});

test("auxiliary token identities cannot serve as ordinary deck entries or commanders", async () => {
  const { source, decks } = await fixture();
  const full = await createFullExecutionRegistry(source);
  const original = decks[0];
  const id = Object.keys(full.tokenTemplates)[0];
  if (!original || !id) throw new Error("Missing auxiliary-root test source");
  for (const commander of [false, true]) {
    const deck = structuredClone(original);
    const entry = deck.entries.find(
      (row) =>
        row.definition ===
        (commander
          ? deck.commander
          : deck.entries.find((row) => row.definition !== deck.commander && row.count === 1)
              ?.definition),
    );
    if (!entry) throw new Error("Missing ordinary root");
    entry.definition = id;
    if (commander) deck.commander = id;
    const changed = await rehash(deck);
    expect(() => admitDeck(changed, full)).toThrow();
    await expect(createPreparedMatchArtifact(source, [changed, original])).rejects.toThrow(
      "Auxiliary token templates cannot be Commander deck cards",
    );
  }
});

test("deck generation rejects omitted bases, corrupt revisions, and a falsely claimed compatible WB commander", async () => {
  const { source, decks } = await fixture();
  await expect(makeFixedTokenDecks(source, decks.slice(1))).rejects.toThrow(
    "Missing frozen token fixture commander",
  );
  const bad = structuredClone(decks);
  if (!bad[0]) throw new Error("Missing fixture deck");
  bad[0].hash = "0".repeat(64);
  await expect(makeFixedTokenDecks(source, bad)).rejects.toThrow("Frozen deck hash mismatch");
  const changed = structuredClone(source);
  const commander = Object.values(changed.definitions).find(
    (card) => card.name === "Jasmine Boreal",
  );
  if (!commander) throw new Error("Missing original commander");
  commander.colorIdentity.push("B");
  await expect(makeFixedTokenDecks(await rehash(changed), decks)).rejects.toThrow(
    "Unauthenticated definition",
  );
  expect(frozen.commanderInventory.records).toHaveLength(37);
  expect(
    frozen.commanderInventory.records.every(
      (card) => !card.colorIdentity.includes("W") || !card.colorIdentity.includes("B"),
    ),
  ).toBe(true);
});

test("source authenticity alone cannot authorize execution under a past or future incompatible processor ABI", async () => {
  const { source, decks } = await fixture();
  const supplement = (await makeFixedTokenDecks(source, decks)).decks[5];
  if (!supplement) throw new Error("Missing authenticated ABI fixture");
  const selected = [supplement, supplement];
  for (const processorAbi of ["commander-engine/0.12.0", "commander-engine/0.14.0"]) {
    const altered = await rehash({ ...source, processorAbi });
    // Historical source verification is data authentication, not permission to execute it.
    expect((await verifySourceRelease(altered)).processorAbi).toBe(processorAbi);
    await expect(createFullExecutionRegistry(altered)).rejects.toThrow(
      "Source processor ABI is incompatible with this engine",
    );
    const plan = await buildDevelopmentMatchPlan(altered, selected);
    expect(plan.closure.blockers.length).toBeGreaterThan(0);
    expect(plan.closure.widened.length).toBeGreaterThan(0);
    await expect(createPreparedMatchArtifact(altered, selected)).rejects.toThrow(
      "Prepared execution blocked",
    );
  }
});

test("prepared ABI rejection also applies to legal legacy-only decks with no reachable token constructor", async () => {
  const { source } = await fixture();
  const named = (name: string) => {
    const card = Object.values(source.definitions).find((row) => row.name === name);
    if (!card) throw new Error(`Missing authenticated legacy ABI fixture: ${name}`);
    return card.id;
  };
  const body = {
    id: "legal-legacy-only-abi-fixture",
    commander: named("Tobias Andrion"),
    entries: [
      { definition: named("Tobias Andrion"), count: 1 },
      { definition: named("Plains"), count: 49 },
      { definition: named("Island"), count: 50 },
    ],
  };
  const deck = { ...body, hash: await semanticHash(body) };
  const selected = [deck, deck];
  admitDeck(deck, await createFullExecutionRegistry(source));
  const admitted = await createPreparedMatchArtifact(source, selected);
  expect(admitted.retainedDefinitions).toHaveLength(3);
  expect(admitted.retainedTokenTemplates).toEqual([]);
  for (const processorAbi of ["commander-engine/0.12.0", "commander-engine/0.14.0"]) {
    const altered = await rehash({ ...source, processorAbi });
    const legacyPlan = await buildDevelopmentMatchPlan(altered, selected);
    // Unreachable incompatible declarations cannot substitute for an ABI admission guard.
    expect(legacyPlan.closure.blockers).toEqual([]);
    expect(legacyPlan.closure.retained).toHaveLength(3);
    await expect(createFullExecutionRegistry(altered)).rejects.toThrow(
      "Source processor ABI is incompatible with this engine",
    );
    await expect(createPreparedMatchArtifact(altered, selected)).rejects.toThrow(
      "Prepared execution blocked: incompatible source processor ABI",
    );
    const forged = await rehash({ ...admitted, sourceReleaseHash: altered.hash, processorAbi });
    await expect(admitPreparedMatchArtifact(forged, altered, selected)).rejects.toThrow(
      "Prepared execution blocked: incompatible source processor ABI",
    );
  }
});
