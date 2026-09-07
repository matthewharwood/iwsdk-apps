import { expect, test } from "bun:test";
import { GameCommand, semanticHash } from "@iwsdk-apps/contracts";
import { observe, transition } from "@iwsdk-apps/engine";
import type { SubmitResult } from "@iwsdk-apps/storage";
import {
  type AttachmentSourceFixture,
  attachmentSourceAnswer as answer,
  attachmentSourceCast as cast,
  attachmentSourceFixture as fixture,
  attachmentSourceObject as object,
  attachmentSourceResolve as resolve,
} from "../../../packages/engine/test-fixtures/attachment-source";
import { runTerminal, TERMINAL_DRIVER_VERSION } from "./terminal";

// Authenticated source cast from explicit selected hands/basic lands; the terminal
// receives only observations. SQLite history and full games are separate evidence.
function boundary(f: AttachmentSourceFixture) {
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

for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`terminal ${mode} actual Shuko equip keeps source in play, pays explicit zero and displays the live link`, async () => {
    const f = await fixture(
      "Tobias Andrion",
      ["Memnite", "Shuko"],
      "Tobias Andrion",
      ["Repulse"],
      mode,
    );
    cast(f, "A", "Memnite");
    resolve(f);
    cast(f, "A", "Shuko");
    resolve(f);
    const source = object(f, "A", "Shuko").id,
      target = object(f, "A", "Memnite").id;
    answer(f, { kind: "activate", source, programIndex: 0 });
    const abilityId = f.state.decision?.activation?.abilityId;
    if (!abilityId) throw Error("No equip ability");
    const host = boundary(f),
      lines: string[] = [];
    const inputs = [
      JSON.stringify({ kind: "activation-target", target }),
      "",
      JSON.stringify({ kind: "pass" }),
      JSON.stringify({ kind: "pass" }),
      "quit",
    ];
    const result = await runTerminal(host.coordinator, 1, {
      readLine: () => inputs.shift() ?? null,
      write: (line) => lines.push(line),
    });
    expect(result).toEqual({ status: "paused", acceptedCommands: 4 });
    expect(host.closed).toBe(true);
    expect(TERMINAL_DRIVER_VERSION).toBe("terminal-observation/10");
    expect(values(lines, "Activated abilities: ")[0]).toMatchObject([
      {
        id: abilityId,
        source,
        target: null,
        programSchema: "commander-equip/1",
        timing: "sorcery",
        targetDomain: "creature-you-control",
        cost: { mana: { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, tapSource: false },
        effects: [{ kind: "attach-source", recipient: "target" }],
      },
    ]);
    expect(values(lines, "Attachments: ").at(-1)).toMatchObject([{ source, target }]);
    expect(object(f, "A", "Shuko").id).toBe(source);
    expect(object(f, "A", "Shuko").zone).toBe("battlefield");
    const visible = observe(f.state, f.registry, "A").objects.find((row) => row.id === target);
    expect(visible?.characteristics.power).toBe(2);
    expect(visible?.characteristics.toughness).toBe(1);
    expect(lines.some((line) => line.startsWith("No heuristic proposal:"))).toBe(false);
    expect("current" in host.coordinator).toBe(false);
  });
  test(`terminal ${mode} actual Diplomatic Immunity targets, pays and displays distinct source and recipient shroud`, async () => {
    const f = await fixture(
      "Tobias Andrion",
      ["Memnite", "Diplomatic Immunity"],
      "Tobias Andrion",
      ["Repulse"],
      mode,
    );
    cast(f, "A", "Memnite");
    resolve(f);
    const target = object(f, "A", "Memnite").id;
    const hidden = Object.values(f.state.objects)
      .filter((row) => row.owner === "B" && ["hand", "library"].includes(row.zone))
      .map((row) => row.id);
    answer(f, { kind: "cast", card: object(f, "A", "Diplomatic Immunity").id });
    const host = boundary(f),
      lines: string[] = [];
    const inputs = [
      JSON.stringify({ kind: "target", target }),
      "",
      JSON.stringify({ kind: "pass" }),
      JSON.stringify({ kind: "pass" }),
      "quit",
    ];
    const result = await runTerminal(host.coordinator, 1, {
      readLine: () => inputs.shift() ?? null,
      write: (line) => lines.push(line),
    });
    expect(result).toEqual({ status: "paused", acceptedCommands: 4 });
    expect(values(lines, "Decision constraints: ")[0]).toMatchObject({
      kind: "target",
      actor: "A",
    });
    const source = object(f, "A", "Diplomatic Immunity").id;
    expect(values(lines, "Attachments: ").at(-1)).toMatchObject([{ source, target }]);
    const visible = observe(f.state, f.registry, "A").objects;
    expect(visible.find((row) => row.id === source)?.characteristics.keywords).toEqual(["shroud"]);
    expect(visible.find((row) => row.id === target)?.characteristics.keywords).toEqual(["shroud"]);
    const firstPrompt = lines.slice(0, lines.indexOf("Enter / JSON Response / quit:")).join("\n");
    expect(hidden.some((id) => firstPrompt.includes(id))).toBe(false);
    expect(lines.some((line) => line.startsWith("No heuristic proposal:"))).toBe(false);
    expect("current" in host.coordinator).toBe(false);
  });
}
