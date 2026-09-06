import {
  type Atom,
  type Candidate,
  expectedKind,
  type FieldSchema,
  type FieldValue,
  type Scalar,
  SelectionError,
  Selector,
} from "./schema";
import type { SelectionView } from "./view";

export interface ReviewedResidual {
  readonly version: string;
  readonly reads: readonly string[];
  evaluate(candidate: Candidate, view: SelectionView): boolean | "unavailable";
}
export type ResidualRegistry = Readonly<Record<string, ReviewedResidual>>;
export function selectorFields(selector: Selector): string[] {
  switch (selector.op) {
    case "all":
    case "none":
      return [];
    case "and":
    case "or":
      return [...new Set(selector.terms.flatMap(selectorFields))];
    case "not":
      return selectorFields(selector.term);
    case "residual":
      return selector.reads;
    default:
      return [selector.field];
  }
}
export function validateSelector(
  input: Selector,
  fields: FieldSchema,
  residuals: ResidualRegistry,
): Selector {
  const selector = Selector.parse(input);
  const visit = (node: Selector): void => {
    switch (node.op) {
      case "all":
      case "none":
        return;
      case "and":
      case "or":
        node.terms.forEach(visit);
        return;
      case "not":
        visit(node.term);
        return;
      case "residual": {
        const registered = residuals[node.id];
        if (
          !registered ||
          registered.version !== node.version ||
          JSON.stringify([...registered.reads].sort()) !== JSON.stringify([...node.reads].sort())
        )
          throw new SelectionError(
            "UnavailableSemantics",
            `Unregistered residual or mismatched version/read footprint: ${node.id}`,
          );
        if (node.reads.some((field) => !fields[field]))
          throw new SelectionError("InvalidSelector", `Unknown residual field: ${node.id}`);
        return;
      }
      default:
        if (fields[node.field] !== expectedKind(node))
          throw new SelectionError(
            "InvalidSelector",
            `Field ${node.field} does not support ${node.op}`,
          );
    }
  };
  visit(selector);
  return selector;
}
export function boundValue(atom: Exclude<Atom, { op: "residual" }>, view: SelectionView): Scalar {
  const value = typeof atom.value === "object" ? view.bindings[atom.value.binding] : atom.value;
  if (value === undefined)
    throw new SelectionError("MissingData", `Missing source binding for ${atom.field}`);
  const kind = expectedKind(atom);
  const type = kind === "integer" ? "number" : kind === "string-set" ? "string" : kind;
  if (typeof value !== type || (type === "number" && !Number.isSafeInteger(value)))
    throw new SelectionError("InvalidSelector", `Binding type mismatch for ${atom.field}`);
  return value;
}
export function compareValue(
  atom: Exclude<Atom, { op: "residual" }>,
  value: FieldValue,
  expected: Scalar,
): boolean {
  switch (atom.op) {
    case "string-eq":
    case "boolean-eq":
      return value === expected;
    case "set-has":
      return Array.isArray(value) && typeof expected === "string" && value.includes(expected);
    case "descendant-of":
      return (
        typeof value === "string" &&
        typeof expected === "string" &&
        (value === expected || value.startsWith(`${expected}${atom.separator}`))
      );
    case "integer-compare": {
      if (typeof value !== "number" || typeof expected !== "number")
        throw new SelectionError(
          "InvalidSelector",
          "Integer comparison needs exact integer operands",
        );
      switch (atom.comparison) {
        case "eq":
          return value === expected;
        case "lt":
          return value < expected;
        case "lte":
          return value <= expected;
        case "gt":
          return value > expected;
        case "gte":
          return value >= expected;
      }
    }
  }
}
export function evaluateAtom(
  atom: Atom,
  candidate: Candidate,
  view: SelectionView,
  residuals: ResidualRegistry,
): boolean {
  if (atom.op === "residual") {
    const registered = residuals[atom.id];
    if (!registered || registered.version !== atom.version)
      throw new SelectionError("UnavailableSemantics", `Missing residual ${atom.id}`);
    for (const field of atom.reads)
      if (!(field in candidate.values))
        throw new SelectionError("MissingData", `Missing ${field} for ${candidate.id}`);
    const result = registered.evaluate(candidate, view);
    if (result === "unavailable")
      throw new SelectionError(
        "UnavailableSemantics",
        `Residual ${atom.id} has unavailable authoritative semantics`,
      );
    return result;
  }
  const value = candidate.values[atom.field];
  if (value === undefined)
    throw new SelectionError("MissingData", `Missing ${atom.field} for ${candidate.id}`);
  return compareValue(atom, value, boundValue(atom, view));
}
export function evaluate(
  selector: Selector,
  candidate: Candidate,
  view: SelectionView,
  residuals: ResidualRegistry,
): boolean {
  switch (selector.op) {
    case "all":
      return true;
    case "none":
      return false;
    case "and":
      return selector.terms.every((term) => evaluate(term, candidate, view, residuals));
    case "or":
      return selector.terms.some((term) => evaluate(term, candidate, view, residuals));
    case "not":
      return !evaluate(selector.term, candidate, view, residuals);
    default:
      return evaluateAtom(selector, candidate, view, residuals);
  }
}
type Evaluator = (candidate: Candidate, view: SelectionView) => boolean;
type Approximation = (candidate: Candidate, view: SelectionView) => boolean | undefined;
/** Compile the expression tree once; do not expand it into assignments or DNF. */
export function compileEvaluator(selector: Selector, residuals: ResidualRegistry): Evaluator {
  switch (selector.op) {
    case "all":
      return () => true;
    case "none":
      return () => false;
    case "not": {
      const term = compileEvaluator(selector.term, residuals);
      return (c, v) => !term(c, v);
    }
    case "and": {
      const terms = selector.terms.map((t) => compileEvaluator(t, residuals));
      return (c, v) => terms.every((t) => t(c, v));
    }
    case "or": {
      const terms = selector.terms.map((t) => compileEvaluator(t, residuals));
      return (c, v) => terms.some((t) => t(c, v));
    }
    default:
      return (c, v) => evaluateAtom(selector, c, v, residuals);
  }
}
export function compileApproximation(
  selector: Selector,
  fields: ReadonlySet<string>,
  residuals: ResidualRegistry,
): Approximation {
  switch (selector.op) {
    case "all":
      return () => true;
    case "none":
      return () => false;
    case "not": {
      const term = compileApproximation(selector.term, fields, residuals);
      return (c, v) => {
        const result = term(c, v);
        return result === undefined ? undefined : !result;
      };
    }
    case "and":
    case "or": {
      const terms = selector.terms.map((t) => compileApproximation(t, fields, residuals));
      return (c, v) => {
        const results = terms.map((t) => t(c, v));
        const decisive = selector.op === "or";
        if (results.includes(decisive)) return decisive;
        return results.includes(undefined) ? undefined : !decisive;
      };
    }
    case "residual":
      return () => undefined;
    default:
      return (c, v) =>
        fields.has(selector.field) && c.values[selector.field] !== undefined
          ? evaluateAtom(selector, c, v, residuals)
          : undefined;
  }
}
