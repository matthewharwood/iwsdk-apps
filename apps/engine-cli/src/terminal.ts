import { createInterface } from "node:readline";
import {
  CONTRACT_VERSION,
  type PlayerObservation,
  Response,
  selfEntryEffects,
} from "@iwsdk-apps/contracts";
import { heuristicDriver } from "@iwsdk-apps/simulation";
import type { Coordinator } from "@iwsdk-apps/storage";

export const TERMINAL_DRIVER_VERSION = "terminal-observation/10";
export type TerminalRun = { status: "completed" | "paused"; acceptedCommands: number };
export type TerminalIO = {
  readLine?: () => string | null | Promise<string | null>;
  write?: (line: string) => void;
};
// A terminal host can discover the acting seat and close its session, but has
// no capability to inspect privileged state through this interface.
type TerminalCoordinator = Pick<Coordinator, "pendingActor" | "view" | "submit" | "close">;

function nativeInput() {
  const reader = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  });
  const lines = reader[Symbol.asyncIterator]();
  const interrupt = () => reader.close();
  reader.on("SIGINT", interrupt);
  return {
    async readLine(): Promise<string | null> {
      const next = await lines.next();
      return next.done ? null : next.value;
    },
    close() {
      reader.off("SIGINT", interrupt);
      reader.close();
    },
  };
}

function present(observation: PlayerObservation, write: (line: string) => void): void {
  // JSON escaping also keeps card names, IDs and source text from injecting
  // terminal control sequences. Only the coordinator's entitled view is used.
  write(
    JSON.stringify({
      match: observation.matchId,
      actingSeat: observation.player,
      revision: observation.revision,
      turn: observation.turn,
      step: observation.step,
      startingPlayerChooser: observation.startingPlayerChooser,
      startingPlayer: observation.startingPlayer,
      activePlayer: observation.activePlayer,
      players: observation.players,
      combat: observation.combat,
      stack: observation.stack,
    }),
  );
  write(
    `Visible objects: ${JSON.stringify(
      observation.objects.map((object) => {
        const base = object.card ?? object.tokenTemplate?.characteristics;
        if (!base) throw new Error(`Visible object has no characteristics: ${object.id}`);
        return {
          id: object.id,
          name: base.name,
          token: object.tokenTemplate !== null,
          owner: object.owner,
          controller: object.controller,
          zone: object.zone,
          tapped: object.tapped,
          damage: object.damage,
          counters: object.counters,
          manaCost: object.card?.manaCost ?? null,
          type: object.card?.typeLine ?? `${base.types.join(" ")} — ${base.subtypes.join(" ")}`,
          power: object.characteristics.power,
          toughness: object.characteristics.toughness,
          keywords: object.characteristics.keywords,
          oracleText: object.card?.oracleText ?? null,
        };
      }),
    )}`,
  );
  write(`Attachments: ${JSON.stringify(observation.attachments ?? [])}`);
  write(`Decision constraints: ${JSON.stringify(observation.decision)}`);
  write(
    `Activated abilities: ${JSON.stringify(
      (observation.activatedAbilities ?? []).map((ability) => ({
        id: ability.id,
        source: ability.source.id,
        name: ability.sourceCard.name,
        controller: ability.controller,
        target: ability.target,
        programSchema: ability.program.schema,
        timing: ability.program.timing,
        targetDomain: ability.program.target,
        cost: ability.program.cost,
        effects: ability.program.effects,
        payment: ability.payment,
      })),
    )}`,
  );
  write(
    `Triggered abilities: ${JSON.stringify(
      observation.abilities.map((ability) => {
        const common = {
          id: ability.id,
          source: ability.source.id,
          name: ability.sourceCard.name,
          controller: ability.controller,
        };
        if (!("referencedTrigger" in ability))
          return { ...common, effects: selfEntryEffects(ability.program) };
        const referenced = ability.referencedTrigger.captured;
        const decision = observation.decision;
        return {
          ...common,
          effects: [ability.program.effect],
          referencedTrigger: {
            id: referenced.id,
            source: referenced.source.id,
            definition: referenced.source.definition,
            controller: referenced.controller,
            program: referenced.program.id,
          },
          pendingPayment:
            decision?.kind === "trigger-payment" && decision.triggers.includes(ability.id)
              ? { actor: decision.actor, cost: decision.cost }
              : null,
        };
      }),
    )}`,
  );
}

async function proposal(
  observation: PlayerObservation,
  seed: number,
  write: (line: string) => void,
) {
  try {
    const response = Response.parse(await heuristicDriver(observation, seed));
    write(`Proposal: ${JSON.stringify(response)}`);
    return response;
  } catch (error) {
    write(
      `No heuristic proposal: ${JSON.stringify(error instanceof Error ? error.message : String(error))}`,
    );
    return null;
  }
}

function parseResponse(line: string, suggested: Response | null): Response | null {
  if (!line) return suggested;
  try {
    const parsed = Response.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Takes ownership of the coordinator lifetime, including EOF, quit and errors. */
export async function runTerminal(
  coordinator: TerminalCoordinator,
  seed: number,
  io: TerminalIO = {},
): Promise<TerminalRun> {
  let native: ReturnType<typeof nativeInput> | undefined;
  let acceptedCommands = 0;
  let lastActor: string | null = null;
  const write = io.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  try {
    if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff)
      throw new Error("Terminal driver seed must be an integer from 1 through 4294967295.");
    native = io.readLine ? undefined : nativeInput();
    const readLine = io.readLine ?? native?.readLine;
    if (!readLine) throw new Error("Terminal input is unavailable.");
    write(
      "Each prompt uses the acting player's view. Enter accepts the proposal; JSON overrides it; quit pauses.",
    );
    for (;;) {
      const actor = coordinator.pendingActor;
      if (!actor) {
        if (lastActor) write(`Outcome: ${JSON.stringify(coordinator.view(lastActor).outcome)}`);
        write("Game completed; no pending decision.");
        return { status: "completed", acceptedCommands };
      }
      lastActor = actor;
      const observation = coordinator.view(actor);
      const decision = observation.decision;
      if (!decision || decision.actor !== actor)
        throw new Error("The acting player has no owned decision.");
      present(observation, write);
      const suggested = await proposal(observation, seed, write);
      write("Enter / JSON Response / quit:");
      const input = await readLine();
      if (input === null || input.trim().toLowerCase() === "quit") {
        write("Paused. The pending decision remains saved.");
        return { status: "paused", acceptedCommands };
      }
      const response = parseResponse(input.trim(), suggested);
      if (!response) {
        write("Input rejected. Use a valid JSON Response, or Enter when a proposal is available.");
        continue;
      }
      const result = await coordinator.submit(actor, {
        schema: CONTRACT_VERSION,
        matchId: observation.matchId,
        commandId: `${observation.matchId}:terminal:${observation.revision + 1}`,
        actor,
        revision: observation.revision,
        decisionId: decision.id,
        response,
      });
      if (result.status === "rejected") {
        write(
          `Command rejected: ${JSON.stringify({ code: result.code, message: result.message })}`,
        );
        continue;
      }
      if (result.status !== "accepted")
        throw new Error(`Terminal stopped: ${JSON.stringify(result)}`);
      acceptedCommands++;
      write(`Accepted revision ${result.receipt.revision}.`);
    }
  } finally {
    native?.close();
    await coordinator.close();
  }
}
