# Card design extraction audit

The user requires the studio's typography, card information architecture and design system in shared packages consumed by `apps/web/app`. The studio itself remains an unchanged reference, not the application entrypoint. This audit covered its instructions, design assets, schema, renderer, formatting helpers, importer/layout limitations, examples and existing verification reports, plus all three `docs/_temp` specifications.

The specifications define the headless engine and its evidence gates. Their frontend exclusion is a workstream boundary, not permission to ignore the user's explicit additional presentation request. The package implemented from this audit keeps that separation: `packages/card-design` is independent of the Commander runtime, and the runtime need not import it. A future app adapter consumes `PlayerObservation`, `DecisionRequest` and permitted catalog facts.

## Source of the design

The current contract is [studio AGENTS.md](../../apps/printable-card-studio/AGENTS.md), [theme.css](../../apps/printable-card-studio/design/theme.css), [cards.css](../../apps/printable-card-studio/design/cards.css), [ASSETS.md](../../apps/printable-card-studio/design/ASSETS.md) and the supplied normal/outline proof images. The older provenance paragraph in the studio's THIRD-PARTY.md describes adaptive 14–18 pt titles and 7–12 pt body text; that paragraph is stale. The current implementation reserves exactly two 18 pt title lines and begins body text at 9.5 pt.

| Element | Preserved contract |
| --- | --- |
| Base | Plain white card and margins; black body; 5:7 card aspect; square thin gray border |
| Primary font | Bundled Roboto Condensed variable normal and italic, aliased Card Sans |
| Technical font | JetBrains Mono Thin 100, Regular 400 and Bold 700, aliased Card Mono |
| Title | Two reserved 18 pt lines, weight 700, line-height 1.05, tracking −0.04 em, descender clearance |
| Body | 9.5 pt initial size, line-height 1.2; measured fitting only, 7 pt floor |
| Stats | 17 pt mono 700; only the P/T slash uses mono 100 |
| Supporting text | 8 pt italic reminders, 7.5 pt utilities, 7 pt labels/type |
| Trigger | Muted teal `#2e655e`; replacement/neutral labels remain gray |
| Activation | Blue `#2d6093`, weight 400; punctuation and branch `#999999` |
| TABLE | Plum `#6e5269` labels and divider, with full supplied scope/conditions |
| Highlight | Neutral gray `#e0e0e0`, measured behind foreground text and SVGs |
| Mana fills | White `#ebe3c7`, blue `#96b8c8`, black `#b0b0b0`, red `#ce8978`, green `#9bb49a`, neutral `#f2f2f2` |
| Rarity | One printing-specific main type-line mark; triangles for common/uncommon/rare/mythic, neutral ovals for special/bonus |

The hierarchy is title, mana/context badge, type/color indicator/rarity, complete rules, optional combined secondary face, token/TABLE utilities, then timing/stats. No artwork, flavor text, set decoration or repeated title/stats strip is introduced. Generic mana moves visually to the end of its adjacent mana segment while source order remains intact. `{C}` stays colorless rather than generic; tap, untap, energy, unknown notation and text prevent cross-segment reordering.

## Fonts, symbols and source status

All five font hashes matched the source ASSETS.md. Both OFL notices are copied with the fonts; the 13 SVGs parse as XML with `0 0 32 32` viewBoxes. Original asset bytes are preserved. PP Editorial Sans is proprietary and absent from the source; the implementation uses the portable reference fonts, not a guessed replacement for a missing private font. No artwork was downloaded.

The two supplied normal/outline proof PNGs were inspected. The archived nine-card proof covers dense text, long names, token/TABLE strips, timing, stats, pips and highlights. Additional examples cover Bofur's combined Adventure, Slicer/Witch Enchanter reverse faces, Thopter, a copy template and Ring reference. Archived source wording is retained only as explicitly labeled display fixtures. It is not a current card catalog or evidence that a card executes in the engine. Historical studio verification reports are not claimed as newly executed checks.

## Refactoring boundaries

One coherent package, `@iwsdk-apps/card-design`, owns pure display contracts and tokenization at its root export, React components under `./react`, scoped CSS tokens/styles, local fonts and SVG assets. It depends on Zod for boundary parsing and React for the optional component entrypoint. It has no catalog acquisition, rules compiler, SQLite, Jotai, worker, IWSDK or network dependency.

The studio's `html.ts` combines reusable markup with Bun/Node file reads and font embedding. Its PDF renderer, import commands, physical sheet grouping, cut guides, print preview toolbar, deck-count/review gates and CLI dependencies stay outside the shared package. Shared styles have no global page/body/mark selectors or 3×3 sheet layout.

The source `fit.js` installs document-wide listeners and a MutationObserver without teardown. The extracted layout effect is card-scoped, waits for fonts, measures highlight fragments/phase anchors, and disposes listeners, ResizeObserver and pending frames on cleanup. Fixed cards retain the original size and fitting hierarchy. Browser cards that still cannot fit at 7 pt expand rather than hiding rules; `data-fit="expanded"` makes that state inspectable. This is an intentional browser adaptation, not a claim of print-fit parity for every possible card.

