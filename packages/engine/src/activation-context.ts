import {
  ActivatedAbility,
  canonicalJson,
  type ExecutionRegistry,
  type GameEvent,
  type GameObject,
  MANA_COLORS,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { requestActivation } from "./activation";
import { definition, RulesError } from "./common";
import { validSpend } from "./mana";
import {
  activatedProgram,
  isAttachmentPermanent,
  isOrdinaryActivatedPermanent,
} from "./permanent-programs";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RulesError("Invariant", message);
}
function same(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
function physicalSource(state: RulesState, source: GameObject): void {
  invariant(
    !source.token &&
      source.zone === "battlefield" &&
      source.id === `${source.lineage}@${source.generation}` &&
      !source.spellState,
    "Activation source is not a battlefield card incarnation",
  );
  const seat = state.manifest.seats.find((entry) => entry.id === source.owner);
  invariant(seat, "Activation source owner has no original deck");
  let ordinal = 0,
    matched = false;
  for (const entry of seat.deck.entries)
    for (let n = 0; n < entry.count; n++) {
      if (source.lineage === `${source.owner}:card:${ordinal++}`)
        matched = entry.definition === source.definition;
    }
  invariant(matched, "Activation source differs from its original physical inventory slot");
}
function eventHeader(state: RulesState, event: GameEvent, type: string): void {
  invariant(
    event.type === type &&
      event.visibility === "public" &&
      event.cause === "rules" &&
      event.index < state.eventSequence &&
      event.epoch <= state.epoch,
    "Activation durable event header changed",
  );
  const retained = state.events.find((entry) => entry.index === event.index);
  if (retained)
    invariant(same(retained, event), "Activation origin differs from its retained event");
}
/** Structural consistency is not a substitute for replay authentication of the accepted history. */
export function assertActivatedAbility(
  state: RulesState,
  registry: ExecutionRegistry,
  input: unknown,
  historical = false,
): ActivatedAbility {
  const parsed = ActivatedAbility.safeParse(input);
  invariant(parsed.success, "Activated ability is not a strict durable context");
  const ability = parsed.data,
    source = definition(registry, ability.source.definition);
  physicalSource(state, ability.source);
  invariant(
    (isOrdinaryActivatedPermanent(source) || isAttachmentPermanent(source)) &&
      source.sourceVersion === ability.sourceVersion &&
      same(activatedProgram(source), ability.program),
    "Activation program differs from its pinned complete source",
  );
  invariant(
    ability.controller === ability.source.controller &&
      state.players.some((seat) => seat.id === ability.controller && (historical || !seat.lost)),
    "Activation controller changed or departed",
  );
  eventHeader(state, ability.announcement, "AbilityAnnounced");
  invariant(
    ability.id === `${state.manifest.id}:activated:${ability.announcement.index}`,
    "Activation occurrence identity changed",
  );
  invariant(
    same(ability.announcement.data, {
      ability: ability.id,
      source: ability.source,
      sourceVersion: ability.sourceVersion,
      controller: ability.controller,
      programIndex: 0,
      program: ability.program,
    }),
    "Activation announcement context changed",
  );
  if (ability.targetEvent) {
    eventHeader(state, ability.targetEvent, "AbilityTargetChosen");
    invariant(
      ability.program.target !== null &&
        ability.target !== null &&
        ability.targetEvent.index > ability.announcement.index &&
        same(ability.targetEvent.data, {
          ability: ability.id,
          source: ability.source.id,
          controller: ability.controller,
          target: ability.target,
        }),
      "Activation target occurrence changed",
    );
  } else invariant(ability.target === null, "Activation target lost its durable selection");
  if (!ability.payment) return ability;
  const payment = ability.payment,
    event = payment.event;
  eventHeader(state, event, "AbilityActivated");
  invariant(
    event.index > (ability.targetEvent?.index ?? ability.announcement.index) &&
      same(payment.sourceBefore, ability.source),
    "Activation payment source or order changed",
  );
  invariant(
    ability.program.target === null ? ability.target === null : ability.target !== null,
    "Paid ability lost its required target",
  );
  const pool = { ...payment.poolBefore };
  invariant(
    new Set(payment.sources.map((entry) => entry.source.id)).size === payment.sources.length,
    "Activation paid twice with one mana source",
  );
  for (const entry of payment.sources) {
    physicalSource(state, entry.source);
    invariant(
      !entry.source.tapped &&
        entry.source.controller === ability.controller &&
        definition(registry, entry.source.definition).manaAbilities.includes(entry.color),
      "Activation mana source snapshot changed",
    );
    invariant(
      !ability.program.cost.tapSource || entry.source.id !== ability.source.id,
      "Activation paid two costs with one tap",
    );
    pool[entry.color]++;
    invariant(Number.isSafeInteger(pool[entry.color]), "Activation payment arithmetic overflow");
  }
  invariant(
    ability.program.cost.mana !== null ||
      (payment.sources.length === 0 && MANA_COLORS.every((color) => payment.spend[color] === 0)),
    "Pure tap ability gained a mana payment",
  );
  if (ability.program.cost.mana)
    invariant(
      validSpend(pool, payment.spend, ability.program.cost.mana),
      "Activation receipt does not pay its exact cost",
    );
  invariant(
    same(event.data, {
      ability: ability.id,
      source: ability.source.id,
      controller: ability.controller,
      program: ability.program.id,
      target: ability.target,
      poolBefore: payment.poolBefore,
      sources: payment.sources.map((entry) => ({ object: entry.source.id, color: entry.color })),
      spend: payment.spend,
      sourceTapped: ability.program.cost.tapSource,
    }),
    "Activation payment differs from its durable completion event",
  );
  return ability;
}
export function assertActivationContexts(state: RulesState, registry: ExecutionRegistry): void {
  const frames = state.frames.filter((frame) => frame.kind === "activating"),
    entries = state.activatedAbilities ?? {};
  const stackIds = state.stack.flatMap((entry) =>
    entry.kind === "activated-ability" ? [entry.abilityId] : [],
  );
  invariant(
    new Set(stackIds).size === stackIds.length &&
      stackIds.length === Object.keys(entries).length &&
      stackIds.every((id) => entries[id]),
    "Activation dictionary and typed stack disagree",
  );
  const proposed: string[] = [];
  for (const [id, value] of Object.entries(entries)) {
    const ability = assertActivatedAbility(state, registry, value);
    invariant(id === ability.id, "Activation dictionary key changed");
    if (!ability.payment) proposed.push(id);
  }
  if (!frames.length) {
    invariant(
      proposed.length === 0 &&
        state.decision?.kind !== "activation-target" &&
        state.decision?.kind !== "activation-payment" &&
        state.decision?.activation === undefined,
      "Unfinished activation lacks its exclusive frame",
    );
    return;
  }
  const frame = frames[0],
    top = state.stack.at(-1);
  invariant(
    frame &&
      frames.length === 1 &&
      state.frames.length === 1 &&
      proposed.length === 1 &&
      proposed[0] === frame.abilityId,
    "Activation workflows overlap or have paid status",
  );
  const ability = entries[frame.abilityId];
  invariant(
    ability &&
      ability.controller === frame.actor &&
      top?.kind === "activated-ability" &&
      top.abilityId === frame.abilityId &&
      state.priorityPlayer === null &&
      state.outcome.kind === "ongoing",
    "Activation lacks its exclusive owner and top stack position",
  );
  invariant(
    same(state.objects[ability.source.id] ?? null, ability.source),
    "Pending activation source changed",
  );
  invariant(
    frame.stage === "target"
      ? ability.program.target !== null && ability.target === null
      : ability.program.target === null || ability.target !== null,
    "Activation target/payment stage changed",
  );
  const expected = { ...state };
  requestActivation(expected, registry);
  invariant(
    same(state.decision, expected.decision),
    "Activation owned legal decision domain changed",
  );
}
