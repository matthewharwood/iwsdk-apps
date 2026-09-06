import { SelfEntryProgram } from "@iwsdk-apps/contracts";

export const SELF_ENTRY_RECIPE_VERSION = "self-entry-creature/1";
export const SELF_ENTRY_RULES = [
  "603.2",
  "603.2c",
  "603.3",
  "603.3a",
  "603.3b",
  "603.6a",
  "603.6b",
  "603.10",
  "109.5",
  "113.7a",
  "117.2a",
  "117.5",
  "101.4",
  "608.2n",
  "800.4a",
  "800.4d",
] as const;
export const SELF_ENTRY_REGISTRY = [
  { text: "When this creature enters, draw a card.", kind: "draw", amount: 1 },
  ...[1, 2, 3, 4, 5].map((amount) => ({
    text: `When this creature enters, you gain ${amount} life.`,
    kind: "gain-life" as const,
    amount,
  })),
] as const;

/** Finite exact whole-line constructors; every remaining line must pass the existing full-body ability compiler. */
export function proposeSelfEntryBody(
  text: string,
): { program: SelfEntryProgram; remainder: string } | null {
  const lines = text.split("\n");
  if (lines.some((line) => line === "")) return null;
  const matches = lines.flatMap((line, index) => {
    const recipe = SELF_ENTRY_REGISTRY.find((entry) => entry.text === line);
    return recipe ? [{ index, recipe }] : [];
  });
  const match = matches[0];
  if (matches.length !== 1 || !match) return null;
  return {
    program: SelfEntryProgram.parse({
      schema: "commander-trigger/1",
      id: "self-entry-0",
      trigger: {
        kind: "self-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
      },
      choice: { kind: "mandatory" },
      effect: {
        kind: match.recipe.kind,
        recipient: "trigger-controller",
        amount: match.recipe.amount,
      },
    }),
    remainder: lines.filter((_, index) => index !== match.index).join("\n"),
  };
}
