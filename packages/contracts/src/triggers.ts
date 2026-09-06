import { z } from "zod";

export const SelfEntryEffect = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("draw"),
    recipient: z.literal("trigger-controller"),
    amount: z.number().int().min(1).max(100_000),
  }),
  z.strictObject({
    kind: z.literal("gain-life"),
    recipient: z.literal("trigger-controller"),
    amount: z.number().int().min(1).max(100_000),
  }),
]);
export type SelfEntryEffect = z.infer<typeof SelfEntryEffect>;
const header = {
  id: z.string().min(1).max(240),
  trigger: z.strictObject({
    kind: z.literal("self-enters-battlefield"),
    view: z.literal("post-committed-event"),
    placementClass: z.literal("ordinary"),
  }),
  choice: z.strictObject({ kind: z.literal("mandatory") }),
};
/** Historical one-effect representation remains byte-equivalent in retained definitions. */
export const SingleSelfEntryProgram = z.strictObject({
  schema: z.literal("commander-trigger/1"),
  ...header,
  effect: SelfEntryEffect,
});
export type SingleSelfEntryProgram = z.infer<typeof SingleSelfEntryProgram>;
/** Entire mandatory sequence resolves atomically; there is no instruction-level choice or priority. */
export const OrderedSelfEntryProgram = z.strictObject({
  schema: z.literal("commander-trigger/2"),
  ...header,
  effects: z.array(SelfEntryEffect).min(2).max(16),
});
export type OrderedSelfEntryProgram = z.infer<typeof OrderedSelfEntryProgram>;
export const SelfEntryProgram = z.discriminatedUnion("schema", [
  SingleSelfEntryProgram,
  OrderedSelfEntryProgram,
]);
export type SelfEntryProgram = z.infer<typeof SelfEntryProgram>;
export function selfEntryEffects(program: SelfEntryProgram): readonly SelfEntryEffect[] {
  return program.schema === "commander-trigger/1" ? [program.effect] : program.effects;
}
