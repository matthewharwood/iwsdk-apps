# Finite whole-text spell families

The opt-in family compiler binds 55 complete spell programs from the pinned source snapshot, including the original seven individually pinned spells. These add 48 definitions to the earlier 649-definition release, giving 697 development definitions. Compilation preserves 31,132 unsupported candidate identities and the snapshot's separate unresolved eligibility record. Binding and review do not certify all interactions or completed gameplay for each identity.

`compileSpellFamilyDraft(databasePath)` scans all 31,829 main-deck candidates. It records 57 complete-text matches with full Oracle bodies, source versions, archived source ordinals, costs, type lines, typed programs and admission outcomes. Of these, 55 bind. Reach Through Mists remains unsupported because its Arcane subtype is outside the ordinary Instant/Sorcery recipe; Unmake remains unsupported because its hybrid cost is outside the plain mana-cost grammar.

## Reviewed constructor scope

Each constructor compares the entire body against finite exact strings. No runtime English interpretation, reminder stripping, whitespace trimming, partial-body consumption, inferred X value, or broader target substitution is used. Only normal, single-face cards with exactly `Instant` or `Sorcery` types, plain fixed costs, consistent mana values, matching source identities and no extra keyword metadata are admitted. Previously pinned identities retain their stricter source-version checks.

| Complete-body family | Finite values | Bound identities |
| --- | --- | ---: |
| Controller draws | One, two, three or four cards | 10 |
| Target player draws | Two, four or seven cards | 3 |
| Controller gains life | 4, 5, 6, 7 or 8 | 6 |
| Target player gains life | 5, 7 or 8 | 3 |
| This named spell damages target creature | 2, 3, 4, 5 or 7 | 13 |
| Creature damage, then controller life gain | 2/2 or 3/3 | 6 |
| Controller life gain, then draw one | 3, 4 or 6 life | 5 |
| Target player gains life, then controller draws one | 4 life | 1 |
| Destroy target creature | Exact complete sentence | 5 |
| Exile target creature | Exact complete sentence | 3 |

The last two constructors were enabled only after the independently implemented destroy/exile primitive tests passed: 22 effect tests with 172 assertions. Their target domain is creatures. Regeneration, prevention, protection, replacement effects, modified target conditions, post-move references and extra clauses are not approximated by these recipes.

The source is the archived Comprehensive Rules TXT with SHA-256 `4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f`, effective August 7, 2026. Constructor obligations reference that text's actual numbering, including 109.5, 119.3, 120.3e, 121.1–121.4, 201.5, 601.2c, 608.2b/c/n, 701.8a/b, 701.13a, 702.12b, 704.4 and 903.9a. The pinned source bundle is `ba729f4152706f845504430574c8bfcc2ae6ea91380182c80d6055d24b50edd9`; the Oracle archive SHA-256 is `ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274`.

## Separate reviews and artifacts

The root agent independently inspected all 55 complete text-to-program bindings and retained explicit expected programs in [spell-family-binding-review.json](spell-family-binding-review.json). Its file SHA-256 is `aac74fc02248dd9bba420c593cc1d55abed5ba4da4ed9a826068eb2430ed8f57`. A second agent reviewed all 57 tuples and verified the actual archived gzip hash, raw record ordinals, source fields and normalized version hashes. Its local report is `.commander/semantic-audit/spell-family-independent-review.json`, with report hash `2ce01e5b33ce4fa18931a8d2fcc737214bf13363a93a5ad01a147b55df44c938`. These reviews establish bounded source bindings; neither reports all-record gameplay certification.

The compiler's expansion report deliberately records zero games and zero automatically inferred independent reviews. Reviews remain separately attributable evidence. Generation does not silently promote a draft release or overwrite earlier artifacts.

| Local artifact | Scope |
| --- | --- |
| `release-v0.4-draft.json` | 697 definitions, engine ABI 0.4; hash `0d3f463389fe52f0c29bac05a63d240760303375a5fd75fd3ef15fbb7c436ef0` |
| `release-v0.5-draft.json` | Same definitions, engine ABI 0.5; hash `4d3a8ebbc31a366a28d9e7ab4392d8843c55d315f07b1e265fd886bf4c2057c7` |
| `spell-family-expansion-v0.5-draft.json` | All 57 source matches, two exclusions and finite constructor inventory |
| `report-v0.5-draft.json` | Complete compiled/unsupported and unresolved-eligibility accounting |
| `decks-v0.5-draft.json` | 17 legal development deck fixtures |
| `source-draft-admission-v0.5.json` | Review-to-definition equality and prepared admission checks; zero game claims |

All these local files reside under `.commander/`. The complete definition dictionaries in the two draft releases have identical canonical hash `83e3d83a1484ba8d2abc6f63b2acf9cfb6f5820541ce980ce4361fd654983844`. Every 0.5 bound spell was also checked against the review's identity, exact source version, complete text and expected program.

## Deck fixtures and verification

`makeDevelopmentDecks(release, { includeFamilyDecks: true })` preserves the original twelve creature profiles and two seven-spell profiles, then appends three spell-rich fixtures. Each includes every compatible admitted spell, one commander, 39 basic lands split 20/19, and enough distinct creatures to total 100 cards. The compiler rejects missing family coverage or an altered typed program.

| Index | Commander | Colors | Spells | Other creatures |
| ---: | --- | --- | ---: | ---: |
| 14 | Tobias Andrion | White/blue | 22 | 38 |
| 15 | Lady Orca | Black/red | 27 | 33 |
| 16 | Jasmine Boreal | Green/white | 16 | 44 |

The union of these decks includes all 55 programs. Lady Orca includes Murder, Bilbo's Deadly Slice, Eviscerate, Fell and Impale for destruction, plus Final Reward, Final Death and Wander Off for exile. All seventeen real-source decks passed engine deck admission. The focused card-program/compiler suite passed 26 tests with 349 assertions, and both package type checks plus Biome and ESLint passed. Tests cover complete-body rejection, changed source pins, altered programs, singleton counts, color identity, fixed land counts and total spell coverage. Actual game and browser execution evidence is recorded by the separate runners, not inferred here.
