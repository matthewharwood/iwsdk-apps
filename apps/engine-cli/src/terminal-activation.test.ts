import { expect, test } from "bun:test";
import { GameCommand, semanticHash } from "@iwsdk-apps/contracts";
import { observe, transition } from "@iwsdk-apps/engine";
import type { SubmitResult } from "@iwsdk-apps/storage";
import {
  type ActivationSourceFixture,
  activationSourceAnswer as answer,
  activationSourceFixture as fixture,
  activationSourceNextTurn as nextTurn,
  activationSourcePermanent as permanent,
} from "../../../packages/engine/test-fixtures/activation-source";
import { runTerminal, TERMINAL_DRIVER_VERSION } from "./terminal";

// Authenticated source cast from explicit selected hands/basic lands; the terminal
// receives only observations. SQLite history and full games are separate evidence.
function boundary(f: ActivationSourceFixture) {
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
function values(lines: string[], prefix: string): unknown[] {
  return lines
    .filter((line) => line.startsWith(prefix))
    .map((line) => JSON.parse(line.slice(prefix.length)));
}
for (const cancel of [false, true]) {
  test(`terminal actual Nantuko target/payment ${cancel ? "cancels cleanly" : "pays and resolves independently"}`, async () => {
    const f = await fixture(
      "Jasmine Boreal",
      ["Nantuko Disciple"],
      "Tobias Andrion",
      ["Repulse"],
      "prepared-indexed",
    );
    const source = permanent(f, "A", "Nantuko Disciple");
    await nextTurn(f, "A");
    answer(f, { kind: "activate", source, programIndex: 0 });
    const id = f.state.decision?.activation?.abilityId;
    if (!id) throw new Error("No actual pending noncard activation");
    const hidden = Object.values(f.state.objects)
      .filter((o) => o.owner === "B" && ["hand", "library"].includes(o.zone))
      .map((o) => o.id);
    const host = boundary(f),
      lines: string[] = [],
      before = f.state.revision;
    const inputs = cancel
      ? ["", JSON.stringify({ kind: "cancel-activation" }), "quit"]
      : ["", "", JSON.stringify({ kind: "pass" }), JSON.stringify({ kind: "pass" }), "quit"];
    const result = await runTerminal(host.coordinator, 1, {
      readLine: () => inputs.shift() ?? null,
      write: (line) => lines.push(line),
    });
    expect(TERMINAL_DRIVER_VERSION).toBe("terminal-observation/10");
    expect(result).toEqual({ status: "paused", acceptedCommands: cancel ? 2 : 4 });
    expect(host.closed).toBe(true);
    expect(f.state.revision).toBe(before + (cancel ? 2 : 4));
    expect(values(lines, "Decision constraints: ")[0]).toMatchObject({
      kind: "activation-target",
      activation: { abilityId: id, source },
    });
    expect(values(lines, "Activated abilities: ")[0]).toMatchObject([
      {
        id,
        source,
        name: "Nantuko Disciple",
        controller: "A",
        target: null,
        programSchema: "commander-activated/1",
        timing: "priority",
        targetDomain: "creature",
        cost: { mana: { G: 1 }, tapSource: true },
        effects: [{ kind: "modify-creature", powerDelta: 2, toughnessDelta: 2 }],
      },
    ]);
    expect(f.state.objects[source]?.tapped).toBe(!cancel);
    expect(Object.keys(f.state.activatedAbilities ?? {})).toEqual([]);
    expect(f.state.continuousEffects).toHaveLength(cancel ? 0 : 1);
    if (!cancel)
      expect(
        f.state.events.some(
          (event) => event.type === "ActivatedAbilityResolved" && event.data.ability === id,
        ),
      ).toBe(true);
    expect(lines.some((line) => line.startsWith("No heuristic proposal:"))).toBe(false);
    // The first prompt belongs to A; B's later entitled prompt may show B's hand.
    const firstPrompt = lines.slice(0, lines.indexOf("Enter / JSON Response / quit:")).join("\n");
    expect(hidden.some((id) => firstPrompt.includes(id))).toBe(false);
    expect("current" in host.coordinator).toBe(false);
  });
}
