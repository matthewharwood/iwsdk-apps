# Commander baseline

Implementation began September 6, 2026 from `1010f15fa4bf03a62fc327f54db74566bb50dcc3` on `codex/commander-engine`. Host: macOS arm64, Bun 1.3.11, Node 24.12.0; package-manager pin remains Bun 1.3.13. GitHub's preceding complete starter check passed, but it establishes no Commander semantics.

The user added three staged specification documents, an untracked printable-card-studio reference, and IDE settings before this work. Their changes were preserved. All 1,583 lines across the three specifications were read, including the consolidated acceptance charter and source appendix. The separately referenced goal-contract.json is absent; acceptance will be reconstructed explicitly from the supplied charter and computed from evidence.

The initial `bun run check:fast` exited 1: Biome reported 38 errors and 65 warnings in the imported studio, including template interpolation and oversized generated print HTML. The studio is a design reference, not part of the application runtime or generator. Workspace/lint exclusions isolate that reference; extracted design code remains checked normally. No baseline test failures are being relabeled passing.

Source document SHA256:

- COMPLETE_SPEC.md: `3c94c727644b57d03ac74ba64868c22f7d45b7e196e66517386fdb059e16016b`
- DESIGN_AND_ARCHITECTURE.md: `29c0b8ceb0aa59f0fb383b3c4abeb5354a0c6551abbaedfbdd817fd3fb45fc21`
- IMPLEMENTATION_PROMPT.md: `e15ac4d3b886f3b365d4636a97949a38bb59f5bcdd7903791b1bc569ab397a61`

The new engine and `.commander/` storage namespace are separate from the original token game and saves. The current target includes the entire pinned eligible Commander snapshot, supporting objects, applicable rules, all release gates G1–G6, and the user's additional shared card-design integration. No gate is certified by this baseline record.
