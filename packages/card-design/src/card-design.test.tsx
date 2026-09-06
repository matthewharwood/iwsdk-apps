import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { cardProofFixtures } from "./fixtures";
import { CardDisplaySchema, CardFaceDisplaySchema } from "./model";
import { Card, CardFace, HiddenCard, RulesText } from "./react";
import { isKnownSymbol, manaDisplayOrder, tokenizeCardText } from "./text";
import { cardDesignTokens } from "./tokens";

const face = CardFaceDisplaySchema.parse({
  id: "test-front",
  name: "Display fixture",
  manaCost: null,
  typeLine: "Artifact",
  oracleText: "Pay {2}, {T}: Draw a card.",
});

test("pure palette tokens match the scoped CSS used by the browser", async () => {
  const css = await Bun.file(new URL("../tokens.css", import.meta.url)).text();
  const normalized = (value: string) =>
    value.length === 4 ? `#${[...value.slice(1)].map((digit) => digit + digit).join("")}` : value;
  for (const [key, color] of Object.entries(cardDesignTokens.colors)) {
    const variable = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const value = new RegExp(`--card-${variable}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
    expect(value).toBeDefined();
    expect(normalized(value ?? "")).toBe(normalized(color));
  }
});

describe("explicit display contracts", () => {
  test("preserves absent costs, zero costs, symbolic stats, hand and life modifiers", () => {
    const parsed = CardFaceDisplaySchema.parse({
      ...face,
      power: "*",
      toughness: "1+*",
      loyalty: "X",
      handModifier: "+2",
      lifeModifier: "-5",
    });
    expect(parsed.manaCost).toBeNull();
    expect(CardFaceDisplaySchema.parse({ ...parsed, manaCost: "{0}" }).manaCost).toBe("{0}");
    const html = renderToStaticMarkup(<CardFace face={parsed} />);
    expect(html).toContain("Printed power *, toughness 1+*");
    expect(html).toContain("Loyalty X");
    expect(html).toContain("Hand +2");
    expect(html).toContain("Life -5");
  });
  test("does not classify rules without explicit annotations", () => {
    const html = renderToStaticMarkup(<CardFace face={face} />);
    expect(html).not.toContain('class="ability-cost"');
    expect(html).not.toContain('class="trigger-label"');
  });
  test("validates supplied paragraph, cost boundary and exact highlight", () => {
    for (const annotations of [
      { abilities: [{ paragraph: 4 }] },
      { abilities: [{ paragraph: 0, costEnd: 6 }] },
      { abilities: [{ paragraph: 0, costEnd: 100 }] },
      { highlights: ["absent phrase"] },
    ]) {
      expect(CardFaceDisplaySchema.safeParse({ ...face, annotations }).success).toBe(false);
    }
    const annotated = CardFaceDisplaySchema.parse({
      ...face,
      annotations: { abilities: [{ paragraph: 0, costEnd: 12 }], highlights: ["Draw a card"] },
    });
    const html = renderToStaticMarkup(<CardFace face={annotated} />);
    expect(html).toContain('class="ability-cost"');
    expect(html).toContain("<mark>Draw a card</mark>");
  });
});

describe("symbols preserve source and untrusted text", () => {
  test("visually reorders only adjacent mana segments and leaves source untouched", () => {
    expect(manaDisplayOrder(["2", "W", "T", "1", "U", "C", "R/W"])).toEqual([1, 0, 2, 6, 3, 4, 5]);
    const input = "{2}{W}, {3}{U}{T}{1}{R}";
    const parts = tokenizeCardText(input);
    expect(
      parts
        .filter((part) => part.kind === "symbols")
        .flatMap((part) => part.symbols.map((symbol) => symbol.raw)),
    ).toEqual(["{2}", "{W}", "{3}", "{U}", "{T}", "{1}", "{R}"]);
    for (const part of parts) {
      if (part.kind === "symbols") {
        for (const symbol of part.symbols)
          expect(input.slice(symbol.start, symbol.end)).toBe(symbol.raw);
      }
    }
  });
  test("unknown symbols and markup remain visible escaped text even inside highlights", () => {
    const text = 'Gain {FUTURE} and {<img src=x onerror="alert(1)">}; <script>alert(1)</script>.';
    const html = renderToStaticMarkup(
      <RulesText text={text} highlights={["FUTURE", '<img src=x onerror="alert(1)">']} />,
    );
    expect(html).toContain("{FUTURE}");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(isKnownSymbol("<svg/onload=alert(1)>")).toBe(false);
    expect(isKnownSymbol("W/U/P")).toBe(false);
  });
  test("highlighting inside a symbol cannot split or conceal the symbol", () => {
    const html = renderToStaticMarkup(
      <RulesText text="Pay {R/W}{2}{T}." highlights={["R", "2"]} />,
    );
    expect(html).toContain('aria-label="{R/W}"');
    expect(html).toContain('aria-label="{2}"');
    expect(html).toContain('aria-label="Tap"');
    expect((html.match(/class="pip"/g) ?? []).length).toBe(3);
  });
  test("hybrid clip references are unique and deterministic across equivalent server renders", () => {
    const render = () => renderToStaticMarkup(<RulesText text="{W/U}{W/U}{B/P}" />);
    const html = render();
    const ids = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(render()).toBe(html);
    for (const id of ids) expect(html).toContain(`url(#${id})`);
  });
  test("highlight fragments do not turn an internal word hyphen into cost punctuation", () => {
    const annotated = CardFaceDisplaySchema.parse({
      ...face,
      oracleText: "Power-up — Pay {2}: Draw a card.",
      annotations: { abilities: [{ paragraph: 0, costEnd: 18 }], highlights: ["-"] },
    });
    const html = renderToStaticMarkup(<CardFace face={annotated} />);
    expect(html).toContain("Power<mark>-</mark>up");
    expect(html).not.toContain('class="ability-punctuation">-</span>');
    expect(html).toContain('class="ability-punctuation">—</span>');
  });
});

describe("all supplied faces and visibility", () => {
  test("combined and separate faces retain both rules and appropriate rarity", () => {
    const back = {
      ...face,
      id: "back",
      name: "Second face",
      oracleText: "Complete second face text.",
      rarity: "rare" as const,
    };
    for (const treatment of ["combined", "separate"] as const) {
      const card = CardDisplaySchema.parse({
        id: "test",
        layout: "provided",
        faceTreatment: treatment,
        faces: [{ ...face, rarity: "rare" }, back],
      });
      const html = renderToStaticMarkup(<Card card={card} />);
      expect(html).toContain("Complete second face text.");
      expect((html.match(/class="rarity-mark"/g) ?? []).length).toBe(
        treatment === "combined" ? 1 : 2,
      );
    }
  });
  test("token faces omit printing rarity and hidden cards carry no source attributes", () => {
    expect(
      renderToStaticMarkup(<CardFace kind="token" face={{ ...face, rarity: "rare" }} />),
    ).not.toContain("rarity-mark");
    const hidden = renderToStaticMarkup(<HiddenCard />);
    expect(hidden).toContain("Hidden card");
    expect(hidden).not.toContain("data-face-id");
    expect(hidden).not.toContain(face.name);
    expect(hidden).not.toContain("rules");
  });
  test("archived studio fixtures include Adventure, reverse, token and reference states", () => {
    expect(
      cardProofFixtures.some(
        (card) => card.faceTreatment === "combined" && card.faces.length === 2,
      ),
    ).toBe(true);
    expect(
      cardProofFixtures.some(
        (card) => card.faceTreatment === "separate" && card.faces.length === 2,
      ),
    ).toBe(true);
    expect(cardProofFixtures.some((card) => card.kind === "token")).toBe(true);
    expect(cardProofFixtures.some((card) => card.kind === "reference")).toBe(true);
    for (const card of cardProofFixtures)
      expect(renderToStaticMarkup(<Card card={card} />)).toContain("print-card");
  });
});
