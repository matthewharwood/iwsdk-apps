# Trigger persistence evidence (engine 0.7)

This increment verifies the storage of separate captured triggered abilities. It keeps three kinds of evidence distinct: a synthetic-card ordinary command transcript, a constructed simultaneous-entry scenario, and source-backed full games. These checks do not establish coverage of unsupported trigger constructors.

## Native ordinary command transcript

`packages/storage/src/triggers-storage.test.ts` casts a synthetic zero-cost entry creature through normal setup, casting, payment and priority commands. The resulting ability is a separate typed stack entry. An Instant resolves above it and destroys its source commander; the owner then moves that commander to the command zone. The test saves while the ability remains on the stack.

Native SQLite reopen, logical import and actual replay retain the original source incarnation, source program and captured controller. Retrying the last accepted command returns its original durable receipt. Reusing that command ID with another response fails. The detached ability resolves for its captured controller after the source has left the battlefield. These cards are explicit test fixtures, not source-backed Oracle records.

The complete native storage suite passes **25 tests and 340 assertions**, including the earlier setup, prepared-registry, transaction-failure, replay and import checks. The child test additionally contains strict assertions for its constructed ordering workflow.

## Constructed simultaneous-entry scenario

There is currently no admitted command that puts multiple self-entry creatures onto the battlefield simultaneously. `constructed-multi-trigger-storage/1` therefore creates a deterministic scenario at revision zero, identifies that construction in the manifest, and uses the real engine for every later transition. One captured source leaves the battlefield before the initial ordering decision. The initializer is kept outside production exports: native testing substitutes it only in a child process, and the standalone browser proof selects it only through an explicit bundle resolver. Ordinary games do not load this adapter.

The actual native SQLite and Chrome SQLite WASM proof passed on 2026-09-06. It covers an actor-owned two-ID ordering decision, exact permutation validation, unchanged state after invalid or stale input, pending-order reopen/import, accepted-order exact retry after reopen/import, conflicting retry rejection, captured-source survival, and replay through the same deterministic initializer. Native fault injection also rejects a boundary insert while preserving the pending decision and all SQL rows for a later successful retry.

The browser used a dedicated worker with real `opfs-sahpool`, OPFS and Web Locks. It reloaded the document twice and imported both a pending and an accepted ordering save into separate namespaces. Native and all three browser continuations matched all six state boundary hashes. Five commands were accepted: the ordering response and the four priority passes needed to resolve two separate abilities. There were no browser errors, request failures or source changes during the successful run.

Run the constructed proof from the workspace root:

```sh
bun packages/storage/browser-proof/trigger-scenario-check.ts
```

Retained evidence: `.commander/prototypes/engine-0.7/.commander/trigger-storage-proof/2026-09-06T20-59-15-827Z-6bf6b1e7/evidence.json`. This report explicitly records `ordinaryCommandReachable: false`, `sourceBackedCards: false` and `fullGame: false`. Its directory retains source bytes, compiled worker, source/manifest fixtures, native report and both logical saves. An earlier retained attempt stopped at the namespace validator because the test namespace included uppercase timestamp characters; the failed browser connection did not open an OPFS database.

| Pin | Value |
| --- | --- |
| Engine | `commander-engine/0.7.0` |
| Native runtime | Bun `1.3.11` |
| Browser | Chromium `149.0.7827.55` |
| Source snapshot | `afb513e9981ccba2f77a8a66719b4c31d52bb3dca7031039fc6cc292aff02839` |
| Worker bundle | `72f70012ecbc945bcc1336695a4129c87dfb8479c72f4c513890ebc8027aa308` |
| SQLite WASM | `02d7e48164395fa68f81c6ec33e9da5461be397dc57602ac0cd89b4bbba1d312` |
| Initial boundary | `aec64a65c4190e764c3b9451a05206c90fdc676b652a11e79c250dba5ff61115` |
| Final boundary | `bab689f8ecaeb6adeb8ca312a12a4a6733199a3106b8b2209b574e437f4daeb8` |

## Ordinary source-backed games

The general browser proof now accepts `--require-triggers`. It pauses only when an observed real ability is on the typed stack and a player has priority. It saves and reloads that pending boundary, verifies a durable command retry, and compares every command boundary with native execution. Captured and resolved definition counts come from emitted events; merely including a card in a deck does not count as exercising its trigger.

