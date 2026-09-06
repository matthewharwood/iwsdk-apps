# Prepared match artifact proposal

Status: broader design proposal. The first strict artifact/admission boundary is now implemented; [implementation evidence](source-prepared-validation.md) distinguishes its actual schema and tests from the additional capabilities proposed below. The original 0.3 `development-match-plan/1` artifact was report-only.

A prepared artifact must have its own identity and hash. Removing definitions from `ContentRelease` while retaining its old hash would misrepresent the authenticated object. The original content release remains immutable and separately verifiable.

## Proposed strict boundary

Use a versioned strict object with the following fields, each validated at runtime. Unknown fields, duplicate IDs, noncanonical hashes, mismatched versions, and incomplete records fail admission.

The current `prepared-match/1` schema stores roots and exclusions inside `closure`, definition hash references inside `retainedDefinitions`, and a hash of the recomputed dependency analysis. It does not yet serialize the broader `dependencyManifest` or `selectorPlans` described in this proposal. Its dependency analysis covers only the declared development recipes. Current `ExecutionRegistry` holds `sourceReleaseHash`, `preparedArtifactHash`, and `definitions`; other compatibility checks remain at artifact and match admission.

| Field | Meaning |
| --- | --- |
| `schema`, `id`, `hash` | Dedicated prepared-artifact schema and hash of its canonical body, excluding only its own hash field. |
| `sourceReleaseHash` | Hash of the complete original `ContentRelease`, never the hash of a trimmed object. |
| `sourceBundle`, `rulesHash`, `profile` | Exact source and policy pins copied from the verified release. |
| `processorAbi`, `compilerVersion`, `recipeRegistryHash` | Explicit executable compatibility and dependency-analysis provenance. |
| `deckHashes` | Exact ordered input deck revisions; seat order remains in the match manifest. |
| `rootDefinitions` | Deduplicated deck/commander roots, recomputed during admission. |
| `retainedDefinitions` | Typed definitions with stable IDs, per-definition canonical hashes, and source-version pins. |
| `requiredCoreCapabilities` | Versioned core capabilities that remain available independently of card reachability. |
| `dependencyManifest` | Exact/class-bounded/registry-wide edges with versioned bound evidence. Unknown dependencies widen and block unsupported execution. |
| `selectorPlans` | Typed ASTs, read footprints, residual versions, and declared index plans; no current affected-object sets. |
| `pruningReport` | Every excluded identity, assumptions, source/profile constraints, dependency proof, compiler version, and actual test-evidence references. |
| `assurance` | Explicit `development-subset`; full-registry availability remains false while source coverage is incomplete. |

The match manifest should retain `releaseHash` and separately pin `preparedArtifactHash`. It must not overload the resolver mode or source release identity with the artifact's identity.

## Admission procedure

Initially, prepared admission receives both the complete source release and the artifact. It verifies the complete release hash first, then verifies the artifact hash and every shared source/version pin. Every retained definition must exactly equal the corresponding definition in the complete release and match its per-definition hash. Extra definitions, missing roots, duplicate definitions, or altered code fail admission.

Deck hashes and composition are checked against the verified source release. The compiler recomputes dependency closure from its reviewed typed recipe/IR registry, rather than trusting the submitted artifact's claimed closure. Core requirements must be available in the selected processor ABI. Class-bound references must resolve to real versioned, passing evidence; a nonempty string named `tests` is not itself evidence. Unknown dependency analysis must retain the complete required pinned registry and report unsupported executable dependencies. Source-rule and unimplemented-card obligations remain visible.

After validation, admission creates a separate `ExecutionRegistry` value containing `sourceReleaseHash`, compatibility metadata, the admitted definition lookup, required core capabilities, and the artifact hash. Engine lookup functions consume this type instead of pretending the subset is a complete `ContentRelease`. The complete release can remain in the content store and be released from transient match memory after validation.

The existing flat full-release hash cannot authenticate subset membership by itself. An offline artifact that omits the original release therefore needs either the previously verified content store or a future versioned registry commitment with verifiable membership proofs. A new Merkle/registry commitment would be a new contract, not a reinterpretation of the old hash.

## Saves, fallbacks, and comparisons

Saves pin the original release, artifact, processor ABI, and serializer. Reopening repeats artifact/source compatibility checks before a command is accepted. Missing definitions or unknown residual operations produce explicit unsupported diagnostics; they cannot become no-op effects or trigger mutable network downloads. Any allowed fallback to the full already-pinned registry is declared and recorded in resolver diagnostics, so a claimed pruning comparison cannot silently run the full registry.

The first integration comparison should admit the same real decks against the full 649-definition development release and the verified 125-definition closure. It should compare legal decisions, observations, chance operations, complete command/event transcripts, gameplay state, final outcome, and replay after checkpoints. Configuration pins are reported separately; no arbitrary state normalization may hide a difference. Failed lookups, changed zones/control, generated-dependency fixtures, invalid class bounds, and deliberately excluded required definitions need negative coverage.

Passing that comparison establishes conservative pruning only for the declared development recipes and pinned decks. It does not certify the full Commander registry or unresolved card/rule obligations.
