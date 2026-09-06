# Prepared registry browser proof: engine 0.5

The [retained execution evidence](../../.commander/browser-proof/2026-09-06T20-31-45-735Z-0c666d37/evidence.json) records a passing native/browser proof on September 6, 2026. Both complete development-subset games ran with `prepared-indexed`, using an actual reduced definition registry in Bun and a dedicated Chromium worker. The worker used SQLite WASM `3.53.0-build1`, the `opfs-sahpool` VFS, and real OPFS storage.

This run used `commander-engine/0.5.0`, `observed-combat/3`, Bun `1.3.11`, and Chromium `149.0.7827.55`. Its complete authenticated source release contained **697 definitions**; that is the compiled development subset, not the full eligible Commander pool.

| Match | Game / driver seed | Actual retained / source definitions | Excluded definitions | Target / payment reload revision | Final revision / compared boundaries | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| Two seats | 1902 / 1919 | 124 / 697 | 573 | 83 / 84 | 1651 / 1652 | P1 won on turn 65 |
| Four seats | 2901 / 2918 | 175 / 697 | 522 | 289 / 290 | 2346 / 2347 | P4 won on turn 58 |

The native and browser coordinators reported their actual private registry sizes and both independent pins. Each match restored the exact pending target decision and payment decision after closing its SQLite connection and reloading the document and worker. Reopening used the artifact persisted in SQLite; it did not receive a replacement artifact from the host. Durable retries returned the original receipts. Importing each target-choice save into a fresh OPFS namespace and completing it reproduced every native/browser boundary hash. A competing worker was refused with `AlreadyOpen`.

The run recorded no browser page/request failures, eight real SQLite WASM fetches, and no changes to captured production source files during execution. Target-choice logical exports were 333,213 bytes for two seats and 725,078 bytes for four seats. Native databases, prepared artifacts, manifests, pending exports, the worker bundle, source snapshot, and every attempted seed remain together in the evidence directory.

## Observed spell behavior and limits

The selected two-seat game resolved 20 noncreature spells and actually destroyed a creature with **Bilbo's Deadly Slice**. The selected four-seat game resolved 21 noncreature spells and actually destroyed a creature with **Murder**. These removal counts come from `CreatureDestroyed` events associated with a successfully resolved typed spell, not from spell presence in a deck or an attempted destruction of an indestructible creature.

Together the selected browser games resolved 30 distinct spell programs from the 55 programs in their selected deck collection. The observed instruction families were damage, destroy, draw, and gain-life. **No exile event occurred in these selected games**, and 25 available spell programs were not observed resolving. The separate rule-unit tests cover exile; this browser proof does not promote that unit coverage into observed full-game coverage.

The earlier two-seat native seed 1901 completed at revision 583 but lacked the required removal workflow. Its full history and `missing-required-workflow` classification are retained. No actual engine, driver, or command-budget failure was discarded by the seed search.

This proof establishes persistence and deterministic parity for these two selected executions. It does not establish full-pool implementation, every admitted card's correctness, physical WebXR behavior, other browser engines, or browser-process crash recovery. Engine 0.5 also predates the separate player-owned starting-player choice increment; its historical evidence must remain associated with its exact source snapshot and engine version.

## Exact invocation and pins

The command below produced this run on the frozen 0.5 source. Future engine builds require a matching release ABI; this is a historical invocation, not an instruction to reinterpret these saves under another engine version.

```sh
bun run --cwd packages/storage test:browser-parity \
  --release .commander/release-v0.5-draft.json \
  --decks .commander/decks-v0.5-draft.json \
  --deck-offset 14 --deck-stride 1 \
  --resolver prepared-indexed --require-removal
```

The zero-based deck slice selected WU Tobias Andrion and BR Lady Orca for two seats; four seats used WU Tobias Andrion, BR Lady Orca, GW Jasmine Boreal, and WU Tobias Andrion. Every deck contains 100 cards and 39 basic lands. The separate content-compilation reports provide their admission evidence.

| Artifact | SHA-256 / semantic digest |
| --- | --- |
| Full source release | `4d3a8ebbc31a366a28d9e7ab4392d8843c55d315f07b1e265fd886bf4c2057c7` |
| Captured source mapping | `99492e98190c07da3e619bed9bd0560fbc17d2848501f8f86b566a05422fe304` |
| Browser worker bundle | `bd7151103a7266ab18c9fa9b1f7995bc5ae4ae00452a32bc91d4fe64225a5402` |
| SQLite WASM | `02d7e48164395fa68f81c6ec33e9da5461be397dc57602ac0cd89b4bbba1d312` |
| Two-seat prepared artifact | `160affee7f17339478430a8141702480b4db8a526955a4b0caaef93c1f415e16` |
| Four-seat prepared artifact | `6ec134c8b1ed8ea8095e2c309f2e7744f1c302c6bca1ecc4b43f69d6f9605e76` |
| Two-seat final state | `31031197741e33d2bda2dbb19e270737f36bd881659e27b4a22e8d675d153672` |
| Four-seat final state | `0d53b40994af0278b7a2d610dabedbb6e6ab48c66fe17d013177ee7a9db15647` |
