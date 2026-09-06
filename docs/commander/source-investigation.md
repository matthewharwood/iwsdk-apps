# Source acquisition and investigation evidence

Observed 2026-09-06. The full source import is complete; semantic coverage remains incomplete. These counts come from the actual local archives and SQLite catalog, not from the earlier starter or synthetic selector tests.

| Artifact | Observed result |
| --- | --- |
| Source bundle | `ba729f4152706f845504430574c8bfcc2ae6ea91380182c80d6055d24b50edd9` |
| Oracle source objects | 38,633 |
| Default printing records | 117,627 |
| Rulings | 78,949 |
| Reconciled bulk records | 235,209 normalized; 0 quarantined |
| Face records | 41,850 |
| Rules source nodes | 4,059: 3,161 numbered rules/subrules, 147 section headings, 9 chapters, 739 glossary definitions, 3 source-only segments |
| Unresolved parsed reference candidates / printing relations / ruling identities | 0 / 0 / 0 |
| Provider Commander-legal objects | 31,830 |
| Paper main-deck candidates | 31,829, plus one unresolved digital-only discrepancy |
| Exact import inventory hash | `363344ac07b599824671f0d0cf89899c3836ce27e77122c1c92d525a00325d38` |

The unresolved object is `"Name Sticker" Goblin`, Oracle identity `acee1d16-1651-4e2c-8138-cc6456c4ee71`. Its provider legality says Commander legal, but its available printing is MTGO-only and its rules differ from related paper `_____ Goblin`. It remains visible instead of being silently counted as a paper definition or discarded. Candidate eligibility is research evidence, not completed policy/definition certification.

## Pinned authorities and transport

The [official rules landing page](https://magic.wizards.com/en/rules) linked [the current TXT artifact](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt). Its 977,822 bytes hash to `4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f`; its contents report **August 7, 2026**, despite August 19 in the filename. A separate agent's download matched these exact bytes.

[Scryfall's bulk metadata](https://api.scryfall.com/bulk-data) and [bulk documentation](https://scryfall.com/docs/api/bulk-data) were accessed with descriptive User-Agent and Accept headers. The live metadata uses `jsonl_download_uri` and `compressed_size`. It supplies neither record totals nor an archive checksum. The archives are gzip-compressed JSONL, not JSON arrays or tarballs. Import computes its own SHA-256 for compressed entity bytes and a separate SHA-256 for decompressed bytes.

| Dataset | Provider update | Compressed bytes | Archive SHA-256 |
| --- | --- | ---: | --- |
| Oracle | 2026-09-06 09:01:54.221 UTC | 24,535,746 | `ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274` |
| Default printings | 2026-09-06 09:05:27.982 UTC | 78,057,181 | `fae54f27ad4dcbf3e5c235ed42478c7f1e4685e1f7889d909062dc75c0935341` |
| Rulings | 2026-09-06 09:00:36.030 UTC | 5,366,171 | `c2ea9267fdb0118a771e27e0d2f53ecbc1c8e497cbca985c1977026afaf77ef7` |

The [official Commander ban page](https://magic.wizards.com/en/banned-restricted-list), [Commander format page](https://magic.wizards.com/en/formats/commander), and linked policy evidence were archived separately. The [February 9 announcement](https://magic.wizards.com/en/news/announcements/commander-banned-and-restricted-february-9-2026) explicitly separates Lutri's companion ban from deck/commander roles. The marketing overview is simplified; precise timing and commander eligibility come from the pinned Comprehensive Rules.

## Executed import checks

The initial full import was stopped after a missing reconciliation index made a join unnecessarily slow. Its staged rows and interrupted-run record remain in the catalog. The corrected full import completed in about 31 seconds. An exact offline reimport returned the same published import and inventory. A separate empty database rebuilt all 235,209 records from the same local archives in about 29 seconds and produced the same inventory hash; the owned temporary database was then removed.

Local evidence files are `.commander/catalog-inventory.json`, `.commander/import-verification.json`, `.commander/reimport-verification.json`, and the content-addressed manifest under `.commander/sources/`. The manifest retains individual retrieval/update dates and validators; it does not pretend independently updated providers form one atomic historical snapshot.

Package tests exercise malformed-record quarantine, partial-normalization rollback, interrupted staging with previous-source preservation, truncated gzip EOF failure, archive corruption, exact offline idempotence, unknown/symbolic field retention, role-specific eligibility, source spans, and reference parsing. Fixture tests are separate from this full-data execution.

## Unresolved obligations and research sample

`buildObligationLedger(dbPath)` creates a source-accounted research queue. It currently contains 111,254 unresolved obligations: 38,633 characteristic/construction reviews, 68,721 source-text reviews, 3,161 rule semantic reviews, and 739 glossary applicability reviews. All source objects, including support objects and excluded formats, remain represented. The 159 structural source nodes are reference-only; the remaining 3,900 substantive rules/glossary nodes have unresolved applicability.

Text-line segmentation does not certify that every semantic obligation has been discovered. Processor ownership, decisions, dependencies, implementation links, executed assertions, and independent review still need to be established. No unimplemented rule is marked not applicable merely to reduce the denominator.

`selectRiskSample(dbPath)` generated 300 distinct paper candidate identities, bound to exact source versions. All twelve risk families have at least twelve source clues. Layout/text/keyword clustering is only a selection aid; the sample is explicitly **not reviewed**. `authorHighRiskScenarios(dbPath)` generated 24 concrete expectations, two per family, each linked to exact rule-node hashes and spans. All 24 remain **not run** with independent review pending.

These artifacts live in `.commander/obligation-inventory.json`, `.commander/risk-sample.json`, and `.commander/high-risk-scenarios.json`. The independent expectations in [scenario-expectations.md](./scenario-expectations.md) are a separate derivation. Existing combat/storage tests must be linked through actual execution evidence; authored expectations and fixture construction alone do not count as passing scenarios or completed real-deck games.

## Development compilation boundary

The initial recipe release bound 642 source definitions and retained 31,187 unsupported candidate identities. It used only ordinary basic lands, ordinary creatures with integer characteristics/plain costs, exact standalone supported keyword labels, and exact single-color tap-for-mana clauses. Unknown remainder text, reminder-bearing text not separately reviewed, dynamic characteristics, and special layouts remain unsupported.

Twelve real-source deck fixtures passed the engine's composition admission: each has one commander, 60 distinct singleton creatures, and 39 basic lands. This establishes source binding and deck construction, not complete game execution or all-card support. Match evidence is reported separately by the engine runner.

The separate 0.3 release adds seven pinned typed spell programs and two spell-bearing deck fixtures without replacing the initial artifacts. It contains 649 definitions and 31,180 unsupported candidate identities. [Source selection and compilation evidence](./source-selection.md) records the exact new release hash, source-binding restrictions, deck composition, selector implementation, checkpoint ordering correction, and unapplied development dependency plan.

## Missing input references

The three supplied files were read completely. `COMPLETE_SPEC.md` embeds the charter, architecture, investigation/acceptance plan, sources, implementation prompt, and delivery status, so absent companion Markdown files do not block understanding. The referenced `goal-contract.json` was not supplied despite the delivery-status claim. Any machine-readable contract created in this repository is a derived implementation of the supplied requirements, not an imported passing evidence report.

Full-snapshot release remains blocked by unresolved semantic applicability, unimplemented card behavior/dependencies/decisions, unreviewed policy details, and the remaining scenario/game/parity gates. No catalog or compilation count closes those gates.
