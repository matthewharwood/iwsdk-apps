# Local XR application starter

This workspace is a Bun/Turborepo starter derived from a read-only audit of Snapmatch, commit `ea33cd75c83a94e6bf2888b7ac5f9b9405fc6f9a`. The original token example remains an infrastructure fixture. The current user mandate additionally implements the Commander engine specified in `docs/_temp/COMPLETE_SPEC.md`, `IMPLEMENTATION_PROMPT.md`, and `DESIGN_AND_ARCHITECTURE.md`.

## Commander implementation mandate

Work on `codex/commander-engine`. Produce a pinned full-source catalog, executable definitions, pure portable rules engine, headless two/four-seat games, native/browser persistence and reproducible replay. Full-snapshot card/rule support remains the final target; early development games never certify the entire corpus. Track source presence, implementation, executed assertions, and independent review separately. Unsupported semantics and operational limits remain explicit incomplete results, never invented draws.

Use `packages/contracts`, `catalog`, `card-programs`, `compiler`, `engine`, `storage`, and `simulation` as needed; `apps/engine-cli` hosts commands. The Commander core must not import SQL, filesystem, network, wall clocks, UI, or ML. Native SQLite belongs behind the host adapter; browser parity must execute the same core. Use `.commander/` for local archives/databases/evidence, isolated from token saves. Retain exact sources and failed attempts. The supplied companion acceptance/source text is embedded in COMPLETE_SPEC; missing companion files are not passing evidence.

The user's explicit presentation extension requires extracting the studio's design, typography and card information architecture into `packages/card-design`, consumed by `apps/web/app`. `apps/printable-card-studio` is an unchanged design reference, excluded from workspace tools; do not import its CLI or infer Magic semantics from its text heuristics. The shared package and consuming app remain subject to all quality gates.

## Architecture

- `apps/web` is both the running example and canonical app template. Generators copy it; do not maintain a second handwritten template.
- TanStack Start prerenders a static SPA. Only `dist/client` is served in production. Browser-only systems initialize after client mount and clean up on unmount/remount.
- `packages/game-core` owns pure deterministic game rules. It has no DOM, renderer, worker globals, persistence, React, or Jotai dependencies. Inject nondeterministic metadata.
- The game worker owns the local coordinator and one SQLite OPFS connection. Commands are serialized, validated and committed atomically before acknowledgement or publication. Receipts deduplicate by command ID; revisions and decision IDs reject stale input. A rejected save must leave the previous committed state intact.
- `@sqlite.org/sqlite-wasm` uses `opfs-sahpool`. Web Locks prevent a second owner of the same application database. Missing storage or failed writes are visible errors; no silent memory fallback. Device storage is not a backup or synchronization service.
- Jotai stores session projections and UI state. IWSDK/Three.js owns meshes, transforms, pointer state and XR lifecycle. Both desktop and immersive input call the same session methods. Frame updates never change game rules.
- The AI worker receives an observation and generated legal choices. The heuristic works without a model. LiteRT.js is optional, lazy and local; no trained model is included or claimed.
- Service workers cache assets only. Generate the service worker after prerender output exists. Respect `BASE_PATH`; do not force an update into an active client.
- This starter requires no Firebase credentials, services, emulator, auth, IndexedDB replica, Pixi renderer, or app server. Do not restore obsolete provider policies from the source repository.

## Workflow

Use `bun install --frozen-lockfile`, `bun run dev`, and `bun run check:fast`. Full validation is `bun run check`, including production browser tests and real generated-workspace verification. `bun run gen:app <name>` adds an app; `bun run gen:workspace <destination> --name <name>` creates an independent reusable workspace. Do not copy secrets, caches, local saves, dependencies or the source repository's Git history into generated projects.

Keep workspace dependencies `workspace:*`, dependency versions pinned, one Three.js version, and compatible matching IWSDK package versions. Foundational changes to the canonical app automatically flow to generated apps; update the owning skill/docs and run the generator gate.

Schemas live in `packages/schemas`. Parse external input, persisted records and worker messages with Zod; infer types rather than re-declaring shapes. Keep React render pure. React Compiler handles routine memoization. For reusable UI, maintain sibling Storybook stories and behavioral play functions. Route/composition code is verified through browser workflows. Use Bun tests for rules, coordinator, migrations and generator behavior; use real Chromium for OPFS/WASM, workers, routes and offline loading. Tests do not require a separate approval step within authorized implementation work.

Biome owns formatting/main lint; Stylelint owns CSS; focused SonarJS rules catch complementary defects. Do not skip failed checks, remove meaningful assertions or add blanket ignores to obtain a green gate. Scope exceptions to an explained integration constraint. Add tests where they validate consequential behavior, not for every cosmetic edit.

Read relevant skills in `.agents/skills`. They are the only canonical project skill collection. Do not create stale `.claude/skills` duplicates. The skill inventory and decisions are in `docs/skills-audit.md`.

Physical Quest qualification is separate from browser/emulator tests. Use `docs/quest.md`; report hardware checks as unverified until performed. Do not claim measured headset performance, working learned AI, full MTG mechanics or multiplayer based on scaffold wiring.
