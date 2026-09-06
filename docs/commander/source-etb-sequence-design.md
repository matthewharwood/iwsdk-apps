# Ordered self-entry effects and optional-choice research

Four additional complete creature bodies fit the next bounded effect proposal: Cloudblazer, Elite Guardmage, Inspiring Overseer and Priest of Ancient Lore. Each gains a fixed amount of life, then draws a fixed number of cards. This research changes no runtime, compiler, content release or deck. No scenario in the accompanying draft has been executed.

| Card | Cost; characteristics | Proposed ordered instructions | Other complete abilities |
| --- | --- | --- | --- |
| Cloudblazer | `{3}{W}{U}`; Human Scout, 2/2 | Gain 2 life; draw 2 | Flying |
| Elite Guardmage | `{2}{W}{U}`; Human Wizard, 2/3 | Gain 3 life; draw 1 | Flying |
| Inspiring Overseer | `{2}{W}`; Angel Cleric, 2/1 | Gain 1 life; draw 1 | Flying |
| Priest of Ancient Lore | `{2}{W}`; Dwarf Cleric, 2/1 | Gain 1 life; draw 1 | None |

All four are normal single-face cards with plain fixed costs and integer power/toughness. Their entire Oracle bodies, metadata and proposed instruction order were inspected. The archive SHA, raw ordinal, byte span and raw-record hash were checked against the archived Oracle file and catalog. Their normalized source versions were independently recomputed by the research scan. The catalog retains no rulings for these four identities; that absence does not certify all interactions.

Reproduce enumeration with `bun docs/commander/source-etb-sequence-research.ts [database] [output]`. Defaults read `.commander/catalog-v2.sqlite` and write `.commander/research/etb-sequence-source-research.json`. The script scans all 31,829 main-deck candidates and verifies every normalized Oracle payload hash. Broad discovery retains 860 face records: 599 creature faces and 261 adjacent noncreature faces. It recovers the previous 60 one-effect creature bodies and identifies four additional ordered bodies. All unmatched text remains in the artifact with explicit failures and unresolved dependencies; discovery is not acceptance.

There are **zero optional candidates** within the complete ordinary-creature scope. The scan retains 99 creature records whose broad entry-related lines contain “may,” including other-object triggers and unrelated optional instructions. Their full bodies require additional semantics. The current source therefore supports an immediate proposal for the four mandatory sequences; optional resolution can remain a separately specified future increment without inventing a real-card coverage claim.

The [four-record review](source-etb-sequence-binding-review.json) retains complete source tuples and explicit proposed IR. The [scenario draft](source-etb-sequence-scenarios.json) contains 33 authored expectations, including synthetic optional-choice and observer fixtures that are clearly separated from source-card cases. The local authentication artifact is `.commander/research/etb-sequence-authentication.json`.

## Resolution requirements

All rule references use the archived [Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt), SHA `4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f`, effective August 7, 2026. Sections 608.1–608.2, 121.1–121.8 and 704.1–704.5b were read alongside the previously reviewed trigger and priority clauses. Exact rule-node hashes and byte/line spans are retained in the research and scenarios.

- **Written order:** CR 608.2c requires life gain before drawing in all four bodies. A constructor must account for the full body before declaring an ordered program. Recognizing a familiar first clause cannot discard a later qualifier or ability.
- **Individual draws:** CR 121.2 makes Cloudblazer’s draw-two instruction two successive card draws. Preserve their library order and event identities. Do not replace this with a single unordered hand transfer.
- **One resolving ability:** CR 117.2e and 608.2c provide no ordinary priority window between the life gain and draws. CR 704.4 postpones state-based checks until the ability finishes. Triggers can occur during the sequence, but CR 117.2a and 117.5 defer their placement until the later checkpoint.
- **Partial draw failure:** Under CR 121.4 and 704.5b, an empty-library draw attempt records the condition for the next state-based check. It must not terminate the remaining resolving instructions early. The synthetic reverse-order scenario tests this explicitly without pretending that the reversed program is one of the four cards.
- **Captured ownership:** CR 603.3a and 109.5 bind both instructions to the captured trigger controller. CR 113.7a preserves the ability after source removal; a later change of source control does not redirect either effect.
- **Ability ordering:** CR 603.3b orders whole triggered-ability instances in the ordinary APNAP cohort. It does not interleave instructions from different abilities. CR 608.2n removes the finished noncard ability rather than sending a counterfeit card to a graveyard.

