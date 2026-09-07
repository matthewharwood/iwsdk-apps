import { beforeAll, expect, test } from "bun:test";
import { STRICT_PROCTOR_PERMANENTS } from "@iwsdk-apps/card-programs";
import {
  ContentRelease,
  canonicalJson,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { admitDeck } from "../../engine/src/index";
import fixture from "../test-fixtures/strict-proctor-decks.json";
import { makeStrictProctorDecks } from "./development-strict-proctor-decks";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "./prepared";

async function sourceFixture() {
  const body = {
    schema: "commander-content/1",
    id: "authenticated-strict-proctor-deck-fixture/1",
    sourceBundle: fixture.sourceBundle,
    rulesHash: fixture.rulesHash,
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions: structuredClone(fixture.definitions),
    tokenTemplates: structuredClone(fixture.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(fixture.definitions).length,
    compilerVersion: "strict-proctor-deck-unit/1",
    processorAbi: ENGINE_VERSION,
  };
  return ContentRelease.parse({ ...body, hash: await semanticHash(body) });
}
const history = () => fixture.decks.map((deck) => DeckRevision.parse(deck));
async function rehash<T extends { hash: string }>(value: T): Promise<T> {
  const { hash: _hash, ...body } = value;
  return { ...body, hash: await semanticHash(body) } as T;
}
function named(source: ContentRelease, name: string) {
  const card = Object.values(source.definitions).find((row) => row.name === name);
  if (!card) throw new Error(`Missing authenticated test card: ${name}`);
  return card;
}
beforeAll(async () => {
  const { hash, ...body } = fixture;
  expect(await semanticHash(body)).toBe(hash);
  expect(hash).toBe("866be423ea63e0e2f435e16cc6369b0da783f32da3bc86cc030b9260df4aa7c1");
  expect(fixture.originReleaseHash).toBe(
    "13f3654940711c24cd84ff2665d126644687a536749d098f92dea2e52db957e4",
  );
  expect(fixture.previousArtifactSha256).toBe(
    "297a0b6598f52323f017355d2f6a25b4428a410ff2789fe42dc87dbcbc5351bd",
  );
  expect(await semanticHash(fixture.decks)).toBe(fixture.previousDecksHash);
  expect(fixture.decks).toHaveLength(51);
  expect(fixture.originPrimaryCount).toBe(1193);
  expect(fixture.originAuxiliaryCount).toBe(20);
  expect(Object.values(fixture.definitions).filter((card) => card.commanderEligible)).toHaveLength(
    41,
  );
});

test("two proctor profiles preserve all51 frozen revisions and admit legal100-card singleton inventories", async () => {
  const source = await sourceFixture(),
    previous = history();
  const sourceBefore = canonicalJson(source),
    previousBefore = canonicalJson(previous);
  const result = await makeStrictProctorDecks(source, previous);
  expect(result.decks).toHaveLength(53);
  expect(canonicalJson(result.decks.slice(0, 51))).toBe(previousBefore);
  expect(canonicalJson(previous)).toBe(previousBefore);
  expect(canonicalJson(source)).toBe(sourceBefore);
  expect(new Set(result.decks.map((deck) => deck.id)).size).toBe(53);
  expect(new Set(result.decks.map((deck) => deck.hash)).size).toBe(53);
  expect(result.decks.slice(51).map(({ commander, entries }) => ({ commander, entries }))).toEqual(
    fixture.expectedSupplements,
  );
  expect(result.decks.slice(51).map((deck) => source.definitions[deck.commander]?.name)).toEqual([
    "Tobias Andrion",
    "Jasmine Boreal",
  ]);
  const registry = await createFullExecutionRegistry(source);
  for (const deck of result.decks) {
    admitDeck(deck, registry);
    const { hash, ...body } = deck;
    expect(await semanticHash(body)).toBe(hash);
    expect(deck.entries.reduce((sum, row) => sum + row.count, 0)).toBe(100);
    const commander = source.definitions[deck.commander];
    if (!commander) throw new Error("Missing commander");
    expect(deck.entries.find((row) => row.definition === commander.id)?.count).toBe(1);
    const names = new Map<string, number>();
    for (const entry of deck.entries) {
      const card = source.definitions[entry.definition];
      if (!card) throw new Error("Missing deck source root");
      expect(card.colorIdentity.every((color) => commander.colorIdentity.includes(color))).toBe(
        true,
      );
      const count = (names.get(card.name) ?? 0) + entry.count;
      names.set(card.name, count);
      if (card.deckLimit !== null) expect(count).toBeLessThanOrEqual(card.deckLimit);
      expect(entry.definition.startsWith("oracle:")).toBe(true);
    }
  }
  for (const deck of result.decks.slice(51)) {
    const basics = deck.entries.filter((row) =>
      source.definitions[row.definition]?.supertypes.includes("Basic"),
    );
    expect(basics.reduce((sum, row) => sum + row.count, 0)).toBe(39);
    expect(basics.map((row) => row.count).sort()).toEqual([19, 20]);
  }
  const { hash, ...body } = result.report;
  expect(await semanticHash(body)).toBe(hash);
  expect(result.report.executedGames).toBe(0);
});

test("the whole Proctor source has legal membership and exhaustive41-commander comparison without waived colors", async () => {
  const source = await sourceFixture(),
    result = await makeStrictProctorDecks(source, history());
  expect(result.report.candidateBindings).toBe(1);
  expect(result.report.coveredBindings).toBe(1);
  expect(result.report.excluded).toEqual([]);
  expect(canonicalJson(result.report.commanderInventory)).toBe(
    canonicalJson(fixture.expectedCommanderInventory),
  );
  expect(result.report.coveredDefinitionIds).toEqual(
    STRICT_PROCTOR_PERMANENTS.map((row) => `oracle:${row.identity}`),
  );
  const card = named(source, "Strict Proctor");
  const row = result.report.coverage[0];
  if (!row) throw new Error("Missing Proctor membership");
  expect(row.sourceVersion).toBe(card.sourceVersion);
  expect(row.compatibleCommanderIds).toEqual(
    Object.values(source.definitions)
      .filter(
        (d) => d.commanderEligible && card.colorIdentity.every((c) => d.colorIdentity.includes(c)),
      )
      .map((d) => d.id)
      .sort(),
  );
  expect(row.compatibleCommanderIds).toHaveLength(13);
  expect(row.supplementalDeckHashes).toHaveLength(2);
  expect(card.commanderEligible).toBe(false);
  expect(card.triggerPrograms?.[0]?.schema).toBe("commander-entry-caused-trigger/1");
});

test("supplements provide ordinary entry causes, token batches and mana sources with distinct WU and GW interaction witnesses", async () => {
  const source = await sourceFixture(),
    result = await makeStrictProctorDecks(source, history());
  const coverage = result.report.coverage[0];
  if (!coverage) throw new Error("Missing Proctor membership");
  for (const row of coverage.potentialWitnesses) {
    const deck = result.decks.find((d) => d.hash === row.deckHash);
    if (!deck) throw new Error("Missing witness deck");
    for (const id of [
      ...row.requiredDefinitionIds,
      ...row.ordinaryTriggerDefinitionIds,
      ...row.tokenProducerDefinitionIds,
      ...row.manaSourceDefinitionIds,
    ])
      expect(deck.entries.some((entry) => entry.definition === id)).toBe(true);
    expect(row.ordinaryTriggerDefinitionIds.length).toBeGreaterThanOrEqual(24);
    expect(row.tokenProducerDefinitionIds).toHaveLength(8);
    expect(row.manaSourceDefinitionIds.length).toBeGreaterThanOrEqual(2);
    for (const id of row.tokenProducerDefinitionIds)
      expect(
        source.definitions[id]?.spellProgram?.effects.some(
          (effect) => effect.kind === "create-token",
        ),
      ).toBe(true);
    for (const name of [
      "Strict Proctor",
      "Soul Warden",
      "Queen's Commission",
      "Ajani's Welcome",
      "Priest of Ancient Lore",
      "Memnite",
    ])
      expect(deck.entries.some((entry) => entry.definition === named(source, name).id)).toBe(true);
    const required =
      deck.commander === named(source, "Tobias Andrion").id
        ? [
            "Scholar of Stars",
            "Donatello, Turtle Techie",
            "Fateful Discovery",
            "Repulse",
            "Counterspell",
            "Darksteel Sentinel",
          ]
        : ["Jaddi Offshoot", "Essence Warden", "Elvish Visionary"];
    for (const name of required)
      expect(deck.entries.some((entry) => entry.definition === named(source, name).id)).toBe(true);
  }
  expect(result.report.executedGames).toBe(0);
});

test("prepared admission keeps Proctor and all linked token template dependencies and every legal root across two and four seats", async () => {
  const source = await sourceFixture(),
    result = await makeStrictProctorDecks(source, history());
  const supplements = result.decks.slice(51);
  for (const selected of [supplements, [...supplements, ...supplements]]) {
    const artifact = await createPreparedMatchArtifact(source, selected);
    const registry = await admitPreparedMatchArtifact(artifact, source, selected);
    for (const deck of selected) admitDeck(deck, registry);
    const roots = [
      ...new Set(selected.flatMap((deck) => deck.entries.map((row) => row.definition))),
    ].sort();
    expect(Object.keys(registry.definitions).sort()).toEqual(roots);
    const templates = [
      ...new Set(
        roots.flatMap(
          (id) =>
            source.definitions[id]?.spellProgram?.effects.flatMap((effect) =>
              effect.kind === "create-token" ? [effect.templateId] : [],
            ) ?? [],
        ),
      ),
    ].sort();
    expect(Object.keys(registry.tokenTemplates ?? {}).sort()).toEqual(templates);
    expect(artifact.closure.blockers).toEqual([]);
    expect(artifact.closure.widened).toEqual([]);
    for (const name of [
      "Strict Proctor",
      "Soul Warden",
      "Queen's Commission",
      "Memnite",
      "Repulse",
      "Jaddi Offshoot",
    ])
      expect(registry.definitions[named(source, name).id]).toEqual(named(source, name));
  }
});

test("proctor deck selection and reports are independent of source dictionary insertion order", async () => {
  const source = await sourceFixture();
  const reversed = {
    ...source,
    definitions: Object.fromEntries(Object.entries(source.definitions).reverse()),
  };
  expect(canonicalJson(await makeStrictProctorDecks(reversed, history()))).toBe(
    canonicalJson(await makeStrictProctorDecks(source, history())),
  );
});

test("corrupt and illegal frozen revisions or duplicate generated identities fail closed", async () => {
  const source = await sourceFixture(),
    previous = history(),
    original = previous[0];
  if (!original) throw new Error("Missing history");
  await expect(makeStrictProctorDecks(source, [])).rejects.toThrow("At least one");
  await expect(makeStrictProctorDecks(source, [original, original])).rejects.toThrow(
    "Duplicate frozen",
  );
  await expect(
    makeStrictProctorDecks(source, [{ ...original, hash: "0".repeat(64) }]),
  ).rejects.toThrow("Frozen deck hash mismatch");
  for (const mutation of ["count", "duplicate-row", "color", "copies", "auxiliary"] as const) {
    const changed = structuredClone(original);
    const single = changed.entries.find(
        (row) => row.definition !== changed.commander && row.count === 1,
      ),
      basic = changed.entries.find((row) => row.count > 1);
    if (!single || !basic) throw new Error("Missing mutation fixture");
    if (mutation === "count") basic.count--;
    if (mutation === "duplicate-row") {
      basic.count--;
      changed.entries.push({ ...single });
    }
    if (mutation === "color") single.definition = named(source, "Donatello, Turtle Techie").id;
    if (mutation === "copies") {
      basic.count--;
      single.count++;
    }
    if (mutation === "auxiliary")
      single.definition = Object.keys(source.tokenTemplates ?? {})[0] ?? "missing";
    await expect(makeStrictProctorDecks(source, [await rehash(changed)])).rejects.toThrow();
  }
  const generated = await makeStrictProctorDecks(source, previous);
  await expect(makeStrictProctorDecks(source, generated.decks)).rejects.toThrow("collides");
});

test("missing required proctor sources or witnesses and rehashed source changes fail authentication", async () => {
  const source = await sourceFixture();
  for (const name of [
    "Scholar of Stars",
    "Tobias Andrion",
    "Jasmine Boreal",
    "Memnite",
    "Darksteel Sentinel",
    "Repulse",
    "Counterspell",
  ]) {
    const changed = structuredClone(source);
    delete changed.definitions[named(source, name).id];
    await expect(makeStrictProctorDecks(await rehash(changed), history())).rejects.toThrow();
  }
  for (const mutation of ["body", "program", "commander", "artifact", "flash"] as const) {
    const changed = structuredClone(source),
      proctor = changed.definitions[named(source, "Strict Proctor").id],
      sentinel = changed.definitions[named(source, "Darksteel Sentinel").id];
    if (!proctor || !sentinel) throw new Error("Missing source mutation");
    if (mutation === "body") proctor.oracleText = "Flying";
    if (mutation === "program") delete proctor.triggerPrograms;
    if (mutation === "commander") proctor.commanderEligible = true;
    if (mutation === "artifact") sentinel.types = ["Creature"];
    if (mutation === "flash")
      sentinel.keywords = sentinel.keywords.filter((keyword) => keyword !== "flash");
    await expect(makeStrictProctorDecks(await rehash(changed), history())).rejects.toThrow(
      "Unauthenticated definition",
    );
  }
});
