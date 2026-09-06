import { writeFile } from "node:fs/promises";
import { arch, availableParallelism, cpus, platform, release, totalmem } from "node:os";

export const HOST_TELEMETRY_VERSION = "commander-host-telemetry/1";
export type HostPhase = "create" | "game" | "replay" | "close";
type CpuReading = { user: number; system: number };
type MemoryReading = {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers?: number;
};
export interface HostProbes {
  monotonicMs(): number;
  timestamp(): string;
  cpu(): CpuReading;
  memory(): MemoryReading;
  every(intervalMs: number, callback: () => void): () => void;
}
const processProbes: HostProbes = {
  monotonicMs: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  cpu: () => process.cpuUsage(),
  memory: () => process.memoryUsage(),
  every(intervalMs, callback) {
    const timer = setInterval(callback, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  },
};
export const HOST_TELEMETRY_LIMITATIONS = [
  "RSS, heap and CPU readings describe the whole host process, including shared runtime, SQLite, prior games and other work in that process; they are not per-match allocation or peak-memory measurements.",
  "Maximum RSS is the largest observed sample. Timers may be delayed by the event loop; unsampled spikes and native allocator residency are not reconstructed.",
  "Monotonic durations include scheduling, persistence, driver execution, hashing and instrumentation within each phase. Replay is reported separately from game execution.",
  "No garbage collection, cache flush or process isolation is forced. Prior games and operating-system activity can affect observations.",
  "CPU time is process user/system time, not elapsed time or normalized utilization. It may include concurrent runtime threads.",
  "These host readings do not instrument individual transitions, commits, selector calls, WebXR frames or AI inference. Historical reports receive no inferred telemetry.",
] as const;

/** Declared once for future runs; no account names, hostname or unrelated process inventory. */
export function hostRuntimeDeclaration() {
  const processors = cpus();
  return {
    schema: "commander-host-runtime/1",
    observedAt: new Date().toISOString(),
    runtime: { name: "bun", version: Bun.version, nodeCompatibility: process.versions.node },
    operatingSystem: { platform: platform(), release: release(), architecture: arch() },
    hardware: {
      cpuModels: [...new Set(processors.map((cpu) => cpu.model))],
      logicalProcessors: processors.length,
      availableParallelism: availableParallelism(),
      systemMemoryBytes: totalmem(),
    },
    processId: process.pid,
    measurement: {
      defaultSampleIntervalMs: 100,
      memoryUnit: "bytes",
      cpuUnit: "microseconds",
      wallUnit: "milliseconds",
    },
    limitations: HOST_TELEMETRY_LIMITATIONS,
  };
}

type Reading = { time: number | null; cpu: CpuReading | null };
type Sample = {
  offsetMs: number | null;
  phase: HostPhase | "host";
  reason: "start" | "interval" | "phase-start" | "phase-end" | "progress" | "finish";
  revision: number | null;
  processMemory: MemoryReading | null;
};
type PhaseResult = {
  phase: HostPhase;
  status: "returned" | "threw";
  wallMs: number | null;
  processCpuMicroseconds: CpuReading | null;
};
export type AttemptAccounting = {
  gameStatus: string;
  acceptedCommands: number | null;
  resultReportedCommands: number | null;
  replayVerified: boolean;
  hostError: string | null;
};

/** Host-only observer. Probe failures are recorded instead of changing engine execution. */
export class AttemptTelemetry {
  private readonly started: Reading;
  private readonly startedAt: string | null;
  private readonly samples: Sample[] = [];
  private readonly phases: PhaseResult[] = [];
  private readonly errors: string[] = [];
  private phase: HostPhase | "host" = "host";
  private droppedSamples = 0;
  private finished = false;
  private readonly cancel: () => void;
  constructor(
    private readonly identity: { matchId: string; index: number; buildHash: string },
    private readonly probes: HostProbes = processProbes,
    private readonly intervalMs = 100,
    private readonly sampleLimit = 10_000,
  ) {
    if (
      !Number.isFinite(intervalMs) ||
      intervalMs <= 0 ||
      !Number.isInteger(sampleLimit) ||
      sampleLimit < 2
    )
      throw new Error("Telemetry interval and sample bound must be positive");
    this.startedAt = this.probe("timestamp", () => probes.timestamp());
    this.started = this.read();
    this.sample("start");
    this.cancel =
      this.probe("sampling timer", () => probes.every(intervalMs, () => this.sample("interval"))) ??
      (() => {});
  }
  private probe<T>(label: string, operation: () => T): T | null {
    try {
      return operation();
    } catch (error) {
      const message = `${label}: ${error instanceof Error ? error.message : String(error)}`;
      if (!this.errors.includes(message)) this.errors.push(message);
      return null;
    }
  }
  private nonnegative(label: string, value: number): number {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} is unavailable or invalid`);
    return value;
  }
  private read(): Reading {
    return {
      time: this.probe("monotonic clock", () =>
        this.nonnegative("clock", this.probes.monotonicMs()),
      ),
      cpu: this.probe("process CPU", () => {
        const value = this.probes.cpu();
        return {
          user: this.nonnegative("CPU user", value.user),
          system: this.nonnegative("CPU system", value.system),
        };
      }),
    };
  }
  private difference(start: number | null, end: number | null): number | null {
    if (start === null || end === null) return null;
    return this.probe("measurement delta", () => this.nonnegative("delta", end - start));
  }
  private elapsed(start: Reading, end: Reading) {
    const user = this.difference(start.cpu?.user ?? null, end.cpu?.user ?? null);
    const system = this.difference(start.cpu?.system ?? null, end.cpu?.system ?? null);
    return {
      wallMs: this.difference(start.time, end.time),
      processCpuMicroseconds: user === null || system === null ? null : { user, system },
    };
  }
  sample(reason: Sample["reason"] = "progress", revision: number | null = null): void {
    if (this.finished) return;
    if (this.samples.length >= this.sampleLimit) {
      this.droppedSamples++;
      return;
    }
    const time = this.probe("sample clock", () =>
      this.nonnegative("clock", this.probes.monotonicMs()),
    );
    const memory = this.probe("process memory", () => {
      const value = this.probes.memory();
      return {
        rss: this.nonnegative("rss", value.rss),
        heapTotal: this.nonnegative("heapTotal", value.heapTotal),
        heapUsed: this.nonnegative("heapUsed", value.heapUsed),
        external: this.nonnegative("external", value.external),
        ...(value.arrayBuffers === undefined
          ? {}
          : { arrayBuffers: this.nonnegative("arrayBuffers", value.arrayBuffers) }),
      };
    });
    this.samples.push({
      offsetMs: this.difference(this.started.time, time),
      phase: this.phase,
      reason,
      revision,
      processMemory: memory,
    });
  }
  async measure<T>(phase: HostPhase, operation: () => T | Promise<T>): Promise<T> {
    if (this.finished || this.phase !== "host")
      throw new Error("Telemetry phases must run sequentially before finish");
    this.phase = phase;
    const start = this.read();
    this.sample("phase-start");
    let status: PhaseResult["status"] = "threw";
    try {
      const result = await operation();
      status = "returned";
      return result;
    } finally {
      this.sample("phase-end");
      this.phases.push({ phase, status, ...this.elapsed(start, this.read()) });
      this.phase = "host";
    }
  }
  finish(accounting: AttemptAccounting) {
    if (this.finished || this.phase !== "host")
      throw new Error("Telemetry can finish exactly once outside a phase");
    this.probe("cancel timer", this.cancel);
    this.sample("finish");
    this.finished = true;
    const ended = this.read();
    const times = this.samples.flatMap((sample) =>
      sample.offsetMs === null ? [] : [sample.offsetMs],
    );
    const rss = this.samples.flatMap((sample) =>
      sample.processMemory === null ? [] : [sample.processMemory.rss],
    );
    return {
      schema: HOST_TELEMETRY_VERSION,
      ...this.identity,
      runtimeEvidence: "host-runtime.json",
      priorAssignmentsInThisBatch: this.identity.index,
      startedAt: this.startedAt,
      finishedAt: this.probe("timestamp", () => this.probes.timestamp()),
      ...this.elapsed(this.started, ended),
      phases: this.phases,
      accounting: {
        ...accounting,
        commandCountsAgree:
          accounting.acceptedCommands === null || accounting.resultReportedCommands === null
            ? null
            : accounting.acceptedCommands === accounting.resultReportedCommands,
        commandCountSource:
          "durable accepted SQLite receipts after game execution; replay creates no new accepted commands",
      },
      sampling: {
        requestedIntervalMs: this.intervalMs,
        sampleLimit: this.sampleLimit,
        droppedSamples: this.droppedSamples,
        sampleCount: this.samples.length,
        largestObservedGapMs:
          times.length < 2
            ? null
            : Math.max(...times.slice(1).map((time, index) => time - (times[index] ?? time))),
      },
      processMemory: { observedMaxRssBytes: rss.length ? Math.max(...rss) : null },
      samples: this.samples,
      probeErrors: this.errors,
      limitations: HOST_TELEMETRY_LIMITATIONS,
    };
  }
}

/** Exclusive writes keep new measurements from replacing historical evidence. */
export async function writeNewTelemetry(
  path: string,
  report: unknown,
  sink: (path: string, text: string, options: { flag: "wx" }) => Promise<unknown> = writeFile,
): Promise<void> {
  await sink(path, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
}
