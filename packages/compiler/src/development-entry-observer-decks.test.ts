import { beforeAll, expect, test } from "bun:test";
import { ENTRY_OBSERVER_PERMANENTS } from "@iwsdk-apps/card-programs";
import {
  ContentRelease,
  canonicalJson,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { admitDeck } from "../../engine/src/index";
import fixture from "../test-fixtures/entry-observer-decks.json";
import { makeEntryObserverDecks } from "./development-entry-observer-decks";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "./prepared";

async function sourceFixture() {
  const body = {
    schema: "commander-content/1",
    id: "authenticated-entry-observer-deck-fixture/1",
    sourceBundle: fixture.sourceBundle,
    rulesHash: fixture.rulesHash,
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions: structuredClone(fixture.definitions),
    tokenTemplates: structuredClone(fixture.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(fixture.definitions).length,
    compilerVersion: "entry-observer-deck-unit/1",
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
  expect(hash).toBe("1d2fe3e18ae16b46cdfb8fb6c5808a16e1fc063c0ecc4dc90e429b7c63c11347");
  expect(fixture.originReleaseHash).toBe(
    "19b625376b02555521b2f0cea2a33097299bac813e65b682725982e61bfd948d",
  );
  expect(fixture.previousArtifactSha256).toBe(
    "eaeca81a90a5c0a8777cb96252b5b66c7e79b43f33072cbe9ed090d437d7183f",
  );
  expect(fixture.decks).toHaveLength(46);
  expect(fixture.originPrimaryCount).toBe(1190);
  expect(fixture.originAuxiliaryCount).toBe(20);
  expect(Object.values(fixture.definitions).filter((card) => card.commanderEligible)).toHaveLength(
    40,
  );
});

test("three observer profiles preserve all46 prior revisions byte-for-byte and admit legal100-card singleton decks", async () => {
  const source = await sourceFixture(),
    previous = history();
  const sourceBefore = canonicalJson(source),
    previousBefore = canonicalJson(previous);
  const result = await makeEntryObserverDecks(source, previous);
  expect(result.decks).toHaveLength(49);
  expect(canonicalJson(result.decks.slice(0, 46))).toBe(previousBefore);
  expect(canonicalJson(previous)).toBe(previousBefore);
  expect(canonicalJson(source)).toBe(sourceBefore);
  expect(new Set(result.decks.map((deck) => deck.id)).size).toBe(49);
  expect(new Set(result.decks.map((deck) => deck.hash)).size).toBe(49);
  expect(result.decks.slice(46).map(({ commander, entries }) => ({ commander, entries }))).toEqual(
    fixture.expectedSupplements,
  );
  expect(result.decks.slice(46).map((deck) => source.definitions[deck.commander]?.name)).toEqual([
    "Jasmine Boreal",
    "Tatyova, Benthic Druid",
    "Yargle and Multani",
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
  for (const deck of result.decks.slice(46)) {
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

test("all20 bindings have legal membership with exhaustive40-commander comparisons, including Tatyova and Bogwater", async () => {
  const source = await sourceFixture(),
    result = await makeEntryObserverDecks(source, history());
  const commanders = Object.values(source.definitions).filter((card) => card.commanderEligible);
  expect(result.report.candidateBindings).toBe(20);
  expect(result.report.coveredBindings).toBe(20);
  expect(result.report.excluded).toEqual([]);
  expect(canonicalJson(result.report.commanderInventory)).toBe(
    canonicalJson(fixture.expectedCommanderInventory),
  );
  expect(result.report.coveredDefinitionIds.slice().sort()).toEqual(
    ENTRY_OBSERVER_PERMANENTS.map((row) => `oracle:${row.identity}`).sort(),
  );
  for (const row of result.report.coverage) {
    const card = source.definitions[row.definition];
    if (!card) throw new Error("Missing observer");
    expect(row.compatibleCommanderIds).toEqual(
      commanders
        .filter((commander) =>
          card.colorIdentity.every((color) => commander.colorIdentity.includes(color)),
        )
        .map((card) => card.id)
        .sort(),
    );
    expect(row.supplementalDeckHashes.length).toBeGreaterThan(0);
  }
  const tatyova = named(source, "Tatyova, Benthic Druid"),
    bogwater = named(source, "Bogwater Lumaret");
  expect(result.decks[47]?.commander).toBe(tatyova.id);
  expect(result.decks[48]?.entries.some((row) => row.definition === bogwater.id)).toBe(true);
  expect(
    result.report.coverage.find((row) => row.definition === bogwater.id)?.compatibleCommanderIds,
  ).toEqual([named(source, "Yargle and Multani").id]);
  expect(result.report.newlyCommanderReachableDefinitionIds).toHaveLength(9);
  expect(
    result.report.newlyCommanderReachableDefinitionIds
      .map((id) => source.definitions[id]?.name)
      .sort(),
  ).toEqual(
    [
      "Assault Zeppelid",
      "Drakewing Krasis",
      "Gaea's Skyfolk",
      "Jungle Barrier",
      "Merfolk Mistbinder",
      "Needlethorn Drake",
      "Simic Sky Swallower",
      "Venomthrope",
      "Winged Coatl",
    ].sort(),
  );
  for (const id of result.report.newlyCommanderReachableDefinitionIds)
    expect(result.decks[47]?.entries.some((row) => row.definition === id)).toBe(true);
});

test("potential entry subjects retain real land, enchantment, artifact, Beast and multi-token witnesses without asserting execution", async () => {
  const source = await sourceFixture(),
    result = await makeEntryObserverDecks(source, history());
  for (const row of result.report.coverage) {
    const observer = source.definitions[row.definition],
      program = observer?.triggerPrograms?.[0];
    if (program?.schema !== "commander-entry-observer/1")
      throw new Error("Missing observer program");
    for (const witness of row.potentialWitnesses) {
      expect(witness.cardIds.length + witness.tokenProducers.length).toBeGreaterThan(0);
      for (const id of witness.cardIds) {
        const subject = source.definitions[id];
        if (!subject) throw new Error("Missing witness");
        if (id === observer?.id && program.trigger.subject.kind === "self-or-filter") continue;
        if (program.trigger.subject.filter.excludeSource) expect(id).not.toBe(observer?.id);
        expect(
          program.trigger.subject.filter.types.every((type) => subject.types.includes(type)),
        ).toBe(true);
        if ("subtype" in program.trigger.subject.filter)
          expect(subject.subtypes).toContain("Beast");
      }
      for (const token of witness.tokenProducers) {
        expect(
          source.definitions[token.definition]?.spellProgram?.effects.some(
            (effect) =>
              effect.kind === "create-token" &&
              effect.templateId === token.templateId &&
              effect.count === token.count,
          ),
        ).toBe(true);
        expect(source.tokenTemplates?.[token.templateId]).toBeDefined();
      }
    }
  }
  const tatyova = result.report.coverage.find((row) => row.name === "Tatyova, Benthic Druid");
  expect(
    tatyova?.potentialWitnesses[0]?.cardIds.map((id) => source.definitions[id]?.name).sort(),
  ).toEqual(["Forest", "Island"]);
  const discovery = result.report.coverage.find((row) => row.name === "Fateful Discovery");
  expect(discovery?.potentialWitnesses[0]?.cardIds.length).toBeGreaterThanOrEqual(6);
  const blossom = result.report.coverage.find((row) => row.name === "Eidolon of Blossoms");
  expect(blossom?.potentialWitnesses.some((row) => row.cardIds.length >= 4)).toBe(true);
  const warden = result.report.coverage.find((row) => row.name === "Essence Warden");
  expect(
    warden?.potentialWitnesses.every((row) =>
      row.tokenProducers.some((producer) => producer.count >= 2),
    ),
  ).toBe(true);
});

test("prepared admission retains exactly required primary roots and token templates for the new legal profiles", async () => {
  const source = await sourceFixture(),
    result = await makeEntryObserverDecks(source, history());
  const decks = result.decks.slice(46);
  for (const selected of [
    [decks[0], decks[1]],
    [decks[0], decks[1], decks[2], decks[1]],
  ]) {
    if (selected.some((deck) => deck === undefined)) throw new Error("Missing fixture profile");
    const ready = selected.filter((deck): deck is DeckRevision => deck !== undefined);
    const artifact = await createPreparedMatchArtifact(source, ready);
    const registry = await admitPreparedMatchArtifact(artifact, source, ready);
    for (const deck of ready) admitDeck(deck, registry);
    expect(Object.keys(registry.definitions).sort()).toEqual(
      [...new Set(ready.flatMap((deck) => deck.entries.map((row) => row.definition)))].sort(),
    );
    expect(artifact.closure.blockers).toEqual([]);
    expect(artifact.closure.widened).toEqual([]);
    for (const definition of Object.values(registry.definitions))
      for (const effect of definition.spellProgram?.effects ?? [])
        if (effect.kind === "create-token")
          expect(registry.tokenTemplates[effect.templateId]).toEqual(
            source.tokenTemplates?.[effect.templateId],
          );
  }
});

test("deck selection and report are independent of source dictionary insertion order", async () => {
  const source = await sourceFixture();
  const reversed = {
    ...source,
    definitions: Object.fromEntries(Object.entries(source.definitions).reverse()),
  };
  expect(canonicalJson(await makeEntryObserverDecks(reversed, history()))).toBe(
    canonicalJson(await makeEntryObserverDecks(source, history())),
  );
});

test("corrupt or illegal prior revisions and duplicate generated identities fail closed", async () => {
  const source = await sourceFixture(),
    previous = history(),
    original = previous[0];
  if (!original) throw new Error("Missing history");
  await expect(makeEntryObserverDecks(source, [])).rejects.toThrow("At least one");
  await expect(makeEntryObserverDecks(source, [original, original])).rejects.toThrow(
    "Duplicate frozen",
  );
  await expect(
    makeEntryObserverDecks(source, [{ ...original, hash: "0".repeat(64) }]),
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
    if (mutation === "color") single.definition = named(source, "Tatyova, Benthic Druid").id;
    if (mutation === "copies") {
      basic.count--;
      single.count++;
    }
    if (mutation === "auxiliary")
      single.definition = Object.keys(source.tokenTemplates ?? {})[0] ?? "missing";
    await expect(makeEntryObserverDecks(source, [await rehash(changed)])).rejects.toThrow();
  }
  const generated = await makeEntryObserverDecks(source, previous);
  await expect(makeEntryObserverDecks(source, generated.decks)).rejects.toThrow("collides");
});

test("missing required source bindings and rehashed identity, program or commander changes fail source authentication", async () => {
  const source = await sourceFixture();
  for (const name of ["Tatyova, Benthic Druid", "Bogwater Lumaret", "Yargle and Multani"]) {
    const changed = structuredClone(source);
    delete changed.definitions[named(source, name).id];
    await expect(makeEntryObserverDecks(await rehash(changed), history())).rejects.toThrow();
  }
  for (const mutation of ["color", "body", "program"] as const) {
    const changed = structuredClone(source),
      tatyova = changed.definitions[named(source, "Tatyova, Benthic Druid").id];
    if (!tatyova) throw new Error("Missing Tatyova");
    if (mutation === "color") tatyova.colorIdentity.push("W");
    if (mutation === "body") tatyova.oracleText = "Whenever a land enters, draw a card.";
    if (mutation === "program") delete tatyova.triggerPrograms;
    await expect(makeEntryObserverDecks(await rehash(changed), history())).rejects.toThrow(
      "Unauthenticated definition",
    );
  }
});
