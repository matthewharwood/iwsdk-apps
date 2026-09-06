# Seven exact counterspell bindings for 0.10

The opt-in `stack-counter-spell/1` constructor adds seven authenticated Instant definitions to the previous 1,090-definition development subset. The 0.10 release contains **1,097 bindings and 30,732 unsupported identities** from the same 31,829-candidate source snapshot. All 1,090 prior definition objects remain exactly unchanged. Compilation, source authentication and legal fixture construction do not certify counterspell execution or full Commander rules coverage.

| Card | Complete Oracle body | Printed cost | Typed target |
| --- | --- | --- | --- |
| Cancel | Counter target spell. | `{1}{U}{U}` | `spell` |
| Counterspell | Counter target spell. | `{U}{U}` | `spell` |
| Essence Scatter | Counter target creature spell. | `{1}{U}` | `creature-spell` |
| False Summoning | Counter target creature spell. | `{1}{U}` | `creature-spell` |
| Negate | Counter target noncreature spell. | `{1}{U}` | `noncreature-spell` |
| Preemptive Strike | Counter target creature spell. | `{1}{U}` | `creature-spell` |
| Remove Soul | Counter target creature spell. | `{1}{U}` | `creature-spell` |

Each program uses `commander-spell/1` and exactly one `{ kind: "counter" }` instruction. The schema admits these three spell-target domains only with that single instruction; it does not permit mixing a counter with draw, damage, removal or temporary effects in this increment. The constructor accepts only the seven exact Oracle identities, normalized source versions, archive hashes, record ordinals, source bundle, complete bodies, ordinary Instant characteristics and fixed costs. Extra abilities, altered reminders, subtypes, changed metadata or provenance fail closed. The counter option is explicit; previous compiler modes do not gain these bindings silently.

## Rules and source evidence

The pinned [official Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt), effective August 7, 2026, distinguish spells from noncard stack abilities (112.1 and 405.1), prohibit a stack item from targeting itself (115.5), and require target legality at announcement and resolution (601.2c and 608.2b). Countering removes the targeted spell from the stack, prevents its effects, and puts its card in its owner's graveyard without refunding paid costs (701.6a–b). A commander reaching the graveyard is then eligible for the existing owner choice at the state-based-action checkpoint (903.9a). The countering Instant's own destination is governed by 608.2n.

All 13 declared rule references were read and authenticated against the rule document's byte ranges and text hashes. Their document SHA-256 is `4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f`. The four retained rulings for the seven cards state that an Artifact Creature or Enchantment Creature spell still belongs to the creature-spell domain. Those records are retained in the [Scryfall rulings snapshot](https://data.scryfall.io/rulings/rulings-20260906090036.jsonl.gz), archive SHA-256 `c2ea9267fdb0118a771e27e0d2f53ecbc1c8e497cbca985c1977026afaf77ef7`.

The seven complete Oracle tuples were independently reviewed before implementation in `counterspell-source-review-initial-e0c17.json`, semantic hash `e0c17a7e92b7e5b8ff268e2caa5ea1432ecc8c914eef66a6b2ee24e9f0dd4a04`. The implementer reread their complete relevant fields and verified the original gzip records, raw hashes, ordinals and byte ranges. Expected definition objects were then derived from those source tuples and independently authored target proposals and compared with the compiler output before adding their digests to the trusted registry. A compiler-generated hash alone was not treated as source authentication. The later `counterspell-source-review.json` adds complete 903.8/733.1 paragraphs and has semantic hash `2fc78a4ef82dfefbbea03b0e164c440e48e41513aa64e05a7a48430c78fb2d05`; its seven Oracle tuples and typed proposals are unchanged. The expansion retains the original review hash, and both review versions are archived explicitly.

A separate audit reauthenticated all **1,097** registry members against original bytes, catalog payloads and normalized source-version hashes. It hashed all **12** manifest archives and checked all **48** retained rulings. This extends the fixed source-membership boundary documented in `source-authentication-v0.9.md`; it does not claim that every retained ruling was semantically discharged or that each card has executed in a game.

Counterflux, Deprive, Disallow, Dissipate, Dovin's Veto, Essence Capture, Mana Leak and Remand remain excluded because their full bodies introduce unimplemented abilities, costs, target domains, optional effects, pay-unless choices or replacement destinations. General copy, spell-control-change, target-change, uncounterability and countering-abilities mechanics are outside this bounded increment. No unknown source text becomes an ignored instruction.

## Prepared execution and source admission

The plan version is `development-match-plan/6`, compatible with `commander-engine/0.10.0`. A counterspell closure retains these explicit capabilities:

- `core:stack-spell-target-domain`
- `core:spell-self-target-exclusion`
- `core:counter-spell-owner-graveyard`
- `core:stack-target-revalidation`

