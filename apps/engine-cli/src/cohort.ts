import { resolve } from "node:path";
import { MatchManifest, RulesState, RunStatus, semanticHash } from "@iwsdk-apps/contracts";
import { z } from "zod";
import { writeEvidence } from "./evidence";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative();
const shardId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/);
// Reporting reads historical declarations; only the pinned executor may replay them.
const HistoricalManifest = z.object({ ...MatchManifest.shape, engineVersion: z.string().min(1) });
const Plan = z.strictObject({
  schema: z.literal("commander-exploration-plan/1"),
  status: z.literal("declared"),
  engineVersion: z.string(),
  releaseHash: hash,
  assignments: count,
  twoSeat: count,
  fourSeat: count,
  shards: z.array(
    z.strictObject({ id: shardId, two: count, four: count, seed: count, maxCommands: count }),
  ),
  counting: z.string(),
});
const Batch = z.object({
  buildHash: hash,
  releaseHash: hash,
  maxCommands: count,
  assignments: z.array(HistoricalManifest),
});
const Result = z.object({
  index: count,
  matchId: z.string(),
  buildHash: hash,
  status: z.union([RunStatus, z.literal("host-failed")]),
  commands: count.optional(),
  stateHash: hash.optional(),
  outcome: RulesState.shape.outcome.optional(),
  replay: z.object({ verified: z.literal(true), stateHash: hash }).optional(),
  coverage: z.record(z.string(), count).optional(),
});

type Accounting = {
  blockers: string[];
  coverage: Record<string, number>;
  totals: Record<
    | "assigned"
    | "accounted"
    | "completed"
    | "pending"
    | "invalid"
    | "replayVerified"
    | "commands"
    | "twoSeat"
    | "fourSeat",
    number
  >;
  dispositions: {
    matchId: string;
    status: string;
    evidence: string | null;
    evidenceHash: string | null;
  }[];
};
async function accountEvidence(
  accounting: Accounting,
  path: string,
  index: number,
  manifest: z.infer<typeof HistoricalManifest>,
  buildHash: string,
): Promise<void> {
  const { totals, dispositions, blockers, coverage } = accounting;
  if (!(await Bun.file(path).exists())) {
    totals.pending++;
    dispositions.push({
      matchId: manifest.id,
      status: "pending",
      evidence: null,
      evidenceHash: null,
    });
    return;
  }
  try {
    const raw = await Bun.file(path).json();
    const result = Result.parse(raw);
    if (result.matchId !== manifest.id || result.index !== index || result.buildHash !== buildHash)
      throw new Error("Result identity differs from assignment");
    if (
      result.status === "completed" &&
      (!result.outcome ||
        result.outcome.kind === "ongoing" ||
        !result.replay ||
        result.replay.stateHash !== result.stateHash)
    )
      throw new Error("Completed result lacks terminal outcome or matching replay");
    totals.accounted++;
    if (result.status === "completed") totals.completed++;
    if (result.replay?.stateHash === result.stateHash && result.replay) totals.replayVerified++;
    totals.commands += result.commands ?? 0;
    for (const [key, hits] of Object.entries(result.coverage ?? {}))
      coverage[key] = (coverage[key] ?? 0) + hits;
    dispositions.push({
      matchId: manifest.id,
      status: result.status,
      evidence: path,
      evidenceHash: await semanticHash(raw),
    });
    if (result.status !== "completed") blockers.push(`${manifest.id}: ${result.status}`);
  } catch (error) {
    totals.invalid++;
    blockers.push(
      `${manifest.id}: unreadable or invalid evidence: ${error instanceof Error ? error.message : String(error)}`,
    );
    dispositions.push({
      matchId: manifest.id,
      status: "invalid-evidence",
      evidence: path,
      evidenceHash: null,
    });
  }
}

