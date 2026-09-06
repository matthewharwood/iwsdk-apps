# Temporary creature effects in engine 0.9

Engine 0.9 executes 97 exact source spells that modify a creature's power, toughness or supported keywords until end of turn. Alongside 232 exact keyword-reminder bodies, the development release now contains 1,090 definitions and 31 legal decks. The [machine-readable checkpoint](development-0.9-evidence.json) pins the source, executors, browser worker and retained evidence. Full frozen-snapshot support remains outstanding: 30,739 paper candidates are unsupported.

The printed card definition stays immutable. A resolved modifier records its captured source object, controller, source version, program and event index, affected object incarnation and expiration turn. Derived characteristics apply supported keyword grants and additive power/toughness changes alongside counters. Combat, legal target selection and state-based actions read those characteristics. This is a finite layer-6/layer-7c implementation, without general dependency, characteristic-setting, type-changing, copying or control-changing effects.

Moving the target creates a new object, so a later incarnation does not inherit the effect. Removing the source or its controller does not erase an already created effect on a surviving target. Cleanup removes damage and expires effects together before checking state-based actions. If that check opens priority, effects created during that cleanup expire in the subsequent cleanup. Source identity, program compatibility and duration are checked when admitting persisted state.

## Source admission and assertions

The [source audit](source-authentication-v0.9.md) authenticates every admitted definition against the retained raw archives. Production full and prepared factories both require the closed source binding registry. A real Oracle ID with substituted behavior, renamed IDs, downgraded recipe markers and wholly fabricated consistent definitions all fail admission. Hypothetical planning inputs and constructed test boards are not production source certificates.

All 97 modifier source cards have ordinary cast/target/payment/resolution assertions on explicitly constructed boards. Another 21 source-card cases check zero-toughness death, including indestructibility and cantrip ordering. That suite passed 118 tests and 2,105 assertions. Twelve independently authored modifier tests cover late strike/evasion changes, actual keyword combat, repeated cleanup and departed-player cases. These constructed setups do not claim ordinary game reachability for every source card.

## Complete game evidence

The corrected native/browser proof uses actual Chromium 149 and SQLite WASM 3.53.0-build1 with OPFS. Both seat modes reopen native SQLite, reload the browser worker, retry exact commands, import an active-effect save into independent databases and complete with matching boundary hashes. A competing browser owner receives `AlreadyOpen`.

| Execution | Seed | Accepted commands | Compared boundaries |
| --- | ---: | ---: | ---: |
| Native and browser, two seats | 9301 | 559 | 560 |
| Native and browser, four seats | 9501 | 1,896 | 1,897 |
| Three independent resolvers, two seats | 9401 | 355 | 356 |
| Three independent resolvers, four seats | 9601 | 1,777 | 1,778 |

The browser proof pauses at starting-player, target, payment and active-modifier decisions. A later audit found the original browser import selected revision zero; the corrected run imports the final active-modifier saves at revisions 91 and 165. The earlier evidence remains retained, and both saved effect IDs are observed in the final expiry history. Exact retries are checked after reopening; this 0.9 proof does not separately retry imported receipts. It records 45 naturally created and expired effects from 36 distinct modifier definitions. Resolver comparisons separately execute the complete registry, prepared scan and prepared index, comparing acting observations as well as semantic state boundaries and driver choices. Each execution has its own SQLite history and verified replay.

Two additional telemetry games completed with 689 and 1,538 commands. Across these six unique assignments, actual event histories contain 6,814 accepted commands and 144 distinct cast/resolved definitions, including 25 newly admitted reminder definitions. Resolver siblings, browser repetitions, imports and replay are not counted as extra assignments. These hit counts are not independent semantic assertions.

The [0.9 fixed corpus](fixed-regression-0.9-evidence.json) separately completed and replayed 64 fresh games, 16 two-seat and 48 four-seat, totaling 89,784 commands. All runs retain their original deck revisions and seeds. Host telemetry records actual elapsed/CPU time and sampled process memory; process samples are not per-match peak allocations or a controlled comparative benchmark.

The historical [0.3 exploration](exploration-0.3-evidence.json) completed all 1,024 predeclared games and replay checks, totaling 1,409,433 commands. Its older source/executor pins remain explicit. These results do not qualify later definitions or replace the outstanding full-universe campaign.

## Reproduction and limits

Run `bun run commander compile --all-reviewed` against the pinned catalog to reproduce release `8abe41532a96354af76d414d6c1c56e74c8142b126bb6cb7b8cac806c7380edd` and all 31 deck revisions. Native CLI proof source, exact assignments and database histories are retained under `.commander/prototypes/engine-0.9`; the completed regression is under `.commander/regressions/regression-0.9-fixed64`. Historical paths inside those archives remain unchanged.

At commit `964e318`, the full main-workspace `bun run check` passed 465 unit tests with 70,756 assertions, 12 production browser tests, the XR emulator smoke check and the independently generated workspace/application gate. After the browser/runtime freeze, terminal test fixtures were migrated to authentic source cards and a test JSON file was formatted; that gate includes those changes. The later import-checkpoint harness correction passed its separate complete native/browser rerun. Physical headset play is unverified.

The [G2 audit](g2-scenario-audit-0.7.md) still has no fully qualified original difficult-scenario manifest. General continuous effects, replacements, suspended resolutions, complex costs, copies, loops and many other rules remain implementation work. The card design package and `/cards` integration continue to pass the application gate; those presentation fixtures do not establish Commander semantic coverage.
