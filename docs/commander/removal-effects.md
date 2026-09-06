# Creature removal in engine 0.4

`commander-engine/0.4.0` adds two typed spell instructions: `{ kind: "destroy" }` and `{ kind: "exile" }`. Both require the program's single target domain to be `"creature"`. The rules engine executes these instructions; the separate content compiler binds reviewed complete Oracle text to them. There is no runtime parsing of card text.

The rules basis is the [pinned official Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt), effective August 7, 2026, SHA-256 `4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f`. Rule numbers below refer to those bytes.

| Operation or boundary | Implemented behavior | Rule basis |
| --- | --- | --- |
| Destroy | Move the targeted battlefield creature to its owner's graveyard without dealing damage. An indestructible creature remains on the battlefield; the spell still resolves. | 701.8a, 702.12b |
| Exile | Move the targeted battlefield creature to exile. Indestructible does not stop this move. | 701.13a, 702.12b |
| Target legality | Use the existing complete supported creature domain, including shroud and opposing hexproof restrictions. Revalidate the chosen object at resolution; if it is illegal, the single-target spell does not resolve. | 601.2c, 608.2b, 702.11b, 702.18a |
| Zone identity | Create a fresh object generation, clear battlefield state, retain ownership and commander designation, and record the departed object's last-known state in the move event. A graveyard move from the battlefield counts as dying; exile does not. | 400.7, 700.4, 903.3 |
| Commander choice | A removed commander first enters its owner's graveyard or exile. Its owner receives the existing optional command-zone choice at the following state-based-action checkpoint, after the removal spell has finished resolving. | 608.2n, 704.4, 903.9a |

The instruction schema rejects removal programs with a player or absent target. It also rejects any instruction that references that target after a destroy/exile instruction. Following the new object through a public zone under rule 400.7j needs a richer reference model; this version does not approximate that behavior. Controller-only draw or life-gain instructions may follow removal in the typed program, and the existing uninterrupted instruction executor finishes the spell before a checkpoint.

Regeneration, replacement effects, ward, protection, conditional destruction, restricted creature subdomains, multiple targets, sacrifice, and general last-known-information expressions are outside these two primitives. Recording last-known state in an event does not establish support for every ability that consumes it. Admission must continue rejecting card text, costs, or mechanics that require an unsupported processor. The release assurance remains `development-subset`.

## Executed tests

`packages/engine/src/effects.test.ts` uses the pinned Oracle identities, whole text and source-version hashes for **Murder** (`938b4e2c-88d9-4637-bc00-e228920c9a78`) and **Final Reward** (`e654242f-c7c5-4713-bbd0-26d41de8e2e7`). Their exact costs are paid through ordinary casting commands. The tests construct small battlefield and floating-mana preconditions explicitly; they are rule-unit scenarios, not source-backed full games or a coverage claim for every removal spell.

The removal scenarios verify fresh zone identity and last-known state; destruction without damage; indestructible against both operations; both owner choices for graveyard and exile in four-seat games; completion of the spell before the Commander choice; and a response that exiles the sole target before an earlier Murder can resolve. Schema tests reject unsupported target/reference combinations.

The combined spell suite passed **22 tests with 172 assertions** after this increment. Type checking and Biome/ESLint checks passed for the changed contracts and engine files. Existing 0.3 browser/native proofs and their archived sources remain historical 0.3 evidence; these unit results do not make those runs evidence for 0.4 removal semantics. The engine version pin deliberately distinguishes the new semantic build.
