import { expect, test } from "bun:test";
import {
  type CardDefinition,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  emptyMana,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { planRegression } from "./regress";

async function fixture() {
  const commander: CardDefinition = {
    id: "commander",
    oracleId: "synthetic",
    sourceVersion: "1".repeat(64),
    name: "Unit commander",
    typeLine: "Legendary Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: ["Legendary"],
    colors: ["G"],
    colorIdentity: ["G"],
    manaCost: { ...emptyMana(), G: 1, generic: 1 },
    manaValue: 2,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: true,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "commander-development-recipes/1",
  };
  const land: CardDefinition = {
    ...commander,
    id: "land",
    oracleId: "synthetic-land",
    name: "Unit Forest",
    typeLine: "Basic Land — Forest",
    types: ["Land"],
    subtypes: ["Forest"],
    supertypes: ["Basic"],
    manaCost: null,
    manaValue: 0,
    power: null,
    toughness: null,
    manaAbilities: ["G"],
    deckLimit: null,
    commanderEligible: false,
  };
  const definitions: ContentRelease["definitions"] = { land };
  const decks: DeckRevision[] = [];
  for (let i = 0; i < 12; i++) {
    const card = {
      ...commander,
      id: `commander-${i}`,
      oracleId: `synthetic-${i}`,
      name: `Unit commander ${i}`,
    };
    definitions[card.id] = card;
    const body = {
      id: `deck-${i}`,
      commander: card.id,
      entries: [
        { definition: card.id, count: 1 },
        { definition: "land", count: 99 },
      ],
    };
    decks.push({ ...body, hash: await semanticHash(body) });
  }
  const body = {
    schema: "commander-content/1" as const,
    id: "regression-synthetic-source",
    sourceBundle: "2".repeat(64),
    rulesHash: "3".repeat(64),
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: 13,
    compilerVersion: "unit/1",
    processorAbi: ENGINE_VERSION,
  };
  const source = { ...body, hash: await semanticHash(body) };
  const corpus = {
    schema: "commander-regression-corpus/1",
    id: "synthetic-corpus",
    baselineSourceReleaseHash: "4".repeat(64),
    rulesHash: source.rulesHash,
    twoSeat: 16,
    fourSeat: 48,
    distinctDecks: 12,
    definitionSourcePins: Object.fromEntries(
      Object.values(definitions).map((card) => [card.id, card.sourceVersion]),
    ),
    decks,
    scope: "Synthetic accounting fixture; no source-backed games are claimed.",
    baselineBuildHashes: ["5".repeat(64)],
    cases: Array.from({ length: 64 }, (_, i) => ({
      id: `case-${i}`,
      mode: i < 16 ? "two-seat" : "four-seat",
      gameSeed: i + 1,
      driverSeed: i + 100,
      seats: Array.from({ length: i < 16 ? 2 : 4 }, (_, seat) => ({
        id: `seat-${seat}`,
        deckHash: decks[(i + seat) % decks.length]?.hash,
      })),
      baseline: {
        engineVersion: "synthetic-old/1",
        driverVersion: "synthetic-driver/1",
        buildHash: "5".repeat(64),
        status: "completed",
        resultHash: "6".repeat(64),
        finalStateHash: "7".repeat(64),
        commands: 100,
      },
    })),
  };
  return { source, corpus };
}

test("fixed regression preserves 64 declared inputs and pins new independent prepared executions", async () => {
  const { source, corpus } = await fixture();
  const plan = await planRegression(corpus, source, "new-build");
  expect(plan.assignments).toHaveLength(64);
  expect(plan.assignments.filter((row) => row.mode === "two-seat")).toHaveLength(16);
  expect(plan.corpusHash).toBe(await semanticHash(corpus));
  for (const [i, row] of plan.assignments.entries()) {
    const baseline = corpus.cases[i];
    if (!baseline) throw new Error("Missing baseline case");
    expect(row.gameSeed).toBe(baseline.gameSeed);
    expect(row.driverSeed).toBe(baseline.driverSeed);
    expect(row.engineVersion).toBe(ENGINE_VERSION);
    expect(row.releaseHash).toBe(source.hash);
    expect(row.preparedArtifactHash && plan.artifacts[row.preparedArtifactHash]).toBeDefined();
  }
});

test("regression rejects changed card source even after the release is rehashed", async () => {
  const { source, corpus } = await fixture();
  const card = source.definitions.land;
  if (!card) throw new Error("Missing fixture land");
  card.sourceVersion = "8".repeat(64);
  const { hash: _hash, ...body } = source;
  source.hash = await semanticHash(body);
  await expect(planRegression(corpus, source, "bad")).rejects.toThrow("card source changed");
});

test("a new case name cannot count identical game inputs twice", async () => {
  const { source, corpus } = await fixture();
  const first = corpus.cases[0];
  if (!first) throw new Error("Missing fixture case");
  corpus.cases[1] = { ...first, id: "different-label" };
  await expect(planRegression(corpus, source, "bad")).rejects.toThrow("identical game inputs");
});

test("regression rejects a changed denominator or a missing pinned source", async () => {
  const { source, corpus } = await fixture();
  corpus.fourSeat = 49;
  await expect(planRegression(corpus, source, "bad")).rejects.toThrow("denominator");
  corpus.fourSeat = 48;
  delete corpus.definitionSourcePins.land;
  await expect(planRegression(corpus, source, "bad")).rejects.toThrow("pin closure");
});
