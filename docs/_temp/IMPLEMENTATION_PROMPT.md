# Coding-Agent Instruction — Investigate, Implement, and Reach Simulations

Use this prompt with the other files in this package. The objective is execution, not another architecture-only response.

---

You are implementing a headless Magic: The Gathering Commander engine, using `matthewharwood/snapmatch` as the starting codebase and `matthewharwood/auteur-toasty-review` as an architectural reference for slots, selectors, immutable publication, and provenance.

## Your goal

**Acquire a complete, versioned dataset for all cards in a declared official Commander snapshot; account for all applicable rules and supporting behavior; build reviewed executable definitions and safe ahead-of-time rule-selection plans; implement the runtime rules engine; and continue until real headless games execute, save, resume, and replay with verifiable evidence. Then continue coverage expansion until the full-snapshot release gates pass.**

Do not stop at research, a README, an ERD, a schema, a successful catalog import, an English-text parser, a list of TODOs, a Boolean-selector demonstration, or a mocked simulation. A first complete game is a required early milestone, not the final definition of full card support.

Read `README.md`, `DESIGN_AND_ARCHITECTURE.md`, `INVESTIGATION_AND_ACCEPTANCE.md`, and `goal-contract.json`. Where older documents contradict this revision, use this revision for the derived engine while preserving unrelated project constraints.

## Scope and boundaries

This work is the card dataset, rules investigation, data model, executable card compiler, AOT selection, runtime execution, decisions, persistence, and simulation harness.

Do not implement a gameplay frontend, VR, IWSDK scenes, network multiplayer, accounts, LiteRT, MAB, learning, deck optimization, or a generalized framework. Preserve a clean observation/decision/session boundary for later consumers.

A scripted or simple deterministic decision driver is explicitly authorized as simulation infrastructure. It need not be a skilled AI. It must use only valid game commands and the information its player is entitled to see. Test assertions may inspect privileged state separately.

Work in a dedicated branch or derived repository. Do not deploy, delete existing user data, mutate Snapmatch production services, or remove unrelated user changes. No purchases or hosted services are required.

## Begin with real inspection, then implementation

Inspect the repository's actual files, instructions, manifests, state architecture, generator templates, tests, and runtime boundaries. Record the commit, baseline failures, and actual tool versions. Inspect Auteur's actual code before attributing capabilities to it.

Replace Firebase-first requirements explicitly for this derived engine, retaining meaningful quality gates. Use new storage namespaces. Keep Bun, Turborepo, TypeScript, Zod, and useful testing infrastructure. Use native SQLite behind an adapter first and prove SQLite WASM/browser-worker portability with the same core.

Record a focused architecture decision comparing a portable TypeScript reference engine with licensed reuse or a native/WASM alternative. Choose based on actual feasibility and difficult fixtures. Do not turn the reuse study into an indefinite prerequisite to the importer or reference executor.

## Build the source dataset

Discover current Scryfall bulk metadata and fetch card and rulings archives using documented headers, rate limits, compression, and formats. Do not hard-code the dated URLs or outdated field names. Discover the current official Comprehensive Rules from its landing page, and capture format/restriction evidence separately.

Preserve raw archives, hashes, update/effective/retrieval dates, importer versions, and original record references. Stream and stage imports. Validate all records, quarantine errors, reconcile counts, and publish only complete verified source snapshots. Demonstrate idempotent offline reimport and interruption safety.

Normalize gameplay identities, semantic versions, faces, layouts, names and name-equivalence groups, costs/characteristics, legalities, related objects, and supporting/name-choice metadata. Preserve missing and symbolic values. Do not confuse a printing with a gameplay identity or equate the chosen printing's release date with first eligibility.

Compute role-aware eligibility under the pinned profile. Keep the entire eligible inventory visible from the start. Do not silently discard difficult legal cards, token/support records, supplementary mechanics, or broader name data.

## Investigate the entire rules/card universe

Parse and account for every rule/subrule and glossary entry in the pinned source, preserving original spans and cross-references. Classify applicability with evidence. An unimplemented rule is not “not applicable.”

Create a many-to-many obligation graph linking exact rules/card/ruling versions to required state, processors, choices, implementation revisions, test specifications, and executed assertions.

Classify all eligible cards. Choose an initial risk-stratified sample of at least 300 eligible identities and expand it until discovered high-risk families are represented. This is an investigation floor, never the final supported-card limit.

For each difficult behavior, derive an expected result from sources, create a minimal fixture, implement it through the production path, and test it. Use independently constructed expectations or genuine separate review for high-risk cases. Do not invent reviewers or use the implementation's output as its own proof.

