import { beforeAll, expect, test } from "bun:test";
import { DAMAGE_REPLACEMENT_PERMANENTS } from "@iwsdk-apps/card-programs";
import {
  ContentRelease,
  canonicalJson,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { admitDeck } from "../../engine/src/index";
import fixture from "../test-fixtures/damage-replacement-decks.json";
import { makeDamageReplacementDecks } from "./development-damage-replacement-decks";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "./prepared";

async function sourceFixture() {
  const body = {
    schema: "commander-content/1",
    id: "authenticated-damage-replacement-deck-fixture/1",
    sourceBundle: fixture.sourceBundle,
    rulesHash: fixture.rulesHash,
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions: structuredClone(fixture.definitions),
    tokenTemplates: structuredClone(fixture.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(fixture.definitions).length,
    compilerVersion: "damage-replacement-deck-unit/1",
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
  expect(hash).toBe("04c228fba6004672322006ac5a6e1dcf61c05049539ef673174597e0ec31a698");
  expect(fixture.originReleaseHash).toBe(
    "77857dc934ac410326f5a1136bca66757c33ae7ae74326c9d3f0f354432810de",
  );
  expect(fixture.previousArtifactSha256).toBe(
    "6e263ed1333a2139688b65045f3b72878119e81b53357ffd8f212883f0f4f33e",
  );
  expect(await semanticHash(fixture.decks)).toBe(fixture.previousDecksHash);
  expect(fixture.decks).toHaveLength(53);
  expect(fixture.originPrimaryCount).toBe(1198);
  expect(fixture.originAuxiliaryCount).toBe(20);
  expect(Object.values(fixture.definitions).filter((card) => card.commanderEligible)).toHaveLength(
    41,
  );
});

test("two damage profiles preserve all53 frozen revisions and admit legal100-card singleton inventories", async () => {
  const source = await sourceFixture(),
    previous = history();
  const sourceBefore = canonicalJson(source),
    previousBefore = canonicalJson(previous);
  const result = await makeDamageReplacementDecks(source, previous);
  expect(result.decks).toHaveLength(55);
  expect(canonicalJson(result.decks.slice(0, 53))).toBe(previousBefore);
  expect(canonicalJson(previous)).toBe(previousBefore);
  expect(canonicalJson(source)).toBe(sourceBefore);
  expect(new Set(result.decks.map((deck) => deck.id)).size).toBe(55);
  expect(new Set(result.decks.map((deck) => deck.hash)).size).toBe(55);
  expect(result.decks.slice(53).map(({ commander, entries }) => ({ commander, entries }))).toEqual(
    fixture.expectedSupplements,
  );
  expect(result.decks.slice(53).map((deck) => source.definitions[deck.commander]?.name)).toEqual([
    "Lady Orca",
    "Tobias Andrion",
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
  for (const deck of result.decks.slice(53)) {
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

test("all five damage sources have legal membership and exhaustive41-commander comparisons without waived colors", async () => {
  const source = await sourceFixture(),
    result = await makeDamageReplacementDecks(source, history());
  expect(result.report.candidateBindings).toBe(5);
  expect(result.report.coveredBindings).toBe(5);
  expect(result.report.excluded).toEqual([]);
  expect(canonicalJson(result.report.commanderInventory)).toBe(
    canonicalJson(fixture.expectedCommanderInventory),
  );
  expect(result.report.coveredDefinitionIds).toEqual(
    DAMAGE_REPLACEMENT_PERMANENTS.map((row) => `oracle:${row.identity}`).sort(),
  );
  for (const row of result.report.coverage) {
    const card = named(source, row.name);
    expect(row.sourceVersion).toBe(card.sourceVersion);
    expect(row.compatibleCommanderIds).toEqual(
      Object.values(source.definitions)
        .filter(
          (d) =>
            d.commanderEligible && card.colorIdentity.every((c) => d.colorIdentity.includes(c)),
        )
        .map((d) => d.id)
        .sort(),
    );
    expect(row.compatibleCommanderIds).toHaveLength(row.name === "Urza's Armor" ? 41 : 13);
    expect(row.supplementalDeckHashes).toHaveLength(row.name === "Urza's Armor" ? 2 : 1);
    expect(card.commanderEligible).toBe(false);
    expect(card.damagePrograms?.[0]?.schema).toBe("commander-damage-static/1");
  }
});
test("supplements separate red and white sources while supplying actual damage and removal witnesses", async () => {
  const source = await sourceFixture(),
    result = await makeDamageReplacementDecks(source, history());
  const supplements = result.decks.slice(53);
  for (const coverage of result.report.coverage)
    for (const row of coverage.potentialWitnesses) {
      const deck = supplements.find((d) => d.hash === row.deckHash);
      if (!deck) throw new Error("Missing witness deck");
      for (const id of [
        ...row.requiredDefinitionIds,
        ...row.sourceProgramDefinitionIds,
        ...row.damageSpellDefinitionIds,
        ...row.combatTraitWitnesses.map((x) => x.definition),
      ])
        expect(deck.entries.some((entry) => entry.definition === id)).toBe(true);
      expect(row.combatTraitWitnesses.length).toBeGreaterThanOrEqual(8);
      for (const id of row.damageSpellDefinitionIds)
        expect(
          source.definitions[id]?.spellProgram?.effects.some((effect) => effect.kind === "damage"),
        ).toBe(true);
    }
  const red = supplements[0],
    white = supplements[1];
  if (!red || !white) throw new Error("Missing supplements");
  for (const name of [
    "Furnace of Rath",
    "Dictate of the Twin Gods",
    "Excruciator",
    "Urza's Armor",
    "Sorin's Thirst",
    "Flame Slash",
    "Murder",
    "Final Reward",
  ])
    expect(red.entries.some((entry) => entry.definition === named(source, name).id)).toBe(true);
  expect(
    red.entries.some((entry) => entry.definition === named(source, "Benevolent Unicorn").id),
  ).toBe(false);
  for (const name of [
    "Benevolent Unicorn",
    "Urza's Armor",
    "Repulse",
    "Counterspell",
    "Queen's Commission",
    "Darksteel Sentinel",
  ])
    expect(white.entries.some((entry) => entry.definition === named(source, name).id)).toBe(true);
  for (const name of ["Furnace of Rath", "Dictate of the Twin Gods", "Excruciator"])
    expect(white.entries.some((entry) => entry.definition === named(source, name).id)).toBe(false);
  expect(result.report.executedGames).toBe(0);
});

test("prepared admission keeps all five damage programs and linked token template dependencies and every legal root across two and four seats", async () => {
  const source = await sourceFixture(),
    result = await makeDamageReplacementDecks(source, history());
  const supplements = result.decks.slice(53);
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
      "Furnace of Rath",
      "Dictate of the Twin Gods",
      "Excruciator",
      "Benevolent Unicorn",
      "Urza's Armor",
      "Sorin's Thirst",
      "Repulse",
    ])
      expect(registry.definitions[named(source, name).id]).toEqual(named(source, name));
  }
});

test("damage deck selection and reports are independent of source dictionary insertion order", async () => {
  const source = await sourceFixture();
  const reversed = {
    ...source,
    definitions: Object.fromEntries(Object.entries(source.definitions).reverse()),
  };
  expect(canonicalJson(await makeDamageReplacementDecks(reversed, history()))).toBe(
    canonicalJson(await makeDamageReplacementDecks(source, history())),
  );
});

test("corrupt and illegal frozen revisions or duplicate generated identities fail closed", async () => {
  const source = await sourceFixture(),
    previous = history(),
    original = previous[0];
  if (!original) throw new Error("Missing history");
  await expect(makeDamageReplacementDecks(source, [])).rejects.toThrow("At least one");
  await expect(makeDamageReplacementDecks(source, [original, original])).rejects.toThrow(
    "Duplicate frozen",
  );
  await expect(
    makeDamageReplacementDecks(source, [{ ...original, hash: "0".repeat(64) }]),
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
    await expect(makeDamageReplacementDecks(source, [await rehash(changed)])).rejects.toThrow();
  }
  const generated = await makeDamageReplacementDecks(source, previous);
  await expect(makeDamageReplacementDecks(source, generated.decks)).rejects.toThrow("collides");
});

test("missing required damage sources or witnesses and rehashed source changes fail authentication", async () => {
  const source = await sourceFixture();
  for (const name of [
    "Furnace of Rath",
    "Dictate of the Twin Gods",
    "Benevolent Unicorn",
    "Urza's Armor",
    "Excruciator",
    "Lady Orca",
    "Tobias Andrion",
    "Memnite",
    "Repulse",
    "Sorin's Thirst",
  ]) {
    const changed = structuredClone(source);
    delete changed.definitions[named(source, name).id];
    await expect(makeDamageReplacementDecks(await rehash(changed), history())).rejects.toThrow();
  }
  for (const mutation of ["body", "program", "commander", "artifact", "flash", "source"] as const) {
    const changed = structuredClone(source),
      furnace = changed.definitions[named(source, "Furnace of Rath").id],
      dictate = changed.definitions[named(source, "Dictate of the Twin Gods").id],
      armor = changed.definitions[named(source, "Urza's Armor").id];
    if (!furnace || !dictate || !armor) throw new Error("Missing source mutation");
    if (mutation === "body") furnace.oracleText = "";
    if (mutation === "program") delete furnace.damagePrograms;
    if (mutation === "commander") furnace.commanderEligible = true;
    if (mutation === "artifact") armor.types = ["Creature"];
    if (mutation === "flash") dictate.keywords = [];
    if (mutation === "source") {
      furnace.id = "oracle:unknown";
      furnace.oracleId = "unknown";
      furnace.sourceVersion = "0".repeat(64);
    }
    await expect(makeDamageReplacementDecks(await rehash(changed), history())).rejects.toThrow(
      mutation === "source"
        ? "Definition dictionary identity mismatch"
        : "Unauthenticated definition",
    );
  }
});