The source hybrid renderer uses render-time random clip IDs. React uses stable `useId` clip references. Raw text never becomes HTML. Unsupported symbol notation remains visible escaped text, including within highlighted text; it cannot disappear through an unrecognized icon or become injected markup.

The studio's trigger/activation/Winota helpers are presentation heuristics, not Commander rules. They were not imported. Annotations must be explicitly supplied by a reviewed source/compiler adapter. Cost boundaries reference existing paragraph offsets, cannot split symbols, and never delete source text. Highlights must already exist in supplied rules/reminders. Timing remains a captioned schematic reminder rather than an engine turn diagram.

## Model and application integration

`CardDisplaySchema` separates card ID, explicit face composition, all faces, kind, layout label and deck color identity. Each face carries a distinct ID, name, nullable mana cost, type line, exact `oracleText`, optional symbolic power/toughness, loyalty, defense, hand/life modifiers, face colors, color indicator, printing rarity and explicit annotations. Missing cost is not zero. Printing rarity is not strength; card color identity is not current color.

The shared package does not adopt the studio's print-copy identity or flatten the engine into its limited `PrintFace` schema. Its original importer only knows selected two-face treatments and explicitly rejects other layouts. `Card` instead displays every supplied face, with combined/separate composition chosen by the adapter. This preserves data without pretending that display composition implements split, meld, transform, copy or face-down game rules.

`apps/web/app` owns zones, card selection, inspection, legal choices, live state and presentation of changed characteristics. It should map only the player's allowed observation to these props. Printed facts should remain distinguishable from current power/toughness, controller, counters and effects. `HiddenCard` deliberately accepts no card identity or face object. A hidden-information test must also verify that the application does not leak names through surrounding attributes, ARIA text, candidate IDs or sorting.

The exact studio face is the full inspection view. A compact table/hand view may use the same type and colors while exposing complete rules through inspection. Selection/targeting/pending feedback belongs to app chrome; semantic card colors retain their documented meanings. Actions originate from `DecisionRequest` and are validated against decision ID, actor and revision. Clicking a card must not infer a cast/activate operation from its text.

The web app now consumes the shared package at `/cards`. The route adopts the studio's typography and white/black palette, provides search, piece filtering, outline titles and source links, and keeps all supplied faces together. Search/filter/outline state is validated in URL search parameters and survives deep-link refresh. The route clearly identifies the bounded archived collection as a display preview, not a Commander game. It imports neither a full local release archive nor the engine database.

Navigation links connect this preview to the existing XR token example at `/`. The original XR example remains operational; existing global footer selectors were scoped to its app shell so they cannot restyle shared card footers. The library's initial load creates no game worker or SQLite connection.

Production integration exposed an asset issue that a client-only proof could not: relative `new URL(..., import.meta.url)` produced filesystem URLs during prerender and different browser URLs during hydration. Static SVG imports now produce matching built URLs. The route regression rejects filesystem image URLs, verifies actual image decoding and fails on hydration/console errors. One archived Winota source link was also corrected from the studio's cached Scryfall record, without editing the studio or its wording; attribution records the correction.

## Verification

The package includes pure/SSR tests for missing versus zero costs, symbolic characteristics, explicit annotation boundaries, source-preserving mana order, malicious/unknown brace content, highlighted symbols, deterministic hybrid clip IDs, multi-face preservation, rarity and hidden-card markup. Companion Storybook stories cover normal, outline, all proof faces, unfamiliar notation, dense text and hidden cards.

The isolated Chromium proof loads real local fonts and SVG assets, checks card dimensions/type sizes, highlights and phase anchors, exercises StrictMode unmount/remount cleanup, verifies safe unfamiliar text and full dense rules, and writes `packages/card-design/test-results/card-proof.png`. Run it with `bun run --cwd packages/card-design test:browser`. This verifies browser presentation, not rules correctness, PDF production, physical printing or headset rendering.

Type and style gates are `bun run --cwd packages/card-design typecheck`, `bun run --cwd packages/card-design test:unit`, Biome, focused SonarJS and Stylelint over package CSS. The root app should include the package story glob and CSS path in its existing quality tooling when it consumes the package.

Executed evidence for this extraction: 12 unit/SSR tests with 97 assertions; package and web app type checks; Biome, SonarJS and Stylelint over owned TS/TSX and all three package CSS files; a real Chromium proof with 19 faces, loaded normal/italic/mono fonts, checked type sizes and observer ownership 19 → 0 → 19 under StrictMode; and a production build prerendering `/` and `/cards`. The two route regressions cover filters, full Adventure faces, outline state, refresh, symbol decoding and same-document navigation back to a ready 15-token XR scene. Browser screenshots are `packages/card-design/test-results/card-proof.png` and `apps/web/test-results/card-library.png`.
