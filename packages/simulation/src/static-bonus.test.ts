import { expect, test } from "bun:test";
import { CONTRACT_VERSION } from "@iwsdk-apps/contracts";
import { move } from "../../engine/src/common";
import { observe, transition } from "../../engine/src/index";
import { givePriority } from "../../engine/src/turns";
import { locate } from "../../engine/test-fixtures/counterspells";
import { enter, staticFixture } from "../../engine/test-fixtures/static-bonus";
import { heuristicDriver } from "./driver";

// Driver projections only: constructed fixtures are not full-game/source-card evidence.
test("existing observed driver casts an affordable static enchantment through its public cost domain", async () => {
  const f = staticFixture();
  for (const entry of Object.values(f.state.objects)) {
    if (
      entry.owner === "A" &&
      ["hand", "command"].includes(entry.zone) &&
      entry.definition !== "enchantment-creature"
    )
      move(f.state, entry.id, "library", "constructed driver hand isolation");
  }
  givePriority(f.state, f.registry, "A");
  const shown = observe(f.state, f.registry, "A");
  const choice = await heuristicDriver(shown, 1);
  expect(choice).toEqual({ kind: "cast", card: locate(f, "A", "enchantment-creature").id });
  const decision = shown.decision;
  if (!decision) throw new Error("Missing priority choice");
  const result = transition(
    f.state,
    {
      schema: CONTRACT_VERSION,
      matchId: shown.matchId,
      commandId: "driver-static",
      actor: "A",
      revision: shown.revision,
      decisionId: decision.id,
      response: choice,
    },
    f.registry,
  );
  expect(result.status).toBe("accepted");
});
test("the observed driver assigns a buffed Soldier's actual combat power instead of its base definition", async () => {
  const f = staticFixture();
  enter(f, "enchantment-creature");
  const attacker = enter(f, "creature");
  f.state.combat.attacks = [{ attacker, defender: "B" }];
  f.state.step = "blockers";
  givePriority(f.state, f.registry, "A");
  for (let i = 0; i < 2; i++) {
    const decision = f.state.decision;
    if (!decision) throw new Error("Missing pass choice");
    const result = transition(
      f.state,
      {
        schema: CONTRACT_VERSION,
        matchId: f.state.manifest.id,
        commandId: `advance-${i}`,
        actor: decision.actor,
        revision: f.state.revision,
        decisionId: decision.id,
        response: { kind: "pass" },
      },
      f.registry,
    );
    if (result.status !== "accepted") throw new Error(result.message);
    f.state = result.state;
  }
  const shown = observe(f.state, f.registry, "A");
  expect(shown.objects.find((o) => o.id === attacker)?.card?.power).toBe(1);
  expect(await heuristicDriver(shown, 1)).toEqual({
    kind: "damage",
    allocations: [{ source: attacker, target: "B", amount: 2 }],
  });
});
