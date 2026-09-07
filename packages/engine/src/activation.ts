import {
  type ActivatedAbility,
  type ActivatedProgram,
  type Decision,
  type ExecutionRegistry,
  emptyMana,
  GameEvent,
  type Response,
  type RulesState,
} from "@iwsdk-apps/contracts";
import type { Selector } from "@iwsdk-apps/rule-selection";
import { card, emit, hit, object, player, RulesError, request, requireRule } from "./common";
import { activateMana, commitManaPayment, manaSources, planManaPayment } from "./mana";
import { activatedProgram } from "./permanent-programs";
import { selectedObjects } from "./selection";
import { legalCreatureTargets } from "./targeting";

const availableActivation: Selector = {
  op: "and",
  terms: [
    { op: "string-eq", field: "zone", value: "battlefield" },
    { op: "string-eq", field: "controller", value: { binding: "actor" } },
    { op: "boolean-eq", field: "hasActivatedProgram", value: true },
    {
      op: "or",
      terms: [
        { op: "boolean-eq", field: "activationTaps", value: false },
        {
          op: "and",
          terms: [
            { op: "boolean-eq", field: "tapped", value: false },
            {
              op: "or",
              terms: [
                { op: "not", term: { op: "set-has", field: "types", value: "Creature" } },
                { op: "set-has", field: "keywords", value: "haste" },
                {
                  op: "integer-compare",
                  field: "controlledSinceTurn",
                  comparison: "lt",
                  value: { binding: "lastTurn" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
export function activationChoices(
  state: RulesState,
  registry: ExecutionRegistry,
  actor: string,
  announcement = true,
): NonNullable<Decision["activations"]> {
  if (
    !Object.values(state.objects).some(
      (entry) => !entry.token && activatedProgram(card(state, registry, entry.id)),
    )
  )
    return [];
  return selectedObjects(state, registry, availableActivation, {
    actor,
    lastTurn: player(state, actor).lastTurnStarted,
  }).flatMap((entry) => {
    const program = activatedProgram(card(state, registry, entry.id));
    if (
      !program ||
      (announcement &&
        program.timing === "sorcery" &&
        (state.activePlayer !== actor ||
          !["main1", "main2"].includes(state.step) ||
          state.stack.length !== 0)) ||
      (program.target && activationTargets(state, registry, actor, program).length === 0)
    )
      return [];
    return [
      {
        source: entry.id,
        programIndex: 0 as const,
        cost: structuredClone(program.cost),
        target: program.target,
      },
    ];
  });
}
export function activationDetails(ability: ActivatedAbility): NonNullable<Decision["activation"]> {
  return {
    abilityId: ability.id,
    source: ability.source.id,
    programIndex: 0,
    cost: structuredClone(ability.program.cost),
  };
}
export function activationManaSources(
  state: RulesState,
  registry: ExecutionRegistry,
  ability: ActivatedAbility,
): Decision["manaSources"] {
  if (ability.program.cost.mana === null) return [];
  return manaSources(state, registry, ability.controller).filter(
    (source) => !ability.program.cost.tapSource || source.object !== ability.source.id,
  );
}
export function requestActivation(state: RulesState, registry: ExecutionRegistry): void {
  const frame = state.frames.at(-1);
  if (frame?.kind !== "activating") throw new RulesError("Invariant", "No activation workflow");
  const ability = state.activatedAbilities?.[frame.abilityId];
  if (!ability) throw new RulesError("Invariant", "No proposed noncard ability");
  if (frame.stage === "target") {
    request(state, "activation-target", frame.actor, {
      activation: activationDetails(ability),
      cards: activationTargets(state, registry, frame.actor, ability.program),
      count: 1,
      context: "Choose the ability's creature target or reverse its announcement.",
    });
  } else {
    request(state, "activation-payment", frame.actor, {
      activation: activationDetails(ability),
      cost: ability.program.cost.mana,
      cards: [ability.source.id],
      manaSources: activationManaSources(state, registry, ability),
      context: "Pay the complete activation cost or reverse the unfinished announcement.",
    });
  }
}
export function beginActivation(
  state: RulesState,
  registry: ExecutionRegistry,
  actor: string,
  response: Response,
): void {
  requireRule(response.kind === "activate", "Expected an ability announcement");
  requireRule(state.frames.length === 0, "Cannot activate during another workflow");
  requireRule(
    activationChoices(state, registry, actor).some(
      (choice) =>
        choice.source === response.source && choice.programIndex === response.programIndex,
    ),
    "That activated ability is not available.",
  );
  const source = structuredClone(object(state, response.source)),
    definition = card(state, registry, response.source),
    program = activatedProgram(definition);
  if (!program) throw new RulesError("Invariant", "Activation has no program");
  const id = `${state.manifest.id}:activated:${state.eventSequence}`;
  emit(
    state,
    "AbilityAnnounced",
    GameEvent.shape.data.parse({
      ability: id,
      source,
      sourceVersion: definition.sourceVersion,
      controller: actor,
      programIndex: 0,
      program,
    }),
  );
  const announcement = state.events.at(-1);
  if (!announcement) throw new RulesError("Invariant", "Activation announcement was not recorded");
  const ability: ActivatedAbility = {
    id,
    source,
    sourceVersion: definition.sourceVersion,
    controller: actor,
    programIndex: 0,
    program: structuredClone(program),
    target: null,
    targetEvent: null,
    announcement: structuredClone(announcement),
    payment: null,
  };
  state.activatedAbilities ??= {};
  state.activatedAbilities[id] = ability;
  state.stack.push({ kind: "activated-ability", abilityId: id });
  state.frames.push({
    kind: "activating",
    abilityId: id,
    actor,
    stage: program.target ? "target" : "payment",
  });
  state.priorityPlayer = null;
  // An unfinished announcement is reversible; accepted mana/payment resets passes.
  requestActivation(state, registry);
  hit(state, "rule:602.2a");
}
function reverseActivation(state: RulesState, ability: ActivatedAbility): void {
  const top = state.stack.pop();
  requireRule(
    top?.kind === "activated-ability" && top.abilityId === ability.id,
    "Activation is not the top stack object",
  );
  if (state.activatedAbilities) delete state.activatedAbilities[ability.id];
  state.frames.pop();
  emit(state, "ActivationReversed", {
    ability: ability.id,
    source: ability.source.id,
    controller: ability.controller,
  });
  hit(state, "rule:733.1");
  hit(state, "rule:733.2");
}
export function activationTargets(
  state: RulesState,
  registry: ExecutionRegistry,
  actor: string,
  program: ActivatedProgram,
): string[] {
  return legalCreatureTargets(state, registry, actor, program.target === "creature-you-control");
}
function targetLegal(
  state: RulesState,
  registry: ExecutionRegistry,
  controller: string,
  program: ActivatedProgram,
  target: string | null,
): boolean {
  return program.target === null
    ? target === null
    : target !== null && activationTargets(state, registry, controller, program).includes(target);
}

export { targetLegal as isLegalActivationTarget };
/** True means a paid or reversed proposal has completed and the activator may regain priority. */
export function answerActivation(
  state: RulesState,
  registry: ExecutionRegistry,
  actor: string,
  response: Response,
): boolean {
  const frame = state.frames.at(-1);
  requireRule(
    frame?.kind === "activating" && frame.actor === actor,
    "No owned activation workflow",
  );
  const ability = state.activatedAbilities?.[frame.abilityId];
  if (!ability) throw new RulesError("Invariant", "Activation workflow lost its noncard source");
  if (response.kind === "cancel-activation") {
    reverseActivation(state, ability);
    return true;
  }
  if (frame.stage === "target") {
    requireRule(
      response.kind === "activation-target",
      "Expected an ability target or cancellation",
    );
    requireRule(
      targetLegal(state, registry, actor, ability.program, response.target),
      "That creature is not a legal ability target",
    );
    ability.target = response.target;
    emit(state, "AbilityTargetChosen", {
      ability: ability.id,
      source: ability.source.id,
      controller: actor,
      target: response.target,
    });
    ability.targetEvent = structuredClone(state.events.at(-1) ?? null);
    frame.stage = "payment";
    requestActivation(state, registry);
    hit(state, "rule:601.2c");
    return false;
  }
  if (response.kind === "mana") {
    requireRule(
      activationManaSources(state, registry, ability).some(
        (source) =>
          source.object === response.source.object && source.colors.includes(response.source.color),
      ),
      "No such mana opportunity during this activation cost",
    );
    activateMana(state, registry, actor, response);
    requestActivation(state, registry);
    hit(state, "rule:601.2g");
    return false;
  }
  requireRule(
    response.kind === "activation-payment",
    "Expected complete activation payment, mana, or cancellation",
  );
  requireRule(
    targetLegal(state, registry, actor, ability.program, ability.target),
    "Activation requires its chosen legal target",
  );
  requireRule(
    activationChoices(state, registry, actor, false).some(
      (choice) => choice.source === ability.source.id,
    ),
    "The source can no longer pay this activation cost",
  );
  requireRule(
    !ability.program.cost.tapSource ||
      !response.sources.some((source) => source.object === ability.source.id),
    "The source cannot pay two tap costs",
  );
  requireRule(
    ability.program.cost.mana !== null || response.sources.length === 0,
    "A pure tap cost does not grant a mana activation window",
  );
  const payment = planManaPayment(
    state,
    registry,
    actor,
    ability.program.cost.mana ?? { ...emptyMana(), generic: 0 },
    response.sources,
    response.spend,
  );
  const sourceBefore = structuredClone(object(state, ability.source.id));
  commitManaPayment(state, actor, payment);
  if (ability.program.cost.tapSource) object(state, ability.source.id).tapped = true;
  emit(
    state,
    "AbilityActivated",
    GameEvent.shape.data.parse({
      ability: ability.id,
      source: ability.source.id,
      controller: actor,
      program: ability.program.id,
      target: ability.target,
      poolBefore: payment.poolBefore,
      sources: response.sources,
      spend: response.spend,
      sourceTapped: ability.program.cost.tapSource,
    }),
  );
  const event = state.events.at(-1);
  if (!event) throw new RulesError("Invariant", "Activation payment was not recorded");
  ability.payment = {
    poolBefore: payment.poolBefore,
    sources: payment.sources,
    spend: payment.spend,
    sourceBefore,
    event: structuredClone(event),
  };
  state.frames.pop();
  state.consecutivePasses = 0;
  hit(state, "rule:602.2b");
  hit(state, "rule:601.2h");
  hit(state, "rule:117.3c");
  hit(state, `card:${ability.source.definition}:activate:${ability.program.id}`);
  return true;
}
