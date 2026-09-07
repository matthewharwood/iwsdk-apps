import { beforeAll, expect, test } from "bun:test";
import {
  ContentRelease,
  canonicalJson,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { admitDeck } from "../../engine/src/index";
import fixture from "../test-fixtures/static-bonus-decks.json";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "./prepared";
import { makeStaticBonusDecks } from "./static-bonus-decks";

async function sourceFixture() {
  const body = {
    schema: "commander-content/1",
    id: "authenticated-static-deck-fixture/1",
    sourceBundle: fixture.sourceBundle,
    rulesHash: fixture.rulesHash,
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions: structuredClone(fixture.definitions),
    tokenTemplates: structuredClone(fixture.tokenTemplates),
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(fixture.definitions).length,
    compilerVersion: "static-deck-unit/1",
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
  expect(hash).toBe("2d66eb268917d7d3ea9e69441532bbb686b3eb966c3a126131c64b1068fdd518");
  expect(await semanticHash(body)).toBe(hash);
  expect(fixture.originReleaseHash).toBe(
    "7f1e1b65f7134dce4add33ded2019720f74b44f0c9c194dbc34e182383914bdf",
  );
  expect(fixture.previousArtifactSha256).toBe(
    "1f9ee1de7119f403eb08f498ddd9c148772281cc34d43e9ddbe741f896ecfde9",
  );
  expect(fixture.decks).toHaveLength(40);
  expect(fixture.originPrimaryCount).toBe(1170);
  expect(fixture.originAuxiliaryCount).toBe(20);
});

test("six static profiles preserve all 40 historical revisions exactly and admit legal 100-card singleton decks", async () => {
  const source = await sourceFixture();
  const previous = history();
  const sourceBefore = canonicalJson(source);
  const previousBefore = canonicalJson(previous);
  const result = await makeStaticBonusDecks(source, previous);
  expect(result.decks).toHaveLength(46);
  expect(canonicalJson(result.decks.slice(0, 40))).toBe(previousBefore);
  expect(canonicalJson(previous)).toBe(previousBefore);
  expect(canonicalJson(source)).toBe(sourceBefore);
  expect(new Set(result.decks.map((deck) => deck.id)).size).toBe(46);
  expect(new Set(result.decks.map((deck) => deck.hash)).size).toBe(46);
  expect(result.decks.slice(40).map(({ commander, entries }) => ({ commander, entries }))).toEqual(
    fixture.expectedSupplements,
  );
  const registry = await createFullExecutionRegistry(source);
  for (const deck of result.decks) {
    admitDeck(deck, registry);
    const { hash, ...body } = deck;
    expect(await semanticHash(body)).toBe(hash);
    expect(deck.entries.reduce((sum, row) => sum + row.count, 0)).toBe(100);
    const commander = source.definitions[deck.commander];
    if (!commander) throw new Error("Missing legal commander");
    expect(commander.commanderEligible).toBe(true);
    expect(deck.entries.find((row) => row.definition === commander.id)?.count).toBe(1);
    const names = new Map<string, number>();
    for (const entry of deck.entries) {
      const card = source.definitions[entry.definition];
      if (!card) throw new Error("Missing authenticated deck root");
      expect(card.colorIdentity.every((color) => commander.colorIdentity.includes(color))).toBe(
        true,
      );
      const count = (names.get(card.name) ?? 0) + entry.count;
      names.set(card.name, count);
      if (card.deckLimit !== null) expect(count).toBeLessThanOrEqual(card.deckLimit);
      expect(entry.definition.startsWith("oracle:")).toBe(true);
    }
  }
  for (const deck of result.decks.slice(40)) {
    const basics = deck.entries.filter((entry) =>
      source.definitions[entry.definition]?.supertypes.includes("Basic"),
    );
    expect(basics.reduce((sum, entry) => sum + entry.count, 0)).toBe(39);
    expect(basics.map((entry) => entry.count).sort()).toEqual([19, 20]);
    expect(
      deck.entries.filter((entry) =>
        source.definitions[entry.definition]?.types.includes("Creature"),
      ).length,
    ).toBeGreaterThan(30);
  }
  expect(result.report.priorDeckHashes).toEqual(previous.map((deck) => deck.hash));
  expect(result.report.executedGames).toBe(0);
  const { hash, ...body } = result.report;
  expect(await semanticHash(body)).toBe(hash);
});

test("all 41 static bindings are checked against every one of 39 authenticated commanders, with exactly three unavoidable gaps", async () => {
  const source = await sourceFixture();
  const result = await makeStaticBonusDecks(source, history());
  const commanders = Object.values(source.definitions).filter((card) => card.commanderEligible);
  expect(commanders).toHaveLength(39);
  expect(canonicalJson(result.report.commanderInventory)).toBe(
    canonicalJson(fixture.expectedCommanderInventory),
  );
  expect(result.report.candidateBindings).toBe(41);
  expect(result.report.coveredBindings).toBe(38);
  expect(result.report.coverage).toHaveLength(41);
  expect(result.report.excluded.map((row) => row.name).sort()).toEqual([
    "Inspiring Veteran",
    "Kargan Warleader",
    "Merfolk Mistbinder",
  ]);
  const supplementIds = new Set(
    result.decks.slice(40).flatMap((deck) => deck.entries.map((entry) => entry.definition)),
  );
  for (const row of result.report.coverage) {
    const card = source.definitions[row.definition];
    if (!card) throw new Error("Missing source static binding");
    const compatible = commanders
      .filter((commander) =>
        card.colorIdentity.every((color) => commander.colorIdentity.includes(color)),
      )
      .map((commander) => commander.id)
      .sort();
    expect(row.compatibleCommanderIds).toEqual(compatible);
    expect(row.supplementalDeckHashes.length > 0).toBe(compatible.length > 0);
    expect(supplementIds.has(row.definition)).toBe(compatible.length > 0);
  }
  for (const excluded of result.report.excluded) {
    expect(excluded.reviewedCommanderDefinitions).toBe(39);
    expect(excluded.reason).toBe("no-compatible-implemented-commander-in-release");
    expect(excluded.executed).toBe(false);
    expect(
      commanders.some((commander) =>
        excluded.colorIdentity.every((color) => commander.colorIdentity.includes(color)),
      ),
    ).toBe(false);
  }
});

test("Arvad enables a real WB fixture containing Call to the Feast, Legion Lieutenant and legendary recipients", async () => {
  const source = await sourceFixture();
  const result = await makeStaticBonusDecks(source, history());
  const arvad = named(source, "Arvad the Cursed");
  const lieutenant = named(source, "Legion Lieutenant");
  const feast = named(source, "Call to the Feast");
  const deck = result.decks[45];
  if (!deck) throw new Error("Missing supplemental Arvad fixture");
  expect(deck.commander).toBe(arvad.id);
  expect(arvad.colorIdentity).toEqual(["B", "W"]);
  for (const card of [arvad, lieutenant, feast])
    expect(deck.entries.find((entry) => entry.definition === card.id)?.count).toBe(1);
  expect(result.report.newlyReachableTokenProducer).toBe(feast.id);
  expect(
    deck.entries.some(
      (entry) =>
        entry.definition !== arvad.id &&
        source.definitions[entry.definition]?.types.includes("Creature") &&
        source.definitions[entry.definition]?.supertypes.includes("Legendary"),
    ),
  ).toBe(true);
  const effect = feast.spellProgram?.effects[0];
  if (effect?.kind !== "create-token") throw new Error("Missing authentic Feast program");
  const template = source.tokenTemplates?.[effect.templateId];
  expect(effect.count).toBe(3);
  expect(template?.characteristics.subtypes).toEqual(["Vampire"]);
  expect(template?.characteristics.keywords).toEqual(["lifelink"]);
  expect(lieutenant.staticPrograms?.[0].predicate).toEqual({ kind: "subtype", subtype: "Vampire" });
  const artifact = await createPreparedMatchArtifact(source, [deck, deck]);
  const registry = await admitPreparedMatchArtifact(artifact, source, [deck, deck]);
  admitDeck(deck, registry);
  expect(registry.tokenTemplates[effect.templateId]).toEqual(template);
  expect(Object.keys(registry.definitions).sort()).toEqual(
    deck.entries.map((entry) => entry.definition).sort(),
  );
  expect(artifact.closure.blockers).toEqual([]);
  expect(artifact.closure.widened).toEqual([]);
});

test("supplement selection and its report do not depend on definition object insertion order", async () => {
  const source = await sourceFixture();
  const reversed = {
    ...source,
    definitions: Object.fromEntries(Object.entries(source.definitions).reverse()),
  };
  const before = await makeStaticBonusDecks(source, history());
  const after = await makeStaticBonusDecks(reversed, history());
  expect(canonicalJson(after)).toBe(canonicalJson(before));
});

test("builder rejects corrupt history, illegal colors, copy violations, duplicate rows and deck identity collisions", async () => {
  const source = await sourceFixture();
  const previous = history();
  const original = previous[0];
  if (!original) throw new Error("Missing historical revision");
  await expect(makeStaticBonusDecks(source, [])).rejects.toThrow("At least one");
  await expect(makeStaticBonusDecks(source, [original, original])).rejects.toThrow(
    "Duplicate frozen",
  );
  await expect(
    makeStaticBonusDecks(source, [{ ...original, hash: "0".repeat(64) }]),
  ).rejects.toThrow("Frozen deck hash mismatch");
  for (const mutation of ["count", "duplicate-row", "color", "copies", "auxiliary"] as const) {
    const changed = structuredClone(original);
    const commanderRow = changed.entries.find((row) => row.definition === changed.commander);
    const single = changed.entries.find(
      (row) => row.definition !== changed.commander && row.count === 1,
    );
    const basic = changed.entries.find((row) => row.count > 1);
    if (!single || !basic || !commanderRow) throw new Error("Missing mutation fixture");
    if (mutation === "count") basic.count--;
    if (mutation === "duplicate-row") {
      basic.count--;
      changed.entries.push({ ...single });
    }
    if (mutation === "color") single.definition = named(source, "Merfolk Mistbinder").id;
    if (mutation === "copies") {
      basic.count--;
      single.count++;
    }
    if (mutation === "auxiliary")
      single.definition = Object.keys(source.tokenTemplates ?? {})[0] ?? "missing";
    await expect(makeStaticBonusDecks(source, [await rehash(changed)])).rejects.toThrow();
  }
  const generated = await makeStaticBonusDecks(source, previous);
  await expect(makeStaticBonusDecks(source, generated.decks)).rejects.toThrow("collides");
});

test("missing required static and Feast roots, fabricated commander colors and altered static bodies fail closed", async () => {
  const source = await sourceFixture();
  for (const name of ["Kargan Warleader", "Arvad the Cursed", "Call to the Feast"]) {
    const changed = structuredClone(source);
    delete changed.definitions[named(source, name).id];
    await expect(makeStaticBonusDecks(await rehash(changed), history())).rejects.toThrow();
  }
  for (const mutation of ["color", "body", "predicate"] as const) {
    const changed = structuredClone(source);
    const arvad = changed.definitions[named(source, "Arvad the Cursed").id];
    if (!arvad?.staticPrograms) throw new Error("Missing authentic Arvad");
    if (mutation === "color") arvad.colorIdentity.push("R");
    if (mutation === "body") arvad.oracleText = "Other creatures you control get +2/+2.";
    if (mutation === "predicate") arvad.staticPrograms[0].predicate = { kind: "all" };
    await expect(makeStaticBonusDecks(await rehash(changed), history())).rejects.toThrow(
      "Unauthenticated definition",
    );
  }
});
