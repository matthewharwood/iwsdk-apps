# Setup observation audit and first-player choice

This bounded review uses the [pinned comprehensive rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt), SHA-256 `4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f`, effective August 7, 2026. The archived bytes are retained in `.commander/sources/archives`. These findings do not certify all of rule 103 or the setup scenario group.

## Public mulligan information: implemented, independent final review pending

CR 103.5 specifies declarations before the round's simultaneous mulligans: “Then each other player in turn order does the same.” A later player therefore knows earlier declarations when making their own choice. The engine collected them correctly in `setupChoices`, but `observe` omitted them. A client using only its entitled observation could not distinguish an earlier keep declaration from an earlier mulligan declaration.

The independent expectation is that every seat can see each pending declaration, the number of mulligans already taken, and which players have finished keeping. New hands, selected bottom-card identities and nonowned decision constraints remain private under CR 402.3. The declaration is not an early redraw: every player's existing hand stays unchanged until the round's declarations are complete. The first multiplayer mulligan counts in the public history while remaining free for bottoming under CR 103.5c.

`PlayerObservation.players` and `observe` now expose:

- `mulliganDeclaration`: `true` for keep, `false` for mulligan, or `null` when this round has no pending declaration for that player. Completing a declaration round clears its declarations.
- `mulligans`: actual redraws taken, including the first free multiplayer mulligan.
- `keptHand`: the player has completed keeping and cannot rejoin later rounds. During an unfinished round, their public keep declaration supplies the immediately visible choice.

The two tests in `packages/engine/src/audit-scenarios.test.ts` execute actual setup transitions for ordinary two-seat and four-seat games. Their exact names are `SET-04 2 seats see mulligan declarations and history while hands and bottom choices stay private` and the corresponding `4 seats` test. Both passed with 84 assertions in `.commander/evidence/setup-observation.junit.xml`. They cover declaration order/visibility, free versus paid counts, kept-player state, round reset, hidden hands and bottom choices, and detached observation values. Synthetic 100-card decks isolate this behavior; these are not source-card or whole-group certification. The earlier aggregate scenario map remains historical and does not silently inherit this run.

## First-player choice: confirmed omission, implementation proposed

CR 103.1 first determines the player who “will choose who takes the first turn.” The current engine uses the seeded random result directly as the starting player, without providing that player's choice. A seeded method can select the chooser, and that chooser can choose themselves, but the core must also allow them to choose another seat. This omission is separate from the corrected mulligan projection.

Implement this after the prepared-registry migration has a stable verification boundary:

1. Add a versioned `starting-player` decision owned by the chooser, with all manifest seats as its allowed `players`, and a matching response naming one seat. Keep chooser and selected starting player explicit in durable setup state; the selected player is initially absent. The seed selects only the chooser at this stage.
2. Defer commander placement, library shuffling and opening hands until that response commits. Prefer an explicit pre-deal setup state with a strict invariant: no live game objects, hands, stack or other decisions yet, while the validated manifest still owns every complete deck. After selection, create all 100 physical cards per seat, place each commander in command, shuffle the remaining 99 and draw seven. Do not weaken the ordinary 100-object invariant for later states or reveal a hand before the choice.
3. Begin mulligan declarations at the selected starting player and continue clockwise in manifest seat order. Keep that selection in history as the game advances. Preserve the existing two-seat first-draw skip and multiplayer first draw, now relative to the selected player.
4. Have the heuristic propose choosing itself through the ordinary response boundary. Let terminal clients override that proposal. Update setup helpers to submit the extra decision explicitly; an automatic choice inside `createMatch` would recreate the defect.
5. Pin the changed initial-state and command behavior to a new compatible engine/serialization identity. Reopening older evidence must execute its preserved version or report a deliberate incompatibility; it must not reinterpret an old first mulligan command as a starting-player response.

Before executing the implementation tests, use these source-derived expectations: chooser selection is reproducible for one seed; no hand is available before choosing; the chooser may choose themselves or any other seat; wrong actor, stale decision and unknown seat leave state/RNG unchanged; the chosen seat owns the first mulligan declaration; all later declarations follow the rotated seat order; and first-draw behavior follows the chosen seat in both modes. Save, reopen and replay before and after the choice must preserve its owner and final selection. Relevant rules are 103.1, 101.4e, 103.2c, 103.3, 103.5 and 103.8a–c. None of these proposed choice tests is reported as executed here.
