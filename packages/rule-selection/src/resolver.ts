import {
  compileApproximation,
  compileEvaluator,
  evaluate,
  type ResidualRegistry,
  selectorFields,
  validateSelector,
} from "./evaluate";
import { CandidateIndex } from "./indexed";
import { Mask } from "./mask";
import type { FieldSchema, Selector } from "./schema";
import type { SelectionView } from "./view";

export type ResolverMode = "full-scan" | "prepared-scan" | "prepared-indexed";
function fieldSignature(fields: FieldSchema): string {
  return JSON.stringify(Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
function freezeExpression(selector: Selector): void {
  if (selector.op === "and" || selector.op === "or") {
    selector.terms.forEach(freezeExpression);
    Object.freeze(selector.terms);
  } else if (selector.op === "not") freezeExpression(selector.term);
  else if ("value" in selector && typeof selector.value === "object") Object.freeze(selector.value);
  else if (selector.op === "residual") Object.freeze(selector.reads);
  Object.freeze(selector);
}
export function prepareSelector(
  selector: Selector,
  fields: FieldSchema,
  options: {
    prefilterFields?: readonly string[];
    indexedFields?: readonly string[];
    residuals?: ResidualRegistry;
  } = {},
) {
  const residuals = options.residuals ?? {};
  const parsed = validateSelector(selector, fields, residuals);
  freezeExpression(parsed);
  return Object.freeze({
    selector: parsed,
    fieldSignature: fieldSignature(fields),
    reads: Object.freeze(selectorFields(parsed)),
    indexedFields: Object.freeze([...(options.indexedFields ?? [])]),
    evaluate: compileEvaluator(parsed, residuals),
    approximate: compileApproximation(parsed, new Set(options.prefilterFields ?? []), residuals),
  });
}
export type PreparedSelector = ReturnType<typeof prepareSelector>;
export interface SelectionResult {
  ids: string[];
  mask: Mask;
  stats: {
    mode: ResolverMode;
    universe: number;
    coarseChecks: number;
    exactChecks: number;
    upperCandidates: number;
    fallback: string | null;
  };
}
export function resolve(
  view: SelectionView,
  selector: Selector,
  options: {
    mode?: ResolverMode;
    plan?: PreparedSelector;
    index?: CandidateIndex;
    residuals?: ResidualRegistry;
  } = {},
): SelectionResult {
  const requested = options.mode ?? "full-scan";
  const residuals = options.residuals ?? {};
  let mode = requested;
  let fallback: string | null = null;
  const plan = options.plan;
  if (
    mode !== "full-scan" &&
    (!plan ||
      plan.fieldSignature !== fieldSignature(view.fields) ||
      JSON.stringify(plan.selector) !== JSON.stringify(selector))
  ) {
    mode = "full-scan";
    fallback = "missing-or-incompatible-plan";
  }
  if (mode === "prepared-indexed" && options.index && options.index.view !== view) {
    mode = "prepared-scan";
    fallback = "stale-index-view";
  }
  const parsed =
    mode === "full-scan" ? validateSelector(selector, view.fields, residuals) : selector;
  let ordinals: number[];
  let coarseChecks = 0;
  if (mode === "prepared-indexed" && plan) {
    const index = options.index ?? new CandidateIndex(view, plan.indexedFields);
    ordinals = index.bounds(parsed).upper.ordinals();
  } else if (mode === "prepared-scan" && plan) {
    ordinals = [];
    for (const [ordinal, candidate] of view.candidates.entries()) {
      coarseChecks++;
      if (plan.approximate(candidate, view) !== false) ordinals.push(ordinal);
    }
  } else ordinals = Array.from(view.candidates.keys());
  const accepted: number[] = [];
  for (const ordinal of ordinals) {
    const candidate = view.candidates[ordinal];
    if (
      candidate &&
      (mode === "full-scan"
        ? evaluate(parsed, candidate, view, residuals)
        : plan?.evaluate(candidate, view))
    )
      accepted.push(ordinal);
  }
  const mask = new Mask(view, accepted);
  return {
    ids: mask.ids(),
    mask,
    stats: {
      mode,
      universe: view.candidates.length,
      coarseChecks,
      exactChecks: ordinals.length,
      upperCandidates: ordinals.length,
      fallback,
    },
  };
}
