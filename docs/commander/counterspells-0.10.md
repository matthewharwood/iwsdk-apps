# Counterspells in engine 0.10

Engine 0.10 adds the seven exact source bindings listed in [the source report](source-counter-spells-v0.10.md): Cancel, Counterspell, Essence Scatter, False Summoning, Negate, Preemptive Strike and Remove Soul. The development release contains 1,097 definitions and 33 legal decks. All 1,090 previous definition objects and the first 31 complete deck revisions remain unchanged. The other 30,732 paper candidates remain unsupported.

Three explicit target domains select spells currently on the stack: any spell, creature spell and noncreature spell. A spell cannot target its own incarnation. Noncard triggered abilities are excluded, and an Artifact Creature or Enchantment Creature remains a creature spell. Target selection and payment revalidate the current object; resolution checks it again. Battlefield hexproof and shroud do not protect a spell on the stack.

A countered spell leaves the stack for its owner's graveyard with a new object identity. It executes none of its effects and refunds no costs. Countering another counterspell can therefore allow the lower spell to resolve normally. A countered commander reaches the graveyard before its owner receives the existing command-zone choice at the subsequent state-based-action checkpoint. The countering spell finishes resolving first. General uncounterability, spell copies, redirection, ability counters, pay-unless costs and alternate counter destinations remain unsupported.

## Executed assertions and source admission

All seven source counterspells execute through production source admission and ordinary cast, target, payment and pass commands on explicitly constructed boards using authentic cards. Eight tests with 223 assertions cover the printed costs, underpayment rejection, owner graveyards, absent target effects and rejection of a rehashed altered definition. These are constructed source scenarios, not seven independent ordinary games.

The focused runtime/schema/driver suite contains 34 passing cases. A separate independent review ran 52 tests with 774 assertions and retained before/after source snapshots with no changed files. It includes four distinct owner/controller roles and cancellation after choosing a target. Its per-clause mapping preserves limitations rather than marking the original G2 scenario manifests complete.

All 1,097 source bindings were reauthenticated against raw Oracle records and catalog payloads, along with the retained 48 rulings and all 12 source archives. Independent admission checks rejected 28 rehashed source mutations through both factories and four rehashed capability omissions. The source and constructor checks establish what is admitted; execution and assertion evidence are recorded separately.

## Independent complete games

The three resolver modes each execute and replay their own native SQLite history, comparing acting observations, chosen responses and semantic state boundaries.

| Mode | Game seed | Driver seed | Commands | Compared boundaries |
| --- | ---: | ---: | ---: | ---: |
| Two seats | 10401 | 10418 | 924 | 925 |
| Four seats | 10601 | 10618 | 1,642 | 1,643 |

These runs use frozen CLI build `66a5ad3c3c8231a4f8281c9c7afee89b691e7e1a3787c711dfb8dd83fa9ed7c7`. Their actual reports are retained under `.commander/prototypes/engine-0.10/.draft-runs/resolver-comparisons`. Replays and resolver siblings do not become additional unique assignments.

The browser proof requires an actual targeted counterspell waiting on the stack and at least one actual counter event. Its evidence checks the target's stack-to-owner-graveyard movement, new incarnation, absence of target resolution, and subsequent resolution of the countering source in the same command record. Imports use the final required paused checkpoint; imported last-command and starting-player receipts are retried exactly, with the full snapshot unchanged. Earlier target/payment checkpoints are reopened and retried but are not separately imported by this proof. The two-seat seed 10301 completed 405 commands (406 equal boundaries), importing revision 365 with Cancel pending. The four-seat seed 10501 completed 1,613 commands (1,614 equal boundaries), importing revision 1,330 with Preemptive Strike pending; Negate later counters that spell. All three successful counter events in this browser proof came from Cancel or Negate. The machine-readable checkpoint records the exact pins.

Across those two assignments and the two resolver-comparison assignments, 4,584 accepted commands include 83 distinct cast definitions and 76 distinct resolved definitions. Six counterspell definitions were cast; five successfully countered another spell. Essence Scatter was not cast in these natural games, while Preemptive Strike was cast and countered. Their constructed source tests remain distinct evidence.

## Reproduction and remaining work

`bun run commander compile --all-reviewed` reproduces release `58b8f2dd09d699ef232ba49257e0287eb8ca204902a9addddb499f73e3084739` and all 33 deck revisions against the pinned catalog. The historical 0.9 headers are reconstructed solely to derive frozen fixture IDs and must match their known hashes; they are never executed under the 0.10 ABI.

The integrated `bun run check` passed 515 unit tests (71,511 assertions), 12 production browser tests, the XR emulator smoke check and the newly generated workspace/application gate. The subsequent [0.10 fixed regression](fixed-regression-0.10-evidence.json) completed and replayed all 64 assignments (16 two-seat, 48 four-seat; 89,784 accepted commands). It uses the historical fixed card compositions, so it validates regression behavior without adding counterspell execution coverage. The [development checkpoint](development-0.10-evidence.json) links actual repository checks, source assertions, full games and persistence evidence. A subsequent [shared-fixture comparison](common-fixture-comparison-0.10.json) passed four executions each in TypeScript, Phase and XMage, with all 11 declared checkpoints matching. The original difficult-scenario G2 suite, full-snapshot card/rule implementation and complete consumer qualification remain outstanding. The existing shared card design and WebXR starter continue to be separate application fixtures; they do not establish unimplemented Commander semantics.
