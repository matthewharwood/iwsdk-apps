import type { Meta, StoryObj } from "@storybook/react-vite";
import "../styles.css";
import { cardProofFixtures } from "./fixtures";
import { CardDisplaySchema } from "./model";
import { Card, HiddenCard } from "./react";

const first = cardProofFixtures[0];
if (!first) throw new Error("Missing card proof fixture.");
const meta = {
  title: "Cards/Studio design",
  component: Card,
  args: { card: first },
  parameters: { layout: "padded" },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const OutlineTitle: Story = { args: { outlineTitle: true } };
export const CompleteProof: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 20 }}>
      {cardProofFixtures.map((card) => (
        <Card key={card.id} card={card} />
      ))}
    </div>
  ),
};
export const Hidden: Story = { render: () => <HiddenCard /> };
export const UnfamiliarNotation: Story = {
  args: {
    card: CardDisplaySchema.parse({
      ...first,
      faces: [
        {
          ...first.faces[0],
          annotations: undefined,
          manaCost: "{W/U/P}",
          oracleText:
            "An unfamiliar {FUTURE} symbol remains visible. <script> is text, never markup.",
        },
      ],
    }),
  },
};
export const DenseRules: Story = {
  args: {
    card: CardDisplaySchema.parse({
      ...first,
      faces: [
        {
          ...first.faces[0],
          annotations: undefined,
          oracleText: Array.from(
            { length: 18 },
            (_, index) =>
              `Display stress paragraph ${index + 1}: This complete sentence remains available when the card cannot fit.`,
          ).join("\n"),
        },
      ],
    }),
  },
};
