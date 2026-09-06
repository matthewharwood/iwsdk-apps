import { z } from "zod";
export const TurnControlsSchema = z.object({
  remaining: z.number().int().min(0).max(15),
  turn: z.enum(["human", "ai"]),
  winner: z.enum(["human", "ai"]).nullable(),
  pending: z.boolean(),
});
export type TurnControlsProps = z.infer<typeof TurnControlsSchema> & {
  onTake: (take: 1 | 2 | 3) => void;
};
export function TurnControls({ remaining, turn, winner, pending, onTake }: TurnControlsProps) {
  return (
    <div className="turn-controls">
      {([1, 2, 3] as const).map((take) => (
        <button
          type="button"
          key={take}
          disabled={pending || turn !== "human" || winner !== null || remaining < take}
          onClick={() => onTake(take)}
        >
          <span>Take {take}</span>
          <kbd>{take}</kbd>
        </button>
      ))}
    </div>
  );
}
