export interface OrderingConstraint {
  before: string;
  after: string;
  reason: string;
}
export type OrderingResult =
  | { kind: "ordered"; ids: string[] }
  | { kind: "choice-required"; prefix: string[]; choices: string[] }
  | { kind: "conflict"; remaining: string[]; constraints: OrderingConstraint[] };
/** A processor supplies precedence or requests a choice. Selector specificity is never precedence. */
export function orderInstances(
  ids: readonly string[],
  constraints: readonly OrderingConstraint[],
  unordered: "preserve-structural" | "require-choice",
): OrderingResult {
  if (new Set(ids).size !== ids.length)
    throw new Error("Independent rule instances need distinct identities");
  const remaining = new Set(ids);
  for (const edge of constraints)
    if (!remaining.has(edge.before) || !remaining.has(edge.after))
      throw new Error("Ordering references an unavailable instance");
  const ordered: string[] = [];
  while (remaining.size > 0) {
    const ready = ids.filter(
      (id) =>
        remaining.has(id) &&
        !constraints.some((edge) => edge.after === id && remaining.has(edge.before)),
    );
    if (ready.length === 0)
      return { kind: "conflict", remaining: [...remaining], constraints: [...constraints] };
    if (ready.length > 1 && unordered === "require-choice")
      return { kind: "choice-required", prefix: ordered, choices: ready };
    const next = ready[0];
    if (next === undefined) throw new Error("Missing ordering candidate");
    ordered.push(next);
    remaining.delete(next);
  }
  return { kind: "ordered", ids: ordered };
}