Use failures to revise the architecture. Slots and bitsets are hypotheses, not sacred constraints.

## Implement the engine and AOT compiler

Keep the engine pure and portable. It owns canonical in-memory state, rules-defined workflows, active effects, historical context, serializable continuations, chance state, and pending decisions. SQLite persists accepted results; it does not adjudicate rules.

Compile reviewed card definitions into a typed IR using versioned operations. No runtime LLM, `eval`, downloaded arbitrary code, or regex-based guessed resolution. Specialized operations require explicit state, decision, serialization, and regression contracts.

Use dedicated processors for setup, timing/priority, casting/payment, resolution, zones/identity, continuous characteristics, replacements/prevention, triggers, combat, automatic checkpoints, Commander/multiplayer, and outcomes/loops as required by the actual inventory.

Compile static definitions, slot taxonomies, hook indexes, dependency summaries, and selector plans ahead of time. Compute conservative dependency closure for match preparation. Keep registry-wide or class-bounded availability when dynamics require it; unknown dependencies widen selection. Never prune a rule merely because its keyword is absent from starting decks.

Separate hierarchical addresses from graph relationships. Keep rule definitions distinct from bound live instances. Boolean discovery returns candidates; exact contextual predicates and rules-specific processors decide applicability and consequences. No general highest-priority-wins cascade.

Implement a reference scan resolver first. Verify full-registry/reference, preselected/reference, and preselected/indexed paths against the same scenarios and games. Preserve finite-universe negation, conservative unknown bounds, source-relative bindings, event/history views, internal mutation epochs, and correct invalidation. Optimize only with measured end-to-end benefit.

## Expose decisions and make simulations run

Provide typed decision descriptors for constrained selections, modes, targets, amounts, payments, combat, ordering, and every required card/profile choice. Do not attempt a flat enumeration of all compound moves. Validate every response by actor, revision, decision identity, and full constraints.

Implement terminal, scripted, and deterministic exercise drivers through the same command path. Unknown decisions fail explicitly. Normal drivers cannot mutate state, call fixture APIs, peek at hidden information, or emit fabricated result events.

Create complete legal deck fixtures and drive ordinary setup through substantive play to real results. Deliver both two-seat and four-seat games early, before all-card implementation is complete. Then expand into the declared multi-deck regression corpus while closing all remaining card/rule obligations.

Do not call an immediate concession, a pass-until-deckout-only run, a small fictional deck, or a prearranged near-terminal scenario a qualifying full-game proof. Those can be separately labeled tests.

Persist accepted inputs, request-bound receipts, event batches, checkpoints, and revisions atomically. Preserve pending choices and continuations. Replay with exact source/engine/serializer/driver/chance versions and compare canonical hashes. Rebuild derived indexes after restoration.

A missing implementation, driver gap, timeout, restart, or exception is not automatically a completed game or a draw. Keep run status separate from rules outcome, retain all attempts, and make long computations bounded and resumable.

## Required release evidence

Produce an actual SQLite catalog, source manifests, eligibility and obligation inventories, executable release artifacts, reviewed scenario results, full-game traces, replay/recovery results, coverage reports, failed/minimized cases, browser parity results, and a clean-run command sequence.

Use the proposed floors in the acceptance plan: 24 initial high-risk scenarios; at least 12 versioned deck fixtures for expansion; 64 known-terminating regression games; and 1,024 fully accounted exploratory assignments. These are not a substitute for every eligible card's implementation and test obligations. Never report them as achieved before running them.

Do not hide failed seeds, count replay as a new game, infer coverage from “card loaded,” or hand-edit a gate status to green. Generate evidence from actual artifacts and keep exact build/source identities attached.

Full-snapshot publication requires complete source accounting, no unresolved applicability or relevant source conflicts, every eligible behavior/dependency/decision implemented and tested, passing regression and replay gates, and resolved observed semantic defects. State the actual assurance, not an exhaustive proof over every possible game.

## Continue through failure and completion

After each milestone, take the next executable step. Investigate, implement, run, inspect failures, minimize, fix, and rerun. Do not request routine reapproval or stop after generating a plan while execution tools and required inputs remain available.

If an actual access or execution limit blocks further work, preserve the runnable state, exact evidence, failed command, and next task. Mark the goal incomplete. Do not pretend to continue unattended, fabricate simulation results, silently narrow the card pool, or weaken an acceptance gate to finish.

**Your success criterion is a complete, auditable content release operating through real headless simulations—not an impressive proposal for one.**
