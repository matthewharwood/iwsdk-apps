# Commander engine reuse assessment

Initial source inspection on 2026-09-06 informed the architecture decision below. A later execution built Phase and passed two upstream constructed Commander tests; its exact scope and failed attempts are recorded below. This remains an incomplete comparison: no common acceptance suite has been run across three external approaches, and no external implementation was copied into this repository.

The current requirement is one pure TypeScript rules core, run unchanged under Bun and in a browser worker, with serializable decisions/continuations and SQLite outside the core. Retain that boundary. Use Auteur as a publication/provenance reference and XMage as an attributable rules/test reference. Phase is a credible native/WASM alternative if the language requirement is deliberately changed; it should not be described as a TypeScript engine or as complete Commander support.

## Reproducible inspected revisions

Public repositories were shallow-cloned into a disposable directory. Local sibling `auteur`, `auteur-cms`, and `auteur-rs` repositories point at different remotes and were not substituted for the requested repository.

| Repository | Inspected commit | License evidence |
| --- | --- | --- |
| `matthewharwood/auteur-toasty-review` | `619bb97e69c0c97d7c21bb8f10b6547840552f5e` | No root license file or Cargo license field at this revision. Architectural reference; no inferred permission to copy. |
| `Card-Forge/forge` | `53a103721d627ecb76a2ea52b2febe894844f288` | [GPL version 3 text, `LICENSE`](https://github.com/Card-Forge/forge/blob/53a103721d627ecb76a2ea52b2febe894844f288/LICENSE). |
| `magefree/mage` | `c6221e0c95a575c4f4a1707468df12fab234cae7` | [MIT, `LICENSE.txt`](https://github.com/magefree/mage/blob/c6221e0c95a575c4f4a1707468df12fab234cae7/LICENSE.txt). |
| `phase-rs/phase` | `2874e52d69d89adf32b6440578238f9c5bc9f8ad` | [MIT](https://github.com/phase-rs/phase/blob/2874e52d69d89adf32b6440578238f9c5bc9f8ad/LICENSE-MIT) OR [Apache-2.0](https://github.com/phase-rs/phase/blob/2874e52d69d89adf32b6440578238f9c5bc9f8ad/LICENSE-APACHE), also declared in workspace `Cargo.toml`. |
| `WagicProject/wagic` | `830604d239fb00a6dfbe943664683603ccb64c79` | [`projects/mtg/LICENSE`](https://github.com/WagicProject/wagic/blob/830604d239fb00a6dfbe943664683603ccb64c79/projects/mtg/LICENSE), BSD-style three-clause source license. Root `LICENSE` explicitly separates resources from code. |

These source-code notices do not establish rights to redistribute Magic art, trademarks, or every upstream data artifact. Preserve exact notices for any later source reuse and retain distinct artifact provenance. In particular, copying or translating Forge scripts should not silently be recorded as MIT material merely because another engine can read them.

## Actual Auteur behavior

The requested repository is a reduced Rust 2024 / Toasty 0.10 / Axum / embedded SQLite review application, not a game engine or browser WASM library. Its [README](https://github.com/matthewharwood/auteur-toasty-review/blob/619bb97e69c0c97d7c21bb8f10b6547840552f5e/README.md) explicitly describes the reduced model and distinguishes a hypothetical browser port from the existing architecture.

[`src/domain.rs`](https://github.com/matthewharwood/auteur-toasty-review/blob/619bb97e69c0c97d7c21bb8f10b6547840552f5e/src/domain.rs) implements the behavior described by [`docs/02-resolution.md`](https://github.com/matthewharwood/auteur-toasty-review/blob/619bb97e69c0c97d7c21bb8f10b6547840552f5e/docs/02-resolution.md):

- `resolve_page` loads authoring rows, selects active revisions, matches tiny `default`/`fact_equals` selectors, and applies sparse operations in ascending priority.
- `set` replaces a placement's block version and provenance; `tombstone` removes it; `order` changes order. Missing content operations inherit. Equal-priority content writes at one placement are rejected by `detect_same_priority_conflicts`.
- `serve_published` reads the active publication and materialized placements without calling the draft selector evaluator. Block versions, revision identifiers, source operations and priorities remain visible as provenance.
- The implementation is intentionally not an AOT rules compiler: it loads whole collections and filters in memory; there is no Boolean inverted index or Magic dependency analysis. `selector_matches` returns false for unknown selector kinds. That permissive fallback is unsuitable for this engine's release-blocking unsupported semantics policy.

Reuse the conceptual separation between normalized authoring, immutable reviewed publication and selector-free runtime assets. Do not reuse the single winning placement cascade as continuous-effect semantics. Magic needs independently applicable effects, layers/sublayers, dependency and timestamp ordering, replacement-choice rules, APNAP handling and last-known information.

## Runtime, decisions and persistence comparison

| Candidate | Actual engine/decision boundary | Actual persistence evidence | Fit and remaining work |
| --- | --- | --- | --- |
| New portable TypeScript core | Can expose the required tagged `DecisionRequest`, constrained compound responses and explicit continuation state directly. | Must implement and test versioned state, RNG, receipts, replay and native/browser parity; these are obligations, not existing coverage. | Exact language/runtime fit; greatest new rules and card-program implementation burden. No coverage credit from scaffolding. |
| Forge | Java 17 Maven modules, separate `forge-game` and `forge-ai`. `PlayerController` has synchronous methods for targets, costs, replacement choices, modes, triggers, attackers and blockers; some methods mutate supplied abilities. | `GameSnapshot` copies a live object graph into another `Game` and restores it. `GameState` emits textual puzzle/setup state. Neither inspected API establishes a versioned browser-compatible continuation save. | Strong existing rules/script reference; a JVM sidecar changes the local worker architecture. A Java-to-WASM or TS port is additional engineering, not an existing supported adapter demonstrated here. GPL source needs an explicit reuse decision. |
| XMage | Java game core with `Player` choice methods and response setters; server/client projections are separate. Card behavior is Java class code. | `GameState` is `Serializable` and `Copyable`, with deep-copy/rollback machinery. `GameImpl` retains transient bookmarks; its `saveGame` field still says replay is unfinished. Java object serialization is not this project's portable continuation format. | MIT source and substantial rules tests make it a useful attributable reference. Direct runtime adoption requires JVM integration; portable TS/native-WASM execution was not found in the inspected modules. |
| Phase | Rust engine, actual `engine-wasm` `cdylib`, `wasm-bindgen` exports. Both legacy legal-action APIs and a richer engine-authored interaction contract exist. | JSON export/restore, RNG restoration, persisted-state envelopes, replay export/playback and rehydration from a loaded card database exist in code. | Technically credible native+browser-WASM lane. Direct use changes the required language and card-program runtime. Complete source-pool coverage and the specific save/decision parity contract remain unverified. |
| Wagic | Native C++ game with pointer-rich `GameObserver`, `TargetChooser`, GUI/resource dependencies and click-oriented actions. | Text serialization writes initial state, seed, consumed random values and action log; the inspected serializer explicitly writes `player1` and `player2`. | Native code is real, but an existing WASM target and ordinary four-seat Commander continuation protocol were not established. Larger extraction/redesign burden than the Phase lane. |

Primary code evidence: Forge [`PlayerController`](https://github.com/Card-Forge/forge/blob/53a103721d627ecb76a2ea52b2febe894844f288/forge-game/src/main/java/forge/game/player/PlayerController.java), [`GameSnapshot`](https://github.com/Card-Forge/forge/blob/53a103721d627ecb76a2ea52b2febe894844f288/forge-game/src/main/java/forge/game/GameSnapshot.java), [`GameState`](https://github.com/Card-Forge/forge/blob/53a103721d627ecb76a2ea52b2febe894844f288/forge-game/src/main/java/forge/game/GameState.java); XMage [`Player`](https://github.com/magefree/mage/blob/c6221e0c95a575c4f4a1707468df12fab234cae7/Mage/src/main/java/mage/players/Player.java), [`GameState`](https://github.com/magefree/mage/blob/c6221e0c95a575c4f4a1707468df12fab234cae7/Mage/src/main/java/mage/game/GameState.java), [`GameImpl`](https://github.com/magefree/mage/blob/c6221e0c95a575c4f4a1707468df12fab234cae7/Mage/src/main/java/mage/game/GameImpl.java); Phase [`engine-wasm`](https://github.com/phase-rs/phase/blob/2874e52d69d89adf32b6440578238f9c5bc9f8ad/crates/engine-wasm/src/lib.rs), [`interaction` DTOs](https://github.com/phase-rs/phase/blob/2874e52d69d89adf32b6440578238f9c5bc9f8ad/crates/engine/src/types/interaction.rs); Wagic [`GameObserver.h`](https://github.com/WagicProject/wagic/blob/830604d239fb00a6dfbe943664683603ccb64c79/projects/mtg/include/GameObserver.h), [`GameObserver.cpp`](https://github.com/WagicProject/wagic/blob/830604d239fb00a6dfbe943664683603ccb64c79/projects/mtg/src/GameObserver.cpp).

### Phase declarative asset reuse

This is a concrete possibility, with a substantial semantic compatibility task. [`CardFace`](https://github.com/phase-rs/phase/blob/2874e52d69d89adf32b6440578238f9c5bc9f8ad/crates/engine/src/types/card.rs) serializes typed keywords, abilities, triggers, static abilities, replacements, alternate costs, restrictions, identity metadata and parse diagnostics. [`CardDatabase::from_json_str`](https://github.com/phase-rs/phase/blob/2874e52d69d89adf32b6440578238f9c5bc9f8ad/crates/engine/src/database/card_db.rs) consumes a preprocessed export; the WASM boundary exposes `load_card_database`. The checked-in [`runtime_card_export_fixture.json`](https://github.com/phase-rs/phase/blob/2874e52d69d89adf32b6440578238f9c5bc9f8ad/crates/engine/tests/fixtures/runtime_card_export_fixture.json) contains Forest, Lightning Bolt and Grizzly Bears with tagged JSON effect records. Thus the records can be read without running Rust.

Reading records does not execute their meaning. A TS adapter must exhaustively translate each admitted effect/filter/cost/timing variant into this project's reviewed IR, reject unsupported variants, preserve face/Oracle identity, and verify semantics against independently derived rules scenarios. Simply accepting the JSON would silently adopt the Rust interpreter's unstated assumptions without that interpreter. The current fixture is evidence of the format, not evidence of complete Commander assets or per-card review.

The [`oracle_loader`](https://github.com/phase-rs/phase/blob/2874e52d69d89adf32b6440578238f9c5bc9f8ad/crates/engine/src/database/oracle_loader.rs) runs an Oracle-text parser over MTGJSON. [`oracle_gen`](https://github.com/phase-rs/phase/blob/2874e52d69d89adf32b6440578238f9c5bc9f8ad/crates/engine/src/bin/oracle_gen.rs) can conditionally apply Forge fallbacks; metadata separately counts those abilities/triggers/statics/replacements. Export artifacts therefore need their own input/configuration/license manifest, not just the Phase repository license. No such artifact has been imported here.

Phase's [README](https://github.com/phase-rs/phase/blob/2874e52d69d89adf32b6440578238f9c5bc9f8ad/README.md) distinguishes its large parsed catalog from thousands of unimplemented cards. Its public `restore_game_state` is also an undo-oriented boundary: it rehydrates the card database and RNG, enables debug mode, rebinds interactions, clears replay recording and rejects its network multiplayer mode. Local four-seat play is a separate question from that network flag. An adapter must inspect these behaviors instead of equating this export with a durable authoritative four-seat save.

## Difficult-rule evidence and execution limits

| Scenario family | Inspected evidence | What it does not prove |
| --- | --- | --- |
| Humility/Opalescence, dependency and timestamp | Forge has declarative scripts for both cards; XMage has layered Java effects plus `LayerTests`, `DependentEffectsTest`, and `OpalescenceTest`; Phase has layer processing and parser branches for these effect shapes. | Presence is not a passing cross-engine result, all relevant ordering permutations, or correctness under the pinned rules release. |
| Cast during a library search | Forge's Panglacial Wurm script declares the permission; XMage's card installs `WhileSearchingPlayFromLibraryAbility`. | Correct suspended search, payment, shuffle and save/resume behavior was not executed. |
| Commander and elimination | Forge has Commander game/deck formats; XMage includes ordinary multiplayer Commander test bases and FFA tests; Phase has Commander configuration and multiplayer fixtures. | No inspected candidate has passed this project's ordinary two-seat/four-seat, legal 100-card, substantive full-game acceptance suite here. |
| Portable compound decisions and resume | Phase interaction records include selections, sequences, relations, allocations, stale/unauthorized rejection and persistent semantic owners. Forge/XMage expose real choices but primarily through host-language objects. | Durable receipt replay, imported-state integrity, decision-generation invalidation and native/browser parity need direct fixture execution under the chosen adapter. |

Except for the two explicitly recorded Phase tests below, these fixture paths remain source-inspection references. They do not count toward this project's 24 difficult scenarios, 64 terminating games, 1,024 exploratory assignments, 300-identity research floor or full-pool support gate. No benchmark ranking is asserted.

## Executed Phase fixture

At the inspected Phase commit, two upstream `issue_2863_commander_aura_zone_change` integration tests passed: commander death does not duplicate the commander in the graveyard, and an Aura stays in the graveyard when an exiled commander returns through the command zone and is recast. These are constructed upstream fixtures, including privileged Aura placement and zone changes. They are not ordinary legal 100-card games, a cross-engine oracle or this project's native/browser persistence proof.

The retained result is `.commander/reuse-execution/phase/result.json` (SHA-256 `bc186646fbb4be10d51166d5be828702bbf7c21df295d5f391b40ea1a63bfb3d`). It records toolchain `rustc 1.99.0-nightly (da86f4d07 2026-07-24)`, source file digests, every attempt, and the generated Cargo lock. The inspected upstream revision had no lockfile; the retained generated lock has SHA-256 `abb062ab52b6656a1090026b34137038324e4e0957ca8840b3411661a38f9ec6`.

The successful command in the isolated upstream checkout was:

```sh
RUST_MIN_STACK=16777216 CARGO_TARGET_DIR=/private/tmp/commander-reuse-execution/phase/target \
  cargo +nightly-2026-07-25 test --locked -j 2 -p phase-engine \
  --test integration issue_2863_commander_aura_zone_change -- --nocapture
```

The preceding retained failures were a missing offline dependency, a missing lockfile, fixture files omitted by the initial sparse checkout, and a test-thread stack overflow. Fetching the actual fixture/generated interaction files and setting the test stack resolved those specific problems. The final run exited zero with two tests passed and 6,529 filtered out. No benchmark ranking or claim about the filtered tests follows from this run.

## Decision for this implementation

Proceed with the portable TS core and explicit unsupported records. Use independently derived official-rule scenarios as its primary oracle; compare to attributable XMage/Forge behavior where useful without treating either implementation as normative rules. Keep a future Phase JSON-to-reviewed-IR experiment bounded to a preselected set of effect shapes with complete provenance and negative cases. If the strict TypeScript requirement is later relaxed, evaluate the actual Phase native/WASM adapter with the same decision/resume fixtures before revisiting runtime adoption.

This decision favors contract compatibility, not a claim that rebuilding broad Magic semantics is inexpensive. The complete-source-pool release remains blocked until its explicit implementation and evidence requirements pass.
