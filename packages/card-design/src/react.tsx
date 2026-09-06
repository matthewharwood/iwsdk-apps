import { useId, useRef } from "react";
import { useCardLayout } from "./layout";
import type { CardAnnotations, CardColor, CardDisplay, CardFaceDisplay, CardRarity } from "./model";
import { RulesText, TextRuns } from "./rich-text";
import { ManaSymbol } from "./symbols";
import { highlightRanges, oracleParagraphs } from "./text";

export { RulesText } from "./rich-text";
export { ManaSymbol } from "./symbols";

export function RarityMark({ rarity }: { rarity: CardRarity }) {
  return (
    <span
      className="rarity-mark"
      data-rarity={rarity}
      role="img"
      aria-label={`${rarity} rarity`}
      title={rarity}
    >
      <svg viewBox="0 0 18 13" aria-hidden="true" focusable="false">
        {rarity === "special" || rarity === "bonus" ? (
          <ellipse cx="9" cy="6.5" rx="7" ry="4.5" />
        ) : (
          <path d="M2 2H16L9 11Z" />
        )}
      </svg>
    </span>
  );
}

function TypeLine({ face, showRarity }: { face: CardFaceDisplay; showRarity: boolean }) {
  return (
    <div className="card-type-row">
      <p className="card-type">{face.typeLine}</p>
      {face.colorIndicator.length > 0 && (
        <span
          className="indicator"
          role="img"
          aria-label={`Color indicator: ${face.colorIndicator.join(", ")}`}
        >
          {face.colorIndicator.map((color) => (
            <ManaSymbol key={color} symbol={color} />
          ))}
        </span>
      )}
      {showRarity && face.rarity && <RarityMark rarity={face.rarity} />}
    </div>
  );
}

function FaceRules({ face }: { face: CardFaceDisplay }) {
  const highlights = face.annotations?.highlights ?? [];
  return (
    <div className="card-rules">
      {face.oracleText.length > 0 &&
        oracleParagraphs(face.oracleText).map(({ text, paragraph, start }) => {
          const annotation = face.annotations?.abilities.find(
            (ability) => ability.paragraph === paragraph,
          );
          const ranges = highlightRanges(text, highlights);
          const costEnd = annotation?.costEnd;
          return (
            <p key={start}>
              {annotation?.label && (
                <span className="trigger-label" data-label-kind={annotation.labelKind ?? "neutral"}>
                  {annotation.label}
                </span>
              )}
              {costEnd !== undefined ? (
                <>
                  <span className="ability-cost">
                    <TextRuns text={text.slice(0, costEnd)} ranges={ranges} activation />
                  </span>
                  <span className="ability-effect">
                    <TextRuns text={text.slice(costEnd)} ranges={ranges} offset={costEnd} />
                  </span>
                </>
              ) : (
                <TextRuns text={text} ranges={ranges} />
              )}
            </p>
          );
        })}
      {face.annotations?.reminder && (
        <p className="reminder">
          <RulesText text={face.annotations.reminder} highlights={highlights} />
        </p>
      )}
    </div>
  );
}

function Utilities({ annotations }: { annotations: CardAnnotations | undefined }) {
  return (
    <>
      {annotations?.tokens.map((text) => (
        <div className="utility-row" key={text}>
          <span className="micro-label vertical-label">TOKEN</span>
          <p>
            <RulesText text={text} />
          </p>
        </div>
      ))}
      {annotations?.table && (
        <div className="utility-row table-row">
          <span className="micro-label vertical-label">TABLE</span>
          <p>
            <RulesText text={annotations.table} />
          </p>
        </div>
      )}
    </>
  );
}

