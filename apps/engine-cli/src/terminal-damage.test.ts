import { expect, test } from "bun:test";
import { GameCommand, Response, semanticHash } from "@iwsdk-apps/contracts";
import { observe, transition } from "@iwsdk-apps/engine";
import type { SubmitResult } from "@iwsdk-apps/storage";
import {
  damageSourceCast as cast,
  type DamageSourceFixture,
  damageSourceFixture as fixture,
  damageSourceMain as main,
  damageSourceObject as object,
  damageSourceResolve as resolve,
} from "../../../packages/engine/test-fixtures/damage-source";
import { runTerminal, TERMINAL_DRIVER_VERSION } from "./terminal";

// Actual source programs with selected hands/basic lands; an in-memory terminal boundary,
// not a durable or completed game. Native and OPFS histories are separate qualifications.
async function pending() {
  const f = await fixture(
    "Lady Orca",
    ["Furnace of Rath", "Sorin's Thirst"],
    "Jasmine Boreal",
    ["Benevolent Unicorn", "Ancient Brontodon"],
    "prepared-indexed",
  );
  cast(f, "A", "Furnace of Rath");
  resolve(f);
  main(f, "B");
  cast(f, "B", "Benevolent Unicorn");
  resolve(f);
  cast(f, "B", "Ancient Brontodon");
  resolve(f);
  main(f, "A");
  cast(f, "A", "Sorin's Thirst", object(f, "B", "Ancient Brontodon").id);
  resolve(f);
  const view = observe(f.state, f.registry, "B");
  expect(view.decision?.kind).toBe("damage-replacement");
  const choice = view.decision?.damageReplacement,
    occurrence = choice?.occurrences[0];
  const subtract = occurrence?.effects.find(
    (row) => row.program.kind === "replacement" && row.program.operation.kind === "subtract",
  );
  if (!choice || !occurrence || !subtract) throw new Error("Missing actual damage ordering choice");
  return { f, choice, occurrence, subtract };
}
function boundary(f: DamageSourceFixture) {
  let closed = false;
  return {
    get closed() {
      return closed;
    },
    coordinator: {
      get pendingActor() {
        return f.state.decision?.actor ?? null;
      },
      view: (actor: string) => observe(f.state, f.registry, actor),
      async submit(actor: string, input: unknown): Promise<SubmitResult> {
        const command = GameCommand.parse(input);
        expect(command.actor).toBe(actor);
        const result = transition(f.state, command, f.registry);
        if (result.status !== "accepted") return result;
        f.state = result.state;
        return {
          status: "accepted",
          receipt: {
            schema: "commander-receipt/1",
            matchId: command.matchId,
            commandId: command.commandId,
            actor,
            revision: f.state.revision,
            stateHash: await semanticHash(f.state),
            eventHash: await semanticHash(f.state.events),
          },
        };
      },
      async close() {
        closed = true;
      },
    },
  };
}

function outputValues(lines: string[], prefix: string): unknown[] {
  return lines
    .filter((line) => line.startsWith(prefix))
    .map((line) => JSON.parse(line.slice(prefix.length)));
}

for (const override of [false, true])
  test(`terminal displays actual damage occurrence; ${override ? "JSON selects subtraction first" : "Enter accepts owned proposals"}`, async () => {
    const { f, choice, occurrence, subtract } = await pending();
    const before = f.state.revision,
      host = boundary(f),
      lines: string[] = [];
    const explicit = {
      kind: "damage-replacement",
      eventId: choice.eventId,
      eventVersion: choice.version,
      occurrenceId: occurrence.id,
      effectId: subtract.id,
    };
    const inputs = [override ? JSON.stringify(explicit) : "", "", "quit"];
    const result = await runTerminal(host.coordinator, 1, {
      readLine: () => inputs.shift() ?? null,
      write: (line) => lines.push(line),
    });
    expect(TERMINAL_DRIVER_VERSION).toBe("terminal-observation/8");
    expect(result).toEqual({ status: "paused", acceptedCommands: 2 });
    expect(host.closed).toBe(true);
    expect(f.state.revision).toBe(before + 2);
    const decisions = outputValues(lines, "Decision constraints: ");
    expect(decisions[0]).toMatchObject({
      kind: "damage-replacement",
      actor: "B",
      damageReplacement: choice,
    });
    expect(decisions[1]).toMatchObject({
      kind: "damage-replacement",
      actor: "B",
      damageReplacement: { eventId: choice.eventId, version: 1 },
    });
    const first = override
      ? Response.parse(explicit)
      : Response.parse(outputValues(lines, "Proposal: ")[0]);
    if (first.kind !== "damage-replacement")
      throw new Error("Expected actual replacement proposal");
    expect(object(f, "B", "Ancient Brontodon").damage).toBe(first.effectId === subtract.id ? 2 : 3);
    expect(f.state.players.find((p) => p.id === "A")?.life).toBe(42);
    expect(object(f, "A", "Sorin's Thirst").zone).toBe("graveyard");
    expect(f.state.frames).toEqual([]);
    expect(f.state.events.filter((event) => event.type === "DamageBatchCommitted")).toHaveLength(1);
    expect(lines.some((line) => line.startsWith("No heuristic proposal:"))).toBe(false);
    expect("current" in host.coordinator).toBe(false);
  });