Replacement effects, life-gain and draw observers, continuous prohibitions, and player-departure interactions still need their own admitted programs and evidence. The scenarios mark such prerequisites explicitly. No general replacement or continuous-effect support follows from this four-record proposal.

## Proposed typed increment

The immediate constructor needs an immutable ordered list instead of a single effect. For example, Cloudblazer’s proposed research record contains:

```ts
{
  schema: "commander-trigger/research-sequence-1",
  id: "self-entry-0",
  trigger: {
    kind: "self-enters-battlefield",
    view: "post-committed-event",
    placementClass: "ordinary"
  },
  choice: { kind: "mandatory" },
  effects: [
    { kind: "gain-life", recipient: "trigger-controller", amount: 2 },
    { kind: "draw", recipient: "trigger-controller", amount: 2 }
  ]
}
```

This is a proposal, not an accepted runtime schema. An implementation should introduce an explicit compatible program/processor version, preserve complete ordered program digests in captured abilities and prepared artifacts, and keep old source releases distinct. Exact constructors for the three observed sequence bodies can reuse reviewed primitive operations without interpreting English at runtime. They must still reject changed order, changed constants, omitted flying or additional source clauses.

The mandatory four-card sequence needs no user decision between instructions. It can execute atomically within the resolving transition. If a future operation suspends resolution, persist the resolving ability, captured controller and source context, instruction cursor, completed instruction events and continuation. Reload must resume after completed work, not restart the sequence or re-enter trigger placement.

## Optional resolution remains a separate proposal

CR 603.5 puts optional triggers on the stack regardless of the controller’s earlier intention. CR 608.2d asks for the option during resolution. A future typed optional node should declare its deciding player and exact accept/decline branches, rather than attach an ambiguous Boolean to an entire arbitrary sequence. The scope of a “may” must come from a reviewed complete body; a parser must not guess whether it governs one action or several.

The paused state must retain the resolving ability and an owned decision tied to its continuation. Ordinary casting, passing and combat commands remain unavailable while it is paused. Accept or decline resumes that same resolution; it does not create a new stack item or priority window. Save/reopen must retain the decision, and exact retries of accepted command IDs must return the original stored receipts without applying the branch twice.

An empty library still permits choosing an offered draw under CR 121.3; a prohibition on drawing does not. CR 121.2b also distinguishes mandatory multiple draws that can be partially performed from choosing an unavailable optional multiple draw. These are future semantic obligations, not claims that the current source subset implements draw restrictions. Synthetic optional cases must stay outside real-card coverage counts.

## Explicit exclusions

Bookwurm has an additional graveyard-to-library activated ability. Mulldrifter has evoke. Hero in Training and Oil-Gorger Troll have later conditional instructions; Kami of Terrible Secrets has an intervening condition. Disciple of Bolas combines sacrifice and variable values. Tataru Taru involves another player’s option plus an additional Treasure trigger. Dovin’s Acuity adds enchantment behavior and a separate casting trigger. Invasion of Dominaria has Battle/Siege and multiple-face mechanics. None may inherit support by matching only a draw or life-gain fragment.

The source bundle is the reviewed tabletop supplement `6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df`. Its Oracle bytes are unchanged from the earlier bundle; the supplement’s narrow eligibility decision is documented separately in [tabletop eligibility provenance](source-tabletop-eligibility.md).
