# Commander engine development

This implements the supplied investigation-to-simulations specification alongside the reusable WebXR starter. It currently executes a **development subset**, with a full frozen source catalog and explicit unresolved coverage. Full-snapshot support is the remaining release target.

From the workspace root:

```sh
bun install --frozen-lockfile
bun run commander sources fetch
bun run commander sources import --manifest .commander/sources/manifest-<hash>.json
bun run commander investigate inventory
bun run commander investigate obligations
bun run commander investigate sample --size 300
bun run commander investigate scenarios
bun run commander compile --all-reviewed
bun run commander simulate --mode two-seat --seed 1901 --id example-two
bun run commander simulate --mode four-seat --seed 2901 --id example-four --pause-at payment
bun run commander simulate --resume example-four
bun run commander play --mode two-seat --seed 1901 --id human-example
bun run commander play --resume human-example
bun run commander replay --id example-four
bun run commander export --id example-four --out /tmp/example-four.json
bun run commander coverage --fail-on-unresolved
```

`sources fetch` prints the exact manifest path. Compilation binds reviewed syntax recipes to immutable Oracle versions. Unsupported text stays unsupported; the executable never interprets English at runtime. Coverage and verification intentionally return failure while release obligations remain open. `--data <directory>` chooses a separate local data store; do not point it at the token example's saves.

`--all-reviewed` compiles all 1,090 currently reviewed definitions and 31 legal development decks, including 97 temporary creature modifiers and 232 exact keyword-reminder bodies. Source admission verifies every definition against the closed authenticated registry. Earlier constructor flags remain available for their narrower development subsets.

`--self-entry-triggers` includes the reviewed spell families and complete creature bodies with mandatory self-entry draw or life-gain abilities. These abilities capture their controller and source incarnation, wait until state-based actions finish, and enter the stack separately from the physical card. Their resolution survives source removal. Multiple abilities controlled by one player require that player's explicit ordering choice. Other trigger families remain unsupported.

`simulate` starts with legal 100-card fixtures and a seeded choice of which player selects the starting player. That player's command precedes commander placement, shuffling, opening hands and mulligans. The observation-only driver issues the same validated commands as other clients. It plays lands, pays for spells, passes priority, declares attacks and blocks, and assigns combat damage. Outcomes come from the engine. Budget exhaustion and driver/engine failures are retained as separate dispositions.

`play` runs a local hot-seat terminal using the same coordinator and each acting player's entitled observation. Enter accepts the displayed heuristic proposal, a JSON `Response` supplies your own choice, and `quit` or end-of-input saves the pending decision. Resume with `play`; the saved manifest pins the terminal driver separately from autonomous simulations. `simulate --script <path>` instead accepts a versioned `commander-driver-script/1` document containing a `startingRevision` and ordered `{ actor, kind, response }` steps. Reusing the exact script is required when resuming it.

Every command commits its receipt, event batch, full current checkpoint and revision in one SQLite transaction. A pending decision is durable. Reopening validates the content/deck pins and re-executes every command from the original manifest; restoring a final JSON object is not replay verification. The initial executor versions are retained in local evidence when later semantics require a new version.

The catalog lives in `.commander/catalog.sqlite`; ordinary matches use `.commander/matches.sqlite`. Each run has an assignment and result under `.commander/runs`. New runs retain executable source snapshots under `.commander/builds`. Batch assignments are declared before execution, and each database and result remains under `.commander/batches`. These local source archives and saves are ignored by Git; running the documented commands reconstructs them.

```sh
bun run commander batch --id discovery-example --two 16 --four 48 --seed 10000
bun run commander regress --id regression-example
bun run commander compare --mode two-seat --seed 4001 --deck-offset 15 --deck-stride 1
bun run --cwd packages/storage test:browser-parity
bun run check:fast
```

`regress` uses the checked-in [fixed corpus](regression-corpus-v1.json): 16 two-seat and 48 four-seat inputs, with 14 decks and 424 exact card source pins. Its historical terminating baselines were authenticated independently; a new run must complete and replay each assignment again. It admits a fresh prepared registry against the current release, preserves every input seed and seat/deck tuple, and retains assignments, artifacts, databases, dispositions and replay hashes under `.commander/regressions/<id>`. A budget failure remains a failure. No old outcome is reused as a new result. `--corpus <path>` selects another validated corpus; `--release <path>` selects an explicit matching release. Source or rules drift fails admission rather than silently changing a regression input.

Deck diversity counts distinct commander/card compositions. Renaming a deck, reordering its entry rows, or renaming seats cannot manufacture additional coverage. Execution retains the original IDs, row order, hashes and seeds for exact replay. Batch preflight authenticates and admits every declared deck, including decks unused by the first assignment, before recording attempts.

`compare` executes all three resolver modes independently and compares semantic boundaries and driver choices. The current comparator also checks each acting player's observation explicitly; historical reports describe which checks their preserved executor performed. Full-scan uses the complete compiled development registry, while prepared modes admit the authenticated dependency subset for the selected decks. `batch` is exploratory and accepts explicit `--release` and `--decks` paths. `cohort --plan <path>` accounts each predeclared exploratory assignment exactly once and returns failure while any remain pending, invalid, or failed; a replay never counts as an additional game.

To extend an existing pinned source bundle with the reviewed primary evidence for tabletop versus online-only eligibility, run `bun run commander sources supplement-tabletop --manifest <existing-manifest>`, then import the returned manifest into the intended catalog. This creates a new source bundle identity while retaining the old archives. Historical releases and saves keep their old bundle pins; see the [eligibility evidence](source-tabletop-eligibility.md).

The browser parity harness loads the same pure engine in a real browser worker with SQLite WASM `opfs-sahpool`. It compares native/browser state hashes at every command boundary, reloads during payment, tests durable retry and lock contention, imports a logical save, and finishes both seat modes. This is distinct from physical headset qualification.

The studio's card design now lives in `packages/card-design`: shared schemas, typography, mana symbols, annotations, multi-face composition, hidden cards and scoped CSS. `apps/web/app` consumes it at `/cards`; the original studio remains a reference. Display fixtures and semantic engine support have separate provenance and coverage.

See [baseline](baseline.md), [reuse assessment](reuse-assessment.md), [independent scenario expectations](scenario-expectations.md), [card design audit](card-design-audit.md), and the reconstructed [goal contract](goal-contract.json). The [engine 0.9 checkpoint](development-0.9-evidence.json) has 1,090 source bindings and 31 legal development decks. Its [temporary-effect evidence](continuous-effects-0.9.md) separates source review, constructed assertions and complete native/browser games. The [source authentication](source-authentication-v0.9.md) documents closed production admission. The [G2 audit](g2-scenario-audit-0.7.md) records the remaining difficult-scenario gaps.

The [0.9 fixed regression](fixed-regression-0.9-evidence.json) completed and replayed all 64 declared games. The historical [0.3 exploration](exploration-0.3-evidence.json) completed all 1,024 assignments (256 two-seat, 768 four-seat); those games retain the 0.3 source/runtime pins and do not certify later additions. The [0.6](fixed-regression-0.6-evidence.json), [0.7](fixed-regression-0.7-evidence.json), and [0.8 checkpoint](development-0.8-evidence.json) retain their separate provenance. These milestones leave full-universe implementation and qualification outstanding.
