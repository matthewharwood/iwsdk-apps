# Self-entry trigger research and proposed runtime boundary

This is a source inventory and design draft. No trigger code, source release, supported-card status or executed scenario is introduced by this work.

The scan reads all 31,829 paper main-deck candidates from supplemental bundle `6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df`. Of these, 17,750 identities have a creature face. Broad discovery retained 599 creature-face records containing entry-related draw or life-gain language, including nearby conditional, targeted, other-object and mixed-effect cases. Each record retains its complete body, exact Oracle version, archive hash/ordinal, face ordinal, characteristics, proposed constant effect and every unaccounted clause. Broad textual matching is a research index, not semantic acceptance.

After strict complete-body and ordinary-characteristic checks, 60 records remain research candidates. There are 23 mandatory draw-one creatures and 37 mandatory life-gain creatures: one gains 1; eleven gain 2; twelve gain 3; ten gain 4; three gain 5. No optional effect or draw-two-plus creature passes this complete-body scope. The other 539 broad records remain excluded from this initial proposal.

The only additional abilities admitted by the proposed scope are complete supported keyword labels or an exact single-color tap-mana clause. Llanowar Visionary includes its green mana ability; Baleful Strix includes flying and deathtouch. Normal single faces, fixed integer power/toughness and plain fixed mana costs are required. No reminder stripping occurs: Carven Caryatid and Aven Battle Priest remain excluded under their current complete bodies despite familiar keyword semantics. Wistful Selkie has an unsupported hybrid cost. Mulldrifter adds evoke. Cloudblazer combines effects outside the initial one-effect constructor. Soul Warden and Soul of the Harvest watch other objects; the latter is also optional. These exclusions are research scope, not claims that the cards are impossible to implement.

Reproduce with `bun docs/commander/source-etb-research.ts [database] [output]`. The default artifact is `.commander/research/etb-source-research.json`. The script checks every inspected Oracle payload against its normalized source hash; it writes no database or executable release. Source rule references in the artifact include exact text hashes and byte/line spans instead of duplicating the rulebook.

After discovery, all sixty complete body/type/cost/power/toughness tuples were inspected and an explicit proposed trigger was retained per identity in [the binding research review](source-etb-binding-review.json). No extra text was identified within those sixty tuples: the complete behaviors are one mandatory constant self-entry effect plus the recorded existing creature, keyword or green tap-mana behavior. This bounded source-to-proposed-IR review does not establish effective-ability lookup, trigger execution, surrounding interactions, rulings coverage or game certification. The research script passes standalone strict type checking, Biome and ESLint; artifact checks verify hashes, source links, unique scenario IDs and zero execution claims.

## Source-grounded requirements

The pinned rules TXT has hash `4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f` and is effective August 7, 2026. Sections 603 and 117 were read completely, alongside the captured APNAP, source-independence, controller, zone-identity, resolution and player-departure clauses.

| Rule | Required behavior |
| --- | --- |
| 603.2, 117.2a | Capture a trigger when its event occurs; do not execute its effects at that time, even during spell resolution. |
| 603.2c | Preserve each actual occurrence and independent source instance; deduplicate discovery paths rather than ability instances. |
| 603.2g | A prevented or replaced-away event creates no trigger for the event that did not occur. |
| 603.6a/b, 603.10 | For this entry scope, inspect the post-event battlefield and effective abilities, including newcomers and effects already applying. |
| 603.6d | Static “as/with/tapped on entry” text is not an entry trigger. |
| 603.3a, 109.5 | Bind the controller at the time the ability triggers. A later change of source control does not change that trigger's controller or “you.” |
| 117.5, 603.3b | Reach the state-based-action fixed point, place waiting triggers, and repeat checkpoint work before granting priority. |
| 603.3b, 101.4 | Place ordinary triggers in APNAP player order; each controller chooses their own relative stack order. The current rule has a second APNAP pass for abilities triggered by another ability triggering. |
| 603.3, 608.2n | An ability on the stack is an object that is not a card; after resolution it ceases to exist rather than moving to a graveyard. |
| 603.5 | “May” effects still trigger and go on the stack; their option is chosen at resolution. |
| 113.7a, 400.7, 608.2h | A trigger remains independent after source removal. Preserve source identity/history where an instruction needs it; a returned source is a new object. |
| 117.3b, 117.4 | Players can respond after placement; successive passes resolve only the top stack object. Active-player priority follows resolution and checkpoint work. |
| 800.4a/d | Remove a departing controller's noncard stack objects; do not place that departed player's waiting triggers. |

This constant self-draw/life slice needs captured controller and ability context but does not itself read variable source power or last-known characteristics at resolution. Do not generalize that observation into removing history support: variable-power, damage-source, leaves-the-battlefield and linked-ability programs require separately specified current/historical views.

## Proposed typed representation

