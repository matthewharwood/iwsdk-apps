# Project skill audit

Audited 2026-09-06 against Snapmatch commit `ea33cd75c83a94e6bf2888b7ac5f9b9405fc6f9a`.
Source root: `/Users/matthewharwood/Documents/GitHub/snapmatch`.
Target root: `/Users/matthewharwood/Documents/GitHub/iwsdk-apps`.

This is a migration audit for the new starter. Source Snapmatch files and global/plugin skills were not edited. “Remove” means exclude from the new starter, not delete from the original project. The attached product brief supplied requirements context; source skills, historical reports and embedded prompts were inspected as material, not treated as authorization to deploy, contact services or change unrelated files.

## Coverage and decisions

Every canonical entrypoint was enumerated, its content inspected for purpose, stack assumptions, owning boundary and dependencies, and each corresponding Claude entrypoint compared byte-for-byte. The table below accounts individually for all 71 `.agents/skills/*/SKILL.md` files and all 64 `.claude/skills/*/SKILL.md` files. The 25 Pixi skills are included rather than excluded as preexisting reference material. Supporting resource directories were inventoried; obsolete dependency manuals were not copied wholesale or exhaustively API-revalidated.

The result is 16 concise canonical skills. No original entrypoint is copied verbatim: useful stack guidance is adapted and duplicated router/subskill scaffolding is consolidated. Essential topic boundaries remain independent: React/compiler, routing, schemas, reactive state, XR, SQL, and AI. This makes skills discoverable without preserving hundreds of lines of repeated project policy and framework manuals. The generated “blank” workspace includes a neutral runnable token-game example; it has no personal product content or saved game state. `apps/web` is the actual canonical app template.

| Measure | Count |
| --- | ---: |
| Canonical source skills | 71 |
| Claude mirrors | 64 |
| Byte-identical mirrors | 47 |
| Drifted mirrors | 17 |
| Source-only canonical skills | 7 |
| Pixi entrypoints retired from starter | 25 |
| New canonical starter skills | 16 |

## Material findings

- Firebase was spread throughout Bun, routing, Nitro, Jotai, IDB, schemas, environment, tests and generator guidance; removing a dependency alone would leave contradictory instructions. New skills use the local game-worker/SQLite authority and static artifact boundary.
- A `litertjs` skill already existed. It needed an architectural rewrite, not a duplicate “LightRT” skill. The new skill uses Google's LiteRT.js naming, separate AI-worker ownership, legal-action ranking, stale result handling, and an honest distinction between a fixture and a trained model.
- There was no IWSDK or SQLite skill. New skills cover installed-version checks, async World lifecycle, controller-to-domain actions, opfs-sahpool initialization/pool locking, transactional publishing, migrations, and browser/device verification.
- The old `tanstack-start-spa-prerender` both allows prerender-generated `dist/server` artifacts and later says their existence is erroneous. New guidance distinguishes build intermediates from the deployed static artifact.
- Storybook play-function examples used `@storybook/test`; the selected Storybook 10 surface is `storybook/test`.
- The two kill-server skills contain overlapping global process patterns and forced port kills while claiming broad safety. They are excluded; owned-process lifecycle guidance remains.
- Several Playwright skills mandate an extra approval for every test change. That source-project ritual is not carried into this authorized starter implementation. Tests remain scoped to meaningful behavior and actual task permissions.
- `sfx` depends on a missing `sound-design` skill and external ElevenLabs tooling. Prompt execution, provider publication and cloud monitor catalogs are unrelated to a blank local XR application and are excluded.
- Generic sources also overprescribe schemas for internal/UI types and ban all manual memoization. New guidance requires production parsing at real boundaries while permitting appropriate platform types and justified identity/performance work.

## New canonical collection

