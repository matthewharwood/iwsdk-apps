import { expect, test } from "bun:test";
import { emptyMana, type Response, semanticHash } from "@iwsdk-apps/contracts";
import { observe } from "../../engine/src/index";
import {
  proctorSourceAnswer as answer,
  proctorSourceCast as cast,
  proctorSourceCommand as command,
  proctorSourceFixture as fixture,
  proctorSourceMain as main,
  type ProctorSourceFixture,
  proctorSourceResolve as resolve,
} from "../../engine/test-fixtures/proctor-source";
import { heuristicDriver } from "../../simulation/src/driver";
import type { CommandRecord } from "../src/index";
import { atProofStage } from "./spell-evidence";
import { completedTriggerPayment, triggerPaymentEvidence } from "./trigger-payment-evidence";

async function record(f: ProctorSourceFixture, response: Response, records: CommandRecord[]) {
  const envelope = command(f, response);
  answer(f, response);
  records.push({
    command: envelope,
    requestHash: await semanticHash(envelope),
    receipt: {
      schema: "commander-receipt/1",
      matchId: envelope.matchId,
      commandId: envelope.commandId,
      actor: envelope.actor,
      revision: f.state.revision,
      stateHash: await semanticHash(f.state),
      eventHash: await semanticHash(f.state.events),
    },
    events: structuredClone(f.state.events),
  });
}
async function pending(mode: "full-scan" | "prepared-scan" | "prepared-indexed") {
  // Actual authenticated cards, with explicitly selected hand/basic-land preconditions.
  // The local event excerpt tests proof extraction; it is not a complete durable game archive.
  const f = await fixture(
    "Tobias Andrion",
    ["Strict Proctor"],
    "Jasmine Boreal",
    ["Elvish Visionary"],
    mode,
  );
  cast(f, "A", "Strict Proctor");
  resolve(f);
  main(f, "B");
  cast(f, "B", "Elvish Visionary");
  resolve(f);
  const records: CommandRecord[] = [];
  while (f.state.decision?.kind === "priority") await record(f, { kind: "pass" }, records);
  expect(f.state.decision?.kind).toBe("trigger-payment");
  return { f, records };
}
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const)
  test(`${mode}: actual Proctor payment is owned, durable-shape aware and requires the same accepted outcome`, async () => {
    const { f, records } = await pending(mode);
    const view = observe(f.state, f.registry, "B");
    expect(atProofStage(view, "trigger-payment")).toBe(true);
    expect(atProofStage(observe(f.state, f.registry, "A"), "trigger-payment")).toBe(false);
    expect("frames" in view).toBe(false);
    const selected = triggerPaymentEvidence({
      current: structuredClone(f.state),
      records: structuredClone(records),
    });
    expect(selected.frames).toHaveLength(1);
    expect(completedTriggerPayment(selected, selected)).toBe(false);
    const response = await heuristicDriver(view, 1);
    expect(response.kind).toBe("trigger-payment");
    if (response.kind !== "trigger-payment" || !response.pay)
      throw new Error("Expected actual affordable payment");
    expect(Object.values(response.spend).reduce((a, b) => a + b, 0)).toBe(2);
    expect(
      response.sources.every((source) =>
        view.decision?.manaSources.some(
          (legal) => legal.object === source.object && legal.colors.includes(source.color),
        ),
      ),
    ).toBe(true);
    await record(f, response, records);
    const final = triggerPaymentEvidence({ current: f.state, records });
    expect(completedTriggerPayment(selected, final)).toBe(true);
    const withoutResolution = structuredClone(final);
    if (!withoutResolution.completed[0]) throw new Error("Missing actual payment completion");
    withoutResolution.completed[0].resolved = [];
    expect(completedTriggerPayment(selected, withoutResolution)).toBe(false);
    const wrongId = structuredClone(final);
    if (!wrongId.completed[0]) throw new Error("Missing actual payment completion");
    wrongId.completed[0].event.data.trigger = "other-occurrence";
    expect(completedTriggerPayment(selected, wrongId)).toBe(false);
    const unrelated = structuredClone(view);
    unrelated.stack = [];
    expect(atProofStage(unrelated, "trigger-payment")).toBe(false);
    const wrongDecision = structuredClone(view);
    if (!wrongDecision.decision) throw new Error("Missing owned decision");
    wrongDecision.decision.triggers = ["other-occurrence"];
    expect(atProofStage(wrongDecision, "trigger-payment")).toBe(false);
  });
test("decline qualifies only with the actual referenced noncard counter and no invented payment", async () => {
  const { f, records } = await pending("prepared-indexed");
  const selected = triggerPaymentEvidence({
    current: structuredClone(f.state),
    records: structuredClone(records),
  });
  const beforePool = structuredClone(
    f.state.players.find((p) => p.id === "B")?.mana ?? emptyMana(),
  );
  await record(f, { kind: "trigger-payment", pay: false }, records);
  const final = triggerPaymentEvidence({ current: f.state, records });
  expect(completedTriggerPayment(selected, final)).toBe(true);
  expect(f.state.players.find((p) => p.id === "B")?.mana).toEqual(beforePool);
  const missingCounter = structuredClone(final);
  if (!missingCounter.completed[0]) throw new Error("Missing actual payment completion");
  missingCounter.completed[0].countered = [];
  expect(completedTriggerPayment(selected, missingCounter)).toBe(false);
  const wrongPayer = structuredClone(final);
  if (!wrongPayer.completed[0]) throw new Error("Missing actual payment completion");
  wrongPayer.completed[0].actor = "A";
  expect(completedTriggerPayment(selected, wrongPayer)).toBe(false);
  const inventedPay = structuredClone(final);
  if (!inventedPay.completed[0]) throw new Error("Missing actual payment completion");
  inventedPay.completed[0].event.data.paid = true;
  expect(completedTriggerPayment(selected, inventedPay)).toBe(false);
});
