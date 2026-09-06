import { z } from "zod";

/** Initial trigger ABI: one mandatory, targetless constant effect on its captured controller. */
export const SelfEntryProgram = z.strictObject({
  schema: z.literal("commander-trigger/1"),
  id: z.string().min(1).max(240),
  trigger: z.strictObject({
    kind: z.literal("self-enters-battlefield"),
    view: z.literal("post-committed-event"),
    placementClass: z.literal("ordinary"),
  }),
  choice: z.strictObject({ kind: z.literal("mandatory") }),
  effect: z.discriminatedUnion("kind", [
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
  ]),
});
export type SelfEntryProgram = z.infer<typeof SelfEntryProgram>;
