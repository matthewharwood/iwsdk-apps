# Commander persistence and replay

`@iwsdk-apps/storage` runs the same coordinator and replay validator over injected synchronous SQLite operations. The native adapter uses `bun:sqlite`; the browser adapter uses SQLite WASM `3.53.0-build1` and the `opfs-sahpool` VFS in a dedicated worker. The browser adapter requires a secure context, OPFS, and Web Locks. It reports an unavailable-storage error instead of substituting memory storage.

```ts
import { Coordinator } from "@iwsdk-apps/storage";
import { openNativeRepository } from "@iwsdk-apps/storage/native";

const repository = openNativeRepository(".commander/matches.sqlite");
const match = await Coordinator.create(repository, release, manifest);
// To restore: await Coordinator.open(repository, release, manifest.id)
const observation = match.view(boundSeat);
const result = await match.submit(boundSeat, command);
await match.close();
```

Prepared modes take a separately authenticated artifact; they never present a trimmed definition dictionary as the full content release:

```ts
import { createPreparedMatchArtifact } from "@iwsdk-apps/compiler/prepared";

const artifact = await createPreparedMatchArtifact(release, manifest.seats.map(seat => seat.deck));
const preparedManifest = {
  ...manifest,
  resolver: "prepared-indexed" as const,
  preparedArtifactHash: artifact.hash,
};
const prepared = await Coordinator.create(repository, release, preparedManifest, artifact);
const evidence = prepared.executionInfo(); // Actual registry count and both independent pins.
```

`full-scan` requires the complete authenticated registry and no artifact. `prepared-scan` and `prepared-indexed` require an artifact that matches the manifest pin and the ordered deck hashes. The browser-portable compiler entry verifies the full source hash and reconstructs closure, definition references, definition hashes, source versions, core requirements, and recipe evidence before admitting the registry. The coordinator also requires the source processor ABI to equal the current engine version. `Coordinator.open` restores the artifact from SQLite and repeats admission before replay; callers supply the verified full source, not an independently chosen replacement artifact.

For a browser worker, call `openBrowserRepository(applicationNamespace, sqliteWasmUrl)` from `@iwsdk-apps/storage/browser`. The namespace is a stable plain or scoped application name; a SHA-256 digest determines its OPFS directory. A namespace-wide exclusive Web Lock lasts until the connection closes. A second worker or tab gets `AlreadyOpen`. Serve the WASM from the same pinned package version as the JavaScript initializer. The proof harness demonstrates an explicit same-origin WASM URL; Vite applications can provide the bundled `sqlite3.wasm?url` asset.

The host binds the seat passed to `submit`; a command cannot select a different actor. Drivers receive only `view(actor)`, which returns `PlayerObservation`. `current()`, `pendingActor`, and `executionInfo()` are privileged coordinator APIs for orchestration and evidence, not additional driver observations.

Submissions run in a serialized queue. An accepted command, canonical request hash, durable receipt, event batch, boundary hash, and current checkpoint commit in one SQLite transaction before the coordinator advances its published state. Exact retries return the original receipt across reopen; reusing an identity with another payload fails. Stale or illegal commands do not advance the committed state or random cursor. Persistence failures roll back and leave the command retryable. SQLite's write transaction and expected revision prevent a stale native coordinator from overwriting another writer.

Storage schema 2 has `commander_matches`, `commander_commands`, and `commander_boundaries`. Match rows also retain the exact prepared artifact JSON and its hash (null for full-scan). Opening an owned schema-1 database transactionally adds those columns without rewriting its checkpoint bytes; this does not make older engine versions compatible. Keep a SQLite backup for historical executors before upgrading a database they use. It retains the full initial checkpoint, the current checkpoint, and all accepted command/boundary records. Checkpoints, commands, and event batches use versioned canonical JSON columns; this is not a normalized relational mirror of every rules object. The application ID and schema version prevent opening an unrelated or future database as this application's save file.

