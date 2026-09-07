import { expect, test } from "bun:test";
import { GameCommand, semanticHash } from "@iwsdk-apps/contracts";
import { observe, transition } from "@iwsdk-apps/engine";
import type { SubmitResult } from "@iwsdk-apps/storage";
import {
  proctorSourceCast as cast,
  proctorSourceFixture as fixture,
  proctorSourceMain as main,
  type ProctorSourceFixture,
  proctorSourceResolve as resolve,
} from "../../../packages/engine/test-fixtures/proctor-source";
import { runTerminal, TERMINAL_DRIVER_VERSION } from "./terminal";

// Actual authenticated cards and legal 100-card decks. The fixture explicitly
// selects hands and basic lands before ordinary casts. This terminal integration
// test is an in-memory command boundary, not a persisted or completed game.
async function pending() {
  const f = await fixture(
    "Tobias Andrion",
    ["Strict Proctor"],
    "Jasmine Boreal",
    ["Elvish Visionary"],
    "prepared-indexed",
  );
  cast(f, "A", "Strict Proctor");
  resolve(f);
  main(f, "B");
  cast(f, "B", "Elvish Visionary");
  resolve(f);
  resolve(f);
  const view = observe(f.state, f.registry, "B");
  expect(view.decision?.kind).toBe("trigger-payment");
  const meta = view.abilities.find((ability) => "referencedTrigger" in ability);
  if (!meta || !("referencedTrigger" in meta)) throw new Error("Missing actual Proctor trigger");
  return { f, meta, lower: meta.referencedTrigger.captured };
}

function boundary(f: ProctorSourceFixture) {
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

for (const pay of [true, false])
  test(`terminal presents actual Proctor and its ordinary referent; ${pay ? "Enter pays" : "JSON declines"} the owned cost`, async () => {
    const { f, meta, lower } = await pending();
    const before = f.state.revision;
    const hidden = Object.values(f.state.objects)
      .filter((object) => object.owner === "A" && ["hand", "library"].includes(object.zone))
      .map((object) => object.id);
    const host = boundary(f);
    const lines: string[] = [];
    const inputs = [pay ? "" : JSON.stringify({ kind: "trigger-payment", pay: false }), "quit"];
    const result = await runTerminal(host.coordinator, 1, {
      readLine: () => inputs.shift() ?? null,
      write: (line) => lines.push(line),
    });
    expect(TERMINAL_DRIVER_VERSION).toBe("terminal-observation/10");
    expect(result).toEqual({ status: "paused", acceptedCommands: 1 });
    expect(host.closed).toBe(true);
    expect(f.state.revision).toBe(before + 1);
    expect(f.state.decision?.kind).toBe("priority");
    const presentations = outputValues(lines, "Triggered abilities: ");
    expect(presentations).toHaveLength(2);
    const cost = { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    expect(presentations[0]).toEqual(
      expect.arrayContaining([
        {
          id: meta.id,
          source: meta.source.id,
          name: "Strict Proctor",
          controller: "A",
          effects: [
            {
              kind: "counter-referenced-trigger-unless-paid",
              reference: "triggering-ability",
              payer: "referenced-ability-controller",
              cost,
            },
          ],
          referencedTrigger: {
            id: lower.id,
            source: lower.source.id,
            definition: lower.source.definition,
            controller: "B",
            program: lower.program.id,
          },
          pendingPayment: { actor: "B", cost },
        },
        {
          id: lower.id,
          source: lower.source.id,
          name: "Elvish Visionary",
          controller: "B",
          effects: [{ kind: "draw", recipient: "trigger-controller", amount: 1 }],
        },
      ]),
    );
    expect(presentations[1]).toEqual(
      pay
        ? [
            {
              id: lower.id,
              source: lower.source.id,
              name: "Elvish Visionary",
              controller: "B",
              effects: [{ kind: "draw", recipient: "trigger-controller", amount: 1 }],
            },
          ]
        : [],
    );
    expect(
      f.state.events.find((event) => event.type === "TriggerPaymentCompleted")?.data,
    ).toMatchObject({
      trigger: meta.id,
      referencedTrigger: lower.id,
      payer: "B",
      paid: pay,
    });
    expect(
      f.state.events.filter((event) => event.type === "TriggeredAbilityCountered"),
    ).toHaveLength(pay ? 0 : 1);
    if (!pay)
      expect(
        f.state.events.find((event) => event.type === "TriggeredAbilityCountered")?.data,
      ).toMatchObject({ trigger: lower.id, by: meta.id });
    expect(lines.some((line) => line.startsWith("No heuristic proposal:"))).toBe(false);
    for (const id of hidden) expect(lines.join("\n")).not.toContain(JSON.stringify(id));
    expect("current" in host.coordinator).toBe(false);
    if (pay) {
      const handBefore = f.state.players.find((player) => player.id === "B")?.hand.length;
      if (handBefore === undefined) throw new Error("Missing actual lower ability controller");
      resolve(f);
      expect(f.state.players.find((player) => player.id === "B")?.hand.length).toBe(handBefore + 1);
      expect(f.state.abilities[lower.id]).toBeUndefined();
      expect(
        f.state.events.find((event) => event.type === "TriggeredAbilityResolved")?.data,
      ).toMatchObject({ trigger: lower.id, controller: "B" });
    }
  });