- [bun](../.agents/skills/bun/SKILL.md): Manage Bun workspace dependencies and lockfiles, write repository tooling, and run pure unit tests. Use for Bun installation/runtime/test problems; browser SQLite and XR behavior require browser verification.
- [iwsdk](../.agents/skills/iwsdk/SKILL.md): Build and debug Immersive Web SDK scenes, controller interactions, Three.js resources, and WebXR session lifecycle in this starter. Use for XR or desktop 3D presentation; domain rules and durable state belong to the game worker.
- [jotai](../.agents/skills/jotai/SKILL.md): Maintain Jotai snapshots and derived UI state over the local game worker. Use for hydration, command actions, revision ordering and React/XR state subscriptions; SQLite remains durable authority.
- [litertjs](../.agents/skills/litertjs/SKILL.md): Add and operate browser-local LiteRT.js inference, including self-hosted WASM and tflite models, accelerator fallback, model I/O contracts, tensor cleanup, and legal-action ranking. LightRT in this project's brief refers to Google's LiteRT.js.
- [local-first](../.agents/skills/local-first/SKILL.md): Design or review the local WebXR application's domain-worker boundary, deterministic commands/replays, presentation projections, and optional AI worker. Use for cross-layer architecture changes and new game adapters.
- [playwright](../.agents/skills/playwright/SKILL.md): Verify browser routes, worker messaging, real SQLite OPFS persistence, WASM loading and desktop/XR fallbacks with Playwright. Use for browser integration tests and production-artifact smoke checks.
- [quality](../.agents/skills/quality/SKILL.md): Run and maintain the starter's Biome, Stylelint, SonarJS, type, unit, build and browser quality gates. Use for gate failures or tooling configuration, with checks appropriate to the actual change.
- [react](../.agents/skills/react/SKILL.md): Build React 19 UI with the React Compiler, safe worker and IWSDK lifecycles, accessible desktop controls, and component states. Use for React implementation and lifecycle defects.
- [sqlite](../.agents/skills/sqlite/SKILL.md): Implement and debug browser-local SQLite WASM persistence using the opfs-sahpool VFS in the game worker. Use for SQL schemas, migrations, transactions, save/import/export, pool locking, and persistence failures; not server databases or IndexedDB wrappers.
- [storybook](../.agents/skills/storybook/SKILL.md): Build and verify reusable React components in Storybook with shared Vite/Tailwind settings, deterministic Jotai fixtures, and interaction stories. Use for component states and Storybook configuration.
- [tailwind](../.agents/skills/tailwind/SKILL.md): Maintain Tailwind CSS v4, shared design tokens and accessible responsive styles for the desktop UI and Storybook. Use for CSS/UI styling, not spatial Three.js materials.
- [tanstack-start](../.agents/skills/tanstack-start/SKILL.md): Maintain TanStack Start SPA mode, file-based routes, static prerendering, browser-only initialization, error boundaries and deep-link hosting in this starter.
- [turborepo](../.agents/skills/turborepo/SKILL.md): Maintain the Turborepo task graph, app generator, and blank workspace generator, including reproducible dependencies, safe destination handling, and generated-app verification.
- [typescript](../.agents/skills/typescript/SKILL.md): Maintain strict TypeScript and tsgo configuration across app, worker and tooling packages. Use for type-checking failures, shared configuration, package exports, and browser/worker environment types.
- [writing](../.agents/skills/writing/SKILL.md): Write or revise this starter's README, setup instructions, architecture notes, UI errors and release evidence with precise scope and verified commands. Use when prose is a substantive deliverable.
- [zod](../.agents/skills/zod/SKILL.md): Define and evolve runtime contracts for worker messages, actions, saved state, replays, imports, model metadata and public configuration with Zod. Use when data crosses a trust or persistence boundary.

## Individual source dispositions

Paths in this table are relative to the original source root declared above. The Claude column lists the exact corresponding entrypoint and whether its bytes differ; no second maintained copy is generated. Destination names refer to the canonical starter skills listed above. `none` means no task-relevant replacement is needed.

