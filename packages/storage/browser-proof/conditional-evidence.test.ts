import { expect, test } from "bun:test";
import { canonicalJson } from "@iwsdk-apps/contracts";
import { observe } from "../../engine/src/index";
import {
  conditionalSourceCast,
  conditionalSourceFixture,
  conditionalSourceObject,
  conditionalSourceResolve,
} from "../../engine/test-fixtures/conditional-source";
import { atProofStage } from "./spell-evidence";

async function pending(witness: boolean) {
  // Authenticated source bodies with explicit source-fixture hands/lands; not a complete game.
  const f = await conditionalSourceFixture(
    "Tobias Andrion",
    ["Scholar of Stars", "Memnite"],
    "Tobias Andrion",
    ["Repulse"],
  );
  if (witness) {
    conditionalSourceCast(f, "A", "Memnite");
    conditionalSourceResolve(f);
  }
  conditionalSourceCast(f, "A", "Scholar of Stars");
  conditionalSourceResolve(f);
  return f;
}
test("pending conditional checkpoint needs an actual captured stack ability and the acting priority view", async () => {
  for (const witness of [true, false]) {
    const f = await pending(witness);
    const before = canonicalJson(f.state);
    expect(atProofStage(observe(f.state, f.registry, "A"), "pending-conditional")).toBe(witness);
    expect(atProofStage(observe(f.state, f.registry, "B"), "pending-conditional")).toBe(false);
    expect(canonicalJson(f.state)).toBe(before);
    if (witness) {
      conditionalSourceResolve(f);
      expect(atProofStage(observe(f.state, f.registry, "A"), "pending-conditional")).toBe(false);
    }
  }
});
test("a current false condition remains a pending ability until the actual resolution check", async () => {
  const f = await pending(true);
  conditionalSourceCast(f, "B", "Repulse", conditionalSourceObject(f, "A", "Memnite").id);
  conditionalSourceResolve(f);
  const before = canonicalJson(f.state);
  const actor = f.state.decision?.actor;
  if (!actor) throw new Error("Missing real priority actor");
  expect(atProofStage(observe(f.state, f.registry, actor), "pending-conditional")).toBe(true);
  expect(canonicalJson(f.state)).toBe(before);
  conditionalSourceResolve(f);
  expect(atProofStage(observe(f.state, f.registry, "A"), "pending-conditional")).toBe(false);
  expect(f.state.events.some((event) => event.type === "TriggeredAbilityRemoved")).toBe(true);
});
