# Commander Engine — Complete Investigation-to-Simulations Specification

**Consolidated execution charter, design and architecture, investigation procedure, acceptance gates, and coding-agent prompt. Revision 3 — September 6, 2026.**

This is an implementation specification, not a completed engine or simulation report. The accompanying bundle also supplies component files and a machine-readable goal contract.

[Execution charter](#execution-charter) · [Design and architecture](#design-and-architecture) · [Investigation and acceptance](#investigation-and-acceptance) · [Implementation prompt](#implementation-prompt) · [Sources](#sources) · [Delivery status](#delivery-status)

---

<a id="execution-charter"></a>

# Commander Engine: Investigate, Compile, Simulate

**Execution charter and design-and-architecture specification — revision 3, September 6, 2026**

> Build a complete, versioned dataset for the declared Commander card pool; account for the applicable rules; compile reviewed card behavior and conservative ahead-of-time rule-selection plans; and keep implementing until real headless Commander games execute, persist, resume, and replay through the production rules engine.

**Working simulations are the required outcome. Documentation, a populated catalog, a SQL schema, a selector demonstration, or a mocked game trace is not completion.** A first successful game is a mandatory milestone, not permission to abandon full-snapshot coverage.

This package defines work to execute. It does not contain a downloaded card corpus or claim that a Commander simulation has already run. The preceding specification explicitly reported that no card behavior or match was executed. Its slot and Boolean prototypes are hypotheses and reusable starting material, not evidence of Magic correctness. See [Delivery status](#delivery-status).

## 1. Read this as an implementation mandate

Use [IMPLEMENTATION_PROMPT.md](#implementation-prompt) as the coding-agent entry point. The normative architecture is [DESIGN_AND_ARCHITECTURE.md](#design-and-architecture). The research procedure and pass/fail criteria are [INVESTIGATION_AND_ACCEPTANCE.md](#investigation-and-acceptance). [goal-contract.json](goal-contract.json) records the proposed milestones without pretending they have passed. External references are in [SOURCES.md](#sources).

Start from `matthewharwood/snapmatch` and reuse the useful ideas in `matthewharwood/auteur-toasty-review`. Work in a dedicated branch or derived repository. Do not deploy, alter production data, remove unrelated applications, or silently reinterpret existing Snapmatch saves.

Snapmatch's current agent guidance assumes Firebase-first authority. The derived engine needs an explicit replacement of that guidance, not conflicting instructions or blanket-disabled checks. Auteur currently resolves matching sparse variants to a winning block at a placement; adapt its publication, addressing, and provenance ideas without importing that winner-takes-placement behavior into Magic execution. [S8][S9]

## 2. Outcome and scope

The product is a **portable, data-driven, headless Commander simulator**, not yet a rendered game or a strategically intelligent opponent.

The authorized work comprises source acquisition, catalog normalization, a rules obligation inventory, a typed executable card registry, ahead-of-time compilation, runtime rule selection, exact rules execution, structured player decisions, local SQLite persistence, replay, a scripted simulation runner, and browser-worker portability evidence.

Do not implement a React gameplay interface, IWSDK scenes, VR input, online multiplayer, a full CMS editor, deck optimization, trained AI, LiteRT inference, MAB, or a generic framework in this workstream. Preserve narrow interfaces so those consumers can attach later.

**A simulation driver is allowed and required.** It answers legal decisions to exercise the engine. It is test infrastructure, not the deferred AI-versus-AI research product. Scripted choices and simple deterministic decision rules are enough to begin. Seeded exploratory selection may find bugs; it is not evidence of strategic strength or deck quality.

## 3. Define “complete” precisely

Freeze a named source release with exact hashes and dates. The default profile is ordinary tabletop Commander, with two-player and free-for-all multiplayer configurations explicitly distinguished. Do not silently substitute Duel Commander, Brawl, a bracket recommendation, or a house-rule ban list. Official rules, format policy, and card data are separate inputs. [S1][S2][S3]

| Coverage | Required meaning |
| --- | --- |
| Source inventory | All records from the chosen source archives were processed and reconciled; malformed and excluded records have explicit dispositions. |
| Commander catalog | Every eligible gameplay identity and its relevant faces, names, source facts, role constraints, and versions is represented. |
| Supporting content | All required referenced/generated object templates, supplementary data, and legal name-choice metadata are available. These are not necessarily eligible deck cards. |
| Rules accountability | Every numbered rule/subrule and glossary item in the pinned document has an applicability disposition; every relevant semantic obligation is linked to implementation and tests. |
| Executable coverage | Every eligible card's behavior, characteristic, cost, decision, and dependency obligations have reviewed implementations and passing evidence. |
| Simulation capability | Real legal decks progress from setup to genuine outcomes through the normal command path, with durable replay and no manual rule fixes. |

“All cards” means all gameplay identities in that declared Commander snapshot, with complete semantic records—not a claim to download every cosmetic printing, language, or image. Preserve broader source records where needed for reconciliation and dependencies. Do not discard records solely because they cannot be placed in the main deck.

Account for all rules in the source, but implement those relevant to the declared profile and reachable content. A rule for another optional format can be marked not applicable with evidence. “Not implemented” is never a valid synonym for “not applicable.” Unknown applicability remains an open obligation.

Full-snapshot release support means the scoped obligations are implemented and supported by the declared tests. It is not a mathematical claim that every possible game has been exhaustively enumerated or that no undiscovered bug exists.

## 4. The end-to-end architecture

```text
Authoritative sources and provider data
  official rules + format policy + card facts + rulings
                         |
                         v
Versioned acquisition and investigation
  raw archives -> normalized SQLite catalog -> obligation graph
                         |
                         v
Reviewed executable content
  card definitions + processor contracts + slot/selector programs
                         |
                         v
Ahead-of-time compiler
  type checks + dependency closure + static plans + sound pruning
                         |
                         v
Immutable content release and match manifest
  exact source/definition/compiler/engine versions + deck revisions
                         |
                         v
HEADLESS RUNTIME
  canonical state -> candidate discovery -> exact contextual checks
  -> rules-specific processing -> decision or outcome
       ^                                   |
       |                                   v
script/terminal driver          atomic SQLite history/checkpoints
                                           |
                                           v
                               replay, coverage, failure traces
                                           |
                                           v
                        later: human UI, VR, AI, remote authority
```

Do not make SQLite a runtime interpreter, Jotai a rules authority, or a CMS HTTP request a prerequisite for advancing a game. The engine owns the in-memory state; storage makes accepted transitions durable.

## 5. Investigate by building, not by postponing implementation

Conduct a short initial source/repository audit, then immediately build the importer and a reference executor. Research and implementation must proceed together.

Every difficult interaction should produce a chain of evidence:

```text
source rule + exact card revision
  -> identified modeling question
  -> minimal scenario with independently justified expectations
  -> data/processor design or correction
  -> executable regression
  -> complete-game integration when practical
```

Maintain a full-corpus inventory from the start. Select a risk-stratified modeling sample from that inventory, initially targeting at least 300 distinct eligible identities, expanding whenever a mechanic or exceptional pattern is missing. That target is a research floor, not a stopping point, and is not the earlier prototype's generated Boolean tests. Favor distinct behaviors, complex choices, object forms, history, and cross-processor interactions over popularity or easy syntax.

Classify every card before claiming full inventory analysis; implement and verify every eligible card before claiming full executable support. Use shared mechanics to reduce duplicated work, not to replace card-specific review with a keyword count.

## 6. Ahead-of-time selection: the commitment and the limit

Compile what is actually static: immutable definitions, typed selector ASTs, hook taxonomies, primitive dependencies, binding layouts, conservative read footprints, and query plans. Select and preload a match's known dependency closure.

Do not claim to precompute which rules will apply at every future moment. Control, type, ability, target, event, and historical facts remain runtime questions.

The compiler may remove a candidate only with a supported justification that it is unreachable under the pinned profile and content contract. Otherwise retain it or retain a deterministic, offline resolver into the pinned registry. Lazy loading is not permission to discover a missing implementation halfway through a supposedly supported match.

At runtime:

```text
actual applicable instances ⊆ discovered candidates
exact refinement(candidates) = reference applicable instances
```

False-positive discovery can cost time. False-negative discovery changes the game. A general rule does not disappear merely because the initial decks do not print its keyword.

## 7. Slots are an experimental optimization boundary

Use two typed hierarchies: addresses for inspecting game data, and processing hooks for asking rules questions. Keep control, ownership, attachments, linked abilities, and sources as graph relations rather than cascading parent/child ownership.

The selector returns a set of distinct bound rule instances, not a single winning rule. Boolean operations find candidates; specialized processors own meaning, order, and player choices.

Build the slow reference path first. Compare complete outcomes and traces against the indexed path, including event rewrites, control/type changes, state restoration, and intermediate characteristic views. Enable optimization by measured benefit and zero observed semantic divergence in its release gate. If scans are better or the proposed hierarchy fails a required interaction, change the optimization—not the rules.

## 8. Local technology and isolation

Retain Bun, Turborepo, TypeScript, Zod, and useful existing quality gates. Use `bun:sqlite` behind a native repository adapter for the CLI. The same pure TypeScript engine must also run in a browser Worker with a separately tested SQLite WASM adapter. Both native SQLite and browser persistence have documented platform APIs; their deployment and locking behaviors are not interchangeable. [S6][S7]

Preserve React/TanStack/Jotai only as future presentation infrastructure. Remove Firebase, IndexedDB domain replication, and Pixi from the derived game's execution requirements. Do not introduce Axum, an ORM, another global state manager, or a generic policy server merely to express rules.

A local process is sufficient; no HTTP game server is required for the first simulations.

## 9. Definition of a real simulation

A qualifying full game begins with valid deck revisions and ordinary profile setup. Drivers can submit only the same commands a future human interface would submit. The engine determines all consequences.

At least the first two-player and four-player evidence games must include actual casting or activation, meaningful combat/effect interaction, and an unforced rules-defined end. Neither an immediate concession, an empty-library-only pass script, nor a constructed endgame position substitutes for these proofs. Separate end-condition tests may deliberately exercise those cases.

Persist the initial manifest, accepted decisions, chance operations or reproducible chance state, event batches, checkpoints, final outcome, state hashes, coverage hits, and execution build identity. Reload and replay against the same content release. Differences are failures to investigate, not acceptable nondeterminism.

A missing behavior, unresolved script choice, watchdog timeout, or engine exception is a run failure or paused run—not a Magic draw or loss. Never hide these attempts from batch denominators.

## 10. Milestones that cannot be confused

| Gate | Required result |
| --- | --- |
| G0 — Baseline | Headless workspace and source/version contract established; no production mutation. |
| G1 — Dataset | Full frozen source inventory reconciled into SQLite, including rules, rulings, role-aware eligibility, and dependencies. |
| G2 — Semantic proof | Reviewed high-risk scenarios execute through the real registry, processors, choices, and persistence. |
| G3 — First simulations | Both two-seat and four-seat games finish through ordinary setup and play; reload/replay passes. Do not stop here. |
| G4 — Regression simulations | The declared multi-deck batch, scenario suite, optimized/reference comparisons, and browser parity produce retained evidence. |
| G5 — Full-snapshot support | Every applicable rule/card/decision/dependency obligation is covered; no unresolved semantics or silently excluded eligible card remains. |
| G6 — Handoff | Reproducible release and player-visible session contract are usable without learning implementation internals. |

G3 is the first mandatory simulation milestone. **The project goal is G1 through G6, not “a demo ran.”** Do not defer all gameplay until every card is finished; use the games to discover and repair modeling errors while coverage expands.

## 11. Continuation instruction

While execution tools and inputs are available, continue through implementation, tests, debugging, and reruns. Do not end the assignment with a plan, schema, generated backlog, or request for routine permission after completing only research.

Keep individual jobs bounded and resumable. If an actual access restriction or execution limit prevents further work, preserve the working state, record the exact failed command and next executable step, and report `INCOMPLETE`. Do not fabricate a completion claim, promise unattended work, remove a hard card from the target, or ask to reconfirm the already authorized headless scope.

**The finish line is real simulations backed by a complete, auditable content release—not more confidence in an untested architecture.**

[S1]: #s1
[S2]: #s2
[S3]: #s3
[S6]: #s6
[S7]: #s7
[S8]: #s8
[S9]: #s9


---

<a id="design-and-architecture"></a>

# Design and Architecture — Evidence-Driven Commander Engine

**Normative proposal, revision 3.** Read with [README.md](#execution-charter) and [INVESTIGATION_AND_ACCEPTANCE.md](#investigation-and-acceptance). The schema names and APIs below are proposed contracts to implement and test, not existing functionality.

## 1. Architectural decision and alternatives

The default implementation is a pure TypeScript rules core, reviewed typed behavior programs, a conservative selector compiler, and adapters for local storage and player decisions. It is intended to fit Snapmatch's Bun/TypeScript workspace while remaining independent of its browser application. [S8]

Do not commit to a new engine without examining reuse. The investigation must compare three approaches on the same difficult fixtures, record actual evidence, and choose or revise an architecture decision record (ADR).

| Candidate | Reason to investigate | Required evidence and trade-off |
| --- | --- | --- |
| Portable TypeScript core with reviewed IR | Direct fit with the chosen runtime and browser-worker target; controlled schema and continuation model. | Highest responsibility for implementing semantics. Require early complete games, not only a beautiful DSL. |
| Adapt an existing automated Magic engine or its licensed assets | Potential reuse of card implementations, regressions, and battle-tested modeling choices. | Inspect exact repository/license/build, card coverage, version alignment, state/decision access, portability, and deployment assumptions. Do not assume a Java engine is a browser library or a test oracle. |
| Portable native/WASM core behind the same protocol | Potentially attractive if an actual reusable implementation or measured bottleneck warrants it. | Validate build/debug/serialization complexity and identical native/browser traces. Do not add a second language based on presumed speed alone. |

A generic CMS cascade or authorization-policy product is not a substitute for the engine. It may offer authoring/query ideas, but the required workflows, contexts, ordering, and continuations still have to exist.

Reuse assessment is a focused work package, not a reason to postpone the first importer and reference runtime. Source inspection may change the choice; undocumented assumptions may not.

## 2. Package ownership and runtime placement

```text
apps/engine-cli           commands, terminal adapter, local run orchestration
packages/contracts        schemas for commands, decisions, views, manifests, saves
packages/catalog          source normalization, eligibility, identity reconciliation
packages/card-programs    reviewed definition builders, versioned typed IR
packages/compiler         program validation, dependency closure, selector plans
packages/engine           state, processors, scheduling, queries, pure transitions
packages/storage          migrations, repositories, native and browser adapters
packages/simulation       scripts, deterministic test drivers, batch evidence
packages/test-support     fixtures, assertion tools, fuzzing and failure reduction
tools/investigation       source audit, obligation mapping, corpus/sample analysis
```

These are ownership boundaries, not a requirement to create empty packages. Start with fewer coherent modules if that speeds real implementation.

`engine` may depend on pure contracts and immutable executable content. It must not import SQL drivers, network clients, clocks, filesystem APIs, React, Jotai, IWSDK, Firebase, or ML libraries. CI must enforce the import boundary.

The initial host is a Bun CLI with a native SQLite adapter. A browser Worker later hosts the same engine and coordinator with SQLite WASM. The documented persistence implementations differ, so browser portability is an executed test, not a packaging assumption. [S6][S7]

No HTTP game server, account, headset, renderer, or trained policy is required to reach simulations. A future consumer receives `PlayerObservation`, `DecisionRequest`, and redacted events and submits validated answers.

## 3. Sources, provenance, and the dataset

### 3.1 Authority and source roles

Use the official rules landing page to discover the current Comprehensive Rules artifact. Pin its bytes, hash, reported effective date, and retrieval metadata. Capture Commander policy and banned/restricted evidence separately. Card data and rulings are acquisition inputs; unresolved contradictions with authoritative rules/policy require investigation. [S1][S2]

Use Scryfall bulk metadata to discover the Oracle-card and rulings archives. Its documented 2026 transport uses gzip-compressed JSONL through `jsonl_download_uri`; use source metadata rather than a guessed dated filename. Rulings have their own provenance and are not necessarily all authored by Wizards. Preserve their source and publication metadata. [S3][S4][S5]

Do not derive an effective date from an artifact filename. The rules text linked during this review reports August 7, 2026 even though the linked filename contains another date. Recheck on implementation day rather than hard-coding that review result. [S1]

Do not assert historical legality from today's source. A historical release needs historical evidence. A source bundle may contain several independently updated archives; preserve each timestamp and identify unresolved consistency issues rather than pretending it is an atomic global snapshot.

### 3.2 Acquisition algorithm

Implement `discover -> fetch -> verify -> parse -> stage -> reconcile -> publish`.

Discover metadata through the documented interface, using accurate required request headers and endpoint-aware throttling. Respect `Retry-After`; do not crawl individual card or rulings pages when a bulk source is available. [S3][S5]

Download to a temporary content-addressed archive with cancellation, bounded retries, and progress. Resume a partial transfer only when the source's validator and range support make that safe; otherwise restart. Distinguish HTTP content decoding from archive decompression. Compute hashes at documented byte layers so transparent transport decompression cannot invalidate comparisons.

Stream records and stage bounded SQL batches under an unpublished import ID. Store record identity, source ordinal, schema version, normalized links, and a recoverable reference to the original payload. Malformed rows go into quarantine with enough evidence to reproduce the failure. Unknown fields are preserved; unknown semantics are reviewed rather than silently discarded.

After complete parsing, reconcile all record counts and links, verify end-of-file and decompression success, run integrity checks, and classify every record. Interrupted work cannot modify the active release. An identical archive must produce identical semantic hashes and an idempotent import result.

Use an immutable verified source bundle as the input to analysis. Publication of a source bundle does not certify executable support.

### 3.3 Identity and normalization contract

Separate provider printing identity, gameplay identity, card semantic version, name-equivalence group, face identity, and executable definition revision. Provider merges or corrections create explicit reconciliation records; they must not rewrite old releases or saves.

Retain root and per-face facts, layout, names, mana-cost structure, colors and color identity, type components, text, characteristic expressions, legalities, related-object links, and original payloads. Scryfall documents these separately; a flattened name/text/cost record is insufficient. [S4]

Preserve missing versus zero costs, symbolic characteristics, special numeric encodings, absent versus empty values, and alternate/interchangeable names. Imported display values are not always the runtime value of a characteristic. Name equivalence may affect deck construction without implying interchangeable executable versions.

Maintain a broader catalog for valid name choices and supporting content. Tokens, emblems, supplementary objects, and runtime-generated copies need explicit representations, not counterfeit Oracle IDs. A related-parts list is a useful link source, not proof that every semantic dependency was enumerated.

Determine release eligibility using the pinned evidence. A representative printing's `released_at` is not necessarily the gameplay identity's first qualifying release; do not reject a long-existing card merely because its selected reprint is in the future. Resolve printing/identity differences explicitly.

### 3.4 Role-aware eligibility

Store format, effective source, identity, role, allowed/forbidden status, conditions, and rationale. Evaluate main-deck, commander, additional-commander, companion, and supplemental roles separately where the profile needs them.

Do not reduce every restriction to one Boolean on the identity. For example, the official Commander list observed during this review distinguishes a companion-only restriction. Treat that as a reason for a role-aware model, not a permanent hard-coded special case. [S2]

Admission also validates composition, counts, identity constraints, naming equivalences, and applicable exceptions. Keep profile rules, source legality, and card-provided construction behavior separate. Record every disagreement instead of silently choosing whichever source makes a deck pass.

## 4. Investigation data is part of the product

The previous card/session schema is a candidate foundation, not a prescribed fixed table count. Add or revise migrations according to demonstrated constraints. Preserve the meaning of existing immutable records.

| Entity group | Proposed records and invariants |
| --- | --- |
| Acquisition | `source_bundles`, `source_archives`, `import_runs`, `source_records`, `quarantine_records`; hashes, status, counts, provenance. |
| Catalog | `card_identities`, `card_versions`, `card_faces`, `printing_refs`, `name_groups`, `identity_migrations`, `card_relations`; exact versioned links. |
| Policy | `rules_profiles`, `eligibility_decisions`, `deck_revisions`, `deck_entries`; role-aware constraints and pinned evidence. |
| Rules | `rules_documents`, `rule_nodes`, `rule_references`, `glossary_terms`, `rulings`; preserve source addresses and text hashes. |
| Obligations | `behavior_obligations`, `obligation_sources`, `obligation_dependencies`, `card_obligations`, `implementation_links`; many-to-many mapping. |
| Research | `modeling_questions`, `research_findings`, `sample_members`, `architecture_decisions`; questions, counterexamples, decisions, open issues. |
| Executable content | `definition_revisions`, `programs`, `selector_revisions`, `rule_fragments`, `dependency_edges`, `processor_capabilities`; immutable implementations. |
| Releases | `content_releases`, `release_members`, `compiled_artifacts`, `pruning_decisions`; compatibility and evidence references. |
| Verification | `test_specs`, `test_obligation_links`, `test_runs`, `verification_artifacts`, `coverage_snapshots`; actual executed evidence tied to builds. |
| Matches | `match_manifests`, `accepted_inputs`, `command_receipts`, `event_batches`, `checkpoints`, `simulation_runs`; deterministic lineage and explicit outcomes. |

Do not store every mutation as an EAV row or duplicate the live object graph across SQL and a separate store. Normalize durable authoring/evidence identities; persist validated runtime checkpoints and ordered journals.

### 4.1 Rule-source parsing

Parse numbered rules, subrules, examples, glossary definitions, and references while preserving their original source spans. Distinguish body entries from table-of-contents labels. Validate duplicate IDs, unresolved references, lost continuation text, and parser coverage. Do not assume sequential letters or stable rule numbering across editions.

`RuleNodeId` is scoped by document hash. A cross-reference graph may legitimately contain cycles. A source document's textual nesting is not the engine's execution order, and is not the runtime slot tree.

### 4.2 Obligation records

An obligation is an implementable behavior, invariant, decision contract, or source applicability requirement. Multiple rules may support one obligation; one rule or card may create several obligations.

Each obligation needs:

```text
id; kind; source references and exact source versions
profile applicability and justification
required state; processor owner; required decisions; dependencies
implementation revision; test specifications; executed test references
status; unresolved questions; review provenance
```

Suggested workflow: `unclassified -> specified -> implemented -> tested -> reviewed`, with separate `blocked` and `not-applicable-with-evidence` dispositions. Keep applicability separate from implementation progress.

Regex and automated text clustering can propose classifications. Neither a successful parse nor a model's confidence certifies semantics. Ambiguous text, obsolete rulings, unusual layouts, and unsupported choices must appear in the work queue.

## 5. Executable card programs

### 5.1 Representation

Compile reviewed TypeScript data builders or schema-validated definition files to a typed intermediate representation. A definition declares base/copiable characteristics, role/construction behavior where needed, casting/activation descriptions, ability programs, selectors, source bindings, durations, and dependencies.

Program families include typed references, expressions, costs, selection/target constraints, operations, sequential/simultaneous groups, conditionals, explicit continuations, and controlled repetition. Keep triggered, static, activated, replacement, prevention, and permission/restriction structures distinguishable.

A program references versioned engine operations; it does not contain arbitrary downloaded JavaScript. No runtime `eval`, natural-language guessing, or general table-writing permission is allowed. A specialized operation can be added when real data requires it, but must expose state, decision, serialization, and test contracts.

### 5.2 Coverage without false equivalence

For each card, split out every observable behavior, including behavior derived from characteristics rather than text. Link every obligation to shared operations and specific parameter tests. Shared implementation reduces duplication; it does not eliminate the need to check the card's bindings, defaults, options, and interactions.

Track source presence, eligibility, classification, implementation, decision coverage, regression status, and review independently. A successful compile is not a semantic test. A card present in a deck but never exercised is not executed-card coverage.

A reachable unimplemented operation returns `UnsupportedMechanic`, not a no-op and not an illegal-move ruling. A release advertised as full-snapshot support cannot contain such a reachable hole.

## 6. Ahead-of-time compilation and rule selection

### 6.1 Four binding stages

| Stage | What becomes known | What must remain open |
| --- | --- | --- |
| Source/profile analysis | Allowed content versions and profile-level requirements. | Future board state and live choices. |
| Content compilation | Typed programs, selector DAGs, processor contracts, dependency summaries. | Source-instance bindings and changing characteristics. |
| Match preparation | Deck revisions, starting configuration, preload set, initial chance configuration. | Objects and effects created later; opponent decisions. |
| Runtime evaluation | Current/proposed/historical facts and rules-required choices. | Future game states; strategic value is outside this engine. |

Build artifacts such as `ContentRelease`, `MatchPlan`, `HookIndex`, `SelectorPlan`, `DependencyManifest`, and `PruningReport`. These names are proposed data contracts.

### 6.2 Compiler pipeline

Validate exact source/definition compatibility; type-check programs, selectors, bindings, and numeric domains; resolve primitive/processor ABIs; reject unknown operations; build a dependency graph; compute conservative closure; compile hook and address taxonomy indexes; assign safe selector plans and read footprints; record pruning decisions; then publish immutable manifests with evidence references.

Do not require a perfect automatic English parser to make progress. Review and implement behavior families while the classifier exposes remaining work.

### 6.3 Reachability and safe pruning

Dependencies include explicit named definitions and dynamic classes: copied abilities, granted abilities, type-provided capabilities, generated templates, name catalogs, supplemental mechanics, and any registry lookup supported by the profile. A dependency may be `exact`, `class-bounded`, or `registry-wide`.

For roots `R` and dependency relation `D`, begin with `C0 = R` and expand `C(i+1) = Ci union dependencies(Ci)` until the finite definition-identity closure stabilizes. This is a build-time set computation, not a fixed-point replacement for game semantics. Unknown dependencies widen the set; they never disappear.

Always retain core semantic capabilities needed by the profile. A class-bounded dependency must have a tested, versioned bound. A registry-wide dependency retains access to the complete required pinned registry. If an executable dependency is not implemented, preflight rejects the development configuration explicitly. Full-snapshot release publication remains blocked.

A prune record contains the excluded identity or capability, assumptions, source/profile constraint, dependency proof or conservative analysis, compiler version, and tests. Current zone, printed keywords, controller, or current target count are not sufficient grounds for permanent exclusion.

Preloading can be narrow while executable availability is broad. A declared offline resolver can materialize an already-certified definition from the same release; it may not fetch mutable web data or invent missing code mid-match.

### 6.4 What AOT cannot freeze

Do not freeze affected-object sets, replacement applicability, dynamic characteristics, target validity, order choices, or active source lifetimes from the starting position. Compile *how to ask* those questions, not all future answers.

This is the defensible reuse of Auteur: immutable authoring revisions and compiled plans with provenance. Its current single-placement cascade is not reused as effect precedence. [S9]

## 7. Runtime slots and Boolean lookup

### 7.1 State is a graph; indexes may be hierarchical

Use a typed address hierarchy over canonical records:

```text
match
  players/{id}/resources, history, personal-zones
  shared-zones/{zone}/objects
  turn/phase/step/priority/combat
  effects/{id}
  execution/{frame}
  decisions/{window}
```

The zone adapter must reflect the pinned rules; it is not a freely authored container tree. Keep ownership, control, source, attachment, defender, and linked-object relations explicit. Do not cascade-delete an effect merely because its source leaves an address.

Use a second hierarchy for hooks such as `query.characteristics`, `occurrence.proposed.zone-change`, `occurrence.committed.zone-change`, and `checkpoint.state-based`. Hook ancestry adds discoverable subscriptions only when declared. It does not override lower handlers or run them immediately.

A rule definition can have multiple live instances. Retain distinct instance IDs and source/capture context. Deduplicate discovery paths, never independent copies of the same effect.

### 7.2 Availability, activation, selection, and execution are different

Keep these stages explicit:

```text
definition available in the frozen registry
  -> instantiated or retained as rules-relevant source/history context
  -> discovered as a candidate at a particular processing hook
  -> exact applicability established in the required view
  -> ordered or presented for a required player choice by its processor
  -> effect executed or contribution used
```

Loading the full registry does not activate every printed ability. A definition's presence in a deck or archive does not make its effect apply. Runtime lifetime and zone rules determine valid instances and necessary historical contexts. The reference scan enumerates those potentially applicable instances plus core procedures, not every card's abilities as though all cards were on the battlefield.

The compiler certifies availability and query plans. The runtime owns activation and changing applicability. Keeping these identities separate is mandatory for meaningful pruning tests.

### 7.3 Typed predicates and result domains

Selectors are pure typed ASTs or shared DAGs supporting conjunction, disjunction, negation, ancestry, scalar comparison, set membership, bound relations, exact numeric ranges, and reviewed residual predicates.

Object masks, rule-instance masks, and player masks are different domains. Every mask includes universe identity, generation, and evaluation-view identity. Tail bits are cleared. Missing data, a false predicate, and an unindexed predicate have different meanings.

Keep arbitrary expressions compact; do not explode a general Boolean formula into all possible world assignments or full disjunctive normal form.

### 7.4 Exact reference and conservative indexes

First implement `ReferenceResolver`, which scans all potentially applicable bound instances and evaluates exact predicates in the required context. Then implement indexed discovery behind the same interface.

For exact masks over finite universe `U`:

```text
AND = intersection
OR  = union
NOT = U minus operand
```

For approximate discovery, maintain bounds `L subset-of Exact subset-of H`:

```text
AND: L = L1 intersect L2; H = H1 intersect H2
OR:  L = L1 union L2;     H = H1 union H2
NOT: L = U minus H1;     H = U minus L1
```

An entirely unindexed atom has `L = empty` and `H = U`. Evaluate the exact residual over `H`. The uncertainty is in the index, not the game law. Unavailable authoritative semantics yield a diagnostic, not a guess.

A bitset/matrix model can accelerate filtering; it does not establish how characteristics or rules consequences are computed. These equations are the proposed conservative query contract, not a claim of measured performance.

### 7.5 Views, invalidation, and ordering

A cache key needs the match/revision, internal mutation epoch, read lens, event version, processor/layer progress, source bindings, and universe generation. A committed revision alone cannot distinguish multiple changes within one transition.

Read lenses include current state, before an occurrence, proposed occurrence, after an occurrence, and a rules-defined characteristic-evaluation prefix. Begin with broad invalidation and rebuilding. Only narrow it after reference-versus-indexed tests.

Maintain separate orders for structural collections, query cost planning, rules semantics, and display. Never use selector specificity or an arbitrary numeric priority as general effect precedence. Dedicated processors implement the pinned requirements for effect interaction, replacements, and triggers. [S1]

Do not run arbitrary callbacks on every emitted log line. A diagnostic event is not a game occurrence. The scheduler owns when a processor asks its hook.

### 7.6 Keep the optimization replaceable

Benchmark end-to-end transitions including index construction, invalidation, residual predicates, joins, allocations, and persistence overhead. Candidate count alone is not speed. For small populations, the scan may remain the production choice. Removing the bitset planner must not remove functionality.

## 8. Runtime state and execution

### 8.1 Canonical records

```text
RulesState
  compatibility: engine, profile, registry, IR, serializer versions
  revision and internal execution epoch
  ordered seats and player resources/history
  physical card lineages and current object generations
  ordered zones, stack membership and stack-object metadata
  base/copiable characteristics and required historical information
  turn, priority, combat and multiplayer elimination state
  active effects, ability contexts, waiting/delayed triggers
  resumable execution frames and pending decision windows
  chance algorithm/state and recorded chance operations
  current game outcome and any restart lineage
```

Derived masks, caches, and inspection addresses can be rebuilt. A bit ordinal is not an object ID. An object may represent a token, copy, or multiple underlying components; do not force one physical card per current object.

Use deterministic arithmetic and a portable canonical encoding for large exact integers. Preserve symbolic values until evaluated. Define map/set ordering and omit wall-clock diagnostic metadata from semantic hashes.

### 8.2 Processors, not a giant card tree

| Processor | Required contract to implement and verify |
| --- | --- |
| Profile/setup | Deck admission, player setup, startup choices, profile parameters. |
| Turn/priority | Turn-based workflow, passing, stack progression, special actions. |
| Casting/activation/payment | Staged choices, constraints, cost determination, permitted resource actions, valid completion/reversal. |
| Objects/zones | Identity transitions, ordered membership, copies, attachments, component links. |
| Continuous characteristics | Rule-directed layered/dependency evaluation and correct read views. |
| Replacement/prevention | Propose, find, choose where required, transform, and reevaluate occurrences. |
| Trigger handling | Detect from the appropriate context; preserve source/history; request ordering/target choices at the right time. |
| Resolution | Interpret programs and yield/resume required choices. |
| Combat/damage | Attack/block constraints, assignment choices, damage batches and consequences. |
| State-based coordination | Automatic checks at prescribed boundaries, including simultaneous work. |
| Commander/multiplayer | Format-specific tracking and choices, seat changes, elimination effects. |
| Results/loops | Genuine outcomes, explicit shortcuts, restarts, and operational stop distinctions. |

This is an investigation checklist, not a claim that naming these processors implements all applicable rules. The obligation graph must demonstrate actual coverage.

### 8.3 Serializable continuations

An execution frame records program/version, instruction position, parent return destination, bound references and values, source context, relevant history, proposed event state, replacement history, and staged-workflow recovery information.

When a player must choose, yield with the entire continuation available for a checkpoint. Do not persist promises, generator closures, network handles, or callbacks. Saving mid-effect must resume the same semantic point.

Not every possible choice is enumerable. Use symbolic descriptors for amounts, allocations, modes, payments, or constrained combinations, with exact validation. Candidate pagination is a convenience and cannot replace cross-choice validation.

### 8.4 One authoritative transition path

The coordinator parses a command, verifies identity/revision/decision ownership, creates a candidate transition, executes until the next boundary, validates invariants, persists atomically, then publishes permitted results.

Rules processes may request further decisions; they do not turn a partially specified action into probabilistic legality. Distinguish:

```text
Accepted -> WaitingForInput | GameFinished | EnginePaused
Rejected -> invalid command, unchanged committed state
Unsupported -> missing implementation, not an illegal Magic action
Fault -> execution or storage failure, not a game outcome
```

An execution budget produces an explicit paused/incomplete run with a continuation where supported. Do not rename it a draw to satisfy a simulation target. Support rules-defined impossible instructions separately from missing engine functionality.

## 9. Decisions, simulation drivers, and privacy

`DecisionRequest` contains a stable decision/window ID, actor/chooser, revision, kind, visible context, legal-domain descriptor, constraints, and explanatory codes. A response references this exact decision and is revalidated against canonical state.

The runtime may hold hidden state, but the ordinary driver receives only the same player observation and allowed choice view a future interface would receive. Tests may inspect privileged state for assertions; they must not silently pass it to a supposedly ordinary player controller.

Implement three distinct adapters:

| Adapter | Purpose | Failure behavior |
| --- | --- | --- |
| Terminal | Human selects a legal action without a frontend. | Show required choice and validation error; never auto-adjudicate missing semantics. |
| Authored script | Replay/assert a particular legal sequence, including rare decisions. | Fail at the first mismatched decision or missing script branch. |
| Deterministic exercise driver | Run larger regression batches with simple, versioned legal-choice rules. | Explicit `DriverUnsupportedDecision` for a missing decision handler. |

An optional seeded exploratory driver can search for bugs. It is not required to be strategically competent, and win rates from it must not be marketed as deck strength. Its randomness is separate from game randomness.

Expose no normal `SetLife`, `DeleteObject`, `ResolveByText`, or `ForceWin` endpoint. Scenario arrangement belongs to a privileged fixture API that cannot be used during a qualifying complete game. Do not leak hidden cards through candidate IDs, sorting, errors, or traces.

## 10. Storage, replay, and instrumentation

In one short transaction, persist accepted input, request-bound idempotence receipt, resulting event batch, compatible checkpoint, and new match revision. Compute outside that transaction; never hold it open while waiting for a player. Publish only after commit.

Begin with checkpoints at each accepted-input boundary and sufficient workflow checkpoints for interrupted execution. Optimize journal/checkpoint frequency later. A replay uses either recorded commands with a compatible engine or recorded presentation events; never apply both as independent mutations.

Record chance operations, algorithm versions, and separate driver/game seed domains. Reject stale commands without consuming authoritative chance state. Exact replay requires decisions and versions, not only a seed.

Game events include semantic batches with cause, source, visibility, and simultaneous-group identity. Diagnostics can include rule candidate/refinement and processor-order traces, but they are privileged evidence rather than gameplay occurrences.

Proposed evidence events include `SourceBundleVerified`, `DefinitionCompiled`, `DecisionRequested`, `CommandCommitted`, `GameFinished`, `ReplayVerified`, `SimulationAborted`, and `CoverageMeasured`. Proposed game events include `SpellCast`, `DamageDealtBatch`, `ObjectsMovedBatch`, and `TriggeredAbilityStacked`. These are API names to implement, not official rules vocabulary.

Coverage instrumentation must distinguish loaded, instantiated, queried, matched, executed, asserted, and independently reviewed. An ability evaluated but never applied is not the same as an executed/asserted behavior.

## 11. Key invariants and failure recovery

Enforce valid object and zone references, authoritative stack order, correct actor ownership, bounded visibility, live continuation references, release/definition compatibility, and deterministic canonical encoding. Preserve simultaneous groups and source multiplicity.

Invalid input cannot partially mutate committed state. Retrying the same command ID and payload returns the prior receipt; using that ID for different content fails. Interrupted imports leave the old release available. Interrupted simulations retain their last valid checkpoint and exact failure identity.

Use new namespaces for this game's data. Never import raw SQL as a save. Validate logical exports, bound sizes, verify dependency hashes, and choose explicit new-match or overwrite semantics.

A browser-worker parity test must run the same scenarios and compare canonical boundaries with native execution. Browser persistence locking, quota/availability, and reload recovery are separate tests. [S7]

## 12. Performance and release governance

Measure import memory and throughput, compile size/time, active-match memory, selector maintenance, characteristic-query cost, transition latency, SQLite commit latency, and replay speed on declared hardware.

The bitset operation count is only one term. No constant-time whole-game resolution claim is permitted. AOT pruning and incremental caches must be reversible optimizations with the same semantic results as the reference path.

A release pins source bundle, profile, exact definitions, IR, selector compiler, processor ABI, serializer, host build, and evidence hashes. Source text or rules changes invalidate affected approvals through dependency links; they do not silently update ongoing matches.

Publish development subsets honestly. Publish full-snapshot support only when the obligations and simulation gates in the acceptance document pass. Missing semantics are fixed or remain release-blocking—not hidden behind optional-feature labels.

Future LiteRT/MAB/VR/network consumers attach through decision, observation, and session boundaries. No speculative implementation of those consumers is needed now.

[S1]: #s1
[S2]: #s2
[S3]: #s3
[S4]: #s4
[S5]: #s5
[S6]: #s6
[S7]: #s7
[S8]: #s8
[S9]: #s9


---

<a id="investigation-and-acceptance"></a>

# Comprehensive Investigation and Simulation Acceptance

**Required execution plan. All quantities below are proposed acceptance floors, not results already achieved.** Research artifacts must drive implemented scenarios and games. Read the [architecture](#design-and-architecture) for the data and execution contracts.

## 1. What the investigation must establish

Determine whether the proposed data model represents the complete declared card pool; whether the rules obligations have owners and executable semantics; whether ahead-of-time selection is sound; whether the runtime makes correct transitions and decisions; and whether complete games can run, persist, and reproduce without presentation or manual rule edits.

Investigate the slot/Boolean approach as a hypothesis, not as a requirement to preserve every prior design choice. Keep what survives adversarial fixtures and end-to-end measurement. Replace a failing representation with an ADR, migration, and regression evidence.

Maintain one `investigation-status` report containing source versions, coverage denominators, actual executed work, failed commands, open modeling questions, release blockers, and the next runnable task. Do not reset its evidence when an iteration fails.

## 2. Work package A — Establish a reproducible baseline

Inspect Snapmatch's agent instructions, state architecture, manifests, generator templates, scripts, and relevant tests. Record the repository commit, working-tree modifications, tool versions, and baseline test results. Inspect Auteur's actual resolution and publication code before citing it as implemented capability. Do not infer behavior from the names “slots,” “variants,” or “Boolean algebra.” [S8][S9]

Create an engine-specific architecture override and new database namespace. Retain meaningful quality gates, replacing provider-specific requirements only where this derived project no longer uses them. Existing production services and unrelated user code are outside scope.

Produce an ADR comparing the reference TypeScript approach with reuse/port alternatives. Examine exact licenses and dependency boundaries before adopting code. An independent engine is a comparison target, not unquestioned ground truth.

**Exit evidence:** independent headless build, recorded baseline, explicit source/engine version policy, and no Firebase/UI dependency in the engine execution path. Continue directly into acquisition and a working reference runtime.

## 3. Work package B — Acquire and reconcile the full dataset

Fetch current documented bulk metadata, card data, rulings, official rules, and format-policy evidence. Preserve hashes and timestamps. Implement offline reimport so investigation does not require repeated network calls. Source policies, required headers, and bulk mechanisms are documented by the providers. [S1–S5]

Produce these actual generated artifacts, or equivalent named outputs:

```text
source-manifest.json
catalog.sqlite
catalog-inventory.json
eligibility-inventory.json
rules-inventory.json
rulings-inventory.json
source-conflicts.json
import-errors.json
```

The inventory must reconcile every processed source record to a normalized record, an explicit duplicate/alias disposition, a justified exclusion, or a quarantine item. Report each category separately; do not make failed records disappear from the denominator.

Compute counts from SQL, including total source identities, eligible identities by role, faces, supporting objects, name groups, unresolved relations, and exclusions by reason. A raw source-record count is not the legal-card count.

Hash and version each relevant semantic record. Reimport the exact archives and show the same semantic inventory. Interrupt an import deliberately and demonstrate that the last published release remains intact. Test changed Oracle facts, provider identity reconciliation, and role-restriction updates without overwriting history.

**Exit evidence:** complete source reconciliation, no unresolved correctness-relevant error in the certified dataset, reproducible content hashes, and an inspectable database. Imported-card count and implemented-card count must remain separate, even if the latter is zero.

## 4. Work package C — Create the rules and card-obligation graph

Parse the entire pinned Comprehensive Rules document and glossary. Account for every source node, including optional-variant sections, with an explicit applicability disposition. Do not translate textual parent/child numbering directly into runtime precedence. [S1]

Use these distinct applicability categories:

```text
required by core procedure
required by selected profile
required by reachable card/support behavior
source/reference only, no independent runtime operation
not applicable, with source/profile justification
unresolved, blocks a full-coverage claim
```

Every relevant semantic obligation needs required state, a processor owner, decisions, source references, implementation links, and tests. A referenced helper rule can be required even when no card prints its terminology. A card sentence may require several processors.

For every eligible card, enumerate behaviors, conditions, costs, choices, implicit type/characteristic requirements, face/zone modes, links, and exceptional behavior. Import rulings as evidence with their origin preserved; review dated rulings against the pinned card/rules versions. [S4][S5]

Automated text tools can cluster and propose mappings. They cannot mark their own conjectures as verified execution. Record missing mappings and ambiguous cases as modeling questions.

**Exit evidence:** no silently unclassified rule node or card. Full-snapshot release also requires no unresolved applicability and no unimplemented applicable obligation; a research inventory with open questions is an interim artifact only.

## 5. Work package D — Use a large, risk-stratified modeling sample

Start from the entire imported pool, not a hand-maintained list. Initially select at least **300 distinct eligible gameplay identities**, then expand until every discovered high-risk behavior family is represented. Preserve exact source versions and reasons for selection.

This is a proposed modeling sample, not an already executed sample and not a replacement for full-card implementation. It must not be confused with the earlier selector prototype's 500 synthetic Boolean cases.

Stratify by behavior, layouts, state/choice complexity, history sensitivity, source lifetime, dynamic dependencies, and interaction partners. Include low-text and no-text cards to validate implicit behaviors as well as unusual cards. Popularity can inform realistic deck fixtures, but must not determine correctness coverage.

Use a coverage matrix whose rows are cards and whose columns are obligations/processors/decision families. Choose additional sample members to fill gaps; review unclassified and outlier text separately. Keep the full inventory visible while the sample matures.

Construct at least two positive/negative or contrast scenarios in each of these twelve risk groups, then add whatever the actual corpus exposes:

| Risk group | Required questions to resolve through executable fixtures |
| --- | --- |
| Setup and admission | Role restrictions, composition exceptions, starting choices, two-player versus multiplayer behavior. |
| Casting and payment | Alternative/additional costs, constrained mana, mode/value/target order, reversible versus completed work. |
| Targets and selections | Target invalidation, non-target selection, cross-choice constraints, empty domains, numeric choices. |
| Replacement and prevention | Competing transformations, event versions, chooser ownership, repeat-application tracking. |
| Triggers and source history | Simultaneous occurrences, a source leaving, delayed/linked triggers, intervening conditions. |
| Continuous characteristics | Type/control/ability changes, dependency ordering, source-relative predicates, intermediate views. |
| Combat and damage | Attack/block requirements, trample and damage allocation, multiple damage stages, changing characteristics. |
| Object identity and copies | Zone generations, last-known information, copied/merged/face-down/multiface representations where relevant. |
| Zones and chance | Search/reveal/shuffle sequences, ordered zones, empty libraries, chance and saved continuations. |
| Commander and elimination | Commander bookkeeping/destinations, control changes, player departure and retained effects. |
| Hidden or simultaneous choices | Private domains, secret-choice visibility, multiple choosers, control of another player's decisions. |
| Exceptional workflows | Supplemental mechanics, large values, turn/game changes, optional/mandatory loops, unusual dependency discovery. |

This initial **24-scenario floor** is not the total regression suite. At least one scenario per discovered high-risk obligation and each identified interaction defect is required before full release.

## 6. Work package E — Turn research into executable specifications

Every scenario must contain:

```text
scenario ID and version
rules/profile/card/definition source IDs
explicit starting-state assumptions
expected decision kinds, owners, legal domains, and privacy
submitted actions and chance fixture, where controlled
expected intermediate events and semantic boundaries
expected final state or next decision
source-grounded explanation of each asserted behavior
reference/indexed run IDs, checkpoint/replay results, and failures
```

Prefer narrow fixtures whose expected result can be independently reasoned about. Derive expected behavior from sources before observing the engine result. Do not generate a golden file by running the implementation and call that independent validation.

Use a genuinely separate review or independently constructed expectation for high-risk interactions. Record who or what produced each derivation. Do not invent a reviewer, count two prompts over the same output as independent evidence, or claim that agreement between two engines proves the rules.

Differential comparisons against another implementation are valuable where supported. Pin its versions, inputs, and assumptions. On disagreement, inspect authoritative sources, minimize the case, and record the resolution. Two paths sharing a buggy predicate can agree and still be wrong.

Run positive and negative command cases. An engine that rejects everything has not proven legality handling. Include malformed, stale, wrong-owner, unavailable-choice, duplicate, and conflicting-ID inputs.

**Exit evidence:** scenarios execute through production registry, query, processor, decision, and storage paths; failures produce minimized reproducible artifacts. Fix the implementation or data model, then rerun.

## 7. Work package F — Prove ahead-of-time soundness

For each published build, retain the complete rule/definition registry, the computed dependency closure, the match preload plan, and every pruning justification. Unknown dynamic dependencies must expand availability rather than narrow it.

Run identical scenarios using:

```text
full reference registry + scan resolver
compiled/preselected registry + scan resolver
compiled/preselected registry + indexed resolver
```

Compare applicable instance sets, required choices, semantic events, and resulting state at the appropriate views. Exercise copies, granted abilities, changed control/type/zone, event rewrites, source removal, historical triggers, and checkpoint restoration. The comparison must include all active source instances, including identical definitions with different sources.

Test conservative negation, missing-index information, finite universes, numeric ranges, and structural scope. Test access to the pinned broader registry when the initial decks are not a closed dependency set.

**Pass condition:** no observed false-negative discovery, no missing reachable executable dependency, and identical refined results and semantic traces for the release test set. This proves the optimization against the chosen reference cases, not the reference engine's independent Magic correctness.

Measure total wall time and memory, including index maintenance and residual work. Retain scans where they win. The compiler's task is safe specialization, not maximal pruning at any cost.

## 8. Work package G — Reach real simulations early

Do not wait for every card implementation before proving the game loop. Select two legal development decks from the imported inventory whose needed mechanics can be implemented and tested. They must be real decks under the pinned profile, not reduced-size fictional decks mislabeled Commander.

Build drivers that answer the production decision protocol. Start with authored scripts, then simple versioned deterministic exercise rules. They cannot edit state or decide card semantics. Every unknown choice handler is an explicit driver defect, not an instruction to pass silently.

The first simulation gate requires both:

**A complete two-seat game** and **a complete four-seat free-for-all game**, starting from normal setup, with substantive cast/activate/attack or effect decisions and an engine-determined outcome. Each must be replayed from recorded inputs and resumed across a saved decision. No instant-concession or pass-until-deckout-only demonstration qualifies.

Precise midgame fixtures remain valuable, but are interaction tests, not full games. No manual life edits, fixture mutations during play, mocked result events, or script assertions that substitute for rules execution are allowed.

A genuine game result and a run status are separate:

```text
game result: ongoing | win | draw | restart lineage
run status: running | paused | completed | driver-failed |
            unsupported | engine-failed | budget-exhausted | cancelled
```

A restart is modeled according to its rules and must not be counted as a completed batch game merely to satisfy a quota. A timeout or unsupported behavior never becomes a rules-defined result.

**Exit evidence:** setup-to-outcome logs, source/deck/engine hashes, accepted input streams, final state hashes, meaningful coverage hits, checkpoint/resume evidence, and exact rerun commands. Then keep expanding coverage; do not stop at this gate.

## 9. Work package H — Run a declared regression corpus

Expand to at least **12 versioned legal deck revisions** covering distinct behavior families. These are engineering fixtures, not a claim about metagame strength. Publish their card/obligation coverage and unresolved limits.

Proposed minimum batch structure:

| Suite | Scheduled workload | Required interpretation |
| --- | ---: | --- |
| Termination regression | 64 known-terminating scripted/exercise games: 16 two-seat and 48 four-seat | All 64 complete without unsupported behavior, engine faults, or invented outcomes; all replay. |
| Broader exploration | 1,024 declared seed/seat/deck assignments: 256 two-seat and 768 four-seat | Report every attempt and every disposition; investigate and retain failures. This is not 1,024 promised wins or a required strategy benchmark. |
| Browser portability | At least one complete game of each seat mode plus difficult saved-choice fixtures | Same canonical boundaries and outcomes as native execution; actual persistent reload. |

Freeze manifests before the run. Do not cherry-pick successful seeds, hide failed attempts, or count repeated replays as new games. If a fixture changes, version it and retain the old failure evidence. Rerun the unchanged failed manifest after a fix whenever applicable.

All observed engine/driver/unsupported/replay failures in certified scope block the release until fixed. A correctly paused operational budget case is not evidence of an engine bug by itself, but does not count as a completed game. Document why it stopped and its continuation. The known-terminating regression suite may not waive its completion gate by calling timeouts expected.

Report unique executed identities, instantiated and executed ability obligations, decisions exercised, rule families, source/seat coverage, terminal outcomes, failures, pauses, replay parity, memory, and timing. Catalog size and total actions are insufficient coverage measures.

## 10. Work package I — Close the full-snapshot obligations

Continue from the risk sample and early games through every remaining eligible card and required supporting behavior. Shared primitives should accelerate the work, but full coverage still requires audited mapping and card-specific parameter/choice tests.

A card is certified only when all its relevant obligations and dependencies are implemented and tested for the declared release. A rule is not certified because a test touched the file containing its processor. Coverage checks must inspect the source-to-obligation-to-code-to-executed-assertion chain.

For full-snapshot publication require:

- Complete inventory reconciliation and role-aware eligibility; no unresolved correctness-relevant source conflict.
- No unresolved applicability, unimplemented eligible-card obligation, missing decision contract, or missing reachable dependency.
- Passing independently justified scenarios, compiler/reference/indexed checks, complete-game regression, replay/recovery, and native/browser parity.
- All observed in-scope semantic failures resolved, with evidence retained; operational pauses reported separately.

These are necessary release gates, not a proof of every possible interaction. Publish exact evidence and known nonsemantic operational limits. A development subset can be useful without being relabeled full support.

## 11. Failure-driven redesign loop

When a test fails, classify the cause: source error, normalization error, missing obligation, definition error, invalid dependency analysis, incorrect world view, processor ordering, stale index, decision contract, persistence, replay, or driver behavior.

Preserve the failing source/build/seed/input tuple. Reduce to the smallest faithful scenario. Determine the expected result independently. Add a failing regression, repair the narrowest correct layer, update dependencies/migrations if needed, and rerun affected scenarios plus complete games.

Do not add a one-off `CardAVersusCardB` branch where the missing concept is a shared engine mechanism. A genuinely exceptional primitive is permitted when its contract, rationale, and tests are explicit.

Do not continue optimizing a representation whose correctness is unresolved. Keep the reference path operational so architectural experiments cannot strand the product.

## 12. Execution commands and report contract

Implement commands equivalent to the following. They are required future CLI contracts, not commands present in this documentation bundle:

```sh
bun run investigate -- baseline
bun run sources -- fetch --manifest <source-request.json>
bun run sources -- import --manifest <fetched-manifest.json> --db <catalog.sqlite>
bun run investigate -- inventory --db <catalog.sqlite>
bun run investigate -- obligations --profile <profile-id>
bun run investigate -- sample --manifest <sample-policy.json>
bun run compile --release <release-id> --verify-dependencies
bun run scenarios --manifest <suite.json> --compare-resolvers
bun run simulate --manifest <batch.json> --resume --evidence <directory>
bun run replay --batch <batch-id> --verify
bun run coverage --release <release-id> --fail-on-unresolved
bun run verify --goal full-snapshot-simulations
```

A simulation run record must include build and dependency versions, actual timestamps, profile/source/release hashes, complete deck revisions, seat assignment, game and driver randomness identities, driver versions, initial/final state hashes, commands, events, checkpoints, result/run status, errors, coverage references, and replay outcomes.

Do not fabricate counts to populate the report. Before execution use `not-run`, not a successful zero-error result. A report generator calculates gate status from verified artifacts; manually setting a status flag does not certify a release.

## 13. Continue until the goal is reached

Proceed from research into code, from code into failed tests, from failures into corrections, and from scenarios into full games. No additional request to begin implementation is needed after the authorized audit.

Do not stop at a README, an ERD, an import, a parser, a Boolean microbenchmark, a scaffold, or a single passing sample game. G3 is mandatory early progress; G5/G6 close full-snapshot support and the consumer handoff.

Bound individual jobs and preserve checkpoints. If the environment genuinely prevents continuation, report exactly what executed, what failed, and the next runnable command, leaving the task explicitly incomplete. Never imply work will continue unattended. Never change the target merely to make the status green.

[S1]: #s1
[S1–S5]: #sources
[S4]: #s4
[S5]: #s5
[S8]: #s8
[S9]: #s9


---

<a id="implementation-prompt"></a>

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


---

<a id="sources"></a>

# Sources and verification boundaries

Reference review date: **September 6, 2026**. Implementation must recheck current sources and freeze its own archives. The rules and software may change. Source references support external facts; the module boundaries, algorithms, acceptance floors, and command names are proposed engineering decisions.

## S1
### Official rules

[Wizards rules landing page](https://magic.wizards.com/en/rules)

[Comprehensive Rules text linked during this review](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt)

The landing page links the full rules. The linked text reviewed here reports an effective date of August 7, 2026. Preserve the reported effective date and content hash; do not infer an effective date from the filename. Source parsing, applicability auditing, and implementation of all required semantics remain work to execute.

## S2
### Format restrictions and role-aware legality

[Wizards banned and restricted lists](https://magic.wizards.com/en/banned-restricted-list)

The Commander section checked during this review includes a companion-only restriction. This motivates role-aware eligibility rather than one unconditional identity-level Boolean. Capture the actual policy snapshot and investigate discrepancies with provider legality fields. This document does not reproduce or freeze the entire list as a current executable policy.

## S3
### Scryfall bulk acquisition

[Bulk data documentation](https://scryfall.com/docs/api/bulk-data)

[Bulk dataset metadata](https://scryfall.com/docs/api/bulk-data/all)

[Dataset lookup](https://scryfall.com/docs/api/bulk-data/type)

[July 1, 2026 bulk-data transition announcement](https://scryfall.com/blog/two-new-ways-to-sync-scryfall-data-236)

Indexed official documentation describes Oracle-card and rulings datasets and the gzip JSONL `jsonl_download_uri` transport. The transition announcement distinguishes that field from the former JSON download field. Direct Scryfall page opens were blocked in this review; indexed official text was used. No bulk archive was downloaded or live import performed for this package. The implementing agent must verify the real metadata response and decoder behavior.

## S4
### Card structure

[Scryfall card objects](https://scryfall.com/docs/api/cards)

Official card-object documentation is the field reference for identity, face structure, source characteristics, legalities, and related objects. Normalization and interpretation must be validated against the actually downloaded records; undocumented assumptions about layouts or complete dependency enumeration are not acceptable.

## S5
### Rulings and API use

[Scryfall ruling objects](https://scryfall.com/docs/api/rulings)

[Scryfall API documentation](https://scryfall.com/docs/api)

Rulings can originate from Oracle rulings, release notes, and Scryfall notes. Preserve origin and date rather than labeling every note an official rules amendment. The API requires accurate User-Agent and Accept headers; verify current endpoint-specific rate and access requirements during implementation. Prefer bulk acquisition for the full corpus.

## S6
### Native persistence

[Bun SQLite documentation](https://bun.com/docs/runtime/sqlite)

Bun documents a built-in SQLite driver and transaction support. The proposed native adapter isolates it from the portable engine. No native driver or engine execution was performed for this documentation package.

## S7
### Browser persistence

[SQLite WASM persistence documentation](https://sqlite.org/wasm/doc/trunk/persistence.md)

The official documentation covers multiple persistence backends with differing ownership, locking, and deployment requirements. Choose and test a backend on the target browser rather than copying native SQLite settings or treating a local filename as shared browser storage.

## S8
### Snapmatch starting architecture

[Snapmatch AGENTS.md](https://github.com/matthewharwood/snapmatch/blob/main/AGENTS.md)

Read through the GitHub connector in this review, lines 1–110. Returned file-content blob SHA: `8b795850207d71c2fdf8b12721b93114841f5c4c` (a blob identity, not a repository commit).

The reviewed file describes Bun/TypeScript/Turborepo, Firebase-first committed state, the IndexedDB replica/outbox, and Jotai projections. This is the concrete reason the derived engine needs a documented authority change. Its reported test results are not evidence for the new Commander engine. No repository files were changed in this response.

## S9
### Auteur resolution reference

[Auteur resolution design](https://github.com/matthewharwood/auteur-toasty-review/blob/main/docs/02-resolution.md)

Read through the GitHub connector in this review. Returned file-content blob SHA: `d433fdc5a1c8c0d963d8296f17b8cb96ab647a2f`.

The document describes sparse variant layers, priority-based placement resolution, conflict rejection, immutable revisions, and provenance. It explicitly calls its existing fact-equality selector deliberately small. It is a useful architectural reference, not an implemented general Boolean Magic runtime.

## S10
### Previous deliverables reviewed

The conversation's `commander-slotted-headless-spec/README.md`, `SELECTOR_DESIGN.md`, and `VALIDATION.md` were read before this revision. Their validation report explicitly says no card catalog was downloaded, no card behavior executed, and no match played. This revision treats their schema/selector work as candidate implementation material and replaces architecture-only completion with simulation evidence gates.

## Distribution boundary

Archive sources locally for reproducibility within applicable permissions. Keep source-code licenses, card/rules data terms, and artwork permissions separate. Public accessibility is not a project-specific distribution license. Record permissions and attribution before redistributing protected content. This package contains instructions and source links, not the protected full corpus or card artwork.


---

<a id="delivery-status"></a>

# Delivery status of this package

## Delivered now

This response provides a revised execution charter, design-and-architecture specification, comprehensive investigation procedure, simulation acceptance gates, coding-agent prompt, and machine-readable goal definition.

The prior uploaded README, selector design, and validation report were reviewed. Current official rules/format pages and relevant library/provider documentation were checked, and the relevant Snapmatch/Auteur instructions were read through GitHub. Scryfall documentation was available through indexed official text where direct access was blocked.

## Not delivered or executed here

No full card or rulings archive was downloaded. No complete catalog database, executable card registry, Magic rules processor, trained opponent, or complete game simulation was produced in this response. No claim of full card coverage, independent semantic validation, simulation throughput, or strategy quality is made.

No changes were pushed to a repository, no deployed services were modified, and no prior user database was migrated. The CLI command examples are implementation requirements, not currently runnable commands in this package.

The acceptance counts are proposed targets, not observed results. The machine-readable goal file describes requested work; it is not a passing evidence report.

## Relationship to the earlier prototype

The previous schema/selector tests are not new Magic evidence. This package does not relabel synthetic Boolean cases as card scenarios or import the previous test counts as proof of simulation capability.

## How actual completion will be demonstrated

An implementation must generate its source manifests, catalog inventory, obligations, executable release, scenario evidence, complete-game traces, checkpoints, replay results, failures, and coverage reports. Completion is determined from those artifacts under the acceptance contract, not from this status document.

