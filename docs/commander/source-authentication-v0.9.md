# Fixed source authentication for the 0.9 development subset

The production full and prepared registry factories now reject definitions outside an explicit authenticated source registry. Recomputing a submitted release hash is insufficient to introduce a new card, change its program, or disguise a known card by removing its constructor label. The current registry contains **1,090 exact definitions** from one pinned source bundle. This is source-membership verification; it does not certify their Magic semantics or complete the 31,829-card snapshot.

## Authenticated inputs

The source bundle is `6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df`. The combined release hash is `8abe41532a96354af76d414d6c1c56e74c8142b126bb6cb7b8cac806c7380edd`; its canonical binding-registry hash is `cd651570d557df8ebc49c9e8919fe43408237ae870be7542f8a503c532fffdd5`.

A separate offline audit rehashed all 12 manifest archives and recomputed the source bundle hash. For every one of the 1,090 bindings it verified the original gzip record ordinal, raw record SHA-256, uncompressed byte range, complete payload equality with both catalog representations, recomputed normalized source-version hash, and exact definition/recipe digest in the closed registry. It also checked the retained main-deck candidate provenance and authenticated all 44 retained rulings against their own raw records. The audit does not convert candidate eligibility into comprehensive policy or rules certification.

The Oracle archive is the [Scryfall bulk snapshot dated September 6, 2026](https://data.scryfall.io/oracle-cards/oracle-cards-20260906090154.jsonl.gz), SHA-256 `ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274`. The [official Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt) have effective date August 7, 2026 and SHA-256 `4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f`. Record authentication checks retained bytes; it neither refetches a newer snapshot nor silently replaces these versions.

## Admission boundary

`verifySourceRelease` validates the content schema and release self-hash, requires the exact source-bundle and rules pins, and checks every definition, including unused definitions. Each dictionary key and object ID must equal `oracle:${oracleId}`. The Oracle identity must exist in the trusted registry, and the normalized source version, implementation revision and full canonical definition digest must match its entry. Changing all identifiers, source version, body and program together still fails because the new identity has no registry entry.

`createFullExecutionRegistry`, `createPreparedMatchArtifact` and `admitPreparedMatchArtifact` all pass through this verification. Prepared admission additionally rehashes the artifact and recomputes the entire plan from the authenticated source and exact ordered deck revisions. It compares the closure, retained definition digests, capabilities, recipe registry, source pins and analysis hash. An artifact does not become a smaller `ContentRelease`: its execution registry keeps the full source release hash and a separate prepared-artifact hash.

The pure planning function can analyze hypothetical structurally valid definitions for research. A successful structural plan alone cannot pass production source admission. No synthetic identity exception, unchecked verifier option or English-text runtime fallback was added. Pure engine unit fixtures can construct a test registry directly; external saves, source releases and prepared artifacts must use the authenticated admission path.

The verifier accepts exact subsets of these trusted definitions with the same source/rules pins. Such a subset has its own truthful release hash, and is useful for focused tests. It does not have to claim the full registry's reference release hash. Header identifiers and reporting denominators are not semantic certificates. ABI compatibility, legal 100-card composition and commander legality are checked by engine/match admission in addition to source authentication. A subset missing deck roots cannot execute that deck.

The trusted registry is application code. Adding a new snapshot or changing a binding requires explicit source authentication and semantic review before updating its digests. Hashing an arbitrary compiler output and placing it in the registry would not itself establish authenticity. This audit supplies the archived-record evidence for the present finite registry.

## Validation and limits

Independent mutation checks rejected changed Oracle bodies, changed programs, an unused fabricated card, a completely renamed/fabricated tuple, wrong source-bundle and rules pins, and mismatched dictionary identity at both full and prepared factories. Earlier targeted regressions also cover known-source-version renaming, constructor downgrades and erased typed markers. An authenticated 697-definition subset remained admissible. Empty or missing-root subsets could not execute legal decks or prepared closures.

The owned compiler/card-program tests passed 50 tests and 1,715 assertions. The CLI regression suite passed 17 tests and 546 assertions after migration to 369 exact authenticated definitions and the original 12 legal source-backed deck revisions. It retains corruption, closure, duplicate-composition, input-identity, source-pin and whole-batch preflight tests. Its baseline results are explicitly synthetic accounting data, not 64 completed games. The three positive seed/order variants are independent tests because each constructs 64 actual prepared plans. Compiler and CLI strict types and touched-source lint checks passed.

These counts do not claim that all 1,090 cards have been played, all rulings have been semantically reviewed, all 31,829 eligible identities are implemented, or all relevant Comprehensive Rules obligations have been discharged. The audit contributes zero executed game scenarios. Independent runtime and browser evidence is tracked separately.

## Reproduction and retained evidence

From `/private/tmp/iwsdk-commander-0.9`, with the pinned catalog and source archives retained in the source repository:

```sh
python3 .draft-artifacts/authenticate-reviewed-source.py /Users/matthewharwood/Documents/GitHub/iwsdk-apps
bun .draft-artifacts/authenticate-reviewed-source.ts /Users/matthewharwood/Documents/GitHub/iwsdk-apps
bun test packages/card-programs/src packages/compiler/src
bun test apps/engine-cli/src/regress.test.ts
```

`raw-reviewed-source-authentication-v0.9.json` retains all exact Oracle payloads, archive record references and rulings. Its file SHA-256 is `b8c6c10144d9e7e849837a3faf45e6db16235719f2117ffd176dc15e84e8d832`. The compact per-binding proof `reviewed-source-authentication-v0.9.json` has semantic hash `7f07f6eb0a8728afa56596dbe1e743afd7d4ce7a6b22bf5ffe5d94d2745fe822`. Both are retained under `.commander/prototypes/engine-0.9/.draft-artifacts/` in the main workspace, along with their scripts and captured sources. The independent mutation report is `.commander/prototypes/engine-0.9/.draft-artifacts/independent-closed-source-review.json`. Source snapshots and detailed reports must remain attached to any later integration evidence; this note does not replace them.