It also retains the existing casting, payment, priority, zone-generation and relevant trigger/continuous capabilities. A counterspell adds no external card definition, token or copied definition. Unknown declarations widen availability and block prepared execution. The actual target is selected from the current typed stack at runtime; the compiler does not freeze a target set from initial state.

The closed production registry has 1,097 authenticated members and canonical hash `7a3f6263a6f3c7e726f0378d06402921efc40bc22df8f28ea9da613a4de2649b`. Full and prepared factories reject changed target restrictions, removed opcodes, downgraded recipe labels, known-version renaming and entirely fabricated identities even when the submitter rehashes every affected object. Prepared admission recomputes the closure and rejects rehashed capability omissions. Prior 0.9 ABI counterspell preparation is blocked. Exact earlier definitions remain valid source members, but historical headers do not bypass the engine's current ABI checks.

## Legal fixtures and reproducibility

`compileCounterSpellDraft(dbPath)` returns `{ release, report, expansion }`. `compileDevelopmentRelease` also supports the explicit `counterSpells: true` flag. `makeCounterSpellDecks(release, frozenDecks)` preserves every supplied frozen revision and appends two profiles using existing source-backed commanders. Each replaces seven ordinary creature slots with all seven counterspells, retains 39 basics, and preserves a legal 100-card singleton composition.

The combined set contains 33 legal deck revisions. The first 31 are identical to the frozen 0.9 revisions, including IDs and hashes. Index 31 uses Tobias Andrion (WU); index 32 uses Sivitri Scarzam (UB). Both include all seven counters. Actual engine admission accepted all 33 decks. Fixture inclusion is not evidence that a driver cast those seven cards.

The CLI's `compile --all-reviewed` path independently reproduced the same release and all 33 exact revisions. It reconstructs the historical 858- and 1,090-definition headers only to reproduce the original deck identities, requiring their known `671c50…55ba` and `8abe41…0edd` hashes first. It then builds the new counterspell fixtures against the actual 0.10 source release. No historical source is executed under a false ABI label.

Two- and four-seat prepared artifacts using the new WU/UB profiles each retain 116 definitions and exclude 981 from the 1,097-definition source. They have no unresolved closure blockers. These are real admission checks; game and persistence results belong to separate runtime evidence.

## Validation and artifact pins

All 58 card-program/compiler tests passed with 2,051 assertions. Both packages passed strict TypeScript, Biome and ESLint. New tests exercise all seven exact bodies and target restrictions, opt-in behavior, source and metadata changes, extra/altered text, constructor reconstruction, source-authentication downgrades and fabricated tuples, capability omissions, earlier ABI rejection, frozen deck preservation and invalid fixture inputs. Prior package regressions remain in the run.

Artifacts are retained in `.commander/prototypes/engine-0.10/.draft-artifacts`; the original isolated workspace `/private/tmp/iwsdk-commander-0.10` retains the recorded reproduction paths:

| Artifact | Semantic hash |
| --- | --- |
| `release-counter-spells-v0.10.json` | `58b8f2dd09d699ef232ba49257e0287eb8ca204902a9addddb499f73e3084739` |
| `expansion-counter-spells-v0.10.json` | `09cadce057a87deb880793f92ecce5b27ba1acd45da1c63fb9074998cc185f06` |
| `counter-spell-binding-derivation-v0.10.json` | `615e46aa9d6b7aad9965343b0aa7319186dcbc4b97011758a56f27c08998087e` |
| `deck-report-counter-spells-v0.10.json` | `b3b0c51bc1bc844719b91aefe4c1edcf97c351ac879816cffe8e3985fc3a2ddf` |
| `reviewed-source-authentication-v0.10.json` | `d54d7f78b462c9ec227c975b3fd71826eda1f728482c6e4c7f871e5d93ab431a` |
| `prepared-counter-spells-2p-v0.10.json` | `c8ece6db749fa216c1367044187db982b685b2505c69334baf536930059927af` |
| `prepared-counter-spells-4p-v0.10.json` | `0c900e7e0fd9f3a5a25193f67ed7fa27bfaa84fd6b10fad4d1d3f8e4a41a1d5d` |

The complete 33-deck list's semantic hash is `455fcdd798014f8c015274ae339e9161251dac5638d2f8a47491badf1d42e483`. The raw 1,097-record proof file SHA-256 is `68bf72cd60bdc8f43c6c24316d1d60434a32d24e5a54c22591f44b5c56a1ca21`. Reproduce with `build-counter-source.ts`, `build-counter-decks.ts`, and both `authenticate-reviewed-source` scripts in that directory. The source bundle remains `6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df`.

This source/constructor report contributes zero executed game scenarios and makes no full-snapshot support claim.
