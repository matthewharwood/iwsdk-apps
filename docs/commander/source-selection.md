# Development selection and compilation evidence

This document records the initial 0.3 candidate-selection paths and conservative dependency-plan builder. The later strict artifact boundary is described in [prepared admission evidence](source-prepared-validation.md), and the expanded source definitions in [spell-family evidence](source-spell-families.md). These are development infrastructure, not full-registry or complete AOT acceptance.

The source AST supports typed scalar comparison, set membership, segment ancestry, source bindings, exact integer ranges through conjunction, reviewed residuals, and arbitrary compact Boolean combinations. Object, rule-instance, and player masks use separate immutable universes. Indexed discovery obeys `lower ⊆ exact ⊆ upper`, including NOT; unknown index facts widen candidates. Missing authoritative semantics fail explicitly.

The engine uses these selectors for battlefield creatures, available mana sources, and cards available at priority. This reaches combat and state-based procedures through their creature queries. Full scan interprets every candidate; prepared scan uses a compiled dynamic prefilter and evaluator; prepared indexed mode builds postings and refines their upper mask. All rebuild facts within a transition. No initial affected-object set or printed keyword permanently excludes a later candidate.

The pure package has eight tests, including 128 nested Boolean differential cases. Engine regressions compare the three modes through setup, casting/payment staging, cancellation, priority progression, control changes, tap state, zone movement, and same-epoch invalidation. These isolated tests do not count as complete real-deck games; game evidence comes from separate runner artifacts.

## Canonical checkpoint correction

A real-source audit found that insertion-ordered object dictionaries changed legal-action order after canonical JSON round trips. The original setup returned `B:card:17@0`, `B:card:15@1`, `B:card:70@1` first, while the reconstructed dictionary returned `B:card:15@1`, `B:card:17@0`, `B:card:27@1`. Dictionary order was not represented by the semantic hash.

Engine dictionary-derived object lists now use raw lexical object-ID order, including observations, target candidates, creature/mana/priority selectors, and checkpoint object scans. Explicit library, hand, stack, seat, and choice arrays retain their rules-defined order. A regression compares every seat's observation and twenty exact subsequent transitions for each resolver, canonicalizing the restored state after every step. Cross-resolver comparison changes only the manifest's resolver setting; the checkpoint comparison changes no semantic field.

## Source-bound spell fixtures

The separate local `release-v0.3.json` has hash `078225448205425a2bb05912afa09ce35cbd7156550b2af7960f45a720d1a42a` and binds 649 source definitions. It retains 31,180 unsupported main-deck candidates and the separate unresolved eligibility discrepancy. Seven exact identity/version/name/type/cost/full-text recipes compile typed spell sequences: Divination, Inspiration, Flame Slash, Sacred Nectar, Revitalize, Healing Hands, and Sorin's Thirst. They cover complete supported player or creature target domains, not the broader “any target” domain.

The initial 642-definition release and twelve deck artifacts remain separate. `decks-v0.3.json` adds two fixtures at indices 12 and 13: Tobias Andrion with five white/blue spell sequences, and Lady Orca with Flame Slash and Sorin's Thirst. All fourteen decks passed composition admission. Each new deck has 100 cards, 39 balanced basic lands, one commander, all required singleton spells, and 55 or 58 distinct creature cards. Pinned source versions are checked during fixture construction.

Constructor tests verify exact source binding and reject changed text, source versions, costs, or unreviewed spell identities. The engine's independently authored spell tests establish execution expectations separately. A successful compilation or deck admission never substitutes for a completed game, independent scenario proof, or full-source semantic review.

## Conservative dependency plan

`computeDependencyClosure` follows explicit exact, versioned/test-referenced class-bounded, and registry-wide dependencies to a finite fixed point. Unknown dependency analysis and invalid class bounds widen to the whole pinned development registry and remain preflight blockers. Missing executable definitions and core procedures are explicit blockers. Every requested core capability remains retained.

`buildDevelopmentMatchPlan` validates release/deck hashes and emits a hashed, serializable development plan with dependency closure, required core capabilities, excluded definitions, assumptions, source constraints, and test references. Unrecognized recipe revisions cannot receive an empty dependency declaration. Current reviewed recipes create no external definitions, tokens, copied abilities, or granted abilities.

The actual 0.3 plan for the two spell fixtures retains 125 of 649 development definitions and reports 524 unreachable definitions under those restricted recipe declarations. It records `fullRegistryAvailable: false` and the complete unsupported identity list. **The archived 0.3 engine loads the full development release; that plan is a report and is not applied as runtime pruning.** Its resolver comparisons exercise candidate selection, not a pruned-versus-full executable registry. Full-registry availability, unknown card dependencies, source applicability, and semantic coverage remain open gates.
