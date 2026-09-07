# Fixed token creation, development 0.12

The release binds 27 exact token-producing card bodies and adds durable token objects to the Commander runtime. It contains 1,129 primary card definitions and 20 auxiliary token templates. Those templates are not additional Commander cards. All previous 1,102 primary definitions and 35 deck revisions are preserved exactly after canonical serialization. The full snapshot still has 30,700 unsupported paper candidates.

The source release is `fd5d52dc3d11284940cae72faace2ca0ead11deaa11508c12ea6b179967912a4`. Its definitions use `commander-engine/0.12.0`; prepared artifacts use `prepared-match/2` and plan version 8. `bun run commander compile --all-reviewed` reconstructs the source release and 40 legal development decks.

Independent authentication checked all 12 source archives, 1,129 original Oracle records and 53 retained ruling records. The finite research reviewed 31 complete whole-shape bodies; four hybrid-cost or Lesson bodies remain excluded. Broader token-producing text stays unsupported. The exact source tuples, full text and typed programs are retained in [source evidence](source-fixed-token-v0.12.json).

| Card | Mana | Timing | Created tokens |
| --- | --- | --- | --- |
| Advent of the Wurm | `{1}{G}{G}{W}` | Instant | 1 × 5/5 G Wurm; trample |
| Allied Reinforcements | `{3}{W}` | Sorcery | 2 × 2/2 W Knight Ally; no abilities |
| Call of the Conclave | `{G}{W}` | Sorcery | 1 × 3/3 G Centaur; no abilities |
| Call the Cavalry | `{3}{W}` | Sorcery | 2 × 2/2 W Knight; vigilance |
| Call to the Feast | `{2}{W}{B}` | Sorcery | 3 × 1/1 W Vampire; lifelink |
| Captain's Call | `{3}{W}` | Sorcery | 3 × 1/1 W Soldier; no abilities |
| Dragon Fodder | `{1}{R}` | Sorcery | 2 × 1/1 R Goblin; no abilities |
| Flurry of Horns | `{4}{R}` | Sorcery | 2 × 2/3 R Minotaur; haste |
| Goblin Rally | `{3}{R}{R}` | Sorcery | 4 × 1/1 R Goblin; no abilities |
| Hive Stirrings | `{2}{W}` | Sorcery | 2 × 1/1 colorless Sliver; no abilities |
| Hop to It | `{2}{W}` | Sorcery | 3 × 1/1 W Rabbit; no abilities |
| Hordeling Outburst | `{1}{R}{R}` | Sorcery | 3 × 1/1 R Goblin; no abilities |
| Icatian Town | `{5}{W}` | Sorcery | 4 × 1/1 W Citizen; no abilities |
| Join the Ranks | `{3}{W}` | Instant | 2 × 1/1 W Soldier Ally; no abilities |
| Knight Watch | `{4}{W}` | Sorcery | 2 × 2/2 W Knight; vigilance |
| Krenko's Command | `{1}{R}` | Sorcery | 2 × 1/1 R Goblin; no abilities |
| Midnight Haunting | `{2}{W}` | Instant | 2 × 1/1 W Spirit; flying |
| Queen's Commission | `{2}{W}` | Sorcery | 2 × 1/1 W Vampire; lifelink |
| Raise the Alarm | `{1}{W}` | Instant | 2 × 1/1 W Soldier; no abilities |
| Ral's Reinforcements | `{1}{R}` | Sorcery | 2 × 1/1 U R Elemental; no abilities |
| Release the Dogs | `{3}{W}` | Sorcery | 4 × 1/1 W Dog; no abilities |
| Revel of the Fallen God | `{3}{R}{R}{G}{G}` | Sorcery | 4 × 2/2 R G Satyr; haste |
| Spore Swarm | `{3}{G}` | Instant | 3 × 1/1 G Saproling; no abilities |
| Sprout | `{G}` | Instant | 1 × 1/1 G Saproling; no abilities |
| Sworn Companions | `{2}{W}` | Sorcery | 2 × 1/1 W Soldier; lifelink |
| Take Up Arms | `{4}{W}` | Instant | 3 × 1/1 W Warrior; no abilities |
| Talrand's Invocation | `{2}{U}{U}` | Sorcery | 2 × 2/2 U Drake; flying |

Each producer executes one nontargeted, fixed-count instruction with its complete printed cost and timing. The creating instruction supplies every token trait. For example, Flurry of Horns creates Minotaurs with haste even though its linked printed token omits that ability. The default token name includes its subtype names and “Token.” Ral's Reinforcements remains a red deck card although it creates blue-red tokens.

