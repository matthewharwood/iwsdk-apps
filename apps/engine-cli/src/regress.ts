import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createPreparedMatchArtifact, verifySourceRelease } from "@iwsdk-apps/compiler/prepared";
import {
  CHANCE_VERSION,
  ContentRelease,
  DeckRevision,
  Digest,
  ENGINE_VERSION,
  Id,
  MatchManifest,
  type PreparedMatchArtifact,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { admitDeck } from "@iwsdk-apps/engine";
import { DRIVER_VERSION } from "@iwsdk-apps/simulation";
import { z } from "zod";
import { deckCompositionKey, executeAssignedGames } from "./batch";
import { archiveBuild, writeEvidence } from "./evidence";

const Corpus = z.strictObject({
  schema: z.literal("commander-regression-corpus/1"),
  id: Id,
  baselineSourceReleaseHash: Digest,
  rulesHash: Digest,
  twoSeat: z.number().int().min(16),
  fourSeat: z.number().int().min(48),
  distinctDecks: z.number().int().min(12),
  definitionSourcePins: z.record(Id, Digest),
  decks: z.array(DeckRevision).min(12),
  cases: z
    .array(
      z.strictObject({
        id: Id,
        mode: MatchManifest.shape.mode,
        gameSeed: MatchManifest.shape.gameSeed,
        driverSeed: MatchManifest.shape.driverSeed,
        seats: z
          .array(z.strictObject({ id: Id, deckHash: Digest }))
          .min(2)
          .max(4),
        baseline: z.strictObject({
          engineVersion: Id,
          driverVersion: Id,
          buildHash: Digest,
          status: z.literal("completed"),
          resultHash: Digest,
          finalStateHash: Digest,
          commands: z.number().int().positive(),
        }),
      }),
    )
    .min(64),
  scope: z.string(),
  baselineBuildHashes: z.array(Digest).min(1),
});

/** Preserve inputs across engine revisions; terminal outcomes must be established anew. */
export async function planRegression(raw: unknown, content: ContentRelease, id: string) {
  const corpus = Corpus.parse(raw);
  await verifySourceRelease(content);
  if (content.processorAbi !== ENGINE_VERSION) throw new Error("Regression release ABI mismatch");
  if (content.rulesHash !== corpus.rulesHash) throw new Error("Regression rules source changed");
  const decks = new Map<string, DeckRevision>();
  const usedDefinitions = new Set<string>();
  const compositions = new Set<string>();
  for (const deck of corpus.decks) {
    const { hash, ...body } = deck;
    if ((await semanticHash(body)) !== hash || decks.has(hash))
      throw new Error("Regression deck hash is invalid or duplicated");
    admitDeck(deck, content);
    for (const entry of deck.entries) usedDefinitions.add(entry.definition);
    decks.set(hash, deck);
    compositions.add(deckCompositionKey(deck));
  }
  if (compositions.size !== corpus.distinctDecks)
    throw new Error("Regression deck denominator changed");
  if (Object.keys(corpus.definitionSourcePins).length !== usedDefinitions.size)
    throw new Error("Regression definition source pin closure is incomplete");
  for (const definition of usedDefinitions) {
    if (content.definitions[definition]?.sourceVersion !== corpus.definitionSourcePins[definition])
      throw new Error(`Regression card source changed: ${definition}`);
  }
  const identities = new Set<string>(),
    caseIds = new Set<string>(),
    usedDecks = new Set<string>();
  const assignments: MatchManifest[] = [];
  const artifacts: Record<string, PreparedMatchArtifact> = {};
  for (const [index, item] of corpus.cases.entries()) {
    if (caseIds.has(item.id)) throw new Error("Regression case identity repeated");
    caseIds.add(item.id);
    if (!corpus.baselineBuildHashes.includes(item.baseline.buildHash))
      throw new Error("Regression baseline build is not declared");
    if (
      item.seats.length !== (item.mode === "two-seat" ? 2 : 4) ||
      new Set(item.seats.map((seat) => seat.id)).size !== item.seats.length
    )
      throw new Error("Regression seat assignment is invalid");
    const seats = item.seats.map((seat) => {
      const deck = decks.get(seat.deckHash);
      if (!deck) throw new Error("Regression references an undeclared deck");
      usedDecks.add(deckCompositionKey(deck));
      return { id: seat.id, deck };
    });
    const identity = await semanticHash({
      mode: item.mode,
      gameSeed: item.gameSeed,
      driverSeed: item.driverSeed,
      seatCompositions: seats.map((seat) => deckCompositionKey(seat.deck)),
    });
    if (identities.has(identity)) throw new Error("Regression repeats identical game inputs");
    identities.add(identity);
    const artifact = await createPreparedMatchArtifact(
      content,
      seats.map((seat) => seat.deck),
    );
    artifacts[artifact.hash] = artifact;
    assignments.push(
      MatchManifest.parse({
        schema: "commander-match/1",
        id: `${id}:${index}`,
        releaseHash: content.hash,
        engineVersion: ENGINE_VERSION,
        serializer: SERIALIZER_VERSION,
        chance: CHANCE_VERSION,
        gameSeed: item.gameSeed,
        driverSeed: item.driverSeed,
        driverVersion: DRIVER_VERSION,
        mode: item.mode,
        seats,
        resolver: "prepared-indexed",
        preparedArtifactHash: artifact.hash,
      }),
    );
  }
  if (
    usedDecks.size !== corpus.distinctDecks ||
    assignments.filter((row) => row.mode === "two-seat").length !== corpus.twoSeat ||
    assignments.filter((row) => row.mode === "four-seat").length !== corpus.fourSeat
  )
    throw new Error("Regression case denominator differs from its declaration");
  return { corpus, corpusHash: await semanticHash(corpus), assignments, artifacts };
}

export async function runRegression(
  directory: string,
  options: {
    id: string;
    corpusPath: string;
    contentPath: string;
    maxCommands: number;
  },
): Promise<void> {
  const content = ContentRelease.parse(await Bun.file(options.contentPath).json());
  const plan = await planRegression(await Bun.file(options.corpusPath).json(), content, options.id);
  const root = resolve(directory, "regressions", options.id);
  await mkdir(resolve(directory, "regressions"), { recursive: true });
  await mkdir(root, { recursive: false });
  const buildHash = await archiveBuild(directory);
  await writeEvidence(resolve(root, "corpus.json"), plan.corpus);
  await writeEvidence(resolve(root, "release.json"), content);
  await writeEvidence(resolve(root, "prepared-artifacts.json"), plan.artifacts);
  await writeEvidence(resolve(root, "assignments.json"), {
    schema: "commander-batch/1",
    phase: "fixed-regression",
    buildHash,
    releaseHash: content.hash,
    corpusHash: plan.corpusHash,
    maxCommands: options.maxCommands,
    assignments: plan.assignments,
    baselineCaseIds: plan.corpus.cases.map((row) => row.id),
    historicalOutcomesReused: false,
  });
  await executeAssignedGames(
    root,
    buildHash,
    content,
    plan.assignments,
    options.maxCommands,
    plan.artifacts,
  );
}
