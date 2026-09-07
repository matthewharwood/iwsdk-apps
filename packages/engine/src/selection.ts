import type { ExecutionRegistry, GameObject, RulesState } from "@iwsdk-apps/contracts";
import {
  createView,
  type FieldSchema,
  prepareSelector,
  resolve,
  type Scalar,
  SelectionError,
  type SelectionResult,
  type Selector,
} from "@iwsdk-apps/rule-selection";
import { characteristics } from "./characteristics";
import { objectBase } from "./object-definitions";
import { orderedObjects } from "./object-order";

const fields = {
  isCard: "boolean",
  hasDamageProgram: "boolean",
  zone: "string",
  owner: "string",
  controller: "string",
  tapped: "boolean",
  controlledSinceTurn: "integer",
  types: "string-set",
  subtypes: "string-set",
  supertypes: "string-set",
  keywords: "string-set",
  manaCount: "integer",
  hasManaCost: "boolean",
} satisfies FieldSchema;
const planCache = new Map<string, ReturnType<typeof prepareSelector>>();
export const battlefieldCreatures: Selector = {
  op: "and",
  terms: [
    { op: "string-eq", field: "zone", value: "battlefield" },
    { op: "set-has", field: "types", value: "Creature" },
  ],
};
export const availableMana: Selector = {
  op: "and",
  terms: [
    { op: "string-eq", field: "zone", value: "battlefield" },
    { op: "string-eq", field: "controller", value: { binding: "actor" } },
    { op: "boolean-eq", field: "tapped", value: false },
    { op: "integer-compare", field: "manaCount", comparison: "gt", value: 0 },
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
};
export function priorityCandidates(mainWindow: boolean, landAvailable: boolean): Selector {
  const land: Selector = { op: "set-has", field: "types", value: "Land" };
  return {
    op: "and",
    terms: [
      { op: "boolean-eq", field: "isCard", value: true },
      { op: "string-eq", field: "owner", value: { binding: "actor" } },
      {
        op: "or",
        terms: [
          { op: "string-eq", field: "zone", value: "hand" },
          { op: "string-eq", field: "zone", value: "command" },
        ],
      },
      {
        op: "or",
        terms: [
          {
            op: "and",
            terms: [
              land,
              { op: "string-eq", field: "zone", value: "hand" },
              { op: mainWindow && landAvailable ? "all" : "none" },
            ],
          },
          {
            op: "and",
            terms: [
              { op: "not", term: land },
              { op: "boolean-eq", field: "hasManaCost", value: true },
              {
                op: "or",
                terms: [
                  { op: mainWindow ? "all" : "none" },
                  { op: "set-has", field: "types", value: "Instant" },
                  { op: "set-has", field: "keywords", value: "flash" },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
/** Development characteristics only. Future characteristic processors must supply this view. */
export function selectObjectCandidates(
  state: RulesState,
  release: ExecutionRegistry,
  query: Selector,
  bindings: Readonly<Record<string, Scalar>> = {},
): SelectionResult {
  const view = createView(
    "object",
    {
      match: state.manifest.id,
      revision: state.revision,
      epoch: state.epoch,
      lens: "current",
      eventVersion: String(state.eventSequence),
      processorVersion: "development-object-selection/5",
      bindingsKey: JSON.stringify(bindings),
      universe: "live-objects",
      generation: state.epoch,
    },
    fields,
    orderedObjects(state).map((entry) => {
      const definition = objectBase(release, entry);
      if (!definition)
        throw new SelectionError(
          "UnavailableSemantics",
          `Definition unavailable: ${entry.definition}`,
        );
      return {
        id: entry.id,
        values: {
          isCard: !entry.token,
          hasDamageProgram: !entry.token && !!release.definitions[entry.definition]?.damagePrograms,
          zone: entry.zone,
          owner: entry.owner,
          controller: entry.controller,
          tapped: entry.tapped,
          controlledSinceTurn: entry.controlledSinceTurn,
          types: definition.types,
          subtypes: definition.subtypes,
          supertypes: definition.supertypes,
          keywords: characteristics(state, release, entry.id).keywords,
          manaCount: definition.manaAbilities.length,
          hasManaCost: definition.manaCost !== null,
        },
      };
    }),
    bindings,
  );
  // No dynamic index survives a query. Changes inside a transition cannot reuse stale facts.
  if (state.manifest.resolver === "full-scan") return resolve(view, query);
  const key = JSON.stringify(query);
  let plan = planCache.get(key);
  if (!plan) {
    plan = prepareSelector(query, fields, {
      prefilterFields: ["zone", "owner", "controller", "tapped"],
      indexedFields: [
        "isCard",
        "hasDamageProgram",
        "zone",
        "owner",
        "controller",
        "tapped",
        "types",
        "subtypes",
        "supertypes",
        "keywords",
        "manaCount",
        "hasManaCost",
      ],
    });
    if (planCache.size >= 64) planCache.clear();
    planCache.set(key, plan);
  }
  return resolve(view, query, { mode: state.manifest.resolver, plan });
}
export function selectedObjects(
  state: RulesState,
  release: ExecutionRegistry,
  query: Selector,
  bindings: Readonly<Record<string, Scalar>> = {},
): GameObject[] {
  return selectObjectCandidates(state, release, query, bindings).ids.map((id) => {
    const found = state.objects[id];
    if (!found) throw new SelectionError("MissingData", `Selected object disappeared: ${id}`);
    return found;
  });
}
