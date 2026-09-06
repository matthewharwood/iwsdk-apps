import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { TurnControls } from "./turn-controls";

const meta = {
  title: "Table/Turn controls",
  component: TurnControls,
  args: { remaining: 15, turn: "human", winner: null, pending: false, onTake: fn() },
} satisfies Meta<typeof TurnControls>;
export default meta;
type Story = StoryObj<typeof meta>;
export const YourTurn: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Take 2 2" }));
    await expect(args.onTake).toHaveBeenCalledWith(2);
  },
};
export const OpponentThinking: Story = { args: { turn: "ai", pending: true } };
export const LastToken: Story = {
  args: { remaining: 1 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "Take 2 2" })).toBeDisabled();
  },
};
