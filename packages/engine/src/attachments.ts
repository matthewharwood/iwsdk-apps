import {
  type ActivatedAbility,
  type AttachmentOrigin,
  type ExecutionRegistry,
  GameEvent,
  type GameObject,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { emit, hit, RulesError } from "./common";
import { objectBase } from "./object-definitions";

/** Establishment legality only. Current targeting and the extant relation are separate. */
export function canAttach(
  state: RulesState,
  registry: ExecutionRegistry,
  sourceId: string,
  targetId: string,
): boolean {
  const source = state.objects[sourceId],
    target = state.objects[targetId];
  if (
    !source ||
    !target ||
    source.zone !== "battlefield" ||
    target.zone !== "battlefield" ||
    sourceId === targetId
  )
    return false;
  const base = objectBase(registry, source),
    recipient = objectBase(registry, target);
  if (!recipient.types.includes("Creature") || base.types.includes("Creature")) return false;
  const program = source.token
    ? undefined
    : registry.definitions[source.definition]?.attachmentProgram;
  if (program?.schema === "commander-aura/1")
    return base.types.includes("Enchantment") && base.subtypes.includes("Aura");
  return (
    program?.schema === "commander-equipment/1" &&
    base.types.includes("Artifact") &&
    base.subtypes.includes("Equipment")
  );
}
function commitAttachment(
  state: RulesState,
  source: string,
  target: string,
  origin:
    | Omit<Extract<AttachmentOrigin, { kind: "aura-spell" }>, "event">
    | Omit<Extract<AttachmentOrigin, { kind: "equip" }>, "event">,
): boolean {
  const old = state.attachments?.[source];
  if (old?.target === target) {
    hit(state, "rule:701.3b");
    return false;
  }
  emit(
    state,
    "AttachmentChanged",
    GameEvent.shape.data.parse({
      source,
      target,
      previousTarget: old?.target ?? null,
      kind: origin.kind,
      origin,
    }),
  );
  const event = state.events.at(-1);
  if (!event) throw new RulesError("Invariant", "Attachment event unavailable");
  state.attachments ??= {};
  state.attachments[source] = {
    source,
    target,
    attachedAtEvent: event.index,
    origin: { ...structuredClone(origin), event: structuredClone(event) },
  };
  hit(state, "rule:701.3c");
  hit(state, "rule:613.7e");
  return true;
}
export function attachFromEquip(
  state: RulesState,
  registry: ExecutionRegistry,
  ability: ActivatedAbility,
): void {
  if (ability.program.schema !== "commander-equip/1" || ability.target === null)
    throw new RulesError("Invariant", "No resolved equip instruction");
  if (!canAttach(state, registry, ability.source.id, ability.target)) {
    emit(state, "AttachmentNotChanged", {
      source: ability.source.id,
      target: ability.target,
      ability: ability.id,
      reason: "illegal-attachment",
    });
    hit(state, "rule:701.3b");
    return;
  }
  commitAttachment(state, ability.source.id, ability.target, { kind: "equip", ability });
}
/** Called after the new object exists but before the entry batch is published. */
export function attachEnteringAura(
  state: RulesState,
  registry: ExecutionRegistry,
  source: GameObject,
  entered: string,
  target: GameObject,
): void {
  if (!canAttach(state, registry, entered, target.id))
    throw new RulesError("Invariant", "Aura entry lost its validated attachment");
  const definition = registry.definitions[source.definition];
  if (!definition) throw new RulesError("Invariant", "Aura source unavailable");
  commitAttachment(state, entered, target.id, {
    kind: "aura-spell",
    source,
    sourceVersion: definition.sourceVersion,
    target,
  });
  hit(state, "rule:608.3c");
}
export function detach(state: RulesState, source: string, reason: string): void {
  const before = state.attachments?.[source];
  if (!before) return;
  delete state.attachments?.[source];
  emit(
    state,
    "AttachmentEnded",
    GameEvent.shape.data.parse({ source, target: before.target, before, reason }),
  );
  hit(state, "rule:701.3d");
}
/** Capture all attachment eligibility from the same facts as creature SBA eligibility. */
export function attachmentSbas(
  state: RulesState,
  registry: ExecutionRegistry,
): { source: string; kind: "graveyard" | "detach" }[] {
  return Object.values(state.objects).flatMap<{ source: string; kind: "graveyard" | "detach" }>(
    (source) => {
      if (source.zone !== "battlefield") return [];
      const base = objectBase(registry, source),
        link = state.attachments?.[source.id];
      if (
        base.subtypes.includes("Aura") &&
        (!link || !canAttach(state, registry, source.id, link.target))
      )
        return [{ source: source.id, kind: "graveyard" as const }];
      if (link && !canAttach(state, registry, source.id, link.target))
        return [{ source: source.id, kind: "detach" as const }];
      return [];
    },
  );
}
