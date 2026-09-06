import { useId } from "react";
import blackIcon from "../assets/icons/black.svg";
import blueIcon from "../assets/icons/blue.svg";
import chaosIcon from "../assets/icons/chaos.svg";
import colorlessIcon from "../assets/icons/colorless.svg";
import energyIcon from "../assets/icons/energy.svg";
import greenIcon from "../assets/icons/green.svg";
import phyrexianIcon from "../assets/icons/phyrexian.svg";
import redIcon from "../assets/icons/red.svg";
import redwhiteIcon from "../assets/icons/red-white.svg";
import snowIcon from "../assets/icons/snow.svg";
import tapIcon from "../assets/icons/tap.svg";
import untapIcon from "../assets/icons/untap.svg";
import whiteIcon from "../assets/icons/white.svg";
import { isKnownSymbol } from "./text";

const assets: Record<string, string> = {
  W: whiteIcon,
  U: blueIcon,
  B: blackIcon,
  R: redIcon,
  G: greenIcon,
  C: colorlessIcon,
  T: tapIcon,
  Q: untapIcon,
  S: snowIcon,
  E: energyIcon,
  P: phyrexianIcon,
  CHAOS: chaosIcon,
  "R/W": redwhiteIcon,
};
const colors: Record<string, string> = {
  W: "var(--card-pip-white)",
  U: "var(--card-pip-blue)",
  B: "var(--card-pip-black)",
  R: "var(--card-pip-red)",
  G: "var(--card-pip-green)",
};

function Glyph({ symbol }: { symbol: string }) {
  const asset = assets[symbol];
  if (asset) return <image href={asset} width="32" height="32" />;
  return (
    <>
      <circle
        cx="16"
        cy="16"
        r="15"
        fill="var(--card-pip-neutral)"
        stroke="var(--card-symbol-ink)"
      />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fill="var(--card-symbol-ink)"
        fontFamily="Card Mono, monospace"
        fontSize={symbol.length > 1 ? 15 : 19}
        fontWeight="700"
      >
        {symbol}
      </text>
    </>
  );
}

export function ManaSymbol({
  symbol,
  marked = false,
  order,
}: {
  symbol: string;
  marked?: boolean;
  order?: number;
}) {
  const clipId = `card-hybrid-${useId()}`;
  const Tag = marked ? "mark" : "span";
  if (!isKnownSymbol(symbol))
    return (
      <Tag
        className="symbol-unknown"
        data-unknown-symbol="true"
        style={order === undefined ? undefined : { order }}
      >{`{${symbol}}`}</Tag>
    );
  const halves = symbol.split("/");
  const hybrid = halves.length === 2 && !assets[symbol];
  const label = symbol === "T" ? "Tap" : symbol === "Q" ? "Untap" : `{${symbol}}`;
  return (
    <Tag
      className="pip"
      role="img"
      aria-label={label}
      style={order === undefined ? undefined : { order }}
    >
      <svg viewBox="-2 -2 36 36" aria-hidden="true" focusable="false">
        {hybrid ? (
          <>
            <defs>
              <clipPath id={clipId}>
                <circle cx="16" cy="16" r="15" />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
              <circle
                cx="16"
                cy="16"
                r="15"
                fill={colors[halves[1] ?? ""] ?? "var(--card-pip-neutral)"}
              />
              <path
                d="M5.4 26.6A15 15 0 0 1 26.6 5.4Z"
                fill={colors[halves[0] ?? ""] ?? "var(--card-pip-neutral)"}
              />
              <path d="M5.4 26.6 26.6 5.4" stroke="var(--card-symbol-ink)" strokeWidth=".7" />
              <g transform="translate(1 1) scale(.55)">
                <Glyph symbol={halves[0] ?? ""} />
              </g>
              <g transform="translate(13.4 13.4) scale(.55)">
                <Glyph symbol={halves[1] ?? ""} />
              </g>
            </g>
            <circle cx="16" cy="16" r="15" fill="none" stroke="var(--card-symbol-ink)" />
          </>
        ) : (
          <Glyph symbol={symbol} />
        )}
      </svg>
    </Tag>
  );
}
