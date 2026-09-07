import {
  type ExecutionRegistry,
  type GameObject,
  type RulesState,
  TokenOrigin,
  TokenTemplate,
} from "@iwsdk-apps/contracts";
import { definition, RulesError } from "./common";
import { tokenLineage } from "./tokens";

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RulesError("Invariant", message);
}
function originalSlots(state: RulesState, owner: string): Map<string, string> {
  const deck = state.manifest.seats.find((seat) => seat.id === owner)?.deck;
  invariant(deck, "Original card owner has no deck");
  const slots = new Map<string, string>();
  let ordinal = 0;
  for (const entry of deck.entries)
    for (let n = 0; n < entry.count; n++) slots.set(`${owner}:card:${ordinal++}`, entry.definition);
  return slots;
}

export function assertToken(
  state: RulesState,
  registry: ExecutionRegistry,
  entry: GameObject,
): void {
  const parsed = TokenOrigin.safeParse(entry.token);
  invariant(parsed.success, "Token origin is not a strict captured source context");
  const token = parsed.data;
  const template = registry.tokenTemplates[entry.definition];
  invariant(TokenTemplate.safeParse(template).success, "Token has no admitted auxiliary template");
  invariant(template?.id === entry.definition, "Token template dictionary identity differs");
  invariant(!registry.definitions[entry.definition], "Token template collides with a primary card");
  const producer = definition(registry, token.source.definition);
  const effect = producer.spellProgram?.effects[token.programIndex];
  invariant(
    producer.sourceVersion === token.sourceVersion &&
      producer.spellProgram?.target === null &&
      producer.spellProgram.effects.length === 1 &&
      effect?.kind === "create-token" &&
      effect.templateId === entry.definition &&
      effect.count > token.ordinal,
    "Token origin differs from its authenticated producer instruction",
  );
  invariant(
    token.source.id === `${token.source.lineage}@${token.source.generation}` &&
      originalSlots(state, token.source.owner).get(token.source.lineage) ===
        token.source.definition &&
      token.creationEvent < state.eventSequence &&
      entry.lineage === tokenLineage(token.creationEvent, token.ordinal),
    "Token creation occurrence or source incarnation changed",
  );
  invariant(
    entry.owner === token.creator &&
      token.creator === token.source.controller &&
      state.players.some((seat) => seat.id === token.creator) &&
      state.players.some((seat) => seat.id === token.source.owner),
    "Token ownership differs from its creator",
  );
  invariant(
    !entry.commander && !entry.commanderMoveOffered && !entry.spellState,
    "Token acquired card-only state",
  );
  invariant(
    entry.zone === "battlefield" ? entry.generation === 0 : entry.generation === 1,
    "Token moved after leaving the battlefield",
  );
  invariant(entry.zone !== "stack" && entry.zone !== "command", "Token entered a card-only zone");
  if (
    state.outcome.kind === "ongoing" &&
    !state.frames.some((frame) => frame.kind === "resolving-spell")
  )
    invariant(entry.zone === "battlefield", "A departed token escaped its state-based checkpoint");
}

/** Each original manifest slot remains exactly one physical card; tokens cannot fill missing slots. */
export function assertPhysicalInventory(state: RulesState): void {
  for (const seat of state.players.filter((candidate) => !candidate.lost)) {
    const expected = originalSlots(state, seat.id);
    const cards = Object.values(state.objects).filter(
      (entry) => entry.owner === seat.id && !entry.token,
    );
    invariant(
      cards.length === 100 && expected.size === 100,
      "Physical card inventory changed without an implemented create/remove operation",
    );
    for (const entry of cards)
      invariant(
        expected.get(entry.lineage) === entry.definition,
        "Physical card no longer matches its original deck slot",
      );
  }
}
