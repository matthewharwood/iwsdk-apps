# Reviewed online-object exclusion

The supplemental source bundle resolves one specific main-deck eligibility discrepancy: the Magic Online “Name Sticker” Goblin object does not represent the separate paper card. The June 21, 2024 Vintage Cube article describes this online form as unavailable on tabletop. The May 14, 2024 weekly announcement scopes its remaining Commander legality to the Magic Online update. These two statements support a tabletop-profile exclusion for the exact online object; this is not a new Commander ban. [June primary evidence](https://www.mtgo.com/news/june-2024-vintage-cube-update), [May primary evidence](https://www.mtgo.com/news/mtgo-blog-05142024).

The implementation applies only when every condition matches: Oracle identity `acee1d16-1651-4e2c-8138-cc6456c4ee71`, normalized source version `f84acb32fc9630ad8d168e43e70ae7ec1d6e807cc9bf68684d5a167c45b6a8f9`, independently recomputed full-record hash, `digital: true`, exactly `games: ["mtgo"]`, provider Commander legality, no paper printing in the pinned printing archive, and both reviewed HTML archives with their exact URL/hash pins. Missing evidence, a changed record, or any paper printing leaves the prior conservative classification unchanged.

The paper `_____ Goblin` remains a main-deck candidate under identity `88222fd2-8316-426c-8218-64f6be5ca0f8` and source version `b5c4b4faae6f58ed6ccaaeb2ce04ad83645b86f9c2e78bc173767c201f77a8c4`. It receives no executable support through this decision. Commander permissions, card semantics and all unrelated source obligations remain separate work.

## Provenance and immutability

| Evidence | Archived SHA-256 |
| --- | --- |
| June tabletop-form statement | `221c0a663308a794e6093b2afc584a145ecad4c45efc9b58266c48b550160314` |
| May online Commander statement | `cfcea3d046199ae6fbeac7f66e7114246fcb8eeebef22a13a682855028688927` |

`fetchTabletopEligibilityEvidence(existingManifest)` adds these primary pages to a new manifest while preserving the original card/rule archives and snapshot creation date. It is exported from `@iwsdk-apps/catalog`. The new bundle is `6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df`. The original bundle `ba729f4152706f845504430574c8bfcc2ae6ea91380182c80d6055d24b50edd9` still lacks the supplemental evidence and keeps its original classifications.

The additive `eligibility_decisions` table records the exact source archive/ordinal/version, reviewed decision ID, canonical decision hash, both supporting evidence hashes and the decision payload. All four role exclusions point `eligibility.source_hash` to the June primary evidence instead of implying that the named-ban list caused this exclusion. `readEligibilityDecisions(databasePath)` exposes the structured evidence. The decision hash is `2f2603d3019ac85709eb511e0f8f843264807c4eb1906d4e17b721a99fb2f566`; the exact Oracle record is ordinal 25,981 of archive `ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274`.

The importer remains `commander-catalog/1`. Reviewed decision digests contribute to the inventory semantic hash only when decisions exist, preserving the old bundle's digest. Old import rows are never relabeled in place. The new bundle was first imported to the separate `.commander/catalog-v2.sqlite`; the active `.commander/catalog.sqlite` and frozen release/deck artifacts were preserved.

## Verification

The new complete import normalized all 235,209 records with zero quarantine. Its inventory semantic hash is `64d294137a1e87688ddcbfbc8f0dcd215d3ba79310a33d6d2dc06bd9a15b9375`. Main-deck accounting is 31,829 candidates, 6,804 excluded objects and zero unresolved release-evidence records. This resolves that narrow inventory discrepancy; it does not certify all candidate cards or construction roles.

An exact offline reimport returned the identical inventory/import ID. The retained `.commander/tabletop-eligibility-proof.json` contains both named objects' complete role outcomes, the structured decision and old active inventory. Tests cover the exact record, both missing-evidence cases, changed archive hashes/URLs/kinds/formats, source-version drift, altered digital/game/legality facts, future paper printings and the distinct paper identity. Supplement acquisition tests verify preserved archives/date, a distinct new bundle and idempotent reuse without network. The focused catalog suite passed 15 tests with 88 assertions, plus type, Biome and ESLint checks. A regression also verifies that inventory reads never create or migrate a database.

An independent full rebuild of the original bundle retained semantic hash `363344ac07b599824671f0d0cf89899c3836ce27e77122c1c92d525a00325d38`, identical role classifications, zero reviewed decisions and the original unresolved online-object outcome. This rebuild is recorded in the same proof artifact. Its temporary database was removed only after successful verification.
