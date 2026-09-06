import { boundValue, compareValue } from "./evaluate";
import { type Bounds, exactBounds, Mask, unknownBounds } from "./mask";
import { type Atom, type FieldValue, SelectionError, type Selector } from "./schema";
import type { SelectionView } from "./view";

interface Posting {
  value: FieldValue;
  mask: Mask;
}
interface FieldIndex {
  postings: Posting[];
  missing: Mask;
}
/** Rebuilt from authoritative facts in one immutable view; never mutates rules state. */
export class CandidateIndex {
  readonly #fields = new Map<string, FieldIndex>();
  constructor(
    readonly view: SelectionView,
    fields: readonly string[],
  ) {
    for (const field of new Set(fields)) {
      if (!view.fields[field])
        throw new SelectionError("InvalidSelector", `Unknown index field ${field}`);
      const buckets = new Map<string, { value: FieldValue; ordinals: number[] }>();
      const missing: number[] = [];
      for (const [ordinal, candidate] of view.candidates.entries()) {
        const value = candidate.values[field];
        if (value === undefined) {
          missing.push(ordinal);
          continue;
        }
        const key = JSON.stringify(value);
        const bucket = buckets.get(key) ?? { value, ordinals: [] };
        bucket.ordinals.push(ordinal);
        buckets.set(key, bucket);
      }
      this.#fields.set(field, {
        postings: [...buckets.values()].map((b) => ({
          value: b.value,
          mask: new Mask(view, b.ordinals),
        })),
        missing: new Mask(view, missing),
      });
    }
  }
  #atom(atom: Atom): Bounds {
    if (atom.op === "residual") return unknownBounds(this.view);
    const field = this.#fields.get(atom.field);
    if (!field) return unknownBounds(this.view);
    const expected = boundValue(atom, this.view);
    let lower = new Mask(this.view);
    for (const posting of field.postings)
      if (compareValue(atom, posting.value, expected)) lower = lower.or(posting.mask);
    return { lower, upper: lower.or(field.missing) };
  }
  bounds(selector: Selector): Bounds {
    switch (selector.op) {
      case "all":
        return exactBounds(Mask.all(this.view));
      case "none":
        return exactBounds(new Mask(this.view));
      case "not": {
        const result = this.bounds(selector.term);
        return { lower: result.upper.not(), upper: result.lower.not() };
      }
      case "and":
        return selector.terms.reduce<Bounds>(
          (a, t) => {
            const b = this.bounds(t);
            return { lower: a.lower.and(b.lower), upper: a.upper.and(b.upper) };
          },
          exactBounds(Mask.all(this.view)),
        );
      case "or":
        return selector.terms.reduce<Bounds>(
          (a, t) => {
            const b = this.bounds(t);
            return { lower: a.lower.or(b.lower), upper: a.upper.or(b.upper) };
          },
          exactBounds(new Mask(this.view)),
        );
      default:
        return this.#atom(selector);
    }
  }
}
