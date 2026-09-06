import { type ExecutionRegistry, MatchManifest, RulesState } from "@iwsdk-apps/contracts";
import { move } from "../../engine/src/common";
import type * as Engine from "../../engine/src/index";
import { enterBattlefield } from "../../engine/src/triggers";
import { givePriority } from "../../engine/src/turns";
import { triggerCommand } from "./triggers";

export const SCENARIO_ADAPTER = "constructed-multi-trigger-storage/1";
/** Test-only deterministic initialization. No admitted card currently produces a multi-entry
 * event. This constructs that event once at revision zero; every subsequent command,
 * invariant, SQLite transaction, receipt and replay uses the real unmodified engine.
 * Kept out of all production package exports and activated only in an isolated child. */
export function constructedTriggerStart(
  input: unknown,
  registry: ExecutionRegistry,
  engine: Pick<typeof Engine, "createMatch" | "transition" | "assertInvariants">,
): RulesState {
  const manifest = MatchManifest.parse(input);
  if (manifest.driverVersion !== SCENARIO_ADAPTER)
    throw new Error("Scenario adapter identity missing");
  let state = engine.createMatch(manifest, registry);
  for (let i = 0; i < 20 && state.step !== "main1"; i++) {
    const next = engine.transition(state, triggerCommand(state), registry);
    if (next.status !== "accepted") throw new Error(JSON.stringify(next));
    state = next.state;
  }
  if (state.step !== "main1") throw new Error("Constructed setup did not reach main phase");
  const commander = Object.values(state.objects).find(
    (entry) => entry.owner === "A" && entry.commander,
  );
  const draw = Object.values(state.objects).find(
    (entry) => entry.owner === "A" && entry.definition === "synthetic-entry-draw",
  );
  if (!commander || !draw) throw new Error("Constructed scenario lacks its two sources");
  state.revision = 0;
  state.decision = null;
  state.priorityPlayer = null;
  const entered = enterBattlefield(
    state,
    registry,
    [
      { objectId: commander.id, controller: "A" },
      { objectId: draw.id, controller: "A" },
    ],
    SCENARIO_ADAPTER,
  );
  const departed = entered[1];
  if (!departed) throw new Error("Constructed entry source missing");
  // The captured noncommander source changes incarnation before placement; its ability
  // must survive without consulting a later object sharing that physical lineage.
  move(state, departed, "graveyard", SCENARIO_ADAPTER);
  givePriority(state, registry, "A");
  const finished = RulesState.parse(state);
  if (finished.decision?.kind !== "trigger-order")
    throw new Error("Scenario lacks ordering choice");
  engine.assertInvariants(finished, registry);
  return finished;
}
