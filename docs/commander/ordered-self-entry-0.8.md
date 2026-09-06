# Four ordered self-entry programs (engine 0.8)

This increment admits Cloudblazer, Elite Guardmage, Inspiring Overseer and Priest of Ancient Lore. Each captured mandatory ability gains the printed amount of life and then draws the printed number of cards. The complete ability finishes before state-based checks or another priority decision. Individual draws retain their library order and private identities.

| Source card | Ordered instructions | Other complete ability |
| --- | --- | --- |
| Cloudblazer | Gain 2 life; draw 2 cards individually | Flying |
| Elite Guardmage | Gain 3 life; draw 1 | Flying |
| Inspiring Overseer | Gain 1 life; draw 1 | Flying |
| Priest of Ancient Lore | Gain 1 life; draw 1 | None |

## Source admission and versions

The compiler accepts exactly the four authenticated identity/version tuples from `source-etb-sequence-binding-review.json`. It checks the complete body, ordinary layout, type, cost, statistics, colors, keyword set, archive identity, ordinal and reviewed source bundle. It does not interpret English in the engine or admit other records merely because they contain the same life-gain/draw clause.

The compilation rehashed the complete compressed Oracle archive `ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274`, verified the four decompressed record byte spans and raw hashes, and recomputed the four normalized catalog payload hashes. It uses source bundle `6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df` and Comprehensive Rules `4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f`.

`commander-trigger/1` remains unchanged for prior single-effect definitions. The additive `commander-trigger/2` schema stores an ordered `effects` array; `selfEntryEffects` reads either representation without rewriting historical definitions. Engine ABI is `commander-engine/0.8.0`, the exact constructor is `self-entry-sequence-four/1`, compiler version is `commander-development-compiler/3`, and prepared plans use `development-match-plan/3` with explicit ordered-effect and individual-draw capabilities. Prepared admission reconstructs the complete reviewed program, preserves its digest, and rejects changed order, amounts, keywords or mana cost.

The resulting release is `d8f3ff94446ec9ecfe4c037e4a3fe7c4397626b16da87b27f66771397de0c403`: **761 definitions, exactly four additions, and all prior 757 definition bodies canonical-byte-equivalent**. Release and prepared hashes change because they include the current ABI and recipe evidence. Old artifacts remain distinct.

A twentieth source-backed deck profile, WU ordered-entry, includes all four new cards. The compiler also retains the existing nineteen profiles and verifies their 100-card construction and commander color identity. The seven researched exclusions—Bookwurm, Mulldrifter, Hero in Training, Disciple of Bolas, Tataru Taru, Dovin’s Acuity and Invasion of Dominaria—remain explicitly unsupported in the actual compilation report.

## Executed scenario checks

The focused gate passed 184 tests and 2,296 assertions across contracts, card programs, compiler, engine, native storage and simulation. The new engine scenarios account for twelve tests and 106 assertions. Their expectations were authored before implementation in `source-etb-sequence-scenarios.json`, hash `f28319410c8fba4172ceb17409810a60776f4c6e5dffba06cf6c3fbf54bcca07`.

The scenarios cast all four source definitions through ordinary casting/payment/priority transitions on explicitly constructed unit boards. They verify written instruction order, separate individual draws, private card identities, whole-ability completion, source removal and captured controller. Partial and empty libraries produce the printed life gain, available draws, failed draw events, ability completion and then player elimination in that order. A separately named synthetic reverse-order program proves that a failed draw does not suppress a later life-gain instruction before the checkpoint. Synthetic simultaneous-entry scenarios verify whole-ability ordering and APNAP without interleaving instructions.

Those constructed unit preconditions are not presented as ordinary source-backed game transcripts. A scenario review table in `.commander/prototypes/engine-0.8/.draft-artifacts/scenario-review-sequences-v0.8.json` records exactly which expectations were exercised and preserves the unexecuted ones. Optional choices, draw/life observers, replacement effects and continuous prohibitions remain outside this increment.

## Native game evidence

The ordinary source-backed native proof passed on the first retained seed for each mode. Both matches started with legal source-backed decks and ordinary setup, captured an ordered ability through actual casting, reopened the pending state from native SQLite, retried the preceding durable command exactly, and imported a logical save into a separate SQLite database. Each imported continuation matched every original accepted-command boundary. Both final states passed full replay.

| Mode / game seed | Accepted commands / boundaries | Pending ordered ability revision | Actual registry / full source | Ordered source program resolved |
| --- | --- | --- | --- | --- |
| Two seats / 8301 | 721 / 722 | 629 | 120 / 761 | Inspiring Overseer, once |
| Four seats / 8501 | 1,547 / 1,548 | 386 | 184 / 761 | Priest of Ancient Lore, once |