The runtime keeps token templates separate from Oracle card definitions. A live token records its creator, creation event, sibling ordinal, exact resolving source incarnation/version and program position. Its initial owner and controller are the creating spell's controller. All siblings enter together directly onto the battlefield; there is no token card in a library, no token spell cast, and no extra payment. Physical-card invariants preserve the original 100 card lineages per player.

A departing token first makes its actual zone change and receives a new incarnation. CR111.8 prevents any later zone change before cessation. State-based actions then cease an off-battlefield token; cessation is neither another zone change nor another death. Repulse therefore returns the token, draws for the spell controller, finishes, and only then ceases the token. A lethal-damage token dies in one state-based-action pass and ceases in the next. Tokens owned by a departing player leave with that player under the existing multiplayer departure rules.

Prepared admission follows exact producer-to-template dependencies. Full execution retains every authenticated primary definition and auxiliary template; prepared execution retains only reachable entries in separate dictionaries. Both factories reject changed source programs, remapped or missing templates, altered traits/counts, missing capabilities, token templates used as deck cards, and incompatible engine versions even after public hashes are recomputed. Source authenticity inspection remains available for historical fixture records without authorizing their execution under a different ABI.

The new authenticated source suite executes 26 legal producers and all 20 template shapes through ordinary casting, payment and resolution on explicitly constructed legal 100-card boards. It also tests paid countered spells, timing, token combat and removal. Call to the Feast is the one source-bound producer not yet executed: none of the 37 implemented eligible commanders has both white and black color identity. Tests explicitly reject that card under every available commander. Shared template/operator coverage is not reported as execution of that card.

Five additional deck profiles use Jasmine Boreal, The Lady of the Mountain, Lady Orca, Tobias Andrion and Sivitri Scarzam. They retain 39 basic lands each, respect singleton limits and card color identity, and cover 26 of the 27 producers. Every earlier deck revision is unchanged. All 40 compositions are legal and distinct.

Two complete CLI assignments passed full-scan, prepared-scan and prepared-indexed execution, including every command boundary, entitled acting-player observation and independent replay. Seeds 12001 and 12201 completed 381 and 1,609 commands. The two-player game cast Raise the Alarm and created two Soldiers. The four-player game cast Sprout and Flurry of Horns and created three tokens. These games do not imply that every source-bound producer was naturally drawn, cast or resolved.

The native durability fixture reaches Raise the Alarm and Repulse using only ordinary commands from legal game setup. Across all three resolver modes, it saves before creation at revision 45, after creation at 46, before departure at 104, and after return/draw/cessation at 105. Each checkpoint supports reopening, logical import, deterministic replay and exact retries. Twelve tests with 259 assertions also exercise rollback and rehashed origin/template tampering. These are stopped histories, not completed games. Their refreshed source capture includes the final admission checks.

The browser proof completed 429 commands/430 boundaries for two seats and 1,411 commands/1,412 boundaries for four. It reloaded and separately imported a pending token spell, live tokens and a completed token-departure boundary, preserving exact retries. Token stages were revisions 121/123/166 and 937/940/1052. The final imported departure checkpoint continued to the same complete history and replay hash. Browser and CLI runs share two initial deck/game-seed families but use different driver seeds and seat labels; four full execution assignments do not imply four distinct initial game families. Their observed histories created 16 tokens from five distinct producer identities.

Independent review verified every native/imported record and browser boundary, all 75 captured source files, worker/release/WASM/lock hashes, each saved token stage and the final continuation. It separately identified tokens that left with a losing owner under CR800.4a; those departures were not falsely reported as token cessation. Named Dragon Fodder/Midnight Haunting all-resolver gameplay and browser conflicting/stale-command negative cases remain outside this proof's qualification.

The complete repository gate passed 737 unit tests with 78,556 assertions, 12 application browser tests, emulated Quest checks and fresh standalone/generated applications. The main compiler reproduces the exact retained release. Formatting its binding table preserves all exported values and emits byte-identical CLI and browser worker bundles. An earlier proof attempt failed its final source-stability check when the ABI guard changed; it remains archived and unqualified. Exact files and hashes are retained in [development evidence](development-0.12-evidence.json). The fixed 64-game historical-input regression completed and replayed all 64 assignments under the new captured executable (89,784 accepted commands); its older deck compositions do not exercise token producers. Full Commander coverage, arbitrary token text/copies/replacements, original difficult-scenario qualification and physical headset validation remain outstanding.
