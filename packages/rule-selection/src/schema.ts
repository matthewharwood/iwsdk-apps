import { z } from "zod";

export const SELECTOR_VERSION = "typed-selection/1";
const Id = z.string().min(1);
const Integer = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
export const Domain = z.enum(["object", "rule-instance", "player"]);
export type Domain = z.infer<typeof Domain>;
export const FieldKind = z.enum(["string", "boolean", "integer", "string-set"]);
export type FieldKind = z.infer<typeof FieldKind>;
export type FieldSchema = Readonly<Record<string, FieldKind>>;
export const Scalar = z.union([z.string(), z.boolean(), Integer]);
export type Scalar = z.infer<typeof Scalar>;
export const FieldValue = z.union([Scalar, z.array(z.string())]);
export type FieldValue = z.infer<typeof FieldValue>;
const binding = z.strictObject({ binding: Id });
export const Atom = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("string-eq"), field: Id, value: z.union([z.string(), binding]) }),
  z.strictObject({
    op: z.literal("boolean-eq"),
    field: Id,
    value: z.union([z.boolean(), binding]),
  }),
  z.strictObject({
    op: z.literal("integer-compare"),
    field: Id,
    comparison: z.enum(["eq", "lt", "lte", "gt", "gte"]),
    value: z.union([Integer, binding]),
  }),
  z.strictObject({ op: z.literal("set-has"), field: Id, value: z.union([z.string(), binding]) }),
  z.strictObject({
    op: z.literal("descendant-of"),
    field: Id,
    value: z.union([z.string(), binding]),
    separator: z.enum(["/", "."]),
  }),
  z.strictObject({ op: z.literal("residual"), id: Id, version: Id, reads: z.array(Id) }),
]);
export type Atom = z.infer<typeof Atom>;
export type Selector =
  | Atom
  | { op: "all" | "none" }
  | { op: "and" | "or"; terms: Selector[] }
  | { op: "not"; term: Selector };
export const Selector: z.ZodType<Selector> = z.lazy(() =>
  z.union([
    Atom,
    z.strictObject({ op: z.enum(["all", "none"]) }),
    z.strictObject({ op: z.enum(["and", "or"]), terms: z.array(Selector) }),
    z.strictObject({ op: z.literal("not"), term: Selector }),
  ]),
);
export const ViewIdentity = z.strictObject({
  match: Id,
  revision: Integer.nonnegative(),
  epoch: Integer.nonnegative(),
  lens: z.enum(["current", "before", "proposed", "after", "characteristic-prefix"]),
  eventVersion: Id,
  processorVersion: Id,
  bindingsKey: Id,
  universe: Id,
  generation: Integer.nonnegative(),
});
export type ViewIdentity = z.infer<typeof ViewIdentity>;
export interface Candidate {
  readonly id: string;
  readonly values: Readonly<Record<string, FieldValue>>;
}
export class SelectionError extends Error {
  constructor(
    readonly code:
      | "MissingData"
      | "InvalidSelector"
      | "UnavailableSemantics"
      | "IncompatibleUniverse",
    message: string,
  ) {
    super(message);
    this.name = "SelectionError";
  }
}
export function expectedKind(atom: Exclude<Atom, { op: "residual" }>): FieldKind {
  switch (atom.op) {
    case "boolean-eq":
      return "boolean";
    case "integer-compare":
      return "integer";
    case "set-has":
      return "string-set";
    default:
      return "string";
  }
}
export function validateValue(value: FieldValue, kind: FieldKind): boolean {
  if (kind === "string-set")
    return Array.isArray(value) && value.every((v) => typeof v === "string");
  if (kind === "integer") return typeof value === "number" && Number.isSafeInteger(value);
  return typeof value === kind;
}
