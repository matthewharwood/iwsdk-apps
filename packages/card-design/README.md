# Shared card design

This package extracts the portable card studio's typography, symbols and information hierarchy for browser presentation. The studio remains unchanged. It is not an Oracle catalog, card compiler or game engine; callers provide the exact display data they are permitted to observe.

```tsx
import { CardDisplaySchema } from "@iwsdk-apps/card-design";
import { Card, HiddenCard } from "@iwsdk-apps/card-design/react";
import "@iwsdk-apps/card-design/styles.css";

const card = CardDisplaySchema.parse({
  id: "observed-object-1",
  layout: "normal",
  faceTreatment: "separate",
  faces: [{
    id: "front",
    name: "Example display",
    manaCost: null,
    typeLine: "Display fixture",
    oracleText: "Text supplied by the application adapter.",
  }],
  colorIdentity: [],
});

<Card card={card} />;
<HiddenCard />;
```

`Card` displays every supplied face. `faceTreatment: "combined"` puts secondary faces under the main rules, matching the studio's Adventure arrangement; `"separate"` produces an individual card for each face. This choice is explicit, never inferred from English text or a layout name. `CardFace` displays one already selected visible face. Face identity, current game state and user decisions remain the consuming app's responsibility.

The pure root export contains `CardDisplaySchema`, `CardFaceDisplaySchema`, their inferred types, annotation/color/rarity schemas, text tokenization utilities and `cardDesignTokens`. It imports no React, DOM, filesystem, storage or engine code. The `./react` export contains `Card`, `CardFace`, `HiddenCard`, `ColorIdentity`, `RarityMark`, `ManaSymbol` and `RulesText`. Load `./styles.css` once; it includes `./fonts.css` and `./tokens.css`. Asset subpaths are exported as `./assets/*`. Low-level symbol/text components should be inside an element with class `card-design`; the higher-level card components supply that scope themselves.

The face model retains null versus zero mana costs, exact Oracle text, symbolic power/toughness, loyalty, defense, hand/life modifiers, face colors, color indicators and printing rarity. Deck color identity is a separate card field and optional `ColorIdentity` presentation; it does not replace face colors or a printed color indicator. Tokens and references omit printing rarity. Combined secondary faces do not duplicate the main rarity marker.

Annotations are explicit reviewed data: paragraph labels and their semantic kinds, exclusive `costEnd` string offsets, exact highlight phrases, token/TABLE reminders, timing captions and badges. The schema rejects out-of-range paragraphs, cost boundaries inside symbols and stale highlights. Rendering does not detect trigger words, infer activation costs or assign strategy roles. Printed facts and editorial reminders are not executable behavior or legal-action guidance.

Brace notation is tokenized before highlights. Known pips render from local SVGs; unfamiliar notation, including unsupported three-part hybrid glyphs, stays visible as escaped text. Generic mana moves visually within adjacent mana segments without rewriting the source. Unknown symbols, punctuation, text and non-mana symbols stop reordering. Raw text never becomes HTML, a URL or a DOM attribute name.

The default card measures 240 × 336 CSS pixels, preserving the 2.5 × 3.5-inch studio proportions: 18 pt two-line title, 9.5 pt body, 17 pt stats, 8 pt reminders and 7.5 pt utility text. Only measured body overflow reduces body/icon size, to a 7 pt floor. If full text still cannot fit, browser cards expand and expose `data-fit="expanded"`; they do not clip rules. `fixed={false}` skips fitting and lets the card grow. `outlineTitle` applies only to the main title. Override `--card-width` / `--card-height` on the `card-design` scope when an inspector needs different dimensions.

The layout effect waits for fonts, measures highlight rectangles and phase anchors, and cleans up its ResizeObserver, font listener and animation frame. It is safe to unmount/remount under StrictMode. The five-stop timing diagram is an explicitly captioned reading aid, not the live phase/priority display.

Run from the repository after its dependency installation:

```sh
bun run --cwd packages/card-design typecheck
bun run --cwd packages/card-design test:unit
bun run --cwd packages/card-design test:browser
```

The browser proof exercises the real package in Chromium and saves `test-results/card-proof.png`. It uses Node's native TypeScript support for the Vite test server. `src/react.stories.tsx` provides companion Storybook states, included by the web app's Storybook configuration. `./fixtures` exports the explicitly archived `cardProofFixtures` and `cardProofSources` consumed by the web app's `/cards` route. These demonstrate appearance only, not current Oracle facts, certified Commander behavior or visibility policy. See [attribution](THIRD-PARTY.md) and [design audit](../../docs/commander/card-design-audit.md).

SVGs use static asset imports so Vite supplies consistent browser and prerender URLs. Do not replace these with `new URL(relativePath, import.meta.url)` in server-rendered components: the SSR module can resolve a filesystem URL, leaving stale broken attributes after hydration. The production route regression verifies that every rendered symbol image decodes.
