import { expect, test } from "bun:test";
import { canonicalJson, emptyMana, type MatchManifest } from "@iwsdk-apps/contracts";
import { observe } from "../../engine/src/index";
import { givePriority } from "../../engine/src/turns";
import {
  activationSourceAnswer as answer,
  activationSourceFixture as fixture,
  activationSourceNextTurn as nextTurn,
  activationSourcePermanent as permanent,
} from "../../engine/test-fixtures/activation-source";
import { activationChoice, priorityActivation } from "./activation-driver";
import { findPayment, heuristicDriver } from "./driver";

// Authenticated cards with explicitly selected hands/lands. These test entitled
// observation consumers; they are not ordinary dealt or completed games.
const modes: MatchManifest["resolver"][] = ["full-scan", "prepared-scan", "prepared-indexed"];
function owned(f: Awaited<ReturnType<typeof fixture>>) {
  const actor = f.state.decision?.actor;
  if (!actor) throw new Error("Missing owned decision");
  const view = observe(f.state, f.registry, actor);
  if (!view.decision) throw new Error("Missing projected decision");
  return { view, decision: view.decision };
}
for (const mode of modes) {
  test(`${mode}: actual pure tap artifact is paid without invented mana or hidden input`, async () => {
    const f = await fixture("Tobias Andrion", ["Marble Chalice"], "Tobias Andrion", [], mode);
    const source = permanent(f, "A", "Marble Chalice");
    const { view, decision } = owned(f),
      before = canonicalJson(view);
    expect(priorityActivation(view, decision, findPayment)).toEqual({
      kind: "activate",
      source,
      programIndex: 0,
    });
    expect(canonicalJson(view)).toBe(before);
    answer(f, { kind: "activate", source, programIndex: 0 });
    const pending = owned(f);
    const response = await heuristicDriver(pending.view, 7);
    expect(response).toEqual({ kind: "activation-payment", sources: [], spend: emptyMana() });
    answer(f, response);
    expect(f.state.objects[source]?.tapped).toBe(true);
    expect(owned(f).view.activatedAbilities?.[0]?.payment).not.toBeNull();
    expect("frames" in pending.view).toBe(false);
    expect(
      pending.view.objects.some(
        (o) => o.zone === "library" || (o.zone === "hand" && o.owner !== "A"),
      ),
    ).toBe(false);
  });
  test(`${mode}: source target and exact G plus tap payment use only the owned legal domain`, async () => {
    const f = await fixture("Jasmine Boreal", ["Nantuko Disciple"], "Tobias Andrion", [], mode);
    const source = permanent(f, "A", "Nantuko Disciple");
    await nextTurn(f, "A");
    answer(f, { kind: "activate", source, programIndex: 0 });
    const targeting = owned(f),
      response = await heuristicDriver(targeting.view, 9);
    expect(response).toEqual({ kind: "activation-target", target: source });
    answer(f, response);
    const pending = owned(f),
      payment = await heuristicDriver(pending.view, 9);
    if (payment.kind !== "activation-payment") throw new Error("No actual payment proposal");
    expect(payment.spend).toEqual({ ...emptyMana(), G: 1 });
    expect(payment.sources.some((row) => row.object === source)).toBe(false);
    expect(
      payment.sources.every((row) =>
        pending.decision.manaSources.some(
          (legal) => legal.object === row.object && legal.colors.includes(row.color),
        ),
      ),
    ).toBe(true);
    answer(f, payment);
    expect(f.state.objects[source]?.tapped).toBe(true);
    expect(() => heuristicDriver({ ...pending.view, player: "B" }, 9)).toThrow("no owned decision");
  });
  test(`${mode}: insufficient actual payer cancels; another seat's pool cannot fund it`, async () => {
    const f = await fixture("Tobias Andrion", ["Spectral Sailor"], "Tobias Andrion", [], mode);
    const source = permanent(f, "A", "Spectral Sailor");
    for (const object of Object.values(f.state.objects)) {
      if (
        object.controller === "A" &&
        object.zone === "battlefield" &&
        f.registry.definitions[object.definition]?.types.includes("Land")
      )
        object.tapped = true;
    }
    const other = f.state.players.find((p) => p.id === "B");
    if (!other) throw new Error("Missing opposing seat");
    other.mana.U = 40;
    givePriority(f.state, f.registry, "A");
    answer(f, { kind: "activate", source, programIndex: 0 });
    const pending = owned(f);
    expect(activationChoice(pending.view, pending.decision, findPayment)).toEqual({
      kind: "cancel-activation",
    });
  });
  test(`${mode}: repeat avoidance is driver policy while a real zero-cost ability is on stack`, async () => {
    const f = await fixture("Lady Orca", ["Flowstone Hellion"], "Tobias Andrion", [], mode);
    const source = permanent(f, "A", "Flowstone Hellion");
    while (f.state.step !== "begin-combat") answer(f, { kind: "pass" });
    const initial = owned(f);
    expect(priorityActivation(initial.view, initial.decision, findPayment)).toEqual({
      kind: "activate",
      source,
      programIndex: 0,
    });
    answer(f, { kind: "activate", source, programIndex: 0 });
    answer(f, await heuristicDriver(owned(f).view, 1));
    const paid = owned(f);
    expect(priorityActivation(paid.view, paid.decision, findPayment)).toBeNull();
    expect(paid.decision.activations?.some((row) => row.source === source)).toBe(true);
    answer(f, { kind: "activate", source, programIndex: 0 });
    expect(f.state.stack.filter((row) => row.kind === "activated-ability")).toHaveLength(2);
  });
}
