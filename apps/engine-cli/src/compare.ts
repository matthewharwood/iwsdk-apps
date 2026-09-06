import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createPreparedMatchArtifact } from "@iwsdk-apps/compiler/prepared";
import {
  CONTRACT_VERSION,
  type ContentRelease,
  canonicalJson,
  type GameCommand,
  type MatchManifest,
  type PlayerObservation,
  type PreparedMatchArtifact,
  type RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { heuristicDriver } from "@iwsdk-apps/simulation";
import { Coordinator, replayMatch } from "@iwsdk-apps/storage";
import { openNativeRepository } from "@iwsdk-apps/storage/native";
import { archiveBuild, writeEvidence } from "./evidence";

const modes = ["full-scan", "prepared-scan", "prepared-indexed"] as const;
async function verifyObservations(
  observations: PlayerObservation[],
  index: number,
): Promise<string> {
  const hashes = await Promise.all(observations.map(semanticHash));
  const first = hashes[0];
  if (!first || hashes.some((hash) => hash !== first))
    throw new Error(`Player observation divergence at boundary ${index}`);
  return first;
}
function semanticProjection(state: RulesState): unknown {
  const {
    resolver: _executionMode,
    preparedArtifactHash: _preparedArtifact,
    ...manifest
  } = state.manifest;
  return { ...state, manifest };
}
type Execution = {
  mode: (typeof modes)[number];
  coordinator: Coordinator;
  repo: ReturnType<typeof openNativeRepository>;
};
async function createExecution(
  root: string,
  mode: Execution["mode"],
  source: MatchManifest,
  content: ContentRelease,
  artifact: PreparedMatchArtifact,
): Promise<Execution> {
  const repo = openNativeRepository(resolve(root, `${mode}.sqlite`));
  try {
    const { preparedArtifactHash: _inputArtifact, ...base } = source;
    const prepared = mode !== "full-scan";
    const coordinator = await Coordinator.create(
      repo,
      content,
      { ...base, resolver: mode, ...(prepared ? { preparedArtifactHash: artifact.hash } : {}) },
      prepared ? artifact : undefined,
    );
    return { mode, coordinator, repo };
  } catch (error) {
    repo.close();
    throw error;
  }
}
/** Three real engines/drivers/databases; only execution configuration pins differ. */
export async function compareResolvers(
  directory: string,
  content: ContentRelease,
  source: MatchManifest,
  maxCommands: number,
): Promise<void> {
  const root = resolve(directory, "resolver-comparisons", crypto.randomUUID());
  await mkdir(root, { recursive: true });
  const buildHash = await archiveBuild(directory);
  await writeEvidence(resolve(root, "assignment.json"), {
    schema: "commander-resolver-comparison/1",
    source,
    modes,
    maxCommands,
    buildHash,
    counting:
      "One declared seed/seat/deck assignment, executed through three resolver configurations; comparisons are not additional unique games.",
  });
  await writeEvidence(resolve(root, "release.json"), content);
  const executions: Execution[] = [];
  const boundaryHashes: string[] = [];
  const observationHashes: string[] = [];
  try {
    const artifact = await createPreparedMatchArtifact(
      content,
      source.seats.map((seat) => seat.deck),
    );
    await writeEvidence(resolve(root, "prepared-artifact.json"), artifact);
    for (const mode of modes)
      executions.push(await createExecution(root, mode, source, content, artifact));
    const reference = executions[0];
    if (!reference) throw new Error("Missing reference engine");
    for (let index = 0; index <= maxCommands; index++) {
      const states = executions.map((execution) => execution.coordinator.current());
      const first = states[0];
      if (!first) throw new Error("Missing reference state");
      const hashes = await Promise.all(
        states.map((state) => semanticHash(semanticProjection(state))),
      );
      if (hashes.some((hash) => hash !== hashes[0])) {
        await writeEvidence(resolve(root, "divergence.json"), { index, states });
        throw new Error(`Resolver state divergence at boundary ${index}`);
      }
      boundaryHashes.push(hashes[0] ?? "");
      if (first.outcome.kind !== "ongoing") break;
      if (index === maxCommands)
        throw new Error("Comparison command budget exhausted with an ongoing game");
      const actor = reference.coordinator.pendingActor;
      if (!actor) throw new Error("Ongoing reference engine has no decision");
      const observations = executions.map((execution) => execution.coordinator.view(actor));
      observationHashes.push(await verifyObservations(observations, index));
      const responses = await Promise.all(
        observations.map((observation) => heuristicDriver(observation, source.driverSeed)),
      );
      if (responses.some((response) => canonicalJson(response) !== canonicalJson(responses[0])))
        throw new Error(`Observation-driven policies diverged at boundary ${index}`);
      for (const [ordinal, execution] of executions.entries()) {
        const observation = observations[ordinal];
        const response = responses[ordinal];
        if (!observation?.decision || !response) throw new Error("Missing owned decision/response");
        const command: GameCommand = {
          schema: CONTRACT_VERSION,
          matchId: source.id,
          commandId: `${source.id}:command:${index + 1}`,
          actor,
          revision: observation.revision,
          decisionId: observation.decision.id,
          response,
        };
        const result = await execution.coordinator.submit(actor, command);
        if (result.status !== "accepted") {
          await writeEvidence(resolve(root, "command-failure.json"), {
            mode: execution.mode,
            index,
            command,
            result,
          });
          throw new Error(`${execution.mode} ${result.status}: ${result.message}`);
        }
      }
      if ((index + 1) % 100 === 0)
        console.log(`Compared ${index + 1} command boundaries across all three resolvers`);
    }
    const final = reference.coordinator.current();
    const replays = [];
    for (const execution of executions) {
      const state = await replayMatch(execution.repo, content, source.id);
      replays.push({
        mode: execution.mode,
        revision: state.revision,
        hash: await semanticHash(state),
        semanticHash: await semanticHash(semanticProjection(state)),
        executionRegistry: execution.coordinator.executionInfo(),
      });
    }
    await writeEvidence(resolve(root, "report.json"), {
      schema: "commander-resolver-comparison-report/1",
      status: "passed",
      buildHash,
      revision: final.revision,
      outcome: final.outcome,
      coverage: final.coverage,
      boundaryHashes,
      observationHashes,
      replays,
      comparisonScope:
        "Full development definition registry versus independently admitted deck dependency subsets with prepared scan and indexed object selectors. Only resolver and preparedArtifactHash execution pins are omitted from state equality. Full-universe semantic support remains outstanding.",
    });
    console.log(
      JSON.stringify(
        {
          status: "passed",
          revision: final.revision,
          outcome: final.outcome,
          boundaries: boundaryHashes.length,
          evidence: root,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await writeEvidence(resolve(root, "failure.json"), {
      status: "failed",
      buildHash,
      boundaries: boundaryHashes.length,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    for (const execution of executions) await execution.coordinator.close();
  }
}
