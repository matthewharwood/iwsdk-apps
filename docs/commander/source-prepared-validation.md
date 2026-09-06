# Strict prepared artifact admission

`@iwsdk-apps/compiler/prepared` now exposes a browser-safe prepared admission boundary. It returns a separate execution lookup after authenticating the full source release and recomputing the exact deck dependency closure. It never changes a `ContentRelease` dictionary while retaining that release's hash.

The public functions are `verifySourceRelease`, `createPreparedMatchArtifact`, `admitPreparedMatchArtifact`, and `createFullExecutionRegistry`. The pure entrypoint imports contracts, finite recipe metadata and the dependency-plan builder. A browser bundle test verifies that it does not pull in the native compiler's SQLite or filesystem imports.

## Validated data and responsibilities

`PreparedMatchArtifact` is a strict Zod schema with its own canonical-body hash, original source release/bundle/rules pins, processor ABI, compiler and recipe-registry versions, ordered deck hashes, closure, retained definition digests and source versions, required core capabilities, and recomputed analysis hash. Unknown fields are rejected. The artifact explicitly retains development-subset assurance and `fullRegistryAvailable: false`.

Admission verifies the complete source release checksum and dictionary identities; checks each deck checksum, duplicate rows and commander roots; reconstructs the artifact from the current reviewed recipe registry; and compares all submitted fields. Rehashing a forged artifact does not bypass omitted roots, added definitions, incorrect exclusion lists, changed definitions, missing core capabilities, altered deck order, or changed ABI/compiler evidence. Returned definitions are cloned from the verified source and deeply frozen.

The returned `ExecutionRegistry` contains exactly `sourceReleaseHash`, `preparedArtifactHash`, and `definitions`. The full-scan factory uses all verified source definitions and a null artifact pin. The prepared factory uses the retained subset and the artifact's own hash. Engine setup remains responsible for current processor compatibility and full Commander deck-composition admission; a valid dependency artifact alone does not establish a legal match.

## Conservative scope

Current recognized development recipes create no external card definitions, copied/granted abilities or tokens. Their dependency closure is therefore the complete deck root set plus separately retained core capabilities. Unknown reachable recipes widen the available registry and produce an explicit blocker, preventing an executable pruning artifact. Unavailable exact dependencies and unverified class bounds also remain blockers.

The generic closure helper has fixtures for exact cycles, class-bounded references and registry-wide availability. Executable development artifact construction does not consume user-supplied class evidence: there is no claim that a string naming a test proves a class bound. Full rule-instance preparation, complete registry availability, serialized selector AST/index plans and broader generated-dependency analysis remain open work. The broader [artifact proposal](source-prepared-artifact-proposal.md) records that distinction.

## Measured admission checks

Seven focused prepared tests cover immutable subset construction, strict schemas/checksums, rehashed artifact forgery, changed source data, deck identity/order, unresolved dependencies and browser import isolation. They are included in the 26 passing card-program/compiler tests with 349 assertions. Type checks, Biome and ESLint passed for the touched packages and schema.

An admission-only check of the preserved 0.3 release retained 125 of 649 definitions and excluded 524. It preserved the original source object and produced `.commander/prepared-artifact-source-v0.3.json`, hash `12be6fd1769e07fcd76936815f18212f502a8850396e384fd76ddaa94c8f85f8`. Its source ABI remains 0.3; this is not a new-engine gameplay artifact.

The 0.5 draft release has 697 definitions and hash `4d3a8ebbc31a366a28d9e7ab4392d8843c55d315f07b1e265fd886bf4c2057c7`. Source-bound rich deck fixtures produced these separately authenticated closures:

| Ordered deck indices | Retained | Excluded | Artifact hash |
| --- | ---: | ---: | --- |
| 14, 15 | 124 | 573 | `160affee7f17339478430a8141702480b4db8a526955a4b0caaef93c1f415e16` |
| 14, 15, 16, 14 | 175 | 522 | `6ec134c8b1ed8ea8095e2c309f2e7744f1c302c6bca1ecc4b43f69d6f9605e76` |

The artifacts are `.commander/prepared-v0.5-rich-2.json` and `.commander/prepared-v0.5-rich-4.json`. Both had no dependency blockers within the declared recipe scope. `.commander/source-draft-admission-v0.5.json` retains the source, definition and review hashes and explicitly records zero executed games. Actual runtime subset use, replay, browser persistence and full-versus-prepared gameplay comparisons require their own integration evidence; this admission report does not claim those runs.
