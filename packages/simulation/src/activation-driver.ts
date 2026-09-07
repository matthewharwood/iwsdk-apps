import {
  type ActivatedProgram,
  type Cost,
  type Decision,
  emptyMana,
  type Mana,
  type OrdinaryActivatedEffect,
  type PlayerObservation,
  type Response,
} from "@iwsdk-apps/contracts";

type Visible = PlayerObservation["objects"][number];
type PaymentPlanner = (
  cost: Cost,
  pool: Mana,
  sources: Decision["manaSources"],
) => Extract<Response, { kind: "payment" }> | null;
const combatSteps = new Set([
  "begin-combat",
  "attackers",
  "blockers",
  "first-strike-damage",
  "combat-damage",
]);

function creatureTargets(view: PlayerObservation, allowed?: readonly string[]): Visible[] {
  return view.objects.filter((object) => {
    const types = object.card?.types ?? object.tokenTemplate?.characteristics.types;
    return (
      object.zone === "battlefield" &&
      types?.includes("Creature") &&
      (!allowed || allowed.includes(object.id)) &&
      !object.characteristics.keywords.includes("shroud") &&
      (object.controller === view.player || !object.characteristics.keywords.includes("hexproof"))
    );
  });
}
function harmful(effect: OrdinaryActivatedEffect): boolean {
  return (
    effect.kind === "tap" ||
    (effect.kind === "modify-creature" && (effect.powerDelta < 0 || effect.toughnessDelta < 0))
  );
}
function targetsForEffect(
  view: PlayerObservation,
  effect: ActivatedProgram["effects"][0],
  allowed?: readonly string[],
): Visible[] {
  const hurt = effect.kind !== "attach-source" && harmful(effect);
  return creatureTargets(view, allowed)
    .filter(
      (object) =>
        (hurt ? object.controller !== view.player : object.controller === view.player) &&
        (effect.kind !== "tap" || !object.tapped),
    )
    .sort(
      (a, b) =>
        (b.characteristics.power ?? 0) - (a.characteristics.power ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}
function targetedByOpponent(view: PlayerObservation, id: string): boolean {
  return (
    view.objects.some(
      (object) =>
        object.zone === "stack" &&
        object.controller !== view.player &&
        object.spellState?.target === id,
    ) ||
    !!view.activatedAbilities?.some(
      (ability) => ability.controller !== view.player && ability.target === id,
    )
  );
}
function combatParticipant(view: PlayerObservation, source: Visible): boolean {
  return (
    combatSteps.has(view.step) &&
    ((view.activePlayer === view.player && view.step === "begin-combat") ||
      view.combat.attacks.some((row) => row.attacker === source.id) ||
      view.combat.blocks.some((row) => row.blocker === source.id))
  );
}
function useful(
  view: PlayerObservation,
  source: Visible,
  effect: OrdinaryActivatedEffect,
): boolean {
  if (effect.kind === "draw") {
    const self = view.players.find((seat) => seat.id === view.player);
    return !!self && self.libraryCount >= effect.amount;
  }
  if (effect.kind === "gain-life") return true;
  if (effect.recipient === "target") {
    return (
      targetsForEffect(view, effect).length > 0 &&
      (effect.kind !== "tap" || ["main1", "begin-combat"].includes(view.step))
    );
  }
  const current = source.characteristics;
  const nextToughness = (current.toughness ?? 0) + effect.toughnessDelta;
  if (nextToughness <= 0 || nextToughness <= source.damage) return false;
  const newKeywords = effect.keywords.filter((keyword) => !current.keywords.includes(keyword));
  if (effect.powerDelta <= 0 && effect.toughnessDelta <= 0 && !newKeywords.length) return false;
  if (
    newKeywords.some((keyword) => keyword === "shroud" || keyword === "hexproof") &&
    targetedByOpponent(view, source.id)
  )
    return true;
  return combatParticipant(view, source);
}

function equipTargets(
  view: PlayerObservation,
  source: Visible,
  allowed?: readonly string[],
): Visible[] {
  // Policy avoids free same-target loops; this is not a core legality restriction.
  if (view.attachments?.some((link) => link.source === source.id)) return [];
  const modifier = source.card?.attachmentProgram?.attachedModifier;
  if (!modifier) return [];
  return creatureTargets(view, allowed)
    .filter(
      (target) =>
        target.controller === view.player &&
        (target.characteristics.toughness ?? 0) + modifier.toughnessDelta > target.damage,
    )
    .sort(
      (a, b) =>
        (b.characteristics.power ?? 0) - (a.characteristics.power ?? 0) || (a.id < b.id ? -1 : 1),
    );
}

/** Repeat avoidance is policy only. The engine may legally accept several activations on its stack. */
export function priorityActivation(
  view: PlayerObservation,
  decision: Decision,
  pay: PaymentPlanner,
): Response | null {
  const self = view.players.find((seat) => seat.id === view.player);
  if (!self) throw new Error("Activation policy cannot see its own seat");
  if (
    view.activatedAbilities?.some(
      (ability) =>
        ability.controller === view.player &&
        view.stack.some(
          (entry) => entry.kind === "activated-ability" && entry.abilityId === ability.id,
        ),
    )
  )
    return null;
  const descriptors = [...(decision.activations ?? [])].sort((a, b) =>
    a.source < b.source ? -1 : a.source > b.source ? 1 : 0,
  );
  for (const descriptor of descriptors) {
    const source = view.objects.find((object) => object.id === descriptor.source);
    const program =
      source?.card?.attachmentProgram?.schema === "commander-equipment/1"
        ? source.card.attachmentProgram.equip
        : source?.card?.activatedPrograms?.[descriptor.programIndex];
    if (!source || !program) continue;
    if (program.schema === "commander-equip/1") {
      if (equipTargets(view, source).length === 0) continue;
    } else if (!useful(view, source, program.effects[0])) continue;
    const sources = descriptor.cost.mana
      ? decision.manaSources.filter(
          (entry) => !descriptor.cost.tapSource || entry.object !== descriptor.source,
        )
      : [];
    if (!pay(descriptor.cost.mana ?? { ...emptyMana(), generic: 0 }, self.mana, sources)) continue;
    return { kind: "activate", source: descriptor.source, programIndex: descriptor.programIndex };
  }
  return null;
}

/** These responses use the currently owned domain; no source library or hidden state is available. */
export function activationChoice(
  view: PlayerObservation,
  decision: Decision,
  pay: PaymentPlanner,
): Response {
  const context = decision.activation;
  if (!context) throw new Error("Activation decision lacks its noncard source and cost context");
  if (decision.kind === "activation-payment") {
    const self = view.players.find((seat) => seat.id === view.player);
    if (!self) throw new Error("Activation payer is absent from its own observation");
    const sources = context.cost.mana
      ? decision.manaSources.filter(
          (entry) => !context.cost.tapSource || entry.object !== context.source,
        )
      : [];
    const payment = pay(context.cost.mana ?? { ...emptyMana(), generic: 0 }, self.mana, sources);
    return payment
      ? { kind: "activation-payment", sources: payment.sources, spend: payment.spend }
      : { kind: "cancel-activation" };
  }
  if (decision.kind !== "activation-target") throw new Error("Unexpected activation decision");
  const ability = view.activatedAbilities?.find((entry) => entry.id === context.abilityId);
  if (!ability || ability.controller !== view.player)
    throw new Error("Activation target decision lacks its owned public ability");
  const source = view.objects.find((entry) => entry.id === ability.source.id);
  const target =
    ability.program.schema === "commander-equip/1"
      ? source
        ? equipTargets(view, source, decision.cards)[0]
        : undefined
      : targetsForEffect(view, ability.program.effects[0], decision.cards)[0];
  return target ? { kind: "activation-target", target: target.id } : { kind: "cancel-activation" };
}