| Canonical source entrypoint | Claude entrypoint / comparison | Disposition | Destination | Rationale |
| --- | --- | --- | --- | --- |
| `.agents/skills/animejs/SKILL.md` | `.claude/skills/animejs/SKILL.md` — drifted | Remove | react; tailwind; iwsdk | The source mandates an anime.js hook for all motion. The blank starter needs CSS transitions and SDK-owned animation, not a second animation runtime. |
| `.agents/skills/biome/SKILL.md` | `.claude/skills/biome/SKILL.md` — drifted | Adapt / merge | quality | Keep configured formatting/lint ownership; drop Snapmatch paths, nonexistent native watch-flag implications, and obsolete copied examples. |
| `.agents/skills/bun/SKILL.md` | `.claude/skills/bun/SKILL.md` — identical | Adapt | bun | Keep one toolchain entrypoint; read the actual packageManager pin rather than freezing a version in routing prose. |
| `.agents/skills/bun-package-manager/SKILL.md` | `.claude/skills/bun-package-manager/SKILL.md` — drifted | Merge | bun | Keep workspace targeting and frozen lockfiles in the same concise Bun skill; the old dedicated router hop adds no useful separation. |
| `.agents/skills/bun-runtime/SKILL.md` | `.claude/skills/bun-runtime/SKILL.md` — identical | Merge | bun | Preserve tooling/browser API separation and safe scripts; replace Firebase-specific deployment reasoning with the static-browser contract. |
| `.agents/skills/bun-test/SKILL.md` | `.claude/skills/bun-test/SKILL.md` — identical | Merge | bun | Keep pure unit tests distinct from real browser persistence; replace IDB migration examples with engine/replay/worker-boundary coverage. |
| `.agents/skills/eslint-plugin-sonarjs/SKILL.md` | `.claude/skills/eslint-plugin-sonarjs/SKILL.md` — identical | Adapt / merge | quality | Retain the focused local ESLint plugin check and reasoned rule policy. Remove Snapmatch workflow names, domain tuning, and provider assertions. |
| `.agents/skills/fallow/SKILL.md` | `.claude/skills/fallow/SKILL.md` — identical | Remove | quality | Not required in the selected blank stack. Its long external-tool/MCP/runtime-monitoring manual would document uninstalled tooling; add only for a concrete later code-health task. |
| `.agents/skills/five-phase-pass/SKILL.md` | `.claude/skills/five-phase-pass/SKILL.md` — identical | Adapt / merge | turborepo | Preserve implementation/template/rendered-app/docs consistency. Remove remote protocol, Firebase release, exact-main and historical test-count assumptions. |
| `.agents/skills/idb/SKILL.md` | `.claude/skills/idb/SKILL.md` — drifted | Replace | sqlite; local-first | IndexedDB replica/outbox and Firestore authority are not the local architecture. SQLite in the game worker owns durable commits; no second browser persistence facade. |
| `.agents/skills/jotai/SKILL.md` | `.claude/skills/jotai/SKILL.md` — identical | Adapt | jotai | Keep reactive projections; replace atomWithIDB and remote optimistic reconciliation with revision-scoped committed worker snapshots. |
| `.agents/skills/kill-servers/SKILL.md` | Absent | Remove | bun; quality | The entrypoint runs machine-wide pkill and port-targeted SIGKILL while claiming safety. New guidance retains handles and stops identified owned processes only. |
| `.agents/skills/litertjs/SKILL.md` | Absent | Adapt | litertjs | Already exists in the source. Retain self-hosted WASM, lazy runtime and resource ownership; move inference to AI worker, remove Firebase/IDB/per-test approval assumptions, add legality and fixture-quality boundaries. |
| `.agents/skills/micro-utilities/SKILL.md` | `.claude/skills/micro-utilities/SKILL.md` — identical | Remove / absorb | typescript; bun | Native APIs remain appropriate, but a utility-package routing catalog is unnecessary in a blank starter. Runtime/browser boundaries are retained in owning skills. |
| `.agents/skills/nitro/SKILL.md` | `.claude/skills/nitro/SKILL.md` — identical | Replace | tanstack-start | The source is predominantly Firebase publication policy. Preserve only verified static-artifact/prerender behavior; do not inherit a host, credentials or old Nitro wiring claims. |
| `.agents/skills/node/SKILL.md` | `.claude/skills/node/SKILL.md` — identical | Merge | bun | Node is tooling compatibility, not a browser server runtime. Read actual engine pins instead of requiring source Node 25 everywhere. |
| `.agents/skills/pixijs/SKILL.md` | `.claude/skills/pixijs/SKILL.md` — identical | Remove / replace | iwsdk | Remove the Pixi router and mandatory first-party 2D runtime; IWSDK is the selected spatial renderer. |
| `.agents/skills/pixijs-accessibility/SKILL.md` | `.claude/skills/pixijs-accessibility/SKILL.md` — identical | Remove / replace | iwsdk | Pixi shadow-DOM accessibility APIs do not apply. React semantic controls and independently usable XR controls have their own guidance. |
| `.agents/skills/pixijs-application/SKILL.md` | `.claude/skills/pixijs-application/SKILL.md` — drifted | Remove / replace | iwsdk | Replace Application/usePixiApp setup with version-aware IWSDK World lifecycle and async unmount cleanup. |
| `.agents/skills/pixijs-assets/SKILL.md` | `.claude/skills/pixijs-assets/SKILL.md` — identical | Remove / replace | iwsdk | Assets.load/bundles/spritesheets are Pixi-specific; use the selected SDK/Three asset pipeline and explicit shared resource ownership. |
| `.agents/skills/pixijs-blend-modes/SKILL.md` | `.claude/skills/pixijs-blend-modes/SKILL.md` — identical | Remove / replace | iwsdk | Pixi advanced-blend imports and filter backbuffers do not configure Three materials. |
| `.agents/skills/pixijs-color/SKILL.md` | `.claude/skills/pixijs-color/SKILL.md` — identical | Remove / replace | iwsdk | Pixi Color/shared singleton advice does not apply to Three material colors or CSS design tokens. |
| `.agents/skills/pixijs-core-concepts/SKILL.md` | `.claude/skills/pixijs-core-concepts/SKILL.md` — identical | Remove / replace | iwsdk | Replace Pixi renderer systems/pipes and backend selection with IWSDK ECS and its renderer ownership. |
| `.agents/skills/pixijs-create/SKILL.md` | `.claude/skills/pixijs-create/SKILL.md` — identical | Remove / replace | iwsdk | create-pixi produces the wrong application stack; use the repository app/workspace generators. |
| `.agents/skills/pixijs-custom-rendering/SKILL.md` | `.claude/skills/pixijs-custom-rendering/SKILL.md` — identical | Remove / replace | iwsdk | Pixi GlProgram/GpuProgram shader resources are incompatible with the selected SDK renderer pipeline. |
| `.agents/skills/pixijs-environments/SKILL.md` | `.claude/skills/pixijs-environments/SKILL.md` — identical | Remove / replace | iwsdk | Pixi DOMAdapter/unsafe-eval setup is not needed; keep browser/worker/prerender boundaries in their actual owners. |
| `.agents/skills/pixijs-events/SKILL.md` | `.claude/skills/pixijs-events/SKILL.md` — identical | Remove / replace | iwsdk | Pixi federated eventMode and globalpointermove do not provide WebXR controller input; route SDK selection into domain commands. |
| `.agents/skills/pixijs-filters/SKILL.md` | `.claude/skills/pixijs-filters/SKILL.md` — identical | Remove / replace | iwsdk | Pixi filter construction and backbuffer settings would add an unused rendering subsystem. |
| `.agents/skills/pixijs-math/SKILL.md` | `.claude/skills/pixijs-math/SKILL.md` — identical | Remove / replace | iwsdk | Pixi ObservablePoint/Matrix conventions differ from Three spatial math; do not retain a mismatched geometry manual. |
| `.agents/skills/pixijs-migration-v8/SKILL.md` | `.claude/skills/pixijs-migration-v8/SKILL.md` — identical | Remove / replace | iwsdk | This starter is not a Pixi v7-to-v8 migration target; a migration checklist would encourage a removed dependency. |
| `.agents/skills/pixijs-performance/SKILL.md` | `.claude/skills/pixijs-performance/SKILL.md` — identical | Remove / replace | iwsdk | Retain the general intent of resource reuse/frame-budget measurement in IWSDK; retire Pixi caching/culling/ticker recipes. |
| `.agents/skills/pixijs-scene-container/SKILL.md` | `.claude/skills/pixijs-scene-container/SKILL.md` — identical | Remove / replace | iwsdk | Pixi Container/RenderLayer/sortableChildren are replaced by Three Object3D and IWSDK entities. |
| `.agents/skills/pixijs-scene-core-concepts/SKILL.md` | `.claude/skills/pixijs-scene-core-concepts/SKILL.md` — identical | Remove / replace | iwsdk | Pixi leaves, masks, render groups and ordering do not model the selected 3D scene graph. |
| `.agents/skills/pixijs-scene-dom-container/SKILL.md` | `.claude/skills/pixijs-scene-dom-container/SKILL.md` — identical | Remove / replace | iwsdk | Pixi DOMContainer transforms do not make HTML visible/selectable inside an immersive XR session. |
| `.agents/skills/pixijs-scene-gif/SKILL.md` | `.claude/skills/pixijs-scene-gif/SKILL.md` — identical | Remove / replace | iwsdk | No GIF scene feature is required; a specialized GifSprite/GifSource loader would add unused surface. |
| `.agents/skills/pixijs-scene-graphics/SKILL.md` | `.claude/skills/pixijs-scene-graphics/SKILL.md` — identical | Remove / replace | iwsdk | Pixi vector path/fill APIs are not the tabletop geometry pipeline; use normal React/CSS and Three geometry as appropriate. |
| `.agents/skills/pixijs-scene-mesh/SKILL.md` | `.claude/skills/pixijs-scene-mesh/SKILL.md` — identical | Remove / replace | iwsdk | Pixi 2D mesh/rope/perspective classes are not Three geometry; retaining this would misroute spatial mesh work. |
| `.agents/skills/pixijs-scene-particle-container/SKILL.md` | `.claude/skills/pixijs-scene-particle-container/SKILL.md` — identical | Remove / replace | iwsdk | No particle feature is required. Pixi ParticleContainer instancing cannot serve as the SDK spatial particle API. |
| `.agents/skills/pixijs-scene-sprite/SKILL.md` | `.claude/skills/pixijs-scene-sprite/SKILL.md` — identical | Remove / replace | iwsdk | Pixi Sprite/NineSlice/TilingSprite types are unused; avoid installing a second renderer for images. |
| `.agents/skills/pixijs-scene-text/SKILL.md` | `.claude/skills/pixijs-scene-text/SKILL.md` — identical | Remove / replace | iwsdk | Pixi Text/BitmapText/HTMLText APIs do not configure spatial labels. Keep label updates/readability guidance in IWSDK. |
| `.agents/skills/pixijs-ticker/SKILL.md` | `.claude/skills/pixijs-ticker/SKILL.md` — identical | Remove / replace | iwsdk | IWSDK owns its frame loop; a Pixi ticker would create a competing clock and lifecycle. |
| `.agents/skills/playwright/SKILL.md` | `.claude/skills/playwright/SKILL.md` — drifted | Adapt | playwright | Replace router/ASK-FIRST ritual with a focused integration workflow and explicit evidence boundaries appropriate to authorized work. |
| `.agents/skills/playwright-app-tests/SKILL.md` | `.claude/skills/playwright-app-tests/SKILL.md` — identical | Merge | playwright | Retain route/user-flow verification; replace seeded IDB/Firestore convergence assumptions with real SQLite worker persistence and failure paths. |
| `.agents/skills/playwright-conventions/SKILL.md` | `.claude/skills/playwright-conventions/SKILL.md` — drifted | Merge | playwright | Retain web-first assertions, roles and isolated contexts. Remove per-test approval ritual, IDB-only fixtures and fixed historical gate ordering. |
| `.agents/skills/playwright-pwa-offline/SKILL.md` | `.claude/skills/playwright-pwa-offline/SKILL.md` — identical | Merge / defer | playwright; tanstack-start | Retain the distinction between data persistence and offline asset availability. Do not copy a skipped future Workbox test as an implemented capability. |
| `.agents/skills/playwright-story-tests/SKILL.md` | `.claude/skills/playwright-story-tests/SKILL.md` — drifted | Merge | playwright; storybook | Keep story iframe IDs and component assertions without a second routing/approval layer or IDB fixture mandates. |
| `.agents/skills/prompt/SKILL.md` | Absent | Remove | writing | Saved prompt authoring is not part of this runtime template. Remove source-specific command emulation and mandatory confirmation before writing requested prose. |
| `.agents/skills/react/SKILL.md` | `.claude/skills/react/SKILL.md` — identical | Adapt | react | Replace overview/router prose with direct React worker/World lifecycle and presentation guidance. |
| `.agents/skills/react-19-primitives/SKILL.md` | `.claude/skills/react-19-primitives/SKILL.md` — identical | Merge | react; jotai | Keep purposeful loading/async boundaries without a general hook catalog or source-specific IDB Suspense contract. |
| `.agents/skills/react-compiler-rules/SKILL.md` | `.claude/skills/react-compiler-rules/SKILL.md` — drifted | Merge | react | Preserve render purity and automatic memoization; replace Pixi/anime side channels with worker/IWSDK lifecycle, and allow justified memoization rather than an absolute ban. |
| `.agents/skills/react-doctor/SKILL.md` | `.claude/skills/react-doctor/SKILL.md` — drifted | Remove / absorb | react; quality | The selected stack does not include a separate score-based scanner. Preserve semantic controls, lifecycle and measured performance guidance without an uninstalled gate. |
| `.agents/skills/run-prompt/SKILL.md` | Absent | Remove | none | Saved prompt execution, model effort routing and context-handoff commands are agent tooling, not application scaffolding requirements. |
| `.agents/skills/sfx/SKILL.md` | Absent | Remove | none | Depends on ElevenLabs MCP and a sound-design skill/resource absent from this collection. A blank XR app does not need an external sound-generation service. |
| `.agents/skills/source-command-kill-servers/SKILL.md` | Absent | Remove | bun; quality | Duplicates the unsafe broad process-kill command with another entrypoint. Do not carry either command forward. |
| `.agents/skills/storybook/SKILL.md` | `.claude/skills/storybook/SKILL.md` — drifted | Adapt | storybook | Keep Storybook as a component design/verification surface; remove the router-only layer and meaningless story requirements for nonvisual modules. |
| `.agents/skills/storybook-config/SKILL.md` | `.claude/skills/storybook-config/SKILL.md` — drifted | Merge | storybook | Retain shared Vite/Tailwind/alias configuration and fresh stores. Avoid importing application prerender behavior into Storybook. |
| `.agents/skills/storybook-play-functions/SKILL.md` | `.claude/skills/storybook-play-functions/SKILL.md` — drifted | Merge | storybook | Retain in-story interactions; update Storybook 10 helpers to storybook/test instead of the older @storybook/test examples. |
| `.agents/skills/storybook-stories/SKILL.md` | `.claude/skills/storybook-stories/SKILL.md` — drifted | Merge | storybook | Keep typed CSF, sibling stories and stable IDs, with deterministic worker-free fixtures and useful component states. |
| `.agents/skills/stylelint/SKILL.md` | `.claude/skills/stylelint/SKILL.md` — drifted | Adapt / merge | quality; tailwind | Retain CSS/Tailwind validation; remove source-specific watcher/task wiring and redundant tool-routing paragraphs. |
| `.agents/skills/t3-env/SKILL.md` | `.claude/skills/t3-env/SKILL.md` — identical | Remove / absorb | zod; tanstack-start | The Firebase-enabled discriminant and cloud environment layer are unnecessary. Public configuration validation and browser-visible secret boundaries remain. |
| `.agents/skills/tailwind/SKILL.md` | `.claude/skills/tailwind/SKILL.md` — drifted | Adapt | tailwind | Retain CSS-first v4 and shared tokens; remove source-specific files, wave references, and unnecessarily rigid styling claims. |
| `.agents/skills/tanstack/SKILL.md` | `.claude/skills/tanstack/SKILL.md` — identical | Adapt / merge | tanstack-start | Use one cohesive Start/routing/static-artifact skill instead of a router plus five narrowly repeated subskills. |
| `.agents/skills/tanstack-devtools/SKILL.md` | `.claude/skills/tanstack-devtools/SKILL.md` — identical | Remove | none | The blank stack does not require the extra opt-in TanStack panels/editor integration. IWSDK development tooling is documented separately where used. |
| `.agents/skills/tanstack-router-preload/SKILL.md` | `.claude/skills/tanstack-router-preload/SKILL.md` — identical | Merge | tanstack-start | Preserve intent preloading without mutation/worker initialization; one paragraph replaces a duplicated route-loading manual. |
| `.agents/skills/tanstack-router-pwa-deep-links/SKILL.md` | `.claude/skills/tanstack-router-pwa-deep-links/SKILL.md` — identical | Merge / defer | tanstack-start; playwright | Retain online shell rewrite and evidence boundaries. Workbox/PWA status follows actual implementation instead of historical skipped-test prose. |
| `.agents/skills/tanstack-router-routing/SKILL.md` | `.claude/skills/tanstack-router-routing/SKILL.md` — identical | Merge | tanstack-start | Preserve generated routes, typed navigation, boundary validation and error handling. Replace source Firestore/IDB bootstrap paths. |
| `.agents/skills/tanstack-start-spa-prerender/SKILL.md` | `.claude/skills/tanstack-start-spa-prerender/SKILL.md` — identical | Merge | tanstack-start | Retain SPA/prerender. Correct the source contradiction that first permits dist/server intermediates then calls their existence a build failure; remove Firebase defaults. |
| `.agents/skills/ts/SKILL.md` | `.claude/skills/ts/SKILL.md` — drifted | Adapt / rename | typescript | Keep strict tsgo and schema-derived boundary types; remove universal schema mandates for internal types and read actual native-preview versions. |
| `.agents/skills/turborepo/SKILL.md` | `.claude/skills/turborepo/SKILL.md` — identical | Adapt | turborepo | Keep task graph and generator parity; add independent blank-workspace generation, safe destination handling, and pool-level app namespacing. |
| `.agents/skills/writing/SKILL.md` | Absent | Adapt | writing | Condense the generic style manual into setup/architecture/UI-error/evidence guidance specific to a reusable local XR starter. |
| `.agents/skills/zod/SKILL.md` | `.claude/skills/zod/SKILL.md` — identical | Adapt | zod | Keep inferred boundary contracts and production parsing. Remove Firebase shapes and the overbroad requirement to schema-wrap every internal/UI type. |