`replayMatch(repository, release, matchId)` recreates the initial state from the manifest and runs every stored command through the actual engine. It verifies request identities and hashes, each event batch and state hash, the contiguous SQL boundary records, the final checkpoint, and engine invariants. `Coordinator.open` performs that verification before returning restored state. Source release and deck hashes exclude their own `hash` properties.

`exportMatch(repository, release, matchId)` produces a checksummed `commander-logical-save/2` envelope after replay validation. `importMatch(repository, release, text)` checks schema, versions, hashes, and replay before inserting. It refuses an existing match identity and accepts at most 64 MiB. The caller selects the pinned content release; neither import nor open silently migrates incompatible games.

## Executed checks

Run native transaction, retry, pending-payment restoration, import, and corruption checks with:

```sh
bun test packages/storage/src/storage.test.ts
```

The current suite passed 23 tests and 285 assertions. Initial starting-player choices persist before any cards exist; wrong/stale choices and injected commit failures preserve the undealt state, while accepted-choice retries deal once. Both seat counts test selecting a different player as starter. It verifies both prepared modes actually execute a two-definition closure from a three-definition fixture source, resume a staged payment with the same artifact, preserve exact retry receipts, and replay/import identically. Missing or conflicting pins, forged closure evidence, damaged artifact JSON, and unknown source ABIs are refused. A schema-1 migration test checks preservation of original checkpoint bytes. It includes real SQLite rollback injected at boundary insertion, checkpoint update, and commit; these synthetic unit fixtures do not establish source-card coverage.

After compiling a release for the current engine ABI, provide its release and deck paths:

```sh
bun run --cwd packages/storage test:browser-parity \
  --release /path/to/current-release.json --decks /path/to/current-decks.json
```

This standalone proof builds a browser worker, serves its bundle and the actual SQLite WASM on an ephemeral localhost port, and launches an isolated Chromium context. It retains its native databases, manifests, pending logical saves, source snapshot, worker bundle, and JSON evidence under `.commander/browser-proof/<run-id>/`. It does not use the WebXR application or an in-memory SQLite substitute. Browser and native drivers both use the observation-only simulation driver; the relative simulation import is confined to the test harness to avoid a workspace dependency cycle.

The historical 0.3 spell-enabled proof below was produced with this command on its retained 0.3 source snapshot. Current source requires a matching current-engine release; running this old release against current source intentionally fails ABI admission:

```sh
bun run --cwd packages/storage test:browser-parity \
  --release .commander/release-v0.3.json \
  --decks .commander/decks-v0.3.json \
  --deck-offset 12 --deck-stride 1 --require-spells
```

Relative input paths resolve from the repository root. Deck selection takes the collection starting at the zero-based offset, advances by the stride, and wraps within that slice. With the 14-deck collection above, both matches alternate the WU and BR spell decks. The current harness first restores the pending starting-player choice before any cards are dealt. `--require-spells` adds a real target decision, then its payment decision, followed by at least one actual noncreature `SpellResolved` event per selected game. Every stage undergoes full document/worker reload; accepted commands and the original starting-player choice undergo durable retry. The initial pre-deal save is imported into another namespace and completed again. The report distinguishes actual spell announcements and resolutions from card presence in a deck.

`--resolver prepared-scan` or `--resolver prepared-indexed` creates and admits a prepared artifact for the chosen ordered decks; the default is `full-scan`. Both native and browser snapshots record the actual execution-registry size, full source size, excluded count, source hash, and artifact hash. Prepared runs require a smaller actual registry for these proof fixtures. `--require-removal` also requires the target/payment workflow and at least one actual destroy or exile event associated with a resolved spell in each selected game.

The [engine 0.6 setup browser proof](../../docs/commander/setup-browser-proof-0.6.md) passed both seat counts from revision-0 chooser-owned, undealt states through OPFS reload/import and complete games. Each history retained one accepted starting-player choice; all 575 and 1,912 boundary hashes matched native execution. Its separate SQLite JUnit report records the 23 current storage tests.

