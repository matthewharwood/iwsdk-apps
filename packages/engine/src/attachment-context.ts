import {
  AttachmentLink,
  canonicalJson,
  type ExecutionRegistry,
  type GameObject,
  type RulesState,
} from "@iwsdk-apps/contracts";
import { assertActivatedAbility } from "./activation-context";
import { RulesError } from "./common";

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new RulesError("Invariant", message);
}
function same(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
function physical(state: RulesState, source: GameObject): void {
  invariant(
    !source.token && source.id === `${source.lineage}@${source.generation}`,
    "Attachment origin is not a card incarnation",
  );
  const seat = state.manifest.seats.find((entry) => entry.id === source.owner);
  invariant(seat, "Attachment origin owner is absent");
  let ordinal = 0,
    found = false;
  for (const row of seat.deck.entries)
    for (let n = 0; n < row.count; n++) {
      if (source.lineage === `${source.owner}:card:${ordinal++}`)
        found = row.definition === source.definition;
    }
  invariant(found, "Attachment origin changed physical inventory slot");
}
/** Strict retained context plus live endpoints. Authentic history still requires command replay. */
export function assertAttachmentContexts(state: RulesState, registry: ExecutionRegistry): void {
  const timestamps = new Set<number>();
  for (const [key, input] of Object.entries(state.attachments ?? {})) {
    const parsed = AttachmentLink.safeParse(input);
    invariant(parsed.success, "Attachment is not a strict retained relation");
    const link = parsed.data,
      source = state.objects[link.source],
      target = state.objects[link.target],
      event = link.origin.event;
    invariant(
      key === link.source &&
        source?.zone === "battlefield" &&
        target?.zone === "battlefield" &&
        source.id !== target.id,
      "Attachment endpoint incarnation is missing or changed",
    );
    invariant(!source.token, "Fixed token templates carry no attachment program");
    const definition = registry.definitions[source.definition];
    invariant(definition?.attachmentProgram, "Live attachment source has no program");
    invariant(
      link.attachedAtEvent === event.index &&
        event.index < state.eventSequence &&
        event.epoch <= state.epoch &&
        event.type === "AttachmentChanged" &&
        event.visibility === "public" &&
        event.cause === "rules" &&
        !timestamps.has(event.index),
      "Attachment timestamp or event header changed",
    );
    timestamps.add(event.index);
    invariant(
      event.data.source === link.source &&
        event.data.target === link.target &&
        event.data.kind === link.origin.kind &&
        (event.data.previousTarget === null || typeof event.data.previousTarget === "string") &&
        Object.keys(event.data).length === 5,
      "Attachment event differs from its relation",
    );
    const { event: _event, ...origin } = link.origin;
    invariant(same(event.data.origin, origin), "Attachment event lost immutable origin facts");
    const retained = state.events.find((entry) => entry.index === event.index);
    invariant(!retained || same(retained, event), "Retained attachment event changed");
    if (link.origin.kind === "equip") {
      const ability = assertActivatedAbility(state, registry, link.origin.ability, true);
      invariant(
        ability.program.schema === "commander-equip/1" &&
          definition.attachmentProgram.schema === "commander-equipment/1" &&
          ability.payment &&
          ability.payment.event.index < event.index &&
          ability.source.id === source.id &&
          ability.source.definition === source.definition &&
          ability.target === target.id,
        "Attachment equip origin changed",
      );
    } else {
      const origin = link.origin;
      physical(state, origin.source);
      invariant(
        definition.attachmentProgram.schema === "commander-aura/1" &&
          origin.sourceVersion === definition.sourceVersion &&
          origin.source.definition === source.definition &&
          origin.source.zone === "stack" &&
          origin.source.lineage === source.lineage &&
          origin.source.generation + 1 === source.generation &&
          origin.source.owner === source.owner &&
          origin.source.spellState?.target === target.id,
        "Aura attachment source context changed",
      );
      invariant(
        origin.target.zone === "battlefield" &&
          origin.target.id === target.id &&
          origin.target.lineage === target.lineage &&
          origin.target.generation === target.generation &&
          origin.target.definition === target.definition &&
          origin.target.owner === target.owner,
        "Aura entry target incarnation changed",
      );
    }
  }
  for (const entry of Object.values(state.objects)) {
    const definition = entry.token ? undefined : registry.definitions[entry.definition];
    if (entry.zone !== "stack" || definition?.attachmentProgram?.schema !== "commander-aura/1")
      continue;
    const frame = state.frames.find((row) => row.kind === "casting" && row.card === entry.id);
    invariant(
      entry.spellState && (frame || entry.spellState.target !== null),
      "Aura spell lost target state",
    );
    if (frame?.kind === "casting")
      invariant(
        frame.target === entry.spellState.target &&
          frame.origin.definition === entry.definition &&
          frame.origin.lineage === entry.lineage &&
          frame.origin.generation + 1 === entry.generation,
        "Aura casting target context changed",
      );
  }
}
