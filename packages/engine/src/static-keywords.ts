import {
  type ExecutionRegistry,
  type GameObject,
  Keyword,
  type RulesState,
} from "@iwsdk-apps/contracts";
import {
  createView,
  type FieldSchema,
  prepareSelector,
  resolve,
  type Selector,
} from "@iwsdk-apps/rule-selection";
import { objectBase } from "./object-definitions";

const fields = {
  source: "string",
  zone: "string",
  controller: "string",
  anyController: "boolean",
  excludeSource: "boolean",
  anySubtype: "boolean",
  subtypes: "string-set",
  requiresArtifact: "boolean",
  anyColor: "boolean",
  colors: "string-set",
} satisfies FieldSchema;
const plans = new Map<string, ReturnType<typeof prepareSelector>>();

/**
 * Layer 6 prefix: current object control and base types/subtypes. No supported
 * processor changes those facts in earlier layers. Keyword grants never change
 * the predicates or create further grant programs, so these additions commute.
 */
export function staticGrantedKeywords(
  state: RulesState,
  registry: ExecutionRegistry,
  target: GameObject,
): Keyword[] {
  const base = objectBase(registry, target);
  if (target.zone !== "battlefield" || !base.types.includes("Creature")) return [];
  // The source need not match its recipient filter. Tokens currently carry no programs.
  const sources = Object.values(state.objects).flatMap((source) => {
    const program = source.token
      ? undefined
      : registry.definitions[source.definition]?.staticKeywordPrograms?.[0];
    return program ? [{ source, program }] : [];
  });
  if (!sources.length) return [];
  sources.sort((a, b) => (a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : 0));
  // Invert the recipient subtype predicate over live provider instances. The
  // candidate universe contains programs, not derived characteristics, avoiding
  // recursive characteristic queries and any durable recipient snapshot.
  const query: Selector = {
    op: "and",
    terms: [
      { op: "string-eq", field: "zone", value: "battlefield" },
      {
        op: "or",
        terms: [
          { op: "boolean-eq", field: "requiresArtifact", value: false },
          { op: base.types.includes("Artifact") ? "all" : "none" },
        ],
      },
      {
        op: "or",
        terms: [
          { op: "boolean-eq", field: "anyColor", value: true },
          ...base.colors.map(
            (color): Selector => ({ op: "set-has", field: "colors", value: color }),
          ),
        ],
      },
      {
        op: "or",
        terms: [
          { op: "boolean-eq", field: "anyController", value: true },
          { op: "string-eq", field: "controller", value: { binding: "controller" } },
        ],
      },
      {
        op: "or",
        terms: [
          { op: "boolean-eq", field: "excludeSource", value: false },
          { op: "not", term: { op: "string-eq", field: "source", value: { binding: "target" } } },
        ],
      },
      {
        op: "or",
        terms: [
          { op: "boolean-eq", field: "anySubtype", value: true },
          ...base.subtypes.map(
            (subtype): Selector => ({
              op: "set-has",
              field: "subtypes",
              value: subtype,
            }),
          ),
        ],
      },
    ],
  };
  const bindings = { controller: target.controller, target: target.id };
  const view = createView(
    "object",
    {
      match: state.manifest.id,
      revision: state.revision,
      epoch: state.epoch,
      lens: "characteristic-prefix",
      eventVersion: String(state.eventSequence),
      processorVersion: "static-keyword-layer6/1",
      bindingsKey: JSON.stringify(bindings),
      universe: "live-static-keyword-providers",
      generation: state.epoch,
    },
    fields,
    sources.map(({ source, program }) => ({
      id: source.id,
      values: {
        source: source.id,
        zone: source.zone,
        controller: source.controller,
        anyController: program.filter.controller === "any",
        excludeSource: program.filter.excludeSource,
        requiresArtifact: program.filter.types.some((type) => type === "Artifact"),
        anyColor: program.filter.color === null,
        colors: program.filter.color === null ? [] : [program.filter.color],
        anySubtype: program.filter.subtype === null,
        subtypes: program.filter.subtype === null ? [] : [program.filter.subtype],
      },
    })),
    bindings,
  );
  let ids: readonly string[];
  if (state.manifest.resolver === "full-scan") ids = resolve(view, query).ids;
  else {
    const key = JSON.stringify(query);
    let plan = plans.get(key);
    if (!plan) {
      plan = prepareSelector(query, fields, {
        prefilterFields: ["zone", "controller"],
        indexedFields: Object.keys(fields),
      });
      if (plans.size >= 64) plans.clear();
      plans.set(key, plan);
    }
    ids = resolve(view, query, { mode: state.manifest.resolver, plan }).ids;
  }
  const selected = new Set(ids);
  const granted = new Set<Keyword>();
  for (const { source, program } of sources)
    if (selected.has(source.id)) for (const keyword of program.grant) granted.add(keyword);
  // Canonical presentation order, not a timestamp or dependency ordering rule.
  return Keyword.options.filter((keyword) => granted.has(keyword));
}
