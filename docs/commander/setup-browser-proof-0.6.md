# Pre-deal setup browser proof: engine 0.6

The [retained browser evidence](../../.commander/browser-proof/2026-09-06T20-45-06-454Z-2ff24a73/evidence.json) passed with engine `commander-engine/0.6.0`, driver `observed-combat/4`, Bun `1.3.11`, Chromium `149.0.7827.55`, and SQLite WASM `3.53.0-build1`. Both games used actual `opfs-sahpool` storage in a dedicated browser worker and the `prepared-indexed` execution registry.

Before dealing any cards, each game persisted revision 0 with a pending `starting-player` choice. The assertions verified zero physical objects, empty hands/libraries/graveyards, null starting/active/priority players, and a decision visible only to the selected chooser. Closing SQLite and reloading the full document and worker restored that exact state. An exported revision-0 save imported into a new OPFS namespace and continued through the same complete game.

No receipt exists before the first accepted command. After the driver explicitly selected the starting player, the command had one durable receipt at revision 1. Retrying that original choice after subsequent target/payment reloads returned the same receipt without changing state or dealing again. Native, browser, and imported histories each contained exactly one accepted starting-player choice.

| Match | Game / driver seed | Chooser → chosen starter | Actual registry / full source | Reload revisions: start / target / payment | Final revision / compared boundaries | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| Two seats | 1901 / 1918 | P2 → P2 | 124 / 697 | 0 / 395 / 396 | 574 / 575 | P2 won on turn 27 |
| Four seats | 2901 / 2918 | P1 → P1 | 175 / 697 | 0 / 290 / 291 | 1911 / 1912 | P4 won on turn 47 |

Every committed boundary hash matched native, browser, and imported execution. The initial logical saves were 90,643 and 124,581 bytes. Both first seed attempts qualified; no further seed attempts were needed. The run recorded ten actual WASM fetches, no browser page/request failures, and no changes to captured source bytes during execution.

The native [SQLite JUnit report](../../.commander/browser-proof/2026-09-06T20-45-06-454Z-2ff24a73/storage-unit.junit.xml) separately covers 23 tests and 285 assertions. Its setup fixtures test both seat counts and both full/prepared execution, including choosing a player other than the chooser. Wrong-owner, unknown-seat, and stale choices preserve the undealt state. Real SQLite failure injection at boundary insertion, checkpoint update, and commit also preserves that state and its random cursor; a later successful retry deals once. These are isolated unit fixtures, separate from the source-backed browser games above.

## Source and scope

The source bundle remains `ba729f4152706f845504430574c8bfcc2ae6ea91380182c80d6055d24b50edd9`. Compilation for ABI 0.6 preserved the same 697 card definitions as 0.5, with canonical definition digest `83e3d83a1484ba8d2abc6f63b2acf9cfb6f5820541ce980ce4361fd654983844`. All 17 generated 100-card decks passed admission. The proof selected the same rich WU/BR and WU/BR/GW/WU deck arrangements as the earlier prepared proof.

The two-seat game resolved four noncreature spells, including an actual destruction from **Fell**. The four-seat game resolved 18, including an actual destruction from **Murder**. Across the games, 20 distinct spell programs resolved; 35 available programs did not. No exile event was observed. The executed instruction families were damage, destroy, draw, and gain-life.

These results prove these selected setup, persistence, and deterministic execution paths within the development subset. They do not establish full-pool card correctness, other browser engines, process-crash recovery, or physical WebXR behavior. Earlier 0.5 and 0.3 evidence remains tied to its original engine and source snapshots.

```sh
bun run --cwd packages/storage test:browser-parity \
  --release .commander/release-v0.6-draft.json \
  --decks .commander/decks-v0.6-draft.json \
  --deck-offset 14 --deck-stride 1 \
  --resolver prepared-indexed --require-removal
```

| Artifact | SHA-256 / semantic digest |
| --- | --- |
| Source release | `dd089c903f133756f1f56e4da48233f4350f0a4c25db5c9336909ff33de68693` |
| Captured source mapping | `06ded1e3ae386febfd08f593c0b9384ddccd47c75e332ab8b846eed66b1278fe` |
| Browser worker | `98ad108a8f898a8fea4604594105beda6cb1c1782e16cc40340dc6374ba66964` |
| Two-seat prepared artifact | `204995dfb28145fc782d819a850ab878ee70c0dc6a0aed4260e3e7b1df71efe3` |
| Four-seat prepared artifact | `de3bf3d39215de7bd072297ef62cb8dea238179649cbfa81c594a9802b78d740` |
| Two-seat final state | `3829307677b0b11d2fa1e581fcae050ec63d2ffc9454826875edc4036ce09476` |
| Four-seat final state | `9b2f128ba5ffb4e04aa7c3e82af27688e7f2daa50ec1b74ce6cba68dd5e78fee` |
