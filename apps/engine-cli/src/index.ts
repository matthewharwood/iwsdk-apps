import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  authorHighRiskScenarios,
  buildObligationLedger,
  fetchSources,
  fetchTabletopEligibilityEvidence,
  importSources,
  readInventory,
  selectRiskSample,
} from "@iwsdk-apps/catalog";
import {
  compileCounterSpellDraft,
  compileCreatureReturnDraft,
  compileDevelopmentRelease,
  compileFixedTokenDraft,
  compileKeywordReminderDraft,
  compileSelfEntryDraft,
  compileSpellFamilyDraft,
  makeCounterSpellDecks,
  makeCreatureReturnDecks,
  makeDevelopmentDecks,
  makeFixedTokenDecks,
  makeKeywordReminderDecks,
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
import { runRegression } from "./regress";
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
  if (!["simulate", "play", "batch", "compare", "regress"].includes(command ?? "")) return false;
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
  if (command === "regress") {
    await runRegression(directory, {
      id: z
        .string()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/)
        .parse(option("id", `regression-${crypto.randomUUID()}`)),
      corpusPath: resolve(option("corpus", "docs/commander/regression-corpus-v1.json") ?? ""),
      contentPath: releasePath,
      maxCommands: integer("max-commands", 20000),
    });
  } else if (command === "compare") {
    const content = await release();
    await compareResolvers(
      directory,
      content,
      await makeManifest(content, DRIVER_VERSION),
      integer("max-commands", 20000),
    );
  } else if (command === "batch") {
    await mkdir(resolve(directory, "batches"), { recursive: true });
    await runBatch(
      directory,
      {
        id: z
          .string()
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/)
          .parse(option("id", `discovery-${crypto.randomUUID()}`)),
        two: integer("two", 16),
        four: integer("four", 48),
        seed: integer("seed", 10000),
        maxCommands: integer("max-commands", 20000),
      },
      releasePath,
      decksPath,
    );
  } else await simulate(command === "play");
  return true;
}
// Reproduce historical fixture identity only. These releases are never executed
// under a newer ABI; exact content hashes prevent accidental historical relabeling.
async function historicalFixtureRelease(
  release: ContentRelease,
  expectedHash: string,
  processorAbi = "commander-engine/0.9.0",
): Promise<ContentRelease> {
  const { hash: _hash, ...current } = release;
  const body = { ...current, processorAbi };
  const hash = await semanticHash(body);
  if (hash !== expectedHash) throw new Error("Historical fixture source changed");
  return ContentRelease.parse({ ...body, hash });
}
async function reviewedFixtureDecks(content: ContentRelease) {
  const base = await compileDevelopmentRelease(catalogPath, {
    spellFamilies: true,
    selfEntryTriggers: true,
    selfEntrySequences: true,
    temporaryCreatureSpells: true,
  });
  const historical = await historicalFixtureRelease(
    base.release,
    "671c50aa072e6004b9fe286d387fc07edc722cf7b4a57c7f5653c8c113b655ba",
  );
  const prior24 = await makeDevelopmentDecks(historical, {
    includeFamilyDecks: true,
    includeTriggerDecks: true,
    includeTemporaryDecks: true,
  });
  const reminderRelease = await compileKeywordReminderDraft(catalogPath);
  const historicalReminders = await historicalFixtureRelease(
    reminderRelease.release,
    "8abe41532a96354af76d414d6c1c56e74c8142b126bb6cb7b8cac806c7380edd",
  );
  const reminders = await makeKeywordReminderDecks(historicalReminders, prior24);
  const counterRelease = await compileCounterSpellDraft(catalogPath);
  const historicalCounters = await historicalFixtureRelease(
    counterRelease.release,
    "58b8f2dd09d699ef232ba49257e0287eb8ca204902a9addddb499f73e3084739",
    "commander-engine/0.10.0",
  );
  const counters = await makeCounterSpellDecks(historicalCounters, reminders.decks);
  const returnRelease = await compileCreatureReturnDraft(catalogPath);
  const historicalReturns = await historicalFixtureRelease(
    returnRelease.release,
    "dac4f923e99a94e3e54031e635609dca4c91ad3f26c0bf85c4eb1bc3b35fa900",
    "commander-engine/0.11.0",
  );
  const returns = await makeCreatureReturnDecks(historicalReturns, counters.decks);
  const tokens = await makeFixedTokenDecks(content, returns.decks);
  return {
    ...tokens,
    returnReport: returns.report,
    counterReport: counters.report,
    reminderReport: reminders.report,
  };
}
async function compileCatalog(): Promise<void> {
  const allReviewed = args.includes("--all-reviewed");
  const triggers = allReviewed || args.includes("--self-entry-triggers");
  const families = allReviewed || args.includes("--spell-families");
  const compiled = allReviewed
    ? await compileFixedTokenDraft(catalogPath)
    : triggers
      ? await compileSelfEntryDraft(catalogPath)
      : families
        ? await compileSpellFamilyDraft(catalogPath)
        : await compileDevelopmentRelease(catalogPath);
  const reviewed = allReviewed ? await reviewedFixtureDecks(compiled.release) : null;
  const decks =
    reviewed?.decks ??
    (await makeDevelopmentDecks(compiled.release, {
      includeFamilyDecks: families,
      includeTriggerDecks: triggers,
    }));
  const retained = resolve(directory, "compilations", compiled.release.hash);
  await mkdir(retained, { recursive: true });
  await write(resolve(retained, "release.json"), compiled.release);
  await write(resolve(retained, "report.json"), compiled.report);
  await write(resolve(retained, "decks.json"), decks);
  if ("expansion" in compiled)
    await write(
      resolve(
        retained,
        allReviewed
          ? "fixed-token-expansion.json"
          : triggers
            ? "self-entry-expansion.json"
            : "spell-family-expansion.json",
      ),
      compiled.expansion,
    );
  if (reviewed) {
    await write(resolve(retained, "keyword-reminder-decks.json"), reviewed.reminderReport);
    await write(resolve(retained, "counter-spell-decks.json"), reviewed.counterReport);
    await write(resolve(retained, "creature-return-decks.json"), reviewed.returnReport);
    await write(resolve(retained, "fixed-token-decks.json"), reviewed.report);
  }
  await write(releasePath, compiled.release);
  if (releasePath === resolve(directory, "development-release.json"))
    await write(resolve(directory, "development-compilation.json"), compiled.report);
  await write(decksPath, decks);
  console.log(
    JSON.stringify(
      {
        releaseHash: compiled.release.hash,
        definitions: Object.keys(compiled.release.definitions).length,
        auxiliaryTokenTemplates: Object.keys(compiled.release.tokenTemplates ?? {}).length,
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
async function runSourceCommand(): Promise<void> {
  if (args[1] === "fetch") {
    console.log(JSON.stringify(await fetchSources(resolve(directory, "sources")), null, 2));
    return;
  }
  const path = option("manifest");
  if (!path) throw new Error("--manifest is required");
  if (args[1] === "supplement-tabletop") {
    console.log(JSON.stringify(await fetchTabletopEligibilityEvidence(path), null, 2));
  } else if (args[1] === "import") {
    console.log(JSON.stringify(await importSources(path, catalogPath), null, 2));
  } else throw new Error("Use sources fetch, supplement-tabletop, or import");
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
  if (command === "sources") return runSourceCommand();
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
    "Use sources fetch|supplement-tabletop|import, investigate inventory|obligations|sample|scenarios, compile, simulate, play, batch, regress, cohort, compare, scenarios, replay, export, import, coverage, or verify. Run data is retained under --data (default .commander).",
  );
}
await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