/** Aggregate each predeclared assignment once; pending and malformed evidence stay visible. */
export async function reportCohort(directory: string, planPath: string) {
  const plan = Plan.parse(await Bun.file(planPath).json());
  const blockers: string[] = [];
  const seenIds = new Set<string>(),
    seenGames = new Set<string>(),
    deckHashes = new Set<string>();
  const coverage: Record<string, number> = {};
  const totals = {
    assigned: 0,
    accounted: 0,
    completed: 0,
    pending: 0,
    invalid: 0,
    replayVerified: 0,
    commands: 0,
    twoSeat: 0,
    fourSeat: 0,
  };
  const dispositions: {
    matchId: string;
    status: string;
    evidence: string | null;
    evidenceHash: string | null;
  }[] = [];
  const builds = new Set<string>();
  if (new Set(plan.shards.map((row) => row.id)).size !== plan.shards.length)
    throw new Error("Cohort repeats a shard identity.");
  for (const shard of plan.shards) {
    const root = resolve(directory, "batches", shard.id);
    const batch = Batch.parse(await Bun.file(resolve(root, "assignments.json")).json());
    builds.add(batch.buildHash);
    if (
      batch.releaseHash !== plan.releaseHash ||
      batch.maxCommands !== shard.maxCommands ||
      batch.assignments.length !== shard.two + shard.four
    )
      throw new Error(`Shard differs from its declared plan: ${shard.id}`);
    for (const [index, manifest] of batch.assignments.entries()) {
      const mode = index < shard.two ? "two-seat" : "four-seat";
      if (
        manifest.id !== `${shard.id}:${index}` ||
        manifest.mode !== mode ||
        manifest.gameSeed !== shard.seed + index ||
        manifest.engineVersion !== plan.engineVersion ||
        manifest.releaseHash !== plan.releaseHash
      )
        throw new Error(`Assignment differs from plan: ${manifest.id}`);
      const identity = await semanticHash({
        mode,
        gameSeed: manifest.gameSeed,
        driverSeed: manifest.driverSeed,
        driverVersion: manifest.driverVersion,
        decks: manifest.seats.map((seat) => seat.deck.hash),
      });
      if (seenIds.has(manifest.id) || seenGames.has(identity))
        throw new Error(`Duplicate game assignment cannot count twice: ${manifest.id}`);
      seenIds.add(manifest.id);
      seenGames.add(identity);
      for (const seat of manifest.seats) deckHashes.add(seat.deck.hash);
      totals.assigned++;
      totals[mode === "two-seat" ? "twoSeat" : "fourSeat"]++;
      const path = resolve(root, `${index}.result.json`);
      await accountEvidence(
        { totals, dispositions, blockers, coverage },
        path,
        index,
        manifest,
        batch.buildHash,
      );
    }
  }
  if (
    totals.assigned !== plan.assignments ||
    totals.twoSeat !== plan.twoSeat ||
    totals.fourSeat !== plan.fourSeat
  )
    throw new Error("Cohort denominator differs from declaration.");
  const report = {
    schema: "commander-exploration-report/1",
    planHash: await semanticHash(plan),
    engineVersion: plan.engineVersion,
    releaseHash: plan.releaseHash,
    buildHashes: [...builds].sort(),
    distinctDecks: deckHashes.size,
    totals,
    dispositions,
    blockers,
    coverage,
    fullyAccounted: totals.accounted === totals.assigned,
    allCompletedAndReplayed:
      totals.completed === totals.assigned && totals.replayVerified === totals.assigned,
    scope:
      "Aggregation of retained per-assignment reports; replay itself is performed by each batch executor.",
    runtimeHitsAreNotSemanticAssertions: true,
    fullSnapshotSupported: false,
  };
  const output = resolve(directory, "exploration-report.json");
  await writeEvidence(output, report);
  console.log(
    JSON.stringify(
      {
        ...totals,
        distinctDecks: report.distinctDecks,
        fullyAccounted: report.fullyAccounted,
        allCompletedAndReplayed: report.allCompletedAndReplayed,
        blockers: blockers.length,
        output,
      },
      null,
      2,
    ),
  );
  return report;
}
