# Design provenance and assets

The design and display fixtures were extracted from this repository's unchanged `apps/printable-card-studio` reference. The font files and 13 locally drawn SVG source files are byte-for-byte copies. No Scryfall artwork, font CDN or proprietary font files are included.

Roboto Condensed normal/italic variable fonts and JetBrains Mono Thin 100, Regular 400 and Bold 700 retain their supplied SIL Open Font License 1.1 notices in `assets/fonts/OFL-RobotoCondensed.txt` and `assets/fonts/OFL-JetBrainsMono.txt`. Preserve these notices with redistributed assets. Font provenance is recorded in the studio's `design/ASSETS.md`: Roboto Condensed comes from the Google Fonts repository; JetBrains Mono Regular/Bold are v2.211 files and Thin is the official v2.304 file. This package does not normalize those versions or substitute different glyph metrics.

Verified SHA-256 values:

| Asset | SHA-256 |
| --- | --- |
| JetBrainsMono-Thin.woff2 | `01c7c4cd01380e75fb1b5ff9900508afcd89a83d0b0e6f70e96ede53183ab53a` |
| JetBrainsMono-Regular.woff2 | `14425ba9c695763c1547f48a206b7aa60350a33ae23de09f0407877f3fcd89eb` |
| JetBrainsMono-Bold.woff2 | `d0d4e818808f2a0ba39b2b09d1989366f63494e295f003c7ef436697378507e8` |
| RobotoCondensed.ttf | `dace262afcee68a5276f200d8026c57221735c0118ab5fda8c2c0d3dc409a8d0` |
| RobotoCondensed-Italic.ttf | `78f643b1923008b00dfc9b371a2ecd4d80a017722925f1a3fac9940be56d1b7d` |

The original privately licensed PP Editorial Sans is deliberately absent. The shared browser design uses the actual bundled portable fonts. A local proprietary font configuration would not confer redistribution rights.

The studio describes its SVGs as original editable functional symbols rather than copied card artwork. Their 32 × 32 viewBoxes and accessible source titles are preserved. Generated browser hybrids use those assets and scoped clipping.

Magic: The Gathering card names and game information remain their respective rights holders' materials. The archived proof fixtures retain the studio's display wording, which can be a concise editorial summary. They are not a fresh Oracle snapshot, licensed artwork, an endorsement, or executable card definitions. Their original research/source references remain in `apps/printable-card-studio/examples/gameplay-proof.json` and `examples/winota.json`. A production catalog must retain its own exact versioned sources and permissions independently of this presentation package.

The Winota proof's sole supplied reference pointed to an unrelated release-notes page. Its primary browser source link was corrected using that card's Scryfall URI in the studio's existing `research/scryfall-snapshot.json`; the original listed reference is retained in `src/proof-sources.json` for audit. The studio and its source data were not edited.
