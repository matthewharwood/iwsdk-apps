# Next bounded coverage families

The largest immediate compiler opportunity is **232 ordinary creatures with already implemented keywords whose exact reminder lines are not currently consumed**. The largest useful new semantic investment is typed continuous modifiers and ordinary activated abilities: the strict research grammars find 309 distinct cards across temporary creature spells, self-pump activations, team effects, and combat-triggered modifiers. Mana output vectors, color choices, and entry replacements provide another coherent 186-card union. These are research counts, not admitted or executed coverage.

The scan used all 31,829 tabletop candidate identities from source bundle `6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df`, compared with the frozen 757-definition 0.7 release `15d505263948face9482d6ba3586eabfb9bac114edce46ae9b4ec0db256dd769`. It examines the remaining 31,072 unsupported identities. It verifies the frozen release hash and bundle, then recomputes every candidate's normalized source-version hash. It records full Oracle bodies, identity/version/archive/ordinal pins, characteristics, family membership, and exact rule-node references.

The reproducible command, run from the repository root, is:

```sh
bun .commander/research/next-coverage-families.ts \
  .commander/catalog-v2.sqlite \
  /private/tmp/iwsdk-commander-0.7/.draft-artifacts/release-self-entry-v0.7.json \
  .commander/research/next-coverage-families.json
```

The research artifact is `.commander/research/next-coverage-families.json`, semantic hash `419701b9c5ebfe5ce80eea289348432d0e54d0635d61379526c1a184e8b7fa49`. The script and large source artifact are local research evidence, excluded from Git. The artifact includes the script's byte hash and the inspected implementation hashes. Strict TypeScript, Biome, and ESLint checks passed for the script. This is not a compiler release and runs no games.

## Counts and exact boundaries

“Discovery” is a broad text search, including cards with additional unsupported clauses. “Qualified” requires the entire body to match a finite bounded research grammar and ordinary supported layout, fixed cost, and characteristics. Qualified counts are lower bounds for those grammars, not complete semantic-family inventories or individual binding reviews. Families overlap. The union is **1,216 identities**; adding the table rows would overcount. These grammars leave 29,856 unsupported identities outside their union.

The baseline remainder accepts only current keyword lists, exact single-color tap mana, the existing single mandatory self-entry draw/life clause, and 29 individually enumerated reminder lines. Some proposed families therefore also depend on finishing the reminder work first. Creature candidates must have ordinary Creature/Artifact/Enchantment types, fixed integer power and toughness, and a plain fixed mana cost consistent with mana value. Spells must be ordinary single-face Instants or Sorceries. The artifact retains the stricter family-specific predicates.

| Family | Discovery | Qualified | Complete-body boundary and next requirement |
| --- | ---: | ---: | --- |
| Existing keyword reminders | 898 | 232 | Only exact reviewed reminder lines and current baseline clauses. No general parenthesis removal; preserve the literal Oracle body and version a new constructor. |
| Static evasion | 892 | 146 | Basic landwalk, fear, intimidate, horsemanship, shadow, skulk, cannot-block, unblockable, or flying-only blockers. Add dynamic blocker predicates, including controller/land/color comparisons. |
| Mana activation vectors | 2,185 | 133 | Tap with optional fixed mana input; fixed output vector or finite color/any-color choice. No sacrifice, damage, variable count, conditional output, or spending restriction. |
| Self-pump activations | 423 | 117 | Fixed mana cost gives this creature fixed signed power/toughness change until end of turn. Needs nonmana activation, stack objects, continuous effect identity, duration, and source-instance tracking. |
| Land mana and entry | 2,277 | 99 | Fixed/color-choice mana, unconditional enters-tapped, optional mandatory entry life gain. No conditional entry, pain, bounce, sacrifice, cycling, or search. Needs entry replacement and land-trigger support. |
| Temporary creature spells | 1,087 | 97 | One target-creature clause, possibly “you control”; fixed signed power/toughness or existing keyword grant until end of turn; optional exact controller draw-one sentence. |
| Combat-trigger modifiers | 253 | 73 | Exact prowess, exalted, flanking, bushido 1–5, or attacks-to-fixed-self-pump forms. Needs event families and continuous effects beyond self-entry. |
| Simple attachments | 1,442 | 62 | Aura with enchant creature, or Equipment with a fixed equip cost; only constant stat/known-keyword effects. Needs attachment legality, equip stack/targets, layer evaluation, and detachment/state-based actions. |
| Tap draw/life activations | 539 | 53 | Fixed mana/tap cost and optional self-sacrifice; fixed draw or controller life gain only, with admitted baseline mana/entry clauses. |
| Fixed-color protection | 344 | 48 | Bare protection-from-color clauses plus baseline keywords. Requires damage prevention, attachment, blocking, and targeting rules together; cannot implement only one part. |
| Regeneration | 263 | 43 | Fixed mana regenerates this creature. Requires replacement shields, destruction reason, damage clearing, tap/combat removal; not equivalent to indestructible. |
| Filtered removal/damage | 2,071 | 27 | One attacking/blocking/tapped/untapped/nonblack/nonartifact creature filter, constant effect, no rider. Needs complete typed target predicates and resolution revalidation. |
| Hybrid costs, existing bodies | 608 | 23 | Color/color or two-generic/color symbols and existing complete bodies; excludes Phyrexian, X, snow. Requires alternative payment plans and exact mana-value rules. |
| Team temporary spells | 287 | 22 | Creatures you control get fixed stats/known keywords until end of turn, optionally draw one. Capture the affected set when the effect resolves. |
| Tap/untap creature activations | 63 | 21 | Fixed mana/tap cost; tap or untap a target creature only. Needs activation stack and typed targets. |
| Any-target damage | 677 | 20 | Exact fixed self-name damage to “any target.” Requires players, creatures, planeswalkers, and battles; a creature/player-only approximation is inadmissible. |
| Targeted self-entry actions | 291 | 12 | Mandatory bounce creature or destroy/exile specified permanent type. Choose targets when placing the trigger; preserve APNAP ordering and source-independent resolution. |
| Draw/life-loss spells | 7,047 | 10 | Exact fixed self/target-player draw plus life loss, or fixed target-player/opponent loss with gain. Preserve written order and loss checkpoints. |
| Draw/loss or drain self-entry | 88 | 8 | Exact draw-one plus self-loss, or fixed each-opponent loss, possibly self-gain. Requires ordered instructions and player-set semantics. |
| Counterspells | 416 | 7 | Counter target spell, creature spell, noncreature spell, or instant/sorcery spell. No “unless” or rider; typed stack targets required. |
| Return to hand | 215 | 6 | Exact target creature/nonland permanent/permanent returned to owner's hand. Requires full named domain and Commander hand-move replacement. |
| Fixed-mana ward | 140 | 4 | Exact positive generic ward with bare or cost-matched reminder. Needs target-event capture, triggered payment at resolution, and countering spells/abilities. |

