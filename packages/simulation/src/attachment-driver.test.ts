import { expect, test } from "bun:test";
import { canonicalJson } from "@iwsdk-apps/contracts";
import { observe } from "../../engine/src/index";
import { givePriority } from "../../engine/src/turns";
import {
  attachmentFixture,
  auraProgram,
  equipProgram,
} from "../../engine/test-fixtures/attachments";
import { answer, locate, resolveOne } from "../../engine/test-fixtures/counterspells";
import { enter, replaceDefinition } from "../../engine/test-fixtures/static-bonus";
import { priorityActivation } from "./activation-driver";
import { findPayment, heuristicDriver } from "./driver";

const modes = ["full-scan", "prepared-scan", "prepared-indexed"] as const;
function owned(f: ReturnType<typeof attachmentFixture>) {
  const actor = f.state.decision?.actor;
  if (!actor) throw new Error("No decision owner");
  const view = observe(f.state, f.registry, actor);
  if (!view.decision) throw new Error("No owned projection");
  return { view, decision: view.decision };
}
// Constructed source/board consumer tests; actual source qualification is separate.
for (const mode of modes) {
  test(`${mode}: equip policy uses public source program and owned targets/payments without a free repeat loop`, async () => {
    const f = attachmentFixture(mode);
    replaceDefinition(f, "artifact-creature", { attachmentProgram: equipProgram(0) });
    const source = enter(f, "artifact-creature"),
      target = enter(f, "creature"),
      other = enter(f, "creature", "B");
    givePriority(f.state, f.registry, "A");
    const { view, decision } = owned(f),
      before = canonicalJson(view);
    expect(priorityActivation(view, decision, findPayment)).toEqual({
      kind: "activate",
      source,
      programIndex: 0,
    });
    expect(canonicalJson(view)).toBe(before);
    answer(f, { kind: "activate", source, programIndex: 0 });
    const targetResponse = await heuristicDriver(owned(f).view, 1);
    expect(targetResponse).toEqual({ kind: "activation-target", target });
    expect(targetResponse).not.toEqual({ kind: "activation-target", target: other });
    answer(f, targetResponse);
    answer(f, await heuristicDriver(owned(f).view, 1));
    resolveOne(f);
    const after = owned(f);
    expect(priorityActivation(after.view, after.decision, findPayment)).toBeNull();
    expect(after.decision.activations?.some((row) => row.source === source)).toBe(true);
    expect(
      after.view.objects.some(
        (row) => row.zone === "library" || (row.zone === "hand" && row.owner !== "A"),
      ),
    ).toBe(false);
    expect("frames" in after.view).toBe(false);
  });
  test(`${mode}: Aura target policy reads full attached modifier and chooses appropriate owned/opposing legal creature`, async () => {
    for (const harmful of [false, true]) {
      const f = attachmentFixture(mode);
      replaceDefinition(f, "enchantment-creature", {
        attachmentProgram: auraProgram(harmful ? -3 : 1, harmful ? -3 : 2),
      });
      const own = enter(f, "creature"),
        other = enter(f, "creature", "B");
      givePriority(f.state, f.registry, "A");
      answer(f, { kind: "cast", card: locate(f, "A", "enchantment-creature").id });
      const response = await heuristicDriver(owned(f).view, 1);
      expect(response).toEqual({ kind: "target", target: harmful ? other : own });
      answer(f, response);
      const pay = await heuristicDriver(owned(f).view, 1);
      expect(pay.kind).toBe("payment");
      answer(f, pay);
      resolveOne(f);
    }
  });
}
