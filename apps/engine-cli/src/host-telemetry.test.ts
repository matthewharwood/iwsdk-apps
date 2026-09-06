import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ContentRelease, ENGINE_VERSION } from "@iwsdk-apps/contracts";
import { executeAssignedGames } from "./batch";
import { AttemptTelemetry, type HostProbes, writeNewTelemetry } from "./host-telemetry";

function probes() {
  let time = 100,
    user = 300,
    system = 90,
    rss = 1_000,
    stops = 0;
  let tick: () => void = () => {};
  const cpu = { user, system };
  const api: HostProbes = {
    monotonicMs: () => time,
    timestamp: () => "2026-01-01T00:00:00.000Z",
    cpu: () => ({ ...cpu }),
    memory: () => ({ rss, heapTotal: 500, heapUsed: 200, external: 50 }),
    every: (_ms, callback) => {
      tick = callback;
      return () => {
        stops++;
      };
    },
  };
  return {
    api,
    tick: () => tick(),
    stops: () => stops,
    advance(ms: number, u: number, s: number, memory: number) {
      time += ms;
      user += u;
      system += s;
      cpu.user = user;
      cpu.system = system;
      rss = memory;
    },
  };
}
const identity = { matchId: "test:game", index: 2, buildHash: "a".repeat(64) };
const accounting = {
  gameStatus: "completed",
  acceptedCommands: 12,
  resultReportedCommands: 12,
  replayVerified: true,
  hostError: null,
};

test("host phases independently measure game versus replay and retain process samples without changing operation results", async () => {
  const fake = probes();
  const measured = new AttemptTelemetry(identity, fake.api, 100);
  const result = { canonicalState: "unchanged" };
  await measured.measure("create", () => fake.advance(5, 8, 2, 1500));
  const actual = await measured.measure("game", () => {
    fake.advance(100, 60, 10, 8000);
    fake.tick();
    measured.sample("progress", 12);
    return result;
  });
  expect(actual).toBe(result);
  await measured.measure("replay", () => fake.advance(40, 20, 4, 4000));
  await measured.measure("close", () => fake.advance(10, 2, 1, 3000));
  const report = measured.finish(accounting);
  expect(report.wallMs).toBe(155);
  expect(report.phases.map((p) => ({ phase: p.phase, wall: p.wallMs }))).toEqual([
    { phase: "create", wall: 5 },
    { phase: "game", wall: 100 },
    { phase: "replay", wall: 40 },
    { phase: "close", wall: 10 },
  ]);
  expect(report.phases[1]?.processCpuMicroseconds).toEqual({ user: 60, system: 10 });
  expect(report.processCpuMicroseconds).toEqual({ user: 90, system: 17 });
  expect(report.processMemory.observedMaxRssBytes).toBe(8000);
  expect(
    report.samples.some((s) => s.reason === "progress" && s.revision === 12 && s.phase === "game"),
  ).toBe(true);
  expect(report.accounting.commandCountsAgree).toBe(true);
  expect(report.priorAssignmentsInThisBatch).toBe(2);
  expect(fake.stops()).toBe(1);
  const count = report.samples.length;
  fake.tick();
  expect(report.samples.length).toBe(count);
  expect(() => measured.finish(accounting)).toThrow("exactly once");
});

test("a failed operation retains partial elapsed/CPU data and does not fabricate replay or command counts", async () => {
  const fake = probes();
  const measured = new AttemptTelemetry(identity, fake.api);
  const failure = new Error("injected commit failure");
  await expect(
    measured.measure("game", () => {
      fake.advance(23, 11, 5, 2300);
      throw failure;
    }),
  ).rejects.toBe(failure);
  const report = measured.finish({
    gameStatus: "no-game-result",
    acceptedCommands: 4,
    resultReportedCommands: null,
    replayVerified: false,
    hostError: failure.message,
  });
  expect(report.phases).toEqual([
    { phase: "game", status: "threw", wallMs: 23, processCpuMicroseconds: { user: 11, system: 5 } },
  ]);
  expect(report.accounting).toMatchObject({
    acceptedCommands: 4,
    resultReportedCommands: null,
    commandCountsAgree: null,
    replayVerified: false,
  });
  expect(report.phases.some((p) => p.phase === "replay")).toBe(false);
});

test("unavailable probes become explicit missing telemetry without suppressing the operation", async () => {
  const fake = probes();
  fake.api.memory = () => {
    throw new Error("memory unsupported");
  };
  fake.api.cpu = () => ({ user: Number.NaN, system: 0 });
  const measured = new AttemptTelemetry(identity, fake.api);
  expect(await measured.measure("game", () => 123)).toBe(123);
  const report = measured.finish(accounting);
  expect(report.processMemory.observedMaxRssBytes).toBeNull();
  expect(report.processCpuMicroseconds).toBeNull();
  expect(report.samples.every((sample) => sample.processMemory === null)).toBe(true);
  expect(report.probeErrors).toHaveLength(2);
  expect(JSON.stringify(report)).not.toContain("NaN");
});

test("sampling bounds explicitly retain dropped samples and the maximum observed value only", async () => {
  const fake = probes();
  const measured = new AttemptTelemetry(identity, fake.api, 100, 3);
  fake.advance(700, 0, 0, 1500);
  fake.tick();
  fake.advance(900, 0, 0, 2500);
  fake.tick();
  fake.advance(1000, 0, 0, 9999);
  fake.tick();
  const report = measured.finish(accounting);
  expect(report.sampling).toMatchObject({
    sampleLimit: 3,
    sampleCount: 3,
    droppedSamples: 2,
    largestObservedGapMs: 900,
  });
  expect(report.processMemory.observedMaxRssBytes).toBe(2500);
});

test("report writes preserve actual paths and exclusive-create semantics, surfacing retention failures", async () => {
  const writes: { path: string; value: unknown; flag: string }[] = [];
  await writeNewTelemetry(
    "/fixture/2.telemetry.json",
    { accepted: 4 },
    async (path, text, options) => {
      writes.push({ path, value: JSON.parse(text), flag: options.flag });
    },
  );
  expect(writes).toEqual([
    { path: "/fixture/2.telemetry.json", value: { accepted: 4 }, flag: "wx" },
  ]);
  await expect(
    writeNewTelemetry("/fixture/failed.json", {}, async () => {
      throw new Error("disk full");
    }),
  ).rejects.toThrow("disk full");
  const directory = await mkdtemp(join(tmpdir(), "commander-host-telemetry-"));
  try {
    const path = join(directory, "retained.json");
    await writeNewTelemetry(path, { first: true });
    await expect(writeNewTelemetry(path, { replacement: true })).rejects.toThrow("EEXIST");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ first: true });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("future batch telemetry refuses to backfill or overwrite a historical result directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "commander-historical-report-"));
  // No game is executed: this verifies the filesystem preflight before source/game access.
  const source: ContentRelease = {
    schema: "commander-content/1",
    id: "unused",
    hash: "a".repeat(64),
    sourceBundle: "unused",
    rulesHash: "b".repeat(64),
    profile: "tabletop-commander",
    assurance: "development-subset",
    definitions: {},
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "test",
    processorAbi: ENGINE_VERSION,
  };
  try {
    const path = join(directory, "0.result.json");
    const original = '{"historical":true}\n';
    await writeFile(path, original);
    await expect(executeAssignedGames(directory, "a".repeat(64), source, [], 5)).rejects.toThrow(
      "refusing to replace historical",
    );
    expect(await readFile(path, "utf8")).toBe(original);
    expect(await Bun.file(join(directory, "host-runtime.json")).exists()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
