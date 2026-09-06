# Design and Architecture — Evidence-Driven Commander Engine

**Normative proposal, revision 3.** Read with [README.md](README.md) and [INVESTIGATION_AND_ACCEPTANCE.md](INVESTIGATION_AND_ACCEPTANCE.md). The schema names and APIs below are proposed contracts to implement and test, not existing functionality.

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

[S1]: SOURCES.md#s1
[S2]: SOURCES.md#s2
[S3]: SOURCES.md#s3
[S4]: SOURCES.md#s4
[S5]: SOURCES.md#s5
[S6]: SOURCES.md#s6
[S7]: SOURCES.md#s7
[S8]: SOURCES.md#s8
[S9]: SOURCES.md#s9
