import { createFullExecutionRegistry } from "@iwsdk-apps/compiler/prepared";
import {
  CHANCE_VERSION,
  CONTRACT_VERSION,
  ENGINE_VERSION,
  type GameCommand,
  type MatchManifest,
  type Response,
  type RulesState,
  SERIALIZER_VERSION,
} from "@iwsdk-apps/contracts";
import { createMatch, transition } from "../../engine/src/index";
import { fixtureCard, fixtureDeck, fixtureRelease } from "./authenticated";

export const TRIGGER_CARDS = {
  life: fixtureCard("Centaur Healer").id,
  draw: fixtureCard("Elvish Visionary").id,
  removal: fixtureCard("Murder").id,
  plains: fixtureCard("Plains").id,
  forest: fixtureCard("Forest").id,
};
export async function triggerFixtures(id: string, commanderScenario = false) {
  const release = await fixtureRelease([
    "Jasmine Boreal",
    "Lady Orca",
    "Centaur Healer",
    "Elvish Visionary",
    "Murder",
    "Plains",
    "Forest",
    "Swamp",
    "Isamaru, Hound of Konda",
  ]);
  const aDeck = commanderScenario
    ? await fixtureDeck("authenticated-commander-storage", "Isamaru, Hound of Konda", [
        ["Isamaru, Hound of Konda", 1],
        ["Plains", 99],
      ])
    : await fixtureDeck("authenticated-entry-storage", "Jasmine Boreal", [
        ["Jasmine Boreal", 1],
        ["Centaur Healer", 1],
        ["Elvish Visionary", 1],
        ["Plains", 48],
        ["Forest", 49],
      ]);
  const bDeck = await fixtureDeck("authenticated-removal-storage", "Lady Orca", [
    ["Lady Orca", 1],
    ["Murder", 1],
    ["Swamp", 98],
  ]);
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id,
    releaseHash: release.hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 1,
    driverSeed: 1,
    driverVersion: "authenticated-trigger-storage/1",
    mode: "two-seat",
    resolver: "full-scan",
    seats: [
      { id: "A", deck: aDeck },
      { id: "B", deck: bDeck },
    ],
  };
  return { release, manifest, registry: await createFullExecutionRegistry(release) };
}
export function triggerCommand(state: RulesState, response?: Response): GameCommand {
  const decision = state.decision;
  if (!decision) throw new Error("Scenario has no pending decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: state.manifest.id,
    commandId: `trigger-storage:${state.revision}`,
    actor: decision.actor,
    revision: state.revision,
    decisionId: decision.id,
    response:
      response ??
      (decision.kind === "starting-player"
        ? { kind: "starting-player", player: "A" }
        : decision.kind === "mulligan"
          ? { kind: "mulligan", keep: true }
          : decision.kind === "attack"
            ? { kind: "attack", attacks: [] }
            : decision.kind === "discard"
              ? { kind: "discard", cards: decision.cards.slice(-decision.count) }
              : { kind: "pass" }),
  };
}
export function reachFirstMain(
  manifest: MatchManifest,
  registry: Awaited<ReturnType<typeof createFullExecutionRegistry>>,
) {
  let state = createMatch(manifest, registry);
  for (let i = 0; i < 20 && state.step !== "main1"; i++) {
    const result = transition(state, triggerCommand(state), registry);
    if (result.status !== "accepted") throw new Error(JSON.stringify(result));
    state = result.state;
  }
  if (state.step !== "main1" || state.decision?.actor !== "A")
    throw new Error("First main was not reached");
  return state;
}