## Claude drift evidence

The following 17 mirrored entrypoints differ. Hashes are SHA-256 prefixes of the original files and byte lengths are included to make the comparison reviewable. Most changes repair frontmatter quoting or links; some alter actual guidance. The generator carries only `.agents/skills`, preventing another independently edited mirror.

| Skill | Canonical bytes / SHA-256 prefix | Claude bytes / SHA-256 prefix | Difference observed |
| --- | --- | --- | --- |
| `animejs` | 10047 / `c116c744ad965e92` | 10045 / `af78302145f6e4f1` | Frontmatter quoting and AGENTS/CLAUDE reference change. |
| `biome` | 6590 / `cf9ce94d1e937a0d` | 6086 / `259a8b5f5216d27a` | Frontmatter quoting plus canonical no-empty-block/top-level-regex guidance. |
| `bun-package-manager` | 3706 / `1350d2d4117cfcd0` | 3704 / `e2f022577052ccdc` | Frontmatter quotation and/or canonical agent-file reference maintenance. |
| `idb` | 20885 / `5bb015620ab8cc43` | 20547 / `2899628726b807d8` | Canonical entry adds cross-namespace Game-establishment serialization and lobby outbox rescan. |
| `pixijs-application` | 12530 / `31d803ffb669a03b` | 12891 / `e6f52899641bc746` | Description shortened; canonical entry adds event-driven static rendering guidance. |
| `playwright` | 7952 / `8d9593243f343862` | 7950 / `85adaa24b3e88714` | Frontmatter quotation and/or canonical agent-file reference maintenance. |
| `playwright-conventions` | 16007 / `20179ac6a8665827` | 16005 / `4cda370ef2ecd9bf` | Frontmatter quotation and/or canonical agent-file reference maintenance. |
| `playwright-story-tests` | 10547 / `c4a872c39f084bbe` | 10545 / `f747fae0bf9d4137` | Frontmatter quotation and/or canonical agent-file reference maintenance. |
| `react-compiler-rules` | 14021 / `44e84a26328bd4b5` | 14019 / `a1c0ab9a986ad7f4` | Frontmatter quotation and/or canonical agent-file reference maintenance. |
| `react-doctor` | 1884 / `ab9decbdd0528d28` | 1283 / `fd7a56aa25376fe3` | Canonical entry adds JSX helper, flushSync, will-change and semantic progress guidance. |
| `storybook` | 6607 / `af02c432cf6aacd7` | 6605 / `4dd19c478781522d` | Frontmatter quotation and/or canonical agent-file reference maintenance. |
| `storybook-config` | 10536 / `ff143b33a417d8b7` | 10534 / `a0fac2d8d201829f` | Frontmatter quotation and/or canonical agent-file reference maintenance. |
| `storybook-play-functions` | 10757 / `c2eadff527812979` | 10755 / `f108cedd4d0b18e6` | Frontmatter quotation and/or canonical agent-file reference maintenance. |
| `storybook-stories` | 10937 / `028147653c97494c` | 10933 / `f98c422044d86c8c` | Frontmatter quotation and/or canonical agent-file reference maintenance. |
| `stylelint` | 4589 / `42b08c101a864121` | 4587 / `6ca21d1e665dd6e9` | Frontmatter quotation and/or canonical agent-file reference maintenance. |
| `tailwind` | 8416 / `321b76507c8a2554` | 8410 / `93e3979af54c6f62` | Frontmatter quotation and/or canonical agent-file reference maintenance. |
| `ts` | 6344 / `0195ada9f0926dac` | 6342 / `11c604fb908f20a2` | Frontmatter quoting and AGENTS/CLAUDE reference changes. |

