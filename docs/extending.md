# Extend the starter

1. Define your versioned Zod state, command envelope, player observation and decisions in schemas. Preserve command IDs, expected revisions and decision IDs. Separate public observations from authoritative secrets if the new game has hidden information; the sample has only public information.
2. Replace the take-away rules in game-core. Keep inputs explicit and transitions deterministic. Introduce injected PRNG state only when the game actually needs randomness. Generate legal choices rather than trusting UI/AI to invent moves. Pin game/card semantics in persisted records.
3. Extend SQL migrations and typed repositories. Keep candidate transitions uncommitted until one transaction writes the state, history and receipt. The UI must not acknowledge a save before commit. Use new tables for catalog metadata without overwriting user saves.
4. Project accepted worker snapshots through the session adapter to Jotai. Have DOM buttons, spatial controls and AI use the coordinator. Treat per-frame transforms as presentation only. A future remote session can replace this port; do not add a second local authority.
5. Replace the table meshes and React controls. Keep a stable container and handle mount cancellation, failed initialization and disposal. Build reusable controls in Storybook. Add all actions necessary for immersive play to the spatial surface; HTML dialogs are only for desktop file import/export.
6. Run the pure rules and browser tests, then `check:template`. Generated apps use the current canonical web app. Keep custom product content out of your shared template by maintaining a separate generated workspace.

The starter's full-state session projection is appropriate only because its fixture has no hidden information. A private-information game must introduce a bound player-view schema and project/redact in the authority worker; don't forward its authoritative state through `getSnapshot`.

Portable saves are logical JSON exports with integrity and replay checks. If you add raw SQLite import/export, use the selected VFS public API; do not copy SAH pool private backing files. A checksum detects corruption, not malicious authenticity.

A second tab is rejected rather than synchronized. Offline app loading and database persistence are independent: verify both against a production build at the intended base path. Keep model bytes outside SQL and download optional assets explicitly.
