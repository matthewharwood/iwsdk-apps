# Exact keyword reminders in the 0.9 development subset

The opt-in `keyword-reminder-creature/1` constructor adds **232 source-bound definitions**, producing a combined 0.9 release of **1,090 definitions** with **30,739 unsupported identities** out of 31,829 candidates. All 858 earlier definitions are preserved exactly, including the four ordered self-entry cards and 97 temporary-modifier spells. The source bindings add no engine semantics. The original 0.7 reminder prototype is retained separately and is not relabeled as 0.9 execution evidence.

Only 20 explicitly enumerated complete keyword-plus-reminder lines are recognized. Equality includes punctuation and pronouns; no general parenthesis removal or partial-body matching occurs. Rules 207.2 and 207.2a in the pinned [official Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt) distinguish explanatory reminder text from game instructions. The resulting flags use the existing typed keyword processors.

An ordinary single face, supported type set, fixed integer power/toughness, plain fixed mana cost and consistent mana value remain required. The provider keyword set must match exactly. Remaining text must be a currently supported exact keyword label, one single-color tap-mana clause, or an explicitly enabled single mandatory self-entry clause. Edited or unknown reminder text, extra abilities, optional or combined triggers, hybrid/variable costs and specialized characteristics fail closed. Four additions reuse existing self-entry programs: Aven Battle Priest, Carven Caryatid, Jungle Barrier and Valkyrior Skyrider. Vine Trellis reuses the existing mana ability. No new runtime English interpretation was added.

The compiler finds 870 candidate records with a recognized reminder line. Only 232 complete records bind; the other 638 retain explicit unsupported reasons. All 232 complete Oracle tuples were read by the implementer and authenticated against original source bytes; the six retained rulings were also read and authenticated. A later full-registry audit authenticates these bindings again as part of all 1,090 records. These are source-binding and constructor checks, not per-card execution certificates.

`reviewedKeywordReminderDefinition` reconstructs the whole body and typed behavior, while prepared admission also enforces the closed authenticated definition registry described in `source-authentication-v0.9.md`. The current plan version is `development-match-plan/5`, compatible with `commander-engine/0.9.0`. It retains the required trigger, continuous-effect and keyword capability checks. Renaming a card, erasing its marker, downgrading its recipe or submitting a fully fabricated consistent body cannot bypass production source verification.

## APIs and fixture coverage

`compileDevelopmentRelease` accepts the explicit `keywordReminders` option in addition to the existing family/trigger/sequence/modifier options. `compileKeywordReminderDraft` compiles the combined opt-in release and checks preservation of the 858-definition baseline. The existing no-option build remains unchanged. `makeKeywordReminderDecks(fullRelease, frozenDecks)` verifies and preserves every supplied frozen revision, then returns supplemental decks and explicit unmatched-color accounting.

The combined release is `8abe41532a96354af76d414d6c1c56e74c8142b126bb6cb7b8cac806c7380edd`, with source bundle `6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df`. The original 24 complete deck revisions are preserved byte-for-byte. The historical builder's commander/entry compositions also remain unchanged; newly generated historical revision IDs normally reflect their new release hash. Seven explicit supplemental decks each contain 39 basics, up to 48 new reminder cards, six existing supported spells, and ordinary source-backed creature fillers. All 31 supplied decks pass engine admission.

| Zero-based index | Commander | New reminder identities |
| ---: | --- | ---: |
| 24 | Jasmine Boreal | 48 |
| 25 | Jasmine Boreal | 48 |
| 26 | Jasmine Boreal | 29 |
| 27 | The Lady of the Mountain | 41 |
| 28 | Tobias Andrion | 29 |
| 29 | Lady Orca | 27 |
| 30 | Sivitri Scarzam | 2 |

The supplemental union contains 224 of the 232 additions. Eight lack a currently implemented compatible commander: Iroas's Champion (RW), Jungle Barrier (GU), Kederekt Creeper (UBR), Lightning Stormkin (RU), Relic Sloth (RW), Simic Sky Swallower (GU), Swiftblade Vindicator (RW) and Winged Coatl (GU). They remain admitted source bindings with explicit deck-coverage gaps, not played or excluded identities.

## Retained integration evidence

All listed artifacts are retained in `.commander/prototypes/engine-0.9/.draft-artifacts`. Their original isolated workspace is `/private/tmp/iwsdk-commander-0.9`; recorded paths and hashes remain unchanged.

| Artifact | Semantic hash |
| --- | --- |
| `release-combined-reminders-v0.9.json` | `8abe41532a96354af76d414d6c1c56e74c8142b126bb6cb7b8cac806c7380edd` |
| `expansion-combined-reminders-v0.9.json` | `eb4a82d63b403554e569511c421dc0dec70d3722671fc5f99fd3daa33475ba30` |
| `deckReport-combined-reminders-v0.9.json` | `23280779628753b29946c599e3fb0a31cd07fd18a8f5be8d294ff9503ce5d869` |
| `verification-combined-reminders-v0.9.json` | `46b2980e37fd6451be32812fd46baafe6afa05bf5329aac6d4b32c4c58ea9832` |
| `prepared-combined-reminders-2p-v0.9.json` | `d592ab3c7e842b0b906318c7ec222ec5ec9c05227d96e7298609d9033d826c6f` |
| `prepared-combined-reminders-4p-v0.9.json` | `b03a1c1610ea7fcfc29aba8544dfa6b3276b575b2ff6eae56a8fb50a4744b17b` |

The two-seat prepared artifact uses deck indices 20 and 24, retaining 120 definitions and excluding 970. The four-seat artifact uses 20, 21, 24 and 29, retaining 213 and excluding 877. Both have zero unresolved closure blockers and explicitly retained core capabilities. These checks establish admission and pruning; game completion is reported separately.

Owned compiler/card-program tests pass 50 tests and 1,715 assertions, with strict type and source-lint checks. The detailed compiler report retains every unsupported reason. Scripts `compile-combined-reminders.ts`, `verify-combined-reminders.ts` and both `authenticate-reviewed-source` scripts reproduce the local artifacts. The earlier 0.7 prototype authentication and full-body review hashes are respectively `24afc17705d7d2eb116e8a8434dc04ed13e4b9825b2b6176ad0df16a88fb248d` and `635e8614ca37b5d49e2de9821a7ebba921ab3471a261afe8ce3837a93e13328b`; the 232 actual definition objects remain identical across integration.
