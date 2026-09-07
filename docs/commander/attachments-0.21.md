# Attachment execution — development 0.21

The archived prototype adds 151 source-bound Aura/Equipment definitions, bringing the executable release to 1,789 primary definitions and 20 token templates in 80 legal development decks. The addition is 87 Auras and 64 Equipment. The exact qualified source has been promoted to main; its CLI bundle and browser worker match the retained prototype bytes.

The rules engine separates announcing and paying for an Aura or Equip ability, establishing an attachment, applying its live power/toughness and keyword effects, and ending the relation when an endpoint leaves. Its retained origin identifies the actual paid source, target incarnation and establishment event. Equipment remains on the battlefield after the recipient leaves; an unattached Aura goes to its owner's graveyard at the next applicable state-based check. Equipping an already equipped recipient pays and resolves without resetting the existing attachment timestamp.

| Evidence | Result | Scope |
| --- | --- | --- |
| Source/compiler | 636 tests / 126,997 assertions | Full bodies, compiler and existing source regressions |
| Core | 2,983 tests / 41,725 assertions | Includes 453 source segments across all three factories and 18 source interactions |
| CLI games | 504 and 1,764 commands | Both completed; all resolver comparisons and replays passed |
| Browser games | 499 and 2,120 commands | Both completed with equal native/OPFS boundaries and imported continuation |
| Native durability | 41 tests / 1,858 assertions | One ordinary dealt history and injected transaction failures |
| Stopped OPFS | 39 reloads, 39 imports, 78 exact retries | Same worker bytes as completed browser games |
| Fixed historical regression | 64 completed and replayed / 89,784 commands | Old decks contain no new attachment programs |

The CLI games establish attachments from 24 distinct definitions and the browser games from 26. These are observed executions; source scenario counts, resolver variants, imported continuations and repeated historical assignments are reported separately. The source segments declare their selected starting hands and lands. Independent reviews cover source meanings, compiled-program mutations, runtime origin checks and native journal artifacts.

The initial browser evidence reader rejected Equip when it parsed all activations as ordinary abilities. A tested union parser fixed that integration error. The stopped proof initially rejected its 13-stage plan because the harness allowed 12 checkpoints; the tested limit is now 16. Both failed attempts remain retained. The raw audit also retains its corrected event-name assumption and text-versus-byte hashing errors. None of these evidence-tool corrections changes an accepted game transition.

Complete semantic support for the 31,829-card snapshot remains unfinished. The archived clause joins identify interaction and rule obligations beyond this finite attachment family. Physical Quest, remaining G2/G6 and specification acceptance/handoff evidence remain incomplete.

The exact sources, failed attempts, executable builds, raw databases and file manifests are retained under `.commander/prototypes/engine-0.21`. The machine-readable evidence index is [development-0.21-evidence.json](development-0.21-evidence.json).

Main passed 4,018 unit tests with 242,598 assertions, along with boundaries, lint, types and the production build. The original full command then stopped because the sandbox denied its localhost listener. That failure is retained. The remaining browser tests (12), emulated Quest smoke and independent workspace/application generator checks subsequently passed with authorized localhost access. The generated workspace repeats the same unit corpus. Physical Quest remains unverified.