## Recommended order

1. **Review the 232 reminder candidates.** Rules 207.2–207.2a establish that reminder text is explanatory. This permits an exact source annotation table; it does not justify erasing arbitrary parenthetical text or accepting partial Oracle bodies. Authenticate every archive ordinal, check provider keywords and all characteristics, reject edited reminders and extra abilities, preserve the old 757 definitions, and compare actual compiler admissions with this discovery count.
2. **Build typed continuous modifiers and nonmana activated abilities.** The 97 target-spell, 117 self-pump, 22 team-spell, and 73 combat-trigger groups total 309 distinct candidates. Persistent effect records need source instance, affected objects, start and expiry, layer, dependencies, and rules-defined ordering. Self-pump uses the same effect primitive but adds cost payment and an independent stack ability. This infrastructure also supports the 62 attachment candidates later.
3. **Generalize mana abilities and land entry.** The two mana/land groups have 186 distinct candidates, one already in the reminder group. Add output vectors and player color choices, mana-input payment, noncreature artifact admission, replacement-based enters-tapped, and land entry triggers. Sol Ring, dual lands, and mana rocks are substantial real-deck improvements, but each requires its entire body and casting/entry behavior.
4. **Add static evasion and typed target filters.** The 146 evasion candidates mostly need explicit battlefield predicates and combat legality. Filtered removal, bounce, counterspells, and targeted entry effects total 52 distinct candidates, but they need different complete domains and trigger-target timing. Keep those constructors separate.
5. **Then broaden costs, replacements, and attachments.** Tap utility, self-pump, tap-target, and regeneration groups total 234 distinct candidates; after the earlier modifiers/reminder/mana groups, 117 are additional. Protection, ward, regeneration, and attachments have interacting obligations that should not be reduced to a single flag.

The four ordered draw/life self-entry cards remain a useful small increment that validates sequence resolution. They should not displace these larger infrastructure steps in an all-snapshot plan. None of these counts substitutes for card rulings, independent expected scenarios, runtime tests, legal-deck games, persistence checks, or complete rule applicability accounting.

## Representative records and rule obligations

The artifact retains 22 representative complete tuples inspected for ranking, including Canopy Spider, Anaconda, Sol Ring, Tranquil Cove, Giant Growth, Shivan Dragon, Jeskai Student, Bonesplitter, Asphodel Wanderer, Doom Blade, Night's Whisper, Phyrexian Rager, Counterspell, Lightning Bolt, Abbey Gargoyles, Waterfall Aerialist, Hearthfire Hobgoblin, Archivist, Blinding Mage, Unsummon, Man-o'-War, and Charge. Examples illustrate the complete bodies, not just matching phrases: Tranquil Cove needs enters-tapped, mandatory life trigger, and white/blue mana choice; Lightning Bolt needs the entire any-target domain; Bonesplitter needs both equip and its continuous modifier.

All references use the pinned [official Comprehensive Rules text](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt), effective August 7, 2026, SHA-256 `4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f`. The artifact records exact node hashes and spans, with zero unresolved references. Core dependencies include 602 (activated abilities), 603 (triggers), 605 (mana abilities), 608 (resolution), 611–613 (continuous effects and layers), 614 (replacement effects), 701.6 (counter), 701.19 (regenerate), 701.21 (sacrifice), 701.26 (tap/untap), 702's individual keyword rules, 704 (state-based actions), and 903.9b (Commander hand/library movement). Team continuous effects specifically need 611.2c's resolution-time affected set; enters-tapped needs 614.1d; battle damage needs 120.3h. Rule numbers were checked against this snapshot rather than remembered from older editions.

The next compiler increment will be isolated and explicitly opt-in. Its output must identify admitted source bindings and unresolved exclusions without changing the meaning of executed or fully supported coverage.
