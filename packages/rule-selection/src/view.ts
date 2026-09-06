import {
  type Candidate,
  type Domain,
  type FieldSchema,
  type Scalar,
  SelectionError,
  ViewIdentity,
  validateValue,
} from "./schema";

export interface SelectionView {
  readonly domain: Domain;
  readonly key: string;
  readonly identity: ViewIdentity;
  readonly fields: FieldSchema;
  readonly candidates: readonly Candidate[];
  readonly bindings: Readonly<Record<string, Scalar>>;
}
export function createView(
  domain: Domain,
  identity: ViewIdentity,
  fields: FieldSchema,
  candidates: readonly Candidate[],
  bindings: Readonly<Record<string, Scalar>> = {},
): SelectionView {
  const ids = new Set<string>();
  const frozen = candidates.map((candidate) => {
    if (!candidate.id || ids.has(candidate.id))
      throw new SelectionError(
        "InvalidSelector",
        `Duplicate or empty candidate identity: ${candidate.id}`,
      );
    ids.add(candidate.id);
    for (const [field, value] of Object.entries(candidate.values)) {
      const kind = fields[field];
      if (!kind || !validateValue(value, kind))
        throw new SelectionError("InvalidSelector", `Invalid ${field} value for ${candidate.id}`);
    }
    const values = structuredClone(candidate.values);
    for (const value of Object.values(values)) if (Array.isArray(value)) Object.freeze(value);
    return Object.freeze({ id: candidate.id, values: Object.freeze(values) });
  });
  const parsed = Object.freeze(ViewIdentity.parse(identity));
  // Candidate identities and binding values defend against a caller reusing a version key.
  const key = JSON.stringify([
    domain,
    parsed,
    frozen.map((c) => c.id),
    Object.entries(bindings).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ]);
  return Object.freeze({
    domain,
    key,
    identity: parsed,
    fields: Object.freeze({ ...fields }),
    candidates: Object.freeze(frozen),
    bindings: Object.freeze({ ...bindings }),
  });
}