Cloudblazer and Elite Guardmage were included in the legal WU deck but did not resolve in these two ordinary games; their execution evidence is the explicit source-bound unit cast scenarios. All four bodies remain distinct in the coverage accounting.

The retained directory is `.commander/prototypes/engine-0.8/.draft-artifacts/native-sequences-proof/2026-09-06T21-15-32-236Z/`. It contains actual SQLite databases, imported databases, exact manifests and prepared artifacts, source bytes, pending logical saves and all boundary hashes. The compact index is `.commander/prototypes/engine-0.8/.draft-artifacts/native-sequences-summary-v0.8.json`. The proof source hash is `200acb9f72021fafb816522e82ec3c21d27cc46f0fea8266edf247f6cdd9d60e`; its end-of-run source guard was empty. Two-seat final hash is `864fde73836b45ad4d5352eeb8abbb55707be2e006c979806411e18bd3bd7ea5`; four-seat final hash is `8737bd0ae73f8ea44877d996b396ebb8eb4a8c059ae4d54da30fd63bc03b662a`.

After that frozen native proof, only the terminal presentation was migrated to display the ordered effects list (`terminal-observation/4`). The existing terminal, batch and regression suite passed 24 tests and 1,167 assertions, with the CLI typecheck passing. This presentation change did not change the rules engine used by the proof. The separate browser/OPFS run captured its own sources; its result follows.

## Browser SQLite OPFS parity

The separate real-browser proof passed using Chromium 149.0.7827.55, a dedicated browser worker, and official SQLite WASM 3.53.0-build1 with OPFS. The release and two/four-seat seeds were the same as above; match IDs differ between the independent native and browser-proof harnesses, so their state hashes differ as expected. Within the browser-proof harness, all 722 and 1,548 native/browser boundaries matched exactly.

Both modes performed full document reloads at the undealt starting-player choice, a payment decision (revisions 133 / 219), and an actual pending ordered ability (629 / 386). Durable retries returned the original receipts. The browser imported the pending ordered-ability save into a separate OPFS namespace, completed the game, and verified the same complete boundary sequence and replayed final state. A second tab was rejected with `AlreadyOpen`. Secure context, OPFS availability and Web Locks were observed in the actual worker. No browser errors or source changes occurred during the successful run.

The retained directory is `.commander/prototypes/engine-0.8/.commander/browser-proof/2026-09-06T21-21-29-879Z-4c355379/`; its evidence source hash is `5c45cbbde1bc81269489bfd4a64c454f181a14119bbb428717a5960fabce8115`, and worker bundle hash is `c3d315b154a882e503c69e5c5e3923a470a301d25142af1f9247cfb3b718e521`. The earlier sandbox loopback-server startup failure is retained in `.commander/prototypes/engine-0.8/.draft-artifacts/browser-sequences-proof.log`; it did not execute a match. The successful approved local-server run is logged in `.commander/prototypes/engine-0.8/.draft-artifacts/browser-sequences-proof-retry.log`.

Reproduce the successful proof from the repository root using the archived inputs:

```sh
bun packages/storage/browser-proof/check.ts --release .commander/prototypes/engine-0.8/.draft-artifacts/release-sequences-v0.8.json --decks .commander/prototypes/engine-0.8/.draft-artifacts/browser-decks-sequences-v0.8.json --deck-stride 1 --require-ordered-triggers --two-seed 8301 --four-seed 8501 --seed-attempts 2 --resolver prepared-indexed
```

This is browser persistence and deterministic rules evidence. It does not establish physical-headset behavior, optional trigger choices, general observers or full card-pool semantics.

## Main workspace promotion

The bounded 0.8 files were promoted without replacing the independent scenario CLI changes or the printable card studio. Recompilation against the existing `catalog-v2.sqlite` reproduced the exact release hash and all twenty deck fixtures. The previous development aliases and untouched original prototype sources are retained under `.commander/prototypes/engine-0.8/`; file hashes are listed in `archive-inventory.json` there. Version 0.7 release files remain available.

The promoted workspace passed 217 focused tests with 3,504 assertions across contracts, card programs, compiler, engine, storage, simulation and CLI. All seven corresponding type checks and the focused Biome/ESLint checks passed. The main result is retained as `.commander/prototypes/engine-0.8/main-focused-unit.junit.xml`; the full application/server gate is separate from this promotion check.
