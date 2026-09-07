import { z } from "zod";

const Id = z.string().min(1).max(240);
const header = {
  schema: z.literal("commander-damage-static/1"),
  id: Id,
  sourceZone: z.literal("battlefield"),
};
/** The complete finite ordinary-class programs; no other replacement class is admitted. */
export const DamageReplacementProgram = z.union([
  z.strictObject({
    ...header,
    kind: z.literal("replacement"),
    priority: z.literal("ordinary"),
    source: z.literal("any"),
    recipient: z.literal("permanent-or-player"),
    operation: z.strictObject({ kind: z.literal("multiply"), factor: z.literal(2) }),
  }),
  z.strictObject({
    ...header,
    kind: z.literal("replacement"),
    priority: z.literal("ordinary"),
    source: z.literal("spell"),
    recipient: z.literal("permanent-or-player"),
    operation: z.strictObject({ kind: z.literal("subtract"), amount: z.literal(1) }),
  }),
  z.strictObject({
    ...header,
    kind: z.literal("prevention"),
    priority: z.literal("ordinary"),
    source: z.literal("any"),
    recipient: z.literal("source-controller"),
    amount: z.literal(1),
  }),
]);
export type DamageReplacementProgram = z.infer<typeof DamageReplacementProgram>;
export const DamageStaticProgram = z.union([
  DamageReplacementProgram,
  z.strictObject({
    ...header,
    kind: z.literal("damage-cannot-be-prevented"),
    source: z.literal("this"),
  }),
]);
export type DamageStaticProgram = z.infer<typeof DamageStaticProgram>;
