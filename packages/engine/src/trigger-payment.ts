import {
  canonicalJson,
  type EntryCausedTriggerAbility,
  type ExecutionRegistry,
  GameEvent,
  ResolvingTriggerPaymentFrame,
  type Response,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { emit, hit, player, RulesError, request, requireRule } from "./common";
import { activateMana, commitManaPayment, manaSources, planManaPayment } from "./mana";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RulesError("Invariant", message);
}
function referencedOnStack(state: RulesState, id: string) {
  return state.stack.some((entry) => entry.kind === "triggered-ability" && entry.triggerId === id)
    ? state.abilities[id]
    : undefined;
}
function finish(
  state: RulesState,
  ability: EntryCausedTriggerAbility,
  paid: boolean,
  payer: string,
): void {
  const referencedId = ability.referencedTrigger.captured.id;
  const reference = referencedOnStack(state, referencedId);
  if (!paid && reference) {
    state.stack = state.stack.filter(
      (entry) => entry.kind !== "triggered-ability" || entry.triggerId !== referencedId,
    );
    delete state.abilities[referencedId];
    emit(state, "TriggeredAbilityCountered", {
      trigger: referencedId,
      source: reference.source.id,
      controller: reference.controller,
      by: ability.id,
      bySource: ability.source.id,
    });
    hit(state, "rule:701.6a");
  }
  emit(state, "TriggerPaymentCompleted", {
    trigger: ability.id,
    referencedTrigger: referencedId,
    payer,
    paid,
    referencedPresent: !!reference,
    payerDeparted: player(state, payer).lost,
  });
  const top = state.stack.pop();
  invariant(
    top?.kind === "triggered-ability" && top.triggerId === ability.id,
    "Resolving meta ability left the top of the stack",
  );
  delete state.abilities[ability.id];
  emit(state, "TriggeredAbilityResolved", {
    trigger: ability.id,
    source: ability.source.id,
    controller: ability.controller,
    definition: ability.source.definition,
    ability: ability.program.id,
  });
  hit(state, "rule:118.12a");
  hit(state, "rule:608.2n");
  hit(state, `card:${ability.source.definition}:trigger:${ability.program.id}:resolve`);
}
function requestPayment(state: RulesState, registry: ExecutionRegistry): void {
  const frame = state.frames.at(-1);
  invariant(frame?.kind === "resolving-trigger-payment", "No resolving trigger payment");
  request(state, "trigger-payment", frame.payer, {
    cost: frame.cost,
    triggers: [frame.resolvingTrigger.id],
    manaSources: manaSources(state, registry, frame.payer),
    context:
      "You may pay {2}. Otherwise the referenced triggered ability is countered. Mana abilities are available during this choice.",
  });
}
/** Return false only while a living payer has an exclusive resolving ability decision. */
export function beginTriggerPayment(
  state: RulesState,
  registry: ExecutionRegistry,
  ability: EntryCausedTriggerAbility,
): boolean {
  invariant(state.frames.length === 0, "Resolving trigger overlaps another workflow");
  const reference = referencedOnStack(state, ability.referencedTrigger.captured.id);
  const payer = (reference ?? ability.referencedTrigger.captured).controller;
  if (player(state, payer).lost) {
    hit(state, "rule:800.4f");
    finish(state, ability, false, payer);
    return true;
  }
  state.priorityPlayer = null;
  state.consecutivePasses = 0;
  const frame = ResolvingTriggerPaymentFrame.parse({
    kind: "resolving-trigger-payment",
    resolvingTrigger: structuredClone(ability),
    payer,
    payerBasis: reference ? "current-referenced-ability" : "last-known-referenced-ability",
    cost: structuredClone(ability.program.effect.cost),
    continuation: "complete-proctor-resolution",
  });
  state.frames.push(frame);
  emit(
    state,
    "TriggerPaymentRequested",
    GameEvent.shape.data.parse({
      trigger: ability.id,
      referencedTrigger: ability.referencedTrigger.captured.id,
      payer,
      payerBasis: frame.payerBasis,
      cost: frame.cost,
    }),
  );
  requestPayment(state, registry);
  hit(state, "rule:608.2g");
  hit(state, "rule:608.2h");
  return false;
}
export function answerTriggerPayment(
  state: RulesState,
  registry: ExecutionRegistry,
  actor: string,
  response: Response,
): boolean {
  const frame = state.frames.at(-1);
  requireRule(
    frame?.kind === "resolving-trigger-payment" && frame.payer === actor,
    "No owned resolving trigger payment",
  );
  if (response.kind === "mana") {
    activateMana(state, registry, actor, response);
    requestPayment(state, registry);
    hit(state, "rule:117.1d");
    return false;
  }
  requireRule(
    response.kind === "trigger-payment",
    "Expected optional trigger payment or a mana ability",
  );
  if (response.pay) {
    const payment = planManaPayment(
      state,
      registry,
      actor,
      frame.cost,
      response.sources,
      response.spend,
    );
    commitManaPayment(state, actor, payment);
    hit(state, "rule:118.3a");
    hit(state, "rule:118.10");
  }
  state.frames.pop();
  finish(state, frame.resolvingTrigger, response.pay, actor);
  return true;
}
/** Pre-dispatch verification matters: completion otherwise removes the serialized evidence. */
export function assertTriggerPayment(state: RulesState, registry: ExecutionRegistry): void {
  const frames = state.frames.filter((frame) => frame.kind === "resolving-trigger-payment");
  if (!frames.length) {
    invariant(state.decision?.kind !== "trigger-payment", "Trigger payment lost its frame");
    return;
  }
  invariant(
    frames.length === 1 && state.frames.length === 1,
    "Trigger payment overlaps a workflow",
  );
  const parsed = ResolvingTriggerPaymentFrame.safeParse(frames[0]);
  invariant(parsed.success, "Invalid resolving trigger payment frame");
  const frame = parsed.data,
    top = state.stack.at(-1),
    ability = frame.resolvingTrigger;
  invariant(
    top?.kind === "triggered-ability" &&
      top.triggerId === ability.id &&
      canonicalJson(state.abilities[ability.id] ?? null) === canonicalJson(ability),
    "Payment resolving context changed",
  );
  const reference = referencedOnStack(state, ability.referencedTrigger.captured.id);
  invariant(
    frame.payer === (reference ?? ability.referencedTrigger.captured).controller &&
      frame.payerBasis ===
        (reference ? "current-referenced-ability" : "last-known-referenced-ability") &&
      canonicalJson(frame.cost) === canonicalJson(ability.program.effect.cost),
    "Payment payer or referenced cost changed",
  );
  invariant(
    !player(state, frame.payer).lost &&
      state.priorityPlayer === null &&
      state.outcome.kind === "ongoing" &&
      state.decision?.kind === "trigger-payment" &&
      state.decision.actor === frame.payer &&
      canonicalJson(state.decision.cost) === canonicalJson(frame.cost) &&
      canonicalJson(state.decision.triggers) === canonicalJson([ability.id]) &&
      canonicalJson(state.decision.manaSources) ===
        canonicalJson(manaSources(state, registry, frame.payer)),
    "Payment lacks its exclusive living owner domain",
  );
}
