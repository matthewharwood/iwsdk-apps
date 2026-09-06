import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  authorHighRiskScenarios,
  buildObligationLedger,
  fetchSources,
  importSources,
  readInventory,
  selectRiskSample,
} from "@iwsdk-apps/catalog";
import {
  compileDevelopmentRelease,
  compileSpellFamilyDraft,
  makeDevelopmentDecks,
} from "@iwsdk-apps/compiler";
import { createPreparedMatchArtifact } from "@iwsdk-apps/compiler/prepared";
import {
  CHANCE_VERSION,
  ContentRelease,
  Decision,
  DeckRevision,
  ENGINE_VERSION,
  MatchManifest,
  type PreparedMatchArtifact,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { DRIVER_VERSION, runGame } from "@iwsdk-apps/simulation";
import { Coordinator, exportMatch, importMatch, replayMatch } from "@iwsdk-apps/storage";
import { openNativeRepository } from "@iwsdk-apps/storage/native";
import { z } from "zod";
import { runBatch } from "./batch";
import { reportCohort } from "./cohort";
import { compareResolvers } from "./compare";
import { reportCoverage } from "./coverage";
import { selectDriver } from "./drivers";
import { archiveBuild, EXECUTOR_OPTION } from "./evidence";
import { runScenarios } from "./scenarios";
import { runTerminal, TERMINAL_DRIVER_VERSION } from "./terminal";

const args = process.argv.slice(2);
function option(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name} value`);
  return value;
}
function integer(name: string, fallback: number): number {
  return z.coerce
    .number()
    .int()
    .min(1)
    .max(0xffffffff)
    .parse(option(name, String(fallback)));
}
const directory = resolve(option("data", ".commander") ?? ".commander");
const catalogPath = resolve(directory, "catalog.sqlite");
const matchesPath = resolve(directory, "matches.sqlite");
const releasePath = resolve(option("release") ?? resolve(directory, "development-release.json"));
const decksPath = resolve(option("decks") ?? resolve(directory, "development-decks.json"));
async function write(path: string, data: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(data, null, 2)}\n`);
}
async function release(): Promise<ContentRelease> {
  const content = ContentRelease.parse(await Bun.file(releasePath).json());
  const { hash, ...body } = content;
  if ((await semanticHash(body)) !== hash) throw new Error("Content release hash mismatch");
  await mkdir(resolve(directory, "releases"), { recursive: true });
  await write(resolve(directory, "releases", `${hash}.json`), content);
  return content;
}
async function makeManifest(
  content: ContentRelease,
  driverVersion: string,
): Promise<MatchManifest> {
  const decks = z.array(DeckRevision).parse(await Bun.file(decksPath).json());
  const mode = z.enum(["two-seat", "four-seat"]).parse(option("mode", "two-seat"));
  const count = mode === "two-seat" ? 2 : 4;
  const gameSeed = integer("seed", 1);
  const deckOffset = integer("deck-offset", 1) - 1;
  const id = option("id", `${mode}-${gameSeed}-${crypto.randomUUID().slice(0, 8)}`);
  return MatchManifest.parse({
    schema: "commander-match/1",
    id,
    releaseHash: content.hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed,
    driverSeed: integer("driver-seed", gameSeed),
    driverVersion,
    mode,
    resolver: MatchManifest.shape.resolver.parse(option("resolver", "full-scan")),
    seats: Array.from({ length: count }, (_, index) => ({
      id: `seat-${index + 1}`,
      deck: decks[(deckOffset + index * integer("deck-stride", 3)) % decks.length],
    })),
  });
}
async function simulate(manual = false): Promise<void> {
  if (manual && option("script"))
    throw new Error("play accepts terminal input; use simulate for a script.");
  const content = await release();
  const driver = await selectDriver(option("script"));
  const driverVersion = manual ? TERMINAL_DRIVER_VERSION : driver.version;
  const pause = option("pause-at");
  if (pause) Decision.shape.kind.parse(pause);
  const repo = openNativeRepository(matchesPath);
  const resume = option("resume");
  let manifest: MatchManifest;
  let artifact: PreparedMatchArtifact | undefined;
  try {
    const selected = resume
      ? repo.load(resume)?.current.manifest
      : await makeManifest(content, driverVersion);
    if (!selected) throw new Error("Requested saved match does not exist");
    if (selected.driverVersion !== driverVersion)
      throw new Error("Resume requires the exact pinned driver or script version.");
    manifest = selected;
    if (!resume && manifest.resolver !== "full-scan") {
      artifact = await createPreparedMatchArtifact(
        content,
        manifest.seats.map((seat) => seat.deck),
      );
      manifest = MatchManifest.parse({ ...manifest, preparedArtifactHash: artifact.hash });
    }
  } catch (error) {
    repo.close();
    throw error;
  }
  const attempt = crypto.randomUUID();
  const evidence = resolve(directory, "runs", attempt);
  await mkdir(evidence, { recursive: true });
  const identity = await archiveBuild(directory);
  if (artifact) await write(resolve(evidence, "prepared-artifact.json"), artifact);
  await write(resolve(evidence, "assignment.json"), {
    schema: "commander-run-assignment/1",
    attempt,
    manifest,
    buildHash: identity,
    resume: resume ?? null,
    maxCommands: integer("max-commands", 20000),
    status: "assigned",
    host: manual ? "terminal" : "headless",
    assurance: "development-subset",
    releasePath,
    driverSource: driver.source,
  });
  let coordinator: Coordinator | undefined;
  try {
    coordinator = resume
      ? await Coordinator.open(repo, content, resume)
      : await Coordinator.create(repo, content, manifest, artifact);
    const result = manual
      ? await runTerminal(coordinator, manifest.driverSeed)
      : await runGame(coordinator, {
          driver: driver.driver,
          seed: manifest.driverSeed,
          maxCommands: integer("max-commands", 20000),
          ...(pause
            ? {
                stopAt: (
                  observation: Parameters<NonNullable<Parameters<typeof runGame>[1]["stopAt"]>>[0],
                ) => observation.decision?.kind === pause,
              }
            : {}),
          onProgress: (revision) => process.stderr.write(`${manifest.id}: revision ${revision}\n`),
        });
    await write(resolve(evidence, "result.json"), { ...result, attempt, buildHash: identity });
    console.log(JSON.stringify({ ...result, evidence }, null, 2));
    if (!["completed", "paused"].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    await write(resolve(evidence, "failure.json"), {
      status: "host-failed",
      message: error instanceof Error ? error.message : String(error),
      buildHash: identity,
    });
    throw error;
  } finally {
    if (coordinator) await coordinator.close();
    else repo.close();
  }
}
async function inspectSaved(command: string): Promise<void> {
  const content = await release();
  const repo = openNativeRepository(matchesPath);
  try {
    const id = option("id");
    if (!id) throw new Error("--id is required");
    if (command === "replay") {
      const state = await replayMatch(repo, content, id);
      console.log(
        JSON.stringify(
          {
            matchId: id,
            verified: true,
            revision: state.revision,
            outcome: state.outcome,
            stateHash: await semanticHash(state),
          },
          null,
          2,
        ),
      );
    } else if (command === "export") {
      const output = option("out");
      if (!output) throw new Error("--out is required");
      await Bun.write(output, await exportMatch(repo, content, id));
      console.log(`Verified logical save written to ${output}`);
    }
  } finally {
    repo.close();
  }
}
async function runExecutionCommand(command: string | undefined): Promise<boolean> {
  if (!["simulate", "play", "batch", "compare"].includes(command ?? "")) return false;
  const buildHash = await archiveBuild(directory);
  if (!option(EXECUTOR_OPTION)) {
    // Execute the captured bytes even if this checkout changes during a long game.
    const executor = Bun.spawn(
      [
        process.execPath,
        resolve(directory, "builds", buildHash, "engine-cli.js"),
        ...args,
        `--${EXECUTOR_OPTION}`,
        buildHash,
      ],
      { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
    );
    process.exitCode = await executor.exited;
    return true;
  }
  if (command === "compare") {
    const content = await release();
    await compareResolvers(
      directory,
      content,
      await makeManifest(content, DRIVER_VERSION),
      integer("max-commands", 20000),
    );
  } else if (command === "batch") {
    await mkdir(resolve(directory, "batches"), { recursive: true });
    await runBatch(directory, {
      id: z
        .string()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/)
        .parse(option("id", `discovery-${crypto.randomUUID()}`)),
      two: integer("two", 16),
      four: integer("four", 48),
      seed: integer("seed", 10000),
      maxCommands: integer("max-commands", 20000),
    });
  } else await simulate(command === "play");
  return true;
}
async function compileCatalog(): Promise<void> {
  const families = args.includes("--spell-families");
  const compiled = families
    ? await compileSpellFamilyDraft(catalogPath)
    : await compileDevelopmentRelease(catalogPath);
  const decks = await makeDevelopmentDecks(compiled.release, { includeFamilyDecks: families });
  const retained = resolve(directory, "compilations", compiled.release.hash);
  await mkdir(retained, { recursive: true });
  await write(resolve(retained, "release.json"), compiled.release);
  await write(resolve(retained, "report.json"), compiled.report);
  await write(resolve(retained, "decks.json"), decks);
  if ("expansion" in compiled)
    await write(resolve(retained, "spell-family-expansion.json"), compiled.expansion);
  await write(releasePath, compiled.release);
  if (releasePath === resolve(directory, "development-release.json"))
    await write(resolve(directory, "development-compilation.json"), compiled.report);
  await write(decksPath, decks);
  console.log(
    JSON.stringify(
      {
        releaseHash: compiled.release.hash,
        definitions: Object.keys(compiled.release.definitions).length,
        unsupported: compiled.release.unsupportedOracleIds.length,
        decks: decks.length,
        assurance: compiled.release.assurance,
        retained,
      },
      null,
      2,
    ),
  );
}
async function main(): Promise<void> {
  await mkdir(directory, { recursive: true });
  const command = args[0];
  if (command === "cohort") {
    const plan = option("plan");
    if (!plan) throw new Error("cohort requires --plan <predeclared-exploration-plan.json>");
    const report = await reportCohort(directory, resolve(plan));
    if (!report.fullyAccounted || report.blockers.length) process.exitCode = 1;
    return;
  }
  if (await runExecutionCommand(command)) return;
  if (command === "scenarios") return runScenarios(directory);
  if (command === "coverage" || command === "verify") {
    await reportCoverage(directory);
    if (command === "verify" || args.includes("--fail-on-unresolved")) process.exitCode = 1;
    return;
  }
  if (command === "replay" || command === "export") return inspectSaved(command);
  if (command === "import") {
    const path = option("file");
    if (!path) throw new Error("--file is required");
    const repo = openNativeRepository(matchesPath);
    try {
      console.log(
        (await importMatch(repo, await release(), await Bun.file(path).text())).manifest.id,
      );
    } finally {
      repo.close();
    }
    return;
  }
  if (command === "sources" && args[1] === "fetch") {
    console.log(JSON.stringify(await fetchSources(resolve(directory, "sources")), null, 2));
    return;
  }
  if (command === "sources" && args[1] === "import") {
    const path = option("manifest");
    if (!path) throw new Error("--manifest is required");
    console.log(JSON.stringify(await importSources(path, catalogPath), null, 2));
    return;
  }
  if (command === "investigate" && args[1] === "inventory") {
    console.log(JSON.stringify(readInventory(catalogPath), null, 2));
    return;
  }
  if (command === "investigate" && ["obligations", "sample", "scenarios"].includes(args[1] ?? "")) {
    const kind = args[1];
    const result =
      kind === "obligations"
        ? await buildObligationLedger(catalogPath)
        : kind === "sample"
          ? await selectRiskSample(catalogPath, { size: integer("size", 300) })
          : await authorHighRiskScenarios(catalogPath);
    const path = resolve(directory, `investigate-${kind}.json`);
    await write(path, result);
    console.log(`Retained investigation artifact: ${path}`);
    return;
  }
  if (command === "compile") return compileCatalog();
  throw new Error(
    "Use sources fetch|import, investigate inventory|obligations|sample|scenarios, compile, simulate, play, batch, compare, scenarios, replay, export, import, coverage, or verify. Run data is retained under --data (default .commander).",
  );
}
await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
