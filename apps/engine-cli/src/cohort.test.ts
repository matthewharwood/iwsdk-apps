import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { CHANCE_VERSION, SERIALIZER_VERSION } from "@iwsdk-apps/contracts";
import { reportCohort } from "./cohort";

const temporary: string[] = [];
afterEach(async () => {
  for (const directory of temporary.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), "commander-cohort-"));
  temporary.push(directory);
  const root = resolve(directory, "batches", "sample");
  await mkdir(root, { recursive: true });
  const releaseHash = "a".repeat(64),
    buildHash = "b".repeat(64),
    stateHash = "c".repeat(64);
  const plan = {
    schema: "commander-exploration-plan/1",
    status: "declared",
    engineVersion: "commander-engine/historical-fixture",
    releaseHash,
    assignments: 2,
    twoSeat: 2,
    fourSeat: 0,
    shards: [{ id: "sample", two: 2, four: 0, seed: 10, maxCommands: 100 }],
    counting: "Synthetic accounting fixtures, not actual game evidence.",
  };
  const assignments = [0, 1].map((index) => ({
    schema: "commander-match/1",
    id: `sample:${index}`,
    releaseHash,
    engineVersion: plan.engineVersion,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 10 + index,
    driverSeed: 20 + index,
    driverVersion: "fixture/1",
    mode: "two-seat",
    resolver: "full-scan",
    seats: ["A", "B"].map((id) => ({
      id,
      deck: {
        id: "fixture",
        hash: "d".repeat(64),
        commander: "commander",
        entries: [{ definition: "land", count: 99 }],
      },
    })),
  }));
  const planPath = resolve(directory, "plan.json");
  await Bun.write(planPath, JSON.stringify(plan));
  const batchPath = resolve(root, "assignments.json");
  await Bun.write(
    batchPath,
    JSON.stringify({ buildHash, releaseHash, maxCommands: 100, assignments }),
  );
  const result = {
    index: 0,
    matchId: "sample:0",
    buildHash,
    status: "completed",
    commands: 30,
    stateHash,
    outcome: { kind: "win", winner: "A", reason: "all-opponents-left" },
    replay: { verified: true, stateHash },
    coverage: { "rule:fixture": 2 },
  };
  await Bun.write(resolve(root, "0.result.json"), JSON.stringify(result));
  return {
    directory,
    root,
    plan,
    planPath,
    assignments,
    batchPath,
    result,
    buildHash,
    releaseHash,
  };
}

test("historical reports retain missing assignments and do not count replays as games", async () => {
  const f = await fixture();
  const report = await reportCohort(f.directory, f.planPath);
  expect(report.totals).toMatchObject({
    assigned: 2,
    accounted: 1,
    completed: 1,
    pending: 1,
    replayVerified: 1,
    commands: 30,
  });
  expect(report.fullyAccounted).toBe(false);
  expect(report.fullSnapshotSupported).toBe(false);
  expect(report.coverage).toEqual({ "rule:fixture": 2 });
});

test("a budget disposition is accounted separately from a completed game", async () => {
  const f = await fixture();
  await Bun.write(
    resolve(f.root, "1.result.json"),
    JSON.stringify({
      ...f.result,
      index: 1,
      matchId: "sample:1",
      status: "budget-exhausted",
      outcome: { kind: "ongoing" },
    }),
  );
  const report = await reportCohort(f.directory, f.planPath);
  expect(report.totals).toMatchObject({ assigned: 2, accounted: 2, completed: 1, pending: 0 });
  expect(report.fullyAccounted).toBe(true);
  expect(report.allCompletedAndReplayed).toBe(false);
  expect(report.blockers).toContain("sample:1: budget-exhausted");
});

test("a claimed completion with an ongoing outcome remains invalid evidence", async () => {
  const f = await fixture();
  await Bun.write(
    resolve(f.root, "0.result.json"),
    JSON.stringify({ ...f.result, outcome: { kind: "ongoing" } }),
  );
  const report = await reportCohort(f.directory, f.planPath);
  expect(report.totals).toMatchObject({ accounted: 0, completed: 0, invalid: 1, pending: 1 });
  expect(report.dispositions[0]?.status).toBe("invalid-evidence");
});

test("changing an assignment seed after declaration is rejected", async () => {
  const f = await fixture();
  const first = f.assignments[0];
  if (!first) throw new Error("Missing fixture");
  first.gameSeed = 999;
  await Bun.write(
    f.batchPath,
    JSON.stringify({
      buildHash: f.buildHash,
      releaseHash: f.releaseHash,
      maxCommands: 100,
      assignments: f.assignments,
    }),
  );
  expect(reportCohort(f.directory, f.planPath)).rejects.toThrow("differs from plan");
});
