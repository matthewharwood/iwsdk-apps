import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import { cardProofFixtures } from "../src/fixtures";
import { CardDisplaySchema } from "../src/model";
import { Card, HiddenCard } from "../src/react";

const annotated = CardDisplaySchema.parse({
  id: "annotation-proof",
  layout: "display-test",
  faceTreatment: "separate",
  faces: [
    {
      id: "annotation-front",
      name: "Typography and escaping proof",
      manaCost: "{2}{W}{W/U}",
      typeLine: "Display fixture",
      oracleText:
        "Power-up — Pay {2}, {T}: Draw a card.\nThis fixture preserves {FUTURE} and <script> as text.",
      power: "*",
      toughness: "1+*",
      annotations: {
        abilities: [{ paragraph: 0, costEnd: 24, label: "SUPPLIED LABEL", labelKind: "trigger" }],
        highlights: ["-", "Pay {2}, {T}", "Draw a card", "FUTURE"],
        table: "Explicit display annotation, not inferred game behavior.",
        timing: { caption: "Supplied timing reminder", phases: ["MAIN"] },
      },
    },
  ],
});
const dense = CardDisplaySchema.parse({
  id: "dense-proof",
  layout: "display-test",
  faceTreatment: "separate",
  faces: [
    {
      id: "dense-front",
      name: "Complete rules remain available",
      manaCost: null,
      typeLine: "Display fixture",
      oracleText: Array.from(
        { length: 18 },
        (_, index) =>
          `Paragraph ${index + 1}: Long display content expands this card without hiding any required text.`,
      ).join("\n"),
    },
  ],
});

function Proof() {
  const [visible, setVisible] = useState(true);
  return (
    <main style={{ padding: 24, background: "white" }}>
      <h1>Shared card design proof</h1>
      <button type="button" onClick={() => setVisible(!visible)}>
        {visible ? "Unmount cards" : "Mount cards"}
      </button>
      {visible && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 20,
            alignItems: "flex-start",
            marginTop: 20,
          }}
        >
          {cardProofFixtures.map((card) => (
            <Card key={card.id} card={card} />
          ))}
          <Card card={annotated} />
          <Card card={dense} />
          <HiddenCard />
        </div>
      )}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing proof root.");
createRoot(root).render(
  <StrictMode>
    <Proof />
  </StrictMode>,
);
