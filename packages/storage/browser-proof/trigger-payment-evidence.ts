import type { PlayerObservation } from "@iwsdk-apps/contracts";
import type { MatchArchive } from "../src/index";

/** Only an owned resolution decision tied to the actual top meta occurrence qualifies. */
export function atTriggerPaymentStage(view: PlayerObservation): boolean {
  const decision = view.decision;
  const top = view.stack.at(-1);
  if (
    decision?.kind !== "trigger-payment" ||
    decision.actor !== view.player ||
    top?.kind !== "triggered-ability"
  )
    return false;
  if (decision.triggers.length !== 1 || decision.triggers[0] !== top.triggerId) return false;
  return view.abilities.some(
    (ability) =>
      ability.id === top.triggerId && ability.program.schema === "commander-entry-caused-trigger/1",
  );
}
/** Privileged audit evidence is separate from the observation supplied to a driver. */
export function triggerPaymentEvidence(archive: Pick<MatchArchive, "records" | "current">) {
  const requested = [];
  const completed = [];
  const countered = [];
  for (const record of archive.records)
    for (const event of record.events) {
      const row = { revision: record.receipt.revision, event };
      if (event.type === "TriggerPaymentRequested") requested.push(row);
      if (event.type === "TriggerPaymentCompleted")
        completed.push({
          ...row,
          response: record.command.response,
          actor: record.command.actor,
          resolved: record.events.filter(
            (candidate) =>
              candidate.type === "TriggeredAbilityResolved" &&
              candidate.data.trigger === event.data.trigger,
          ),
          countered: record.events.filter(
            (candidate) =>
              candidate.type === "TriggeredAbilityCountered" &&
              candidate.data.by === event.data.trigger,
          ),
        });
      if (event.type === "TriggeredAbilityCountered") countered.push(row);
    }
  const frames = archive.current.frames.filter(
    (frame) => frame.kind === "resolving-trigger-payment",
  );
  return {
    requested,
    completed,
    countered,
    frames,
    priorityPlayer: archive.current.priorityPlayer,
    stack: archive.current.stack,
    decision: archive.current.decision,
  };
}
/** Require the same paused occurrence's accepted answer and completed resolution, not disappearance. */
export function completedTriggerPayment(
  pending: ReturnType<typeof triggerPaymentEvidence>,
  final: ReturnType<typeof triggerPaymentEvidence>,
): boolean {
  if (pending.frames.length !== 1) return false;
  const frame = pending.frames[0];
  if (
    !frame ||
    pending.decision?.kind !== "trigger-payment" ||
    pending.decision.actor !== frame.payer ||
    pending.priorityPlayer !== null
  )
    return false;
  const revision = pending.decision.revision;
  const meta = frame.resolvingTrigger;
  const top = pending.stack.at(-1);
  if (
    top?.kind !== "triggered-ability" ||
    top.triggerId !== meta.id ||
    pending.decision.triggers.length !== 1 ||
    pending.decision.triggers[0] !== meta.id
  )
    return false;
  const referenced = meta.referencedTrigger.captured.id;
  if (
    !pending.requested.some(
      (row) =>
        row.event.data.trigger === meta.id &&
        row.event.data.referencedTrigger === referenced &&
        row.event.data.payer === frame.payer,
    )
  )
    return false;
  return final.completed.some((row) => {
    const data = row.event.data;
    if (
      row.revision <= revision ||
      data.trigger !== meta.id ||
      data.referencedTrigger !== referenced ||
      data.payer !== frame.payer ||
      row.actor !== frame.payer ||
      row.response.kind !== "trigger-payment" ||
      row.response.pay !== data.paid ||
      data.payerDeparted !== false ||
      typeof data.referencedPresent !== "boolean" ||
      row.resolved.length !== 1
    )
      return false;
    const resolved = row.resolved[0];
    if (
      !resolved ||
      resolved.data.source !== meta.source.id ||
      resolved.data.controller !== meta.controller ||
      resolved.data.definition !== meta.source.definition ||
      resolved.data.ability !== meta.program.id
    )
      return false;
    if (data.paid === false && data.referencedPresent === true)
      return (
        row.countered.length === 1 &&
        row.countered[0]?.data.trigger === referenced &&
        row.countered[0]?.data.source === meta.referencedTrigger.captured.source.id &&
        row.countered[0]?.data.controller === meta.referencedTrigger.captured.controller &&
        row.countered[0]?.data.bySource === meta.source.id
      );
    return row.countered.length === 0;
  });
}
