# Commander source catalog

This native Bun package acquires and accounts for source material. It does not certify card behavior, Commander admission, or rules implementation. All semantic applicability starts unresolved; observed main-deck candidates remain separate from executable definitions.

```ts
import { fetchSources, importSources, readCandidateCards } from "@iwsdk-apps/catalog";

const { manifestPath } = await fetchSources(".commander/sources");
const inventory = await importSources(manifestPath, ".commander/catalog.sqlite");
const cards = readCandidateCards(".commander/catalog.sqlite", {
  names: ["Jasmine Boreal", "The Lady of the Mountain"],
});
```

`fetchSources` discovers current Scryfall URLs through its bulk metadata and the rules TXT URL through the official landing page. It downloads Oracle objects, default printing objects, rulings, rules, Commander policy, bans, and policy evidence linked from the Commander section. Default printing evidence is necessary because an Oracle representative's reprint date is not its first paper release. Every download records its original/final URL, retrieval/update/effective dates when observed, exact byte count, response validators, and SHA-256. Dates absent from an artifact are recorded as unknown. Downloaded gzip JSONL is archived without HTTP content decoding; import computes a separate decompressed-byte hash.

`importSources` validates manifest paths and archive hashes before staging records in bounded transactions. Each record retains its archive hash, ordinal, decompressed byte range, raw payload, and raw record hash. Unknown fields and symbolic characteristics survive import. Malformed records enter quarantine; their partial normalization is rolled back. Publication updates the active source import atomically only after complete parsing, reconciliation, and SQLite integrity checks. Quarantine or interruption leaves the previous source active. Exact offline reimport returns the same completed import; an independent database can reconstruct the same inventory hash.

`readCandidateCards` returns the full observed Oracle object, canonical source-record version hash, raw archive hash/ordinal, source bundle identity, and each role's candidate/excluded/unresolved disposition. `colorIdentity` restricts results to cards whose identity is a subset of the requested colors. Its results still require reviewed card definitions and complete deck admission. In particular, Companion restrictions and additional-commander permissions are not established by a single provider legality Boolean.

`rule_nodes` partitions every byte of the rules document into preamble/contents, chapters, sections, numbered rules, glossary definitions, and credits. Nodes retain source spans and hashes. Candidate numbered references are resolved against that exact document; this graph is source evidence, not execution precedence. All substantive nodes retain unresolved semantic applicability.

The catalog exposes source discrepancies and unresolved relationships instead of dropping records. Provider legality, paper release evidence, official named bans, and commander characteristics contribute to candidate research queues; category bans, interchangeable names, special construction permissions, and card interactions still require reviewed profile/definition evidence. Current commander characteristic candidates include legendary creatures and qualifying legendary Vehicles/Spacecraft, following the pinned rule text.

Raw archives and SQLite databases belong under ignored `.commander/`. Keep them out of source distribution and generated starter workspaces. Code/data/artwork permissions are separate. The package has no UI, Firebase, renderer, or browser storage dependency. A future browser catalog consumer must use a separate adapter; `bun:sqlite` is native-only.

Run `bun test packages/catalog/src` for integrity, quarantine, interruption, provenance, role, rules-parser, and offline reimport fixtures. Full data inventory and import evidence are generated locally; unit fixture counts do not establish full Commander coverage.
