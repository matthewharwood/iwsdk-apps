import type {
  CardDefinition,
  ExecutionRegistry,
  GameObject,
  ManaColor,
  TokenTemplate,
} from "@iwsdk-apps/contracts";

export function lookupTokenTemplate(registry: ExecutionRegistry, id: string): TokenTemplate {
  const template = registry.tokenTemplates[id];
  if (!template) throw new Error(`Token template unavailable: ${id}`);
  return template;
}
export type ObjectBase = Pick<
  CardDefinition,
  | "id"
  | "name"
  | "types"
  | "subtypes"
  | "supertypes"
  | "colors"
  | "manaCost"
  | "manaValue"
  | "power"
  | "toughness"
  | "keywords"
  | "blockingRestrictions"
> & { manaAbilities: ManaColor[] };

/** Common battlefield facts do not turn an auxiliary template into an Oracle card. */
export function objectBase(registry: ExecutionRegistry, object: GameObject): ObjectBase {
  if (object.token) {
    const template = lookupTokenTemplate(registry, object.definition);
    return { id: template.id, ...template.characteristics, manaAbilities: [] };
  }
  const card = registry.definitions[object.definition];
  if (!card) throw new Error(`Card definition unavailable: ${object.definition}`);
  return card;
}