A narrow initial shape can reference the existing constant effect operations while giving triggers a distinct event and execution context:

```ts
type SelfEntryProgram = {
  schema: "commander-trigger/1";
  id: string; // Stable local ability identity within the versioned card definition.
  trigger: {
    kind: "self-enters-battlefield";
    view: "post-committed-event";
    placementClass: "ordinary";
  };
  choice: { kind: "mandatory" }; // Initial published constructor accepts only this case.
  effect:
    | { kind: "draw"; recipient: "trigger-controller"; amount: number }
    | { kind: "gain-life"; recipient: "trigger-controller"; amount: number };
};
```

The future optional variant must explicitly contain a resolution decision with accept/decline branches. A Boolean flag that disappears before resolution is insufficient. Targeted, modal, delayed, reflexive, intervening-if, trigger-multiplication, other-object and combined-effect programs remain unavailable until their own typed contracts and rules tests exist. Do not reinterpret source English in the runtime or certify a card merely because a regex found a familiar sentence.

Capture a waiting instance with its own deterministic ID, committed event ID and occurrence ordinal, source object ID/generation, definition ID/version, ability ID/program digest, controller-at-trigger, and source view/history references. Save the immutable ability context required to resolve even if the source leaves before placement. A trigger's ID must distinguish two identical card definitions and two separate entries of the same card lineage.

Keep physical card objects separate from noncard ability stack objects. Use a discriminated stack record such as `{ kind: "spell", objectId }` or `{ kind: "triggered-ability", triggerId }`, backed by a typed ability-instance record. No counterfeit Oracle ID, zero-cost spell, or physical card is needed to represent a trigger. Observation projections expose public ability source/controller/effect identity and exact stack order.

## Event capture, ordering and resolution

1. Commit the complete zone-change event, including every simultaneous entry, with distinct pre/post object identities. Preserve its grouping. Match effective self-entry abilities against the post-event view and append waiting instances without applying their effects.
2. Finish the currently resolving instruction sequence or casting/activation procedure. Do not create a priority window merely because a trigger is waiting. If the source leaves later in the same resolution, retain the captured instance.
3. When priority would be granted, perform state-based batches until stable. Apply required Commander-zone choices and repeat state-based checks as appropriate. A source that dies here still has its previously captured trigger; a player who leaves cannot place their waiting trigger.
4. Form the ordinary-trigger placement cohort, grouped by the captured controllers in current APNAP turn order. For each controller with multiple pending instances, request an explicit permutation of exactly those instance IDs. An unambiguous singleton can be placed automatically. Define the submitted order as bottom-to-top, so the final item resolves first. Previous players' choices remain public. Do not substitute lexical IDs, capture timestamps, rule specificity or AI preference for a controller's ordering choice.
5. Reserve the rule's second placement phase for trigger-on-trigger abilities. The initial release rejects those programs, but phase state must not conflate them with ordinary triggers. Newly created waiting triggers must enter a later correctly defined checkpoint cohort; restoring a paused placement cannot discover the same committed event twice.
6. Repeat state-based and waiting-trigger processing, then grant the originally appropriate priority. Passing around the table resolves only the top ability; use its captured trigger controller for self-draw/life gain, run the constant effect, remove the ability instance, run the next checkpoint and grant the rules-required priority.

If the active player leaves during their turn, preserve the existing turn continuation: CR 800.4j continues the turn without an active player and substitutes the next player in turn order when appropriate for priority, resolution or step progression. A trigger checkpoint must not reset that continuation or silently choose the first stored seat.

The exact grouping for newly triggered abilities during placement must be covered before expanding beyond ordinary self-entry triggers. A finite dependency closure over these initial programs needs their card roots and trigger core capabilities, but no external card definition. Unknown or generated dependencies must retain conservative availability and block unsupported preparation. Add explicit capabilities for capture, waiting queue, APNAP ordering, ability-stack resolution and serialization to any future prepared artifact; the current release must not infer their support from the ordinary-creature recipe revision.

## Persistence and proposed verification

The canonical state must include waiting instances, captured contexts, placement phase/cohort, current controller's outstanding permutation, ability stack records and any optional-resolution continuation. Save/import compatibility must pin trigger program/processor/serializer versions. A replay consumes persisted choices and occurrences; it must not recapture an already journaled event. Old untyped stacks require a real version boundary, not silent reinterpretation.

The companion [scenario draft](source-etb-scenarios.json) contains authored expectations for capture, source removal, simultaneous entry, same-controller order, APNAP, changed control, priority, player departure, negative admission and reload points. Every row is explicitly unexecuted. Cases needing simultaneous-entry effects, variable characteristics, trigger suppression, optional effects or control-changing operations are identified as synthetic or future prerequisites rather than claimed real-card gameplay coverage. Initial source candidates remain unsupported until implementation, source binding review and actual scenario/game evidence are linked.