The seven canonical-only skills are `kill-servers`, `litertjs`, `prompt`, `run-prompt`, `sfx`, `source-command-kill-servers`, and `writing`. The `extract-curriculum` directory in both trees is empty and has no `SKILL.md`; it is not counted as a skill and is not carried forward. `_AUDIT_REPORT.md` and `_OWNERSHIP_MATRIX.md` exist in both roots as historical documents, not entrypoints. Their 32-/36-skill totals and older provider/state assumptions are superseded by this audit. This report replaces those extra maintenance surfaces in the starter.

## Verification and provenance

The skill-creator workflow was read from `/Users/matthewharwood/.codex/skills/.system/skill-creator/SKILL.md`. All 16 completed entrypoints are checked with that skill's `quick_validate.py` for valid frontmatter, names, descriptions and unfinished placeholders. Local cross-skill Markdown links are checked to resolve. This validates packaging and guidance consistency; it does not claim that a documentation check proves application behavior.

New technical guidance was checked against official sources on 2026-09-06: [IWSDK overview](https://developers.meta.com/horizon/documentation/iwsdk/guides/overview/), [World API](https://iwsdk.dev/api/core/classes/World.html), [IWSDK repository](https://github.com/facebook/immersive-web-sdk), [SQLite persistence](https://www.sqlite.org/wasm/doc/trunk/persistence.md), [SQLite OO API](https://www.sqlite.org/wasm/doc/trunk/api-oo1.md), [SQLite transactions](https://www.sqlite.org/lang_transaction.html), [SQLite version pragmas](https://www.sqlite.org/pragma.html#pragma_user_version), [LiteRT Web](https://ai.google.dev/edge/litert/web), [LiteRT runtime source](https://github.com/google-ai-edge/LiteRT/tree/main/litert/js/packages/core), [TanStack SPA mode](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode), [React Compiler](https://react.dev/learn/react-compiler), [Storybook interactions](https://storybook.js.org/docs/writing-tests/interaction-testing), [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite), and [Playwright assertions](https://playwright.dev/docs/test-assertions).

The installed declarations remain authoritative when online documentation describes a different release. In particular, IWSDK feature flags and teardown have changed across versions, and upstream LiteRT examples may show undefined example variables or mismatched tensor-container cleanup. Skills instruct maintainers to check real types rather than paste such snippets.

### Independent forward test

The new skills were exercised in an independent review of the command, save/import, AI-generation and React-mount boundaries. This exposed a real development-only SQLite ownership race: React Strict Mode cleanup started an asynchronous close while the next mount immediately requested the same storage lock. A real Vite/Chromium reproduction failed in all three fresh contexts. The runtime owner added same-document session lifetime sequencing, preserving real second-tab rejection. Reverification passed all three contexts; the two committed development regressions also passed, covering startup and same-document route remount with a persisted move. The remount assertion checks that the browser did not replace the document, which would hide the lifecycle problem.

The React, SQLite and Playwright skills now distinguish asynchronous teardown sequencing and development effect replay from production-only browser checks. The local-first skill also records the retry boundary: durable exact-envelope retries are supported by the coordinator, while the convenience UI facade remembers command envelopes only within its page session. Reconstructing an old command ID with the current revision is a conflict, not the same retry. These are narrow improvements grounded in observed behavior rather than additional generic process rules.
