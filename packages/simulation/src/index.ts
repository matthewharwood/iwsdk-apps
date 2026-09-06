import {
  CONTRACT_VERSION,
  type GameCommand,
  type RulesState,
  type RunStatus,
  semanticHash,
} from "@iwsdk-apps/contracts";
import type { Coordinator } from "@iwsdk-apps/storage";
import { type Driver, heuristicDriver } from "./driver";

export {
  DRIVER_VERSION,
  type Driver,
  findPayment,
  heuristicDriver,
  scriptedDriver,
} from "./driver";

export type GameRun = {
  matchId: string;
  status: RunStatus;
  commands: number;
  revision: number;
  turn: number;
  outcome: RulesState["outcome"];
  stateHash: string;
  coverage: Record<string, number>;
  failure: { code: string; message: string; command: GameCommand | null } | null;
};
export async function runGame(
  coordinator: Coordinator,
  options: {
    seed: number;
    maxCommands: number;
    driver?: Driver;
    stopAt?: (observation: ReturnType<Coordinator["view"]>) => boolean;
    onProgress?: (revision: number) => void;
  },
): Promise<GameRun> {
  const driver = options.driver ?? heuristicDriver;
  let commands = 0;
  let status: RunStatus = "budget-exhausted";
  let failure: GameRun["failure"] = null;
  for (; commands < options.maxCommands; commands++) {
    const actor = coordinator.pendingActor;
    if (!actor) {
      status = "completed";
      break;
    }
    const observation = coordinator.view(actor);
    if (options.stopAt?.(observation)) {
      status = "paused";
      break;
    }
    const decision = observation.decision;
    if (!decision)
      throw new Error("Coordinator did not provide its pending actor an owned decision");
    let command: GameCommand;
    try {
      command = {
        schema: CONTRACT_VERSION,
        matchId: observation.matchId,
        commandId: `${observation.matchId}:command:${observation.revision + 1}`,
        actor,
        revision: observation.revision,
        decisionId: decision.id,
        response: await driver(observation, options.seed),
      };
    } catch (error) {
      status = "driver-failed";
      failure = {
        code: "DriverException",
        message: error instanceof Error ? error.message : String(error),
        command: null,
      };
      break;
    }
    const result = await coordinator.submit(actor, command);
    if (result.status !== "accepted") {
      status =
        result.status === "unsupported"
          ? "unsupported"
          : result.status === "rejected"
            ? "driver-failed"
            : "engine-failed";
      failure = { code: result.code, message: result.message, command };
      break;
    }
    if (result.receipt.revision % 100 === 0) options.onProgress?.(result.receipt.revision);
  }
  const state = coordinator.current();
  if (state.outcome.kind !== "ongoing") status = "completed";
  else if (status === "completed") {
    status = "engine-failed";
    failure = { code: "MissingDecision", message: "Ongoing state has no decision", command: null };
  }
  return {
    matchId: state.manifest.id,
    status,
    commands,
    revision: state.revision,
    turn: state.turn,
    outcome: state.outcome,
    stateHash: await semanticHash(state),
    coverage: state.coverage,
    failure,
  };
}
