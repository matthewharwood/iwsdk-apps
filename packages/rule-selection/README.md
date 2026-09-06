# Typed candidate selection

This pure package implements a development selector engine. It does not interpret card text, calculate characteristic layers, execute effects, or establish full rules coverage.

`createView` snapshots a typed object, rule-instance, or player universe. Candidates retain the caller's explicit structural order. Separate live instances require separate IDs, even when they share a definition. Every view carries match/revision, mutation epoch, read lens, event/processor version, bindings, universe identity, and generation. Candidate facts are copied and frozen. A new view invalidates every old mask and index, including when a caller forgets to advance its epoch.

`Selector` is a runtime-validated AST: AND, OR, NOT, string/boolean equality, exact safe-integer comparison, set membership, segment ancestry, typed bound values, and versioned reviewed residuals. Missing authoritative facts and unavailable residual semantics throw distinct diagnostics. Being unindexed never means being false.

`resolve` has three implementations:

| Mode | Work performed |
| --- | --- |
| `full-scan` | Validate and interpret the AST for every candidate. |
| `prepared-scan` | Use compiled expression closures, evaluate a current-view conservative prefilter, then exactly evaluate remaining candidates. |
| `prepared-indexed` | Build typed per-field postings for the immutable view, combine lower/upper Uint32 masks, then exactly evaluate the upper candidates. |

Approximate negation uses `lower = universe − operand.upper` and `upper = universe − operand.lower`. An unindexed atom has empty lower and complete upper bounds. A missing/incompatible plan falls back to reference interpretation; an index from a different view falls back to prepared scanning. Results report the executed path, candidate counts, and fallback reason. These counters do not claim an end-to-end speedup.

`orderInstances` applies explicit processor-provided ordering constraints. Unconstrained instances either preserve structural order or return a required choice. Cycles return a conflict. Selector specificity and numeric priorities never establish game-effect precedence.

Tests compare exact ordered results and conservative bounds across nested Boolean expressions, unindexed negation, finite-domain complements, tail bits, source bindings, unavailable semantics, independent effect instances, changed state without a committed revision, stale-view fallback, and ordering conflicts. The engine adapter rebuilds current facts on every query and uses this package for creature, mana, and priority-card candidates. Future characteristic processors must supply their authoritative evaluation view; printed starting values are not permanent pruning facts.