The [engine 0.5 prepared browser proof](../../docs/commander/prepared-browser-proof-0.5.md) passed both seat counts, with 124 and 175 executed definitions respectively from a 697-definition source, exact OPFS reload/import parity, and actual destruction in each game. Its archived evidence explicitly records zero observed exile events. The proof captures compiler/card-program source alongside engine/storage code and rejects source-byte changes during its run.

The harness tries at most eight deterministic seeds per mode (`--seed-attempts 1..32` overrides that bound). A completed native game missing a required decision remains in the evidence as `missing-required-workflow`, with its SQLite history and manifest preserved. Actual engine, driver, or command-budget failures stop the proof and remain failures. Passing the proof does not require all seven reviewed cards to be drawn or resolved; the report explicitly lists those not resolved in the selected browser games.

The spell-enabled run [`2026-09-06T20-11-06-750Z-1ae96a5b`](../../.commander/browser-proof/2026-09-06T20-11-06-750Z-1ae96a5b/evidence.json) passed with engine `commander-engine/0.3.0`, driver `observed-combat/3`, Chromium `149.0.7827.55`, and the 649-definition release `078225448205425a2bb05912afa09ce35cbd7156550b2af7960f45a720d1a42a`. Its retained source snapshot hash is `adcc97038f80f906dfec56a27f80908347cd90919e929252faa8f292166a86e2`.

| Spell-enabled match | Game / driver seed | Target / payment reload revisions | Final revision | Compared boundaries | Outcome |
| --- | --- | --- | --- | --- | --- |
| Two seats | 1905 / 1922 | 818 / 819 | 839 | 840 | P2 won on turn 32 |
| Four seats | 2901 / 2918 | 1060 / 1061 | 2047 | 2048 | P3 won on turn 49 |

Both games matched every native/browser boundary hash, restored both decisions, returned exact durable retries, and completed identically after importing their target-choice saves. The run fetched SQLite WASM eight times and reported no page or network failures. The selected browser games actually resolved Sorin's Thirst, Sacred Nectar, Healing Hands, and Revitalize, covering damage, draw, and life-gain instructions. Four earlier two-seat seeds completed without the required target workflow and remain retained; one of those native-only attempts also resolved Divination. Inspiration and Flame Slash were not observed in this proof. Those distinctions are recorded in `attempts` and `spellCoverage`, rather than treating all seven deck entries as executed coverage.

The executed run [`2026-09-06T19-54-41-631Z-e262e98f`](../../.commander/browser-proof/2026-09-06T19-54-41-631Z-e262e98f/evidence.json) used Chromium `149.0.7827.55`, engine `commander-engine/0.2.0`, driver `observed-combat/2`, and the 642-definition development subset. It retained the exact tested source snapshot with semantic hash `a921685595a1e9182a2a49ca43c99eff5bf1b772c3ce5090550b25f6aadaa6cb`; later formatting does not change that historical artifact.

| Match | Game / driver seed | Payment saved at revision | Final revision | Compared boundaries | Outcome |
| --- | --- | --- | --- | --- | --- |
| Two seats | 1901 / 1918 | 60 | 406 | 407 | P2 won on turn 17 |
| Four seats | 2901 / 2918 | 150 | 1645 | 1646 | P4 won on turn 39 |

Every native/browser boundary hash matched, including initial state. Both browser games closed their SQLite connection, reloaded the full document and worker at a pending payment, reopened the exact saved decision, and returned the original receipt for an exact durable retry. Importing each pending save into a second namespace and completing it reproduced the same final state and every boundary hash. A competing tab was refused with `AlreadyOpen`. The run reported no page or network failures and fetched the real WASM six times.

These are two complete games of the explicitly limited development subset. They do not prove full-pool card implementation, the requested larger corpus floors, other browser engines, browser-process crash recovery, or physical WebXR behavior. The first local harness launch was denied a listening socket by the sandbox before any game ran; the authorized localhost run above completed successfully.
