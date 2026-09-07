import { beforeAll, expect, test } from "bun:test";
import { ORDINARY_ACTIVATED_PERMANENTS } from "@iwsdk-apps/card-programs";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { admitDeck } from "../../engine/src/index";
import {
  activationDefinitionShards,
  activationFixtureSource,
  activationPriorDecks,
  activationFixtureMetadata as fixture,
} from "../test-fixtures/ordinary-activated";
import { makeOrdinaryActivatedDecks } from "./development-ordinary-activated-decks";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "./prepared";

beforeAll(async () => {
  const { hash, ...body } = fixture;
  expect(await semanticHash(body)).toBe(hash);
  expect(fixture.originReleaseHash).toBe(
    "4efc85ff671b5628c45d617a136f31a5f1d6e4b64067efe39d95525ec61f7e93",
  );
  expect(fixture.originPrimaryCount).toBe(1437);
  expect(fixture.originAuxiliaryCount).toBe(20);
  expect(await semanticHash(fixture.decks)).toBe(fixture.previousDecksHash);
  for (const [index, shard] of activationDefinitionShards.entries()) {
    expect(await semanticHash(shard)).toBe(
      fixture.definitionShards[index]?.semanticHash ?? "missing",
    );
    expect(Object.keys(shard)).toHaveLength(fixture.definitionShards[index]?.count ?? 0);
  }
  expect(await semanticHash((await activationFixtureSource()).definitions)).toBe(
    fixture.subsetDefinitionDigest,
  );
});

test("eight legal activation profiles preserve all55 historical revisions and exact expected compositions", async () => {
  const source = await activationFixtureSource(),
    previous = activationPriorDecks();
  const sourceBefore = canonicalJson(source),
    previousBefore = canonicalJson(previous);
  const result = await makeOrdinaryActivatedDecks(source, previous),
    full = await createFullExecutionRegistry(source);
  expect(result.decks).toHaveLength(63);
  expect(canonicalJson(result.decks.slice(0, 55))).toBe(previousBefore);
  expect(canonicalJson(previous)).toBe(previousBefore);
  expect(canonicalJson(source)).toBe(sourceBefore);
  expect(result.decks.slice(55).map(({ commander, entries }) => ({ commander, entries }))).toEqual(
    fixture.expectedSupplements,
  );
  expect(new Set(result.decks.map((deck) => deck.id)).size).toBe(63);
  expect(
    new Set(
      result.decks.map((deck) =>
        canonicalJson({ commander: deck.commander, entries: deck.entries }),
      ),
    ).size,
  ).toBe(63);
  for (const deck of result.decks) {
    admitDeck(deck, full);
    const { hash, ...body } = deck;
    expect(await semanticHash(body)).toBe(hash);
    expect(deck.entries.reduce((sum, row) => sum + row.count, 0)).toBe(100);
    const commander = source.definitions[deck.commander];
    if (!commander) throw Error("Missing commander");
    expect(commander.commanderEligible).toBe(true);
    expect(deck.entries.find((row) => row.definition === deck.commander)?.count).toBe(1);
    const names = new Map<string, number>();
    for (const entry of deck.entries) {
      const card = source.definitions[entry.definition];
      if (!card) throw Error("Missing source");
      expect(card.colorIdentity.every((color) => commander.colorIdentity.includes(color))).toBe(
        true,
      );
      const copies = (names.get(card.name) ?? 0) + entry.count;
      names.set(card.name, copies);
      if (card.deckLimit !== null) expect(copies).toBeLessThanOrEqual(card.deckLimit);
    }
  }
  for (const deck of result.decks.slice(55)) {
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

test("234 source identities have legal witnesses; all45 commanders prove the five color gaps without waivers", async () => {
  const source = await activationFixtureSource(),
    result = await makeOrdinaryActivatedDecks(source, activationPriorDecks());
  expect(canonicalJson(result.report.commanderInventory)).toBe(
    canonicalJson(fixture.expectedCommanderInventory),
  );
  expect(result.report.commanderInventory).toHaveLength(45);
  expect(result.report.candidateBindings).toBe(239);
  expect(result.report.coveredBindings).toBe(234);
  expect(
    canonicalJson(
      result.report.excluded.map(({ definition, name, colorIdentity }) => ({
        definition,
        name,
        colorIdentity,
      })),
    ),
  ).toBe(canonicalJson(fixture.expectedExcluded));
  expect(result.report.excluded.map((row) => row.name).sort()).toEqual([
    "Angelfire Crusader",
    "Kranioceros",
    "Leaping Master",
    "Torch Drake",
    "Towering Thunderfist",
  ]);
  const covered = new Set<string>();
  const families = new Set<string>();
  for (const row of result.report.coverage) {
    const card = source.definitions[row.definition];
    if (!card) throw Error("Missing source");
    expect(row.sourceVersion).toBe(card.sourceVersion);
    expect(row.compatibleCommanderIds).toEqual(
      Object.values(source.definitions)
        .filter(
          (d) =>
            d.commanderEligible &&
            card.colorIdentity.every((color) => d.colorIdentity.includes(color)),
        )
        .map((d) => d.id)
        .sort(),
    );
    if (row.supplementalDeckHashes.length) {
      covered.add(row.definition);
      families.add(row.category ?? "missing");
    } else expect(row.compatibleCommanderIds).toEqual([]);
  }
  expect(covered.size).toBe(234);
  expect(families).toEqual(
    new Set(["self-pt", "self-keyword", "target-pt", "tap-creature", "draw", "gain-life"]),
  );
  for (const row of ORDINARY_ACTIVATED_PERMANENTS)
    expect(
      covered.has(`oracle:${row.identity}`) ||
        result.report.excluded.some((e) => e.definition === `oracle:${row.identity}`),
    ).toBe(true);
  const sourceByName = new Map(Object.values(source.definitions).map((card) => [card.name, card]));
  for (const name of ["Tuknir Deathlock", "Pavel Maliki"])
    expect(
      result.decks.slice(55).some((deck) => deck.commander === sourceByName.get(name)?.id),
    ).toBe(true);
  for (const name of [
    "Advanced Hoverguard",
    "Giant Crab",
    "Glimmering Angel",
    "Horror of the Dim",
    "Char-Rumbler",
    "Flowstone Hellion",
  ])
    expect(covered.has(sourceByName.get(name)?.id ?? "missing")).toBe(true);
});

for (let index = 0; index < 8; index++)
  test(`activation profile ${index + 1} admits real full/prepared registries with exact source roots`, async () => {
    const source = await activationFixtureSource(),
      result = await makeOrdinaryActivatedDecks(source, activationPriorDecks()),
      deck = result.decks[55 + index];
    if (!deck) throw Error("Missing profile");
    const artifact = await createPreparedMatchArtifact(source, [deck, deck]);
    const prepared = await admitPreparedMatchArtifact(artifact, source, [deck, deck]);
    admitDeck(deck, prepared);
    expect(prepared.sourceReleaseHash).toBe(source.hash);
    expect(prepared.preparedArtifactHash).toBe(artifact.hash);
    expect(Object.keys(prepared.definitions).sort()).toEqual(
      deck.entries.map((row) => row.definition).sort(),
    );
    const sourceIds = deck.entries
      .filter((row) => source.definitions[row.definition]?.activatedPrograms !== undefined)
      .map((row) => row.definition);
    expect(sourceIds.length).toBeGreaterThanOrEqual(28);
  });
