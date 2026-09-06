import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  ContentRelease,
  canonicalJson,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import pinnedFixture from "../test-fixtures/regression-source.json";
import { deckCompositionKey, runBatch } from "./batch";
import { planRegression } from "./regress";

const FOREST = "oracle:b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6";

async function fixture() {
  const definitions = structuredClone(pinnedFixture.definitions);
  const decks = pinnedFixture.decks.map((deck) => DeckRevision.parse(deck));
  const body = {
    schema: "commander-content/1" as const,
    id: "regression-source-backed-unit-subset",
    sourceBundle: pinnedFixture.sourceBundle,
    rulesHash: pinnedFixture.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "unit/1",
    processorAbi: ENGINE_VERSION,
  };
  const source = ContentRelease.parse({ ...body, hash: await semanticHash(body) });
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
    scope: pinnedFixture.scope,
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

test("regression rejects unauthenticated changed card source even after the release is rehashed", async () => {
  const { source, corpus } = await fixture();
  const card = source.definitions[FOREST];
  if (!card) throw new Error("Missing fixture land");
  card.sourceVersion = "8".repeat(64);
  const { hash: _hash, ...body } = source;
  source.hash = await semanticHash(body);
  await expect(planRegression(corpus, source, "bad")).rejects.toThrow("Unauthenticated definition");
});

test("regression rejects a changed corpus source pin against the authenticated source", async () => {
  const { source, corpus } = await fixture();
  corpus.definitionSourcePins[FOREST] = "8".repeat(64);
  await expect(planRegression(corpus, source, "bad-pin")).rejects.toThrow("card source changed");
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
  delete corpus.definitionSourcePins[FOREST];
  await expect(planRegression(corpus, source, "bad")).rejects.toThrow("pin closure");
});

test("renamed or reordered copies do not inflate the distinct deck denominator", async () => {
  const { source, corpus } = await fixture();
  const first = corpus.decks[0];
  if (!first) throw new Error("Missing fixture deck");
  corpus.decks = await Promise.all(
    corpus.decks.map(async (_, i) => {
      const body = {
        id: `alias-${i}`,
        commander: first.commander,
        entries: i % 2 ? [...first.entries].reverse() : first.entries,
      };
      return { ...body, hash: await semanticHash(body) };
    }),
  );
  corpus.definitionSourcePins = Object.fromEntries(
    first.entries.map((row) => {
      const card = source.definitions[row.definition];
      if (!card) throw new Error("Missing fixture definition");
      return [row.definition, card.sourceVersion];
    }),
  );
  for (const [i, item] of corpus.cases.entries())
    item.seats = item.seats.map((seat, j) => ({
      ...seat,
      deckHash: corpus.decks[(i + j) % 12]?.hash,
    }));
  await expect(planRegression(corpus, source, "aliases")).rejects.toThrow("deck denominator");
});

test("seat renaming cannot turn the same seeds and ordered compositions into a new game", async () => {
  const { source, corpus } = await fixture();
  const first = corpus.cases[0];
  if (!first) throw new Error("Missing fixture case");
  corpus.cases[1] = {
    ...structuredClone(first),
    id: "seat-alias",
    seats: first.seats.map((seat, i) => ({ ...seat, id: `renamed-${i}` })),
  };
  await expect(planRegression(corpus, source, "aliases")).rejects.toThrow("identical game inputs");
});

async function addDeckAliases(corpus: Awaited<ReturnType<typeof fixture>>["corpus"]) {
  const first = corpus.cases[0];
  if (!first) throw new Error("Missing fixture case");
  const aliases: DeckRevision[] = [];
  for (const seat of first.seats) {
    const original = corpus.decks.find((deck) => deck.hash === seat.deckHash);
    if (!original) throw new Error("Missing fixture deck");
    const body = {
      id: `${original.id}-alias`,
      commander: original.commander,
      entries: [...original.entries].reverse(),
    };
    aliases.push({ ...body, hash: await semanticHash(body) });
  }
  corpus.decks.push(...aliases);
  corpus.cases[1] = {
    ...structuredClone(first),
    id: "deck-alias",
    seats: first.seats.map((seat, i) => ({ ...seat, deckHash: aliases[i]?.hash })),
  };
  return corpus.cases[1];
}

test("deck aliases and row permutations cannot count identical seeded compositions twice", async () => {
  const { source, corpus } = await fixture();
  await addDeckAliases(corpus);
  expect(corpus.decks).toHaveLength(14);
  expect(corpus.distinctDecks).toBe(12);
  await expect(planRegression(corpus, source, "aliases")).rejects.toThrow("identical game inputs");
});

test("aliases with distinct seeds preserve exact historical revision pins and row order", async () => {
  const { source, corpus } = await fixture();
  const changed = await addDeckAliases(corpus);
  changed.driverSeed = 123456;
  const plan = await planRegression(corpus, source, "preserved");
  expect(new Set(plan.corpus.decks.map(deckCompositionKey)).size).toBe(12);
  expect(plan.corpus.decks).toHaveLength(14);
  expect(canonicalJson(plan.corpus)).toBe(canonicalJson(corpus));
  for (const [i, assignment] of plan.assignments.entries()) {
    const original = corpus.cases[i];
    if (!original) throw new Error("Missing original case");
    expect(assignment.gameSeed).toBe(original.gameSeed);
    expect(assignment.driverSeed).toBe(original.driverSeed);
    expect(assignment.seats).toEqual(
      original.seats.map((seat) => {
        const deck = corpus.decks.find((candidate) => candidate.hash === seat.deckHash);
        if (!deck) throw new Error("Missing original deck");
        return { id: seat.id, deck };
      }),
    );
  }
});

test.each([
  "seat-order",
  "game-seed",
  "driver-seed",
] as const)("%s distinguishes valid regression inputs", async (change) => {
  const { source, corpus } = await fixture();
  const first = corpus.cases[0];
  if (!first) throw new Error("Missing fixture case");
  const next = { ...structuredClone(first), id: `changed-${change}` };
  if (change === "seat-order") next.seats.reverse();
  if (change === "game-seed") next.gameSeed = 123456;
  if (change === "driver-seed") next.driverSeed = 123456;
  corpus.cases[1] = next;
  expect((await planRegression(corpus, source, "distinct")).assignments).toHaveLength(64);
}, 15000);

async function rejectedBatch(
  alter: (source: ContentRelease, decks: DeckRevision[]) => void | Promise<void>,
  message: string,
) {
  const { source, corpus } = await fixture();
  await alter(source, corpus.decks);
  const directory = await mkdtemp(resolve(tmpdir(), "commander-batch-preflight-"));
  try {
    const sourcePath = resolve(directory, "release.json"),
      decksPath = resolve(directory, "decks.json");
    await Bun.write(sourcePath, JSON.stringify(source));
    await Bun.write(decksPath, JSON.stringify(corpus.decks));
    await expect(
      runBatch(
        directory,
        { id: "preflight", two: 1, four: 0, seed: 1, maxCommands: 1 },
        sourcePath,
        decksPath,
      ),
    ).rejects.toThrow(message);
    expect(await Bun.file(resolve(directory, "batches/preflight/assignments.json")).exists()).toBe(
      false,
    );
    expect(await Bun.file(resolve(directory, "batches/preflight/0.sqlite")).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("batch rejects a bad common release before declaring per-game attempts", async () => {
  await rejectedBatch((source) => {
    source.hash = "f".repeat(64);
  }, "release hash");
});

test("batch rejects an incompatible ABI before declaring per-game attempts", async () => {
  await rejectedBatch(async (source) => {
    source.processorAbi = "unsupported-engine/1";
    const { hash: _hash, ...body } = source;
    source.hash = await semanticHash(body);
  }, "ABI mismatch");
});

test("batch authenticates every declared deck even when its first assignment does not use it", async () => {
  await rejectedBatch((_source, decks) => {
    const unused = decks[11];
    if (!unused) throw new Error("Missing unused deck");
    unused.hash = "e".repeat(64);
  }, "deck hash");
});

test("batch admits every declared deck even when its first assignment does not use it", async () => {
  await rejectedBatch(async (_source, decks) => {
    const unused = decks[11];
    if (!unused) throw new Error("Missing unused deck");
    const land = unused.entries.find((entry) => entry.definition === FOREST);
    if (!land) throw new Error("Missing land");
    land.count -= 1;
    const { hash: _hash, ...body } = unused;
    unused.hash = await semanticHash(body);
  }, "exactly 100 cards");
});

test("batch requires twelve compositions rather than twelve renamed revisions", async () => {
  await rejectedBatch(async (_source, decks) => {
    const first = decks[0];
    if (!first) throw new Error("Missing fixture deck");
    for (const [i, deck] of decks.entries()) {
      const body = {
        id: deck.id,
        commander: first.commander,
        entries: i % 2 ? [...first.entries].reverse() : first.entries,
      };
      decks[i] = { ...body, hash: await semanticHash(body) };
    }
  }, "twelve distinct deck compositions");
});
