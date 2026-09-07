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
export function selfEntryEffects(program: TriggeredProgram): readonly SelfEntryEffect[] {
  return program.schema === "commander-trigger/1" ? [program.effect] : program.effects;
}

const entryFilterCommon = {
  controller: z.enum(["any", "source-controller"]),
  excludeSource: z.boolean(),
  token: z.literal("any"),
};
/** Literal permanent types, or the reviewed subtype alone; Beast does not imply Creature. */
export const EntrySubjectFilter = z.union([
  z.strictObject({
    ...entryFilterCommon,
    types: z.tuple([z.enum(["Creature", "Land", "Artifact", "Enchantment"])]),
  }),
  z.strictObject({ ...entryFilterCommon, types: z.tuple([]), subtype: z.literal("Beast") }),
]);
export type EntrySubjectFilter = z.infer<typeof EntrySubjectFilter>;
export const EntryObserverEffect = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("gain-life"),
    recipient: z.literal("trigger-controller"),
    amount: z.union([z.literal(1), z.literal(2)]),
  }),
  z.strictObject({
    kind: z.literal("draw"),
    recipient: z.literal("trigger-controller"),
    amount: z.literal(1),
  }),
]);
export type EntryObserverEffect = z.infer<typeof EntryObserverEffect>;
export const EntryObserverProgram = z.strictObject({
  schema: z.literal("commander-entry-observer/1"),
  id: z.string().min(1).max(240),
  trigger: z.strictObject({
    kind: z.literal("permanent-enters-battlefield"),
    view: z.literal("post-committed-event"),
    placementClass: z.literal("ordinary"),
    sourceZone: z.literal("battlefield"),
    occurrence: z.literal("each-matching-object"),
    subject: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("filter"), filter: EntrySubjectFilter }),
      z.strictObject({
        kind: z.literal("self-or-filter"),
        filter: EntrySubjectFilter.refine(
          (filter) => filter.excludeSource,
          "The other branch must exclude the source",
        ),
      }),
    ]),
  }),
  choice: z.strictObject({ kind: z.literal("mandatory") }),
  effects: z
    .array(EntryObserverEffect)
    .min(1)
    .max(2)
    .refine(
      (effects) =>
        effects.length === 1 ||
        (effects[0]?.kind === "gain-life" &&
          effects[0].amount === 1 &&
          effects[1]?.kind === "draw"),
      "Only one fixed instruction or ordered gain-one then draw-one is admitted",
    ),
});
export type EntryObserverProgram = z.infer<typeof EntryObserverProgram>;
/** CR603.4 checks this closed current-state condition at capture and at resolution. */
export const ConditionalSelfEntryProgram = z.strictObject({
  schema: z.literal("commander-conditional-self-entry/1"),
  ...header,
  interveningIf: z.strictObject({
    kind: z.literal("controls-permanent"),
    types: z.tuple([z.literal("Artifact")]),
  }),
  effects: z.tuple([
    z.strictObject({
      kind: z.literal("draw"),
      recipient: z.literal("trigger-controller"),
      amount: z.literal(1),
    }),
  ]),
});
export type ConditionalSelfEntryProgram = z.infer<typeof ConditionalSelfEntryProgram>;
/** New observer programs do not rewrite either historical self-entry representation. */
export const TriggeredProgram = z.discriminatedUnion("schema", [
  SingleSelfEntryProgram,
  OrderedSelfEntryProgram,
  EntryObserverProgram,
  ConditionalSelfEntryProgram,
]);
export type TriggeredProgram = z.infer<typeof TriggeredProgram>;
export function triggerEffects(program: TriggeredProgram): readonly SelfEntryEffect[] {
  return program.schema === "commander-trigger/1" ? [program.effect] : program.effects;
}