The source-backed run uses the verified 757-definition release `15d505263948face9482d6ba3586eabfb9bac114edce46ae9b4ec0db256dd769`. Its retained browser deck collection contains, in order, the original GW self-entry, BR removal, UB self-entry and WU spell-rich decks (original indices 17, 15, 18 and 14). The original deck hashes remain unchanged. Two seats use the first two decks; four seats use all four.

```sh
bun run --cwd packages/storage test:browser-parity \
  --release .commander/release-v0.7-draft.json \
  --decks .commander/prototypes/engine-0.7/.draft-artifacts/browser-decks-self-entry-v0.7.json \
  --deck-offset 0 --deck-stride 1 --resolver prepared-indexed \
  --require-removal --require-triggers
```

The two-seat seed 1901 passed with 932 accepted commands and 933 equal boundary hashes, a P2 win, and an actual 126-definition execution registry from the 757-definition source. It reloaded at setup revision 0, target revision 399, payment revision 400 and a pending ability at revision 437. Twelve distinct entry abilities were both captured and resolved. Ten spells resolved, including Fell's actual destruction and Final Reward's actual exile. The initial pre-deal save also completed identically after import.

The four-seat seed 2901 also passed: 2,011 accepted commands, 2,012 equal boundary hashes, a P1 win on turn 47, and an actual 214-definition registry. It reloaded at revisions 0, 785, 786 and 839. Its twelve entry abilities were all captured and resolved; Murder produced an actual destruction. It did not exercise exile. The two-seat winner was P2 on turn 39.

| Mode | Commands / equal boundaries | Setup / target / payment / ability reload | Actual registry | Captured / resolved abilities | Destroy / exile |
| --- | --- | --- | --- | --- | --- |
| Two seats | 932 / 933 | 0 / 399 / 400 / 437 | 126 / 757 | 12 / 12 | 1 / 1 |
| Four seats | 2,011 / 2,012 | 0 / 785 / 786 / 839 | 214 / 757 | 12 / 12 | 1 / 0 |

Both modes passed on their first deterministic seed. Every pending stage survived a full document/worker reload with the same checkpoint and receipt history. Both initial pre-deal saves completed identically after import; those saves contained 94,345 and 138,361 bytes. A competing tab was refused with `AlreadyOpen` in each mode. The run fetched the real SQLite WASM twelve times, reported no browser failures and retained an empty source-change list.

Across the ordinary games, 24 abilities resolved from **21 distinct definitions out of the 60 trigger definitions in the selected decks**. The other 39 were not observed resolving. Twenty distinct spell definitions resolved from 49 selected spell definitions. These are execution observations, not claims that every compiled program was covered. The derived `trigger-observations.json` lists observed and unobserved definitions and pins its input evidence file hash.

Ordinary evidence is retained under `.commander/prototypes/engine-0.7/.commander/browser-proof/2026-09-06T20-59-30-848Z-7d77f2cb/`: `evidence.json`, native SQLite files, exact prepared artifacts and manifests, logical saves for all four stages, source bytes, worker bundle, and `storage-unit.junit.xml`. These results remain separate from the constructed simultaneous-entry ordering check.

| Ordinary proof pin | Value |
| --- | --- |
| Driver | `observed-combat/5` |
| Source snapshot | `1af7e9ed48cbe66a9c0cd35626e7ba999a715c47264aeea82128df08436bd714` |
| Worker bundle | `a8d8049a7ef617591debb44f849cfa787fdcc816af15e2c105f5cf718f2ad77a` |
| Two-seat artifact | `41c4da0c9291150cdaaa1bc37a7f99e2c30c8135c6fe6a88c228e910a47a3de8` |
| Four-seat artifact | `ca787c70a57d6acf1e103f6e143f60a6d3d73af4b77033f845eb438e758d662e` |
| Two-seat final state | `df5a7e9707618772679d1ff89b0607273bc98511e0b6a62fcbd9708937617ce6` |
| Four-seat final state | `b368a76296c2fb55f2324befb7ad552d1a0044776c532094ab0daf1be8bff82f` |

This proof ran in Chromium 149.0.7827.55 on the isolated 0.7 source copy, from 20:59:30 to 21:04:28 UTC on 2026-09-06. It does not establish browser-process crash recovery, other browser engines, physical WebXR operation, unsupported trigger semantics or full-pool Commander coverage.