function Timing({ timing }: { timing: NonNullable<CardAnnotations["timing"]> }) {
  const phases = [
    { id: "upkeep", label: "UPKEEP" },
    { id: "precombat-main", label: "MAIN" },
    { id: "combat", label: "COMBAT" },
    { id: "postcombat-main", label: "MAIN" },
    { id: "end", label: "END" },
  ] as const;
  return (
    <figure className="phase-timeline" aria-label="Timing reminder, not the current turn phase">
      <figcaption className="phase-caption">{timing.caption}</figcaption>
      <div className="phase-track">
        <svg
          className="phase-rail"
          viewBox="0 0 200 8"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line x1="0" y1="4" x2="100%" y2="4" />
          {phases.map((phase, index) => (
            <circle
              key={phase.id}
              className={`phase-dot${timing.phases.includes(phase.label) ? " active" : ""}`}
              cx={index * 50}
              cy="4"
              r="2.333333"
            />
          ))}
        </svg>
        {phases.map((phase) => (
          <span
            className={`phase${timing.phases.includes(phase.label) ? " active" : ""}`}
            key={phase.id}
          >
            {phase.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

function Stats({ face }: { face: CardFaceDisplay }) {
  return (
    <div className="card-stats">
      {face.power !== undefined && face.toughness !== undefined ? (
        <span role="img" aria-label={`Printed power ${face.power}, toughness ${face.toughness}`}>
          {face.power}
          <span className="stats-slash">/</span>
          {face.toughness}
        </span>
      ) : (
        <>
          {face.power !== undefined && <span>Power {face.power}</span>}
          {face.toughness !== undefined && <span>Toughness {face.toughness}</span>}
        </>
      )}
      {face.loyalty !== undefined && <span>Loyalty {face.loyalty}</span>}
      {face.defense !== undefined && <span>Defense {face.defense}</span>}
      {face.handModifier !== undefined && <span>Hand {face.handModifier}</span>}
      {face.lifeModifier !== undefined && <span>Life {face.lifeModifier}</span>}
    </div>
  );
}

function SecondaryFace({ face }: { face: CardFaceDisplay }) {
  return (
    <section className="adventure" aria-label={face.name}>
      <div className="adventure-heading">
        <h3 className="adventure-name">{face.name}</h3>
        {face.manaCost !== null && (
          <div className="mana-cost" role="img" aria-label={`Mana cost ${face.manaCost}`}>
            <RulesText text={face.manaCost} />
          </div>
        )}
      </div>
      <TypeLine face={face} showRarity={false} />
      <FaceRules face={face} />
      <div className="adventure-utilities">
        <Utilities annotations={face.annotations} />
        {face.annotations?.timing && <Timing timing={face.annotations.timing} />}
        <Stats face={face} />
      </div>
    </section>
  );
}

type FaceOptions = { kind?: CardDisplay["kind"]; fixed?: boolean; outlineTitle?: boolean };
function FaceArticle({
  face,
  secondary = [],
  kind = "card",
  fixed = true,
  outlineTitle = false,
}: FaceOptions & { face: CardFaceDisplay; secondary?: readonly CardFaceDisplay[] }) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useCardLayout(ref, [face, ...secondary], fixed);
  return (
    <article
      ref={ref}
      className={`print-card${fixed ? " card-fixed" : ""}${outlineTitle ? " text-outline" : ""}`}
      aria-labelledby={titleId}
      data-face-id={face.id}
    >
      <svg className="highlight-layer" aria-hidden="true" focusable="false" />
      <header className="card-header">
        <div className="card-title-slot">
          <h2 id={titleId} className="card-name" title={face.name}>
            {face.name}
          </h2>
        </div>
        <div className="header-meta">
          <div
            className="mana-cost"
            role="img"
            aria-label={face.manaCost === null ? "No mana cost" : `Mana cost ${face.manaCost}`}
          >
            {face.manaCost !== null && <RulesText text={face.manaCost} />}
            {kind !== "card" && <span className="print-kind">{kind.toUpperCase()}</span>}
          </div>
          {face.annotations?.badge && <span className="role-badge">{face.annotations.badge}</span>}
        </div>
      </header>
      <TypeLine face={face} showRarity={kind === "card"} />
      <div className="card-content">
        <FaceRules face={face} />
        {secondary.map((item) => (
          <SecondaryFace key={item.id} face={item} />
        ))}
      </div>
      <footer className="card-footer">
        <Utilities annotations={face.annotations} />
        <div className="footer-bottom">
          {face.annotations?.timing && <Timing timing={face.annotations.timing} />}
          <Stats face={face} />
        </div>
      </footer>
    </article>
  );
}

/** Present only information the caller is entitled to observe. No fetching or game commands. */
export function CardFace({ face, ...options }: FaceOptions & { face: CardFaceDisplay }) {
  return (
    <div className="card-design">
      <FaceArticle face={face} {...options} />
    </div>
  );
}

export function Card({ card, ...options }: Omit<FaceOptions, "kind"> & { card: CardDisplay }) {
  const first = card.faces[0];
  if (!first) throw new Error("A card presentation requires a face.");
  return (
    <section className="card-design card-faces" aria-label="Card faces" data-layout={card.layout}>
      {card.faceTreatment === "combined" ? (
        <FaceArticle face={first} secondary={card.faces.slice(1)} kind={card.kind} {...options} />
      ) : (
        card.faces.map((face) => (
          <FaceArticle key={face.id} face={face} kind={card.kind} {...options} />
        ))
      )}
    </section>
  );
}

export function ColorIdentity({ colors }: { colors: readonly CardColor[] }) {
  return (
    <span
      className="card-design card-color-identity"
      role="img"
      aria-label={`Deck color identity: ${colors.length ? colors.join(", ") : "colorless"}`}
    >
      {colors.length
        ? colors.map((color) => <ManaSymbol key={color} symbol={color} />)
        : "Colorless identity"}
    </span>
  );
}

/** Deliberately accepts no card identity, face data, or arbitrary DOM attributes. */
export function HiddenCard({ label = "Hidden card" }: { label?: string }) {
  return (
    <div className="card-design">
      <div className="card-back" role="img" aria-label={label}>
        <span>{label}</span>
      </div>
    </div>
  );
}
