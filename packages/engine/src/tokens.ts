import {
  canonicalJson,
  type ExecutionRegistry,
  GameEvent,
  type GameObject,
  type RulesState,
  type SpellEffect,
  TokenOrigin,
  TokenTemplate,
} from "@iwsdk-apps/contracts";
import { card, emit, hit, object, player, RulesError, requireRule } from "./common";
import { lookupTokenTemplate } from "./object-definitions";
import { recordBattlefieldEntryBatch } from "./triggers";

type CreateEffect = Extract<SpellEffect, { kind: "create-token" }>;
export function tokenLineage(event: number, ordinal: number): string {
  return `token:${event}:${ordinal}`;
}

/** One fixed, fully admitted instruction creates its whole batch directly on the battlefield. */
export function createTokens(
  state: RulesState,
  registry: ExecutionRegistry,
  sourceId: string,
  effect: CreateEffect,
  programIndex: number,
): string[] {
  const source = object(state, sourceId);
  const printed = card(state, registry, sourceId);
  requireRule(
    source.zone === "stack" &&
      programIndex === 0 &&
      printed.spellProgram?.effects.length === 1 &&
      canonicalJson(printed.spellProgram.effects[programIndex]) === canonicalJson(effect),
    "Token creation differs from its resolving source instruction",
  );
  const template = TokenTemplate.parse(lookupTokenTemplate(registry, effect.templateId));
  if (template.id !== effect.templateId)
    throw new RulesError("Invariant", "Token template dictionary identity differs");
  const creator = source.controller;
  requireRule(!player(state, creator).lost, "A departed player cannot create tokens");
  const eventIndex = state.eventSequence;
  const created: GameObject[] = [];
  for (let ordinal = 0; ordinal < effect.count; ordinal++) {
    const lineage = tokenLineage(eventIndex, ordinal);
    const id = `${lineage}@0`;
    if (state.objects[id]) throw new RulesError("Invariant", "Token creation identity collision");
    const token = TokenOrigin.parse({
      creator,
      creationEvent: eventIndex,
      ordinal,
      source: {
        id: source.id,
        lineage: source.lineage,
        generation: source.generation,
        definition: source.definition,
        owner: source.owner,
        controller: source.controller,
        zone: "stack",
      },
      sourceVersion: printed.sourceVersion,
      programIndex,
    });
    created.push({
      id,
      lineage,
      generation: 0,
      definition: template.id,
      owner: creator,
      controller: creator,
      zone: "battlefield",
      tapped: false,
      controlledSinceTurn: state.turn,
      damage: 0,
      deathtouchDamage: false,
      counters: {},
      commander: false,
      commanderMoveOffered: false,
      token,
    });
  }
  for (const token of created) state.objects[token.id] = token;
  emit(
    state,
    "TokensCreated",
    GameEvent.shape.data.parse({
      source: sourceId,
      sourceDefinition: printed.id,
      sourceVersion: printed.sourceVersion,
      creator,
      templateId: template.id,
      count: created.length,
      objects: created.map((token) => structuredClone(token)),
    }),
  );
  recordBattlefieldEntryBatch(
    state,
    registry,
    created.map((token) => token.id),
    "create tokens",
  );
  for (const rule of ["111.1", "111.2", "111.3", "111.4", "111.6", "701.7a"])
    hit(state, `rule:${rule}`);
  hit(state, `card:${printed.id}:create-token`);
  hit(state, `token:${template.id}:created`);
  return created.map((token) => token.id);
}
