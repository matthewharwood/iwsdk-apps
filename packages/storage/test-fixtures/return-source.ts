import type { GameCommand, Response } from "@iwsdk-apps/contracts";
import {
  returnDeck,
  returnManifest,
  returnSourceCommand,
  returnSourceRelease,
} from "../../engine/test-fixtures/return-source";
import { heuristicDriver } from "../../simulation/src/driver";
import type { Coordinator } from "../src/index";

/** Ordinary legal100-card source decks; no mutation of RulesState or repository checkpoints. */
export async function storageReturnFixture(id: string, seed = 14) {
  const release = await returnSourceRelease();
  const deck = await returnDeck("durable-authentic-return", [
    ["Tobias Andrion", 1],
    ["Repulse", 1],
    ["Island", 49],
    ["Plains", 49],
  ]);
  return { release, manifest: returnManifest(release, deck, id, seed) };
}
export function replacementCommand(coordinator: Coordinator, move: boolean): GameCommand {
  return returnSourceCommand(
    { state: coordinator.current() },
    { kind: "commander-replacement", move },
  );
}
export async function reachCommanderReplacement(coordinator: Coordinator): Promise<void> {
  for (let step = 0; step < 400; step++) {
    const current = coordinator.current();
    if (current.decision?.kind === "commander-replacement") return;
    const actor = coordinator.pendingActor;
    if (!actor) throw new Error("Ordinary return scenario ended before the replacement choice");
    const observation = coordinator.view(actor);
    const decision = observation.decision;
    if (!decision) throw new Error("Return scenario actor lacks its observed decision");
    let response: Response;
    if (decision.kind === "starting-player") response = { kind: "starting-player", player: "A" };
    else if (decision.kind === "attack") response = { kind: "attack", attacks: [] };
    else if (decision.kind === "discard") {
      // Preserve the only return spell while drawing enough lands to cast a real commander.
      const choices = [...decision.cards].sort((a, b) => {
        const aRepulse = observation.objects.find((row) => row.id === a)?.card?.name === "Repulse";
        const bRepulse = observation.objects.find((row) => row.id === b)?.card?.name === "Repulse";
        return Number(aRepulse) - Number(bRepulse);
      });
      response = { kind: "discard", cards: choices.slice(0, decision.count) };
    } else response = await heuristicDriver(observation, 1);
    const input = returnSourceCommand({ state: current }, response);
    const result = await coordinator.submit(actor, input);
    if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  }
  throw new Error("Ordinary commander return setup exceeded400commands");
}
