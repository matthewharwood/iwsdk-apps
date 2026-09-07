import { beforeAll, expect, test } from "bun:test";
import { CONDITIONAL_SELF_ENTRY_PERMANENTS } from "@iwsdk-apps/card-programs";
import {
  ContentRelease,
  canonicalJson,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { admitDeck } from "../../engine/src/index";
import fixture from "../test-fixtures/conditional-self-entry-decks.json";
import { makeConditionalSelfEntryDecks } from "./development-conditional-self-entry-decks";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "./prepared";

async function sourceFixture() {
  const body = {
    schema: "commander-content/1",
    id: "authenticated-conditional-self-entry-deck-fixture/1",
    sourceBundle: fixture.sourceBundle,
    rulesHash: fixture.rulesHash,
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions: structuredClone(fixture.definitions),
    tokenTemplates: structuredClone(fixture.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(fixture.definitions).length,
    compilerVersion: "conditional-self-entry-deck-unit/1",
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
  expect(hash).toBe("64c3b222c93a61740ae45a03b03ca1948cdf5883ec41d11a941f523a99a8f5d9");
  expect(fixture.originReleaseHash).toBe(
    "ee7d9fe069b1c829325ac3a87d8622fab2893c2dc85e7e065537fb2cfb9782a0",
  );
  expect(fixture.previousArtifactSha256).toBe(
    "09744b0fce95f2c47eb243c1fbf9ea11d15c4f0a3332f336cf935e00db1a23d6",
  );
  expect(await semanticHash(fixture.decks)).toBe(fixture.previousDecksHash);
  expect(fixture.decks).toHaveLength(49);
  expect(fixture.originPrimaryCount).toBe(1192);
  expect(fixture.originAuxiliaryCount).toBe(20);
  expect(Object.values(fixture.definitions).filter((card) => card.commanderEligible)).toHaveLength(
    41,
  );
});

test("two conditional profiles preserve all49 frozen revisions and admit legal100-card singleton inventories", async () => {
  const source = await sourceFixture(),
    previous = history();
  const sourceBefore = canonicalJson(source),
    previousBefore = canonicalJson(previous);
  const result = await makeConditionalSelfEntryDecks(source, previous);
  expect(result.decks).toHaveLength(51);
  expect(canonicalJson(result.decks.slice(0, 49))).toBe(previousBefore);
  expect(canonicalJson(previous)).toBe(previousBefore);
  expect(canonicalJson(source)).toBe(sourceBefore);
  expect(new Set(result.decks.map((deck) => deck.id)).size).toBe(51);
  expect(new Set(result.decks.map((deck) => deck.hash)).size).toBe(51);
  expect(result.decks.slice(49).map(({ commander, entries }) => ({ commander, entries }))).toEqual(
    fixture.expectedSupplements,
  );
  expect(result.decks.slice(49).map((deck) => source.definitions[deck.commander]?.name)).toEqual([
    "Donatello, Turtle Techie",
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
  for (const deck of result.decks.slice(49)) {
    const basics = deck.entries.filter((row) =>
      source.definitions[row.definition]?.supertypes.includes("Basic"),
    );
    expect(basics.reduce((sum, row) => sum + row.count, 0)).toBe(39);
    expect(basics.map((row) => row.count).sort()).toEqual(
      deck.commander === named(source, "Donatello, Turtle Techie").id ? [39] : [19, 20],
    );
  }
  const { hash, ...body } = result.report;
  expect(await semanticHash(body)).toBe(hash);
  expect(result.report.executedGames).toBe(0);
});

test("both source bodies have legal membership and exhaustive41-commander comparisons with no waived colors", async () => {
  const source = await sourceFixture(),
    result = await makeConditionalSelfEntryDecks(source, history());
  const commanders = Object.values(source.definitions).filter((card) => card.commanderEligible);
  expect(result.report.candidateBindings).toBe(2);
  expect(result.report.coveredBindings).toBe(2);
  expect(result.report.excluded).toEqual([]);
  expect(canonicalJson(result.report.commanderInventory)).toBe(
    canonicalJson(fixture.expectedCommanderInventory),
  );
  expect(result.report.coveredDefinitionIds.slice().sort()).toEqual(
    CONDITIONAL_SELF_ENTRY_PERMANENTS.map((row) => `oracle:${row.identity}`).sort(),
  );
  for (const row of result.report.coverage) {
    const card = source.definitions[row.definition];
    if (!card) throw new Error("Missing conditional source");
    expect(row.compatibleCommanderIds).toEqual(
      commanders
        .filter((commander) =>
          card.colorIdentity.every((color) => commander.colorIdentity.includes(color)),
        )
        .map((card) => card.id)
        .sort(),
    );
    expect(row.compatibleCommanderIds).toHaveLength(11);
    expect(row.supplementalDeckHashes).toHaveLength(2);
    expect(row.sourceVersion).toBe(card.sourceVersion);
    expect(card.triggerPrograms?.[0]?.schema).toBe("commander-conditional-self-entry/1");
  }
  const donatello = named(source, "Donatello, Turtle Techie"),
    scholar = named(source, "Scholar of Stars");
  expect(donatello.commanderEligible).toBe(true);
  expect(scholar.commanderEligible).toBe(false);
  expect(result.decks[49]?.commander).toBe(donatello.id);
  expect(result.decks[50]?.entries.find((row) => row.definition === donatello.id)?.count).toBe(1);
});

test("potential witnesses include distinct artifacts, a flash replacement witness, return and counter interaction", async () => {
  const source = await sourceFixture(),
    result = await makeConditionalSelfEntryDecks(source, history());
  for (const row of result.report.coverage)
    for (const witness of row.potentialWitnesses) {
      const deck = result.decks.find((value) => value.hash === witness.deckHash);
      if (!deck) throw new Error("Missing supplemental deck");
      expect(witness.artifactDefinitionIds).toHaveLength(17);
      for (const id of witness.artifactDefinitionIds) {
        expect(source.definitions[id]?.types).toContain("Artifact");
        expect(deck.entries.some((entry) => entry.definition === id)).toBe(true);
      }
      for (const id of [
        witness.zeroCostArtifact,
        witness.differentFlashArtifact,
        witness.returnAndDrawSpell,
        witness.counterSpell,
      ])
        expect(deck.entries.some((entry) => entry.definition === id)).toBe(true);
      expect(witness.zeroCostArtifact).toBe(named(source, "Memnite").id);
      expect(source.definitions[witness.zeroCostArtifact]?.manaValue).toBe(0);
      expect(witness.differentFlashArtifact).toBe(named(source, "Darksteel Sentinel").id);
      expect(source.definitions[witness.differentFlashArtifact]?.keywords).toContain("flash");
      expect(witness.differentFlashArtifact).not.toBe(witness.zeroCostArtifact);
      expect(source.definitions[witness.returnAndDrawSpell]?.spellProgram?.effects).toEqual([
        { kind: "return-to-hand" },
        { kind: "draw", recipient: "controller", amount: 1 },
      ]);
      expect(source.definitions[witness.counterSpell]?.spellProgram?.effects).toEqual([
        { kind: "counter" },
      ]);
      expect(
        deck.entries.filter((entry) => {
          const card = source.definitions[entry.definition];
          return card?.types.includes("Creature") && !card.types.includes("Artifact");
        }).length,
      ).toBeGreaterThan(10);
    }
});

test("prepared admission keeps both conditional definitions and every legal root across two and four seats", async () => {
  const source = await sourceFixture(),
    result = await makeConditionalSelfEntryDecks(source, history());
  const supplements = result.decks.slice(49);
  for (const selected of [supplements, [...supplements, ...supplements]]) {
    const artifact = await createPreparedMatchArtifact(source, selected);
    const registry = await admitPreparedMatchArtifact(artifact, source, selected);
    for (const deck of selected) admitDeck(deck, registry);
    expect(Object.keys(registry.definitions).sort()).toEqual(
      [...new Set(selected.flatMap((deck) => deck.entries.map((row) => row.definition)))].sort(),
    );
    expect(artifact.closure.blockers).toEqual([]);
    expect(artifact.closure.widened).toEqual([]);
    for (const name of [
      "Scholar of Stars",
      "Donatello, Turtle Techie",
      "Memnite",
      "Darksteel Sentinel",
      "Repulse",
      "Counterspell",
    ])
      expect(registry.definitions[named(source, name).id]).toEqual(named(source, name));
  }
});

test("conditional deck selection and reports are independent of source dictionary insertion order", async () => {
  const source = await sourceFixture();
  const reversed = {
    ...source,
    definitions: Object.fromEntries(Object.entries(source.definitions).reverse()),
  };
  expect(canonicalJson(await makeConditionalSelfEntryDecks(reversed, history()))).toBe(
    canonicalJson(await makeConditionalSelfEntryDecks(source, history())),
  );
});

test("corrupt and illegal frozen revisions or duplicate generated identities fail closed", async () => {
  const source = await sourceFixture(),
    previous = history(),
    original = previous[0];
  if (!original) throw new Error("Missing history");
  await expect(makeConditionalSelfEntryDecks(source, [])).rejects.toThrow("At least one");
  await expect(makeConditionalSelfEntryDecks(source, [original, original])).rejects.toThrow(
    "Duplicate frozen",
  );
  await expect(
    makeConditionalSelfEntryDecks(source, [{ ...original, hash: "0".repeat(64) }]),
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
    await expect(makeConditionalSelfEntryDecks(source, [await rehash(changed)])).rejects.toThrow();
  }
  const generated = await makeConditionalSelfEntryDecks(source, previous);
  await expect(makeConditionalSelfEntryDecks(source, generated.decks)).rejects.toThrow("collides");
});

test("missing required conditional sources or witnesses and rehashed source changes fail authentication", async () => {
  const source = await sourceFixture();
  for (const name of [
    "Scholar of Stars",
    "Donatello, Turtle Techie",
    "Tobias Andrion",
    "Memnite",
    "Darksteel Sentinel",
    "Repulse",
    "Counterspell",
  ]) {
    const changed = structuredClone(source);
    delete changed.definitions[named(source, name).id];
    await expect(makeConditionalSelfEntryDecks(await rehash(changed), history())).rejects.toThrow();
  }
  for (const mutation of ["body", "program", "commander", "artifact", "flash"] as const) {
    const changed = structuredClone(source),
      donatello = changed.definitions[named(source, "Donatello, Turtle Techie").id],
      sentinel = changed.definitions[named(source, "Darksteel Sentinel").id];
    if (!donatello || !sentinel) throw new Error("Missing source mutation");
    if (mutation === "body") donatello.oracleText = "When Donatello enters, draw a card.";
    if (mutation === "program") delete donatello.triggerPrograms;
    if (mutation === "commander") donatello.commanderEligible = false;
    if (mutation === "artifact") sentinel.types = ["Creature"];
    if (mutation === "flash")
      sentinel.keywords = sentinel.keywords.filter((keyword) => keyword !== "flash");
    await expect(makeConditionalSelfEntryDecks(await rehash(changed), history())).rejects.toThrow(
      "Unauthenticated definition",
    );
  }
});
