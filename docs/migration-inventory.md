# Snapmatch migration inventory

Inspected on September 6, 2026, from the local source repository
`/Users/matthewharwood/Documents/GitHub/snapmatch` at commit
`ea33cd75c83a94e6bf2888b7ac5f9b9405fc6f9a`. Its worktree was clean when inspected.
The source repository was read only: no source files, production services, database contents,
deployment settings, or source Git history were changed.

The delivered project is a **reusable local WebXR starter with a working integration example**.
The example is a deterministic take-away game, not a Commander implementation. The attached
Magic brief supplied architectural requirements and future application context. The user's
clarification established the reusable starter as the current product scope. The source's
Firestore-first instructions describe its original application; they do not require this new
project to retain Firestore.

## Inspection coverage

The tracked source contains 510 files: 130 under `apps/web`, 98 in the duplicated app template,
71 canonical skill entry points, and their supporting configuration, domain, tests, and docs.
There are 27 application unit-test files, 5 shared-schema unit-test files, 2 emulator-test files,
and 25 copied template unit-test files. These counts describe the inspected source, not tests
executed in this project.

The audit inspected `AGENTS.md`, `CLAUDE.md`, `STATE_ARCHITECTURE.md`, root and workspace manifests,
`turbo.json`, Vite configuration, the LiteRT adapter and asset synchronization code, app-generator
configuration, generated-app validation, state and deployment boundary checks, environment
validation, CI/deploy workflows, and the test inventory. Environment **names** were inventoried;
existing configuration values were not copied into this project.

Every source skill and mirrored copy is covered separately in [the skill audit](skills-audit.md).
The following tables cover the rest of the source by owned file or directory family. “Remove”
means exclude from this new starter, never delete from the source repository.

## Runtime and workspace files

| Source files | Decision | New ownership or reason |
| --- | --- | --- |
| Root `package.json`, `bun.lock`, `turbo.json`, `.nvmrc`, `tsconfig.json` | Adapt | Keep Bun, Turborepo, TypeScript native checking, workspace dependency boundaries, and a reproducible lockfile. Use the `@iwsdk-apps/*` scope so it cannot collide with official `@iwsdk/*` packages. |
| `packages/tsconfig/*` | Retain/adapt | Shared TypeScript configuration remains useful. |
| `packages/schemas/*` | Replace domain contents | Keep Zod boundary ownership; replace Snapmatch World/Session/Game/Participant/Vote contracts with local commands, revisions, receipts, player views, save envelopes, and model manifests. |
| `packages/biome-config/*`, `packages/stylelint-config/*` | Consolidate | Small root configuration files are clearer than otherwise empty configuration package shells. |
| `apps/web/package.json`, `tsconfig.json` | Adapt | Browser-only app, local workspaces, IWSDK, Three.js, SQLite worker, and heuristic-first AI. |
| `apps/web/vite.config.ts`, `vite.shared.ts` | Adapt | Retain static TanStack Start SPA and Vite. Remove Firebase-specific chunking and production URLs. Add worker/Wasm handling, IWSDK development tools, and explicit secure headset development. |
| `apps/web/index.html`, `app/client.tsx`, `app/router.tsx`, `app/routes/__root.tsx`, `app/lib/route-boundaries.tsx` | Adapt | Keep the client shell, root/router error and not-found boundaries, and failure behavior during prerender. Browser-only systems initialize after mount. |
| `apps/web/app/env.ts` | Adapt | Validate public local configuration without requiring remote-service credentials or identifiers. App identity is explicit in `app/app.config.ts`. |
| `apps/web/app/routes/index.tsx`, `routes/match/$gameId.tsx` | Replace | A straightforward local workspace replaces matchmaking and remote invite routes. |
| `apps/web/app/components/action-button/*`, `health-card/*` | Adapt patterns | Retain typed, semantic controls and isolated stories; remove backend connectivity sentinels. |
| `apps/web/app/components/landing-*/*`, `match-queue-page/*`, product styles, metadata, and Snapmatch imagery | Remove/replace | These implement the old product, not a neutral starter. New UI explains and operates the local example. |
| `apps/web/app/canvas/use-pixi-app.ts`, `components/pixi-canvas-demo/*` | Remove | One IWSDK/Three.js presentation serves desktop and immersive XR. |
| `apps/web/app/state/remote/**` | Remove | Auth bootstrap, Firestore repositories/listeners/timestamp codecs, queues, session claims, remote transport, presence, reconciliation, and remote cleanup do not belong in the local architecture. |
| `apps/web/app/state/db.ts`, `persist.ts`, `hydration.ts`, `reset.ts`, `storage-schema.ts`, `migrations/*`, `hydration-retention.ts` | Replace | SQLite in the game worker owns durable accepted commands, receipts, and checkpoints. There is no parallel authoritative IndexedDB replica/outbox. |
| `apps/web/app/state/atoms.ts` | Adapt concept | Jotai publishes accepted player views and UI status. It is not the rules engine or transform store. |
| `apps/web/app/state/matchmaking.ts`, `queue-time.ts` | Remove | Online rooms, queue deadlines, audience roles, and remote lease countdowns are outside this starter. |
| `apps/web/app/lib/litert-runtime.ts` | Adapt | Preserve lazy loading and local inference. Put model validation, deterministic features, legal-action scoring, and a usable fallback in the AI boundary. |
| `apps/web/public/litert/**` | Exclude | The optional LiteRT adapter accepts caller-supplied compatible runtime/model assets. No default model or LiteRT asset synchronization is claimed, and nothing is copied from Snapmatch. |
| `apps/web/app/assets/fonts/*`, `public` product artwork, OG images, robots/sitemap content | Replace selectively | The neutral starter must not inherit product branding, deployment URLs, or unneeded asset/license assumptions. |

## Dependencies

The source columns below record its manifest declarations, rather than claiming every caret
range was resolved to its lower bound. Exact installed target versions are pinned in manifests
and `bun.lock`; execution results are reported separately from version selection.

The target matrix and full app/browser execution evidence are maintained in
[validation](validation.md). Generator-focused verification executed here used Bun 1.3.11:
15 tests / 77 assertions passed, as did Biome, focused ESLint, and the root native TypeScript
check. A real independent clone installed its copied lockfile with `bun install
--frozen-lockfile` and created a second app through `bunx turbo gen app --args new-app`.
These checks do not stand in for physical Quest qualification.

The integrated `bun run check:template` subsequently passed with a renamed `verified-starter`
workspace and a second `generated-example` app: frozen dependency installation, the real Turbo
generator, boundary/lint checks, native TypeScript checks across the root and all packages,
40 unit tests, and production/prerender/offline builds of both applications. Each build listed
59 local precached assets. Generated output was formatted using the source's pinned Biome before
checking; source files were not changed by that formatting step.

| Dependency family | Source declaration | Starter decision |
| --- | --- | --- |
| Bun / Turborepo / TypeScript | Bun 1.3.13; Turbo `^2.5.0`; `@turbo/gen ^2.9.0`; native preview `^7.0.0-dev.20260426.1` | Keep the tooling family and native preview baseline. Pin the tested target dependency set. |
| React / React DOM / compiler | React `^19.0.0`, compiler `^1.0.0` | Keep conventional browser UI and compiler integration. |
| TanStack Router / Start | Router `^1.168.0`, Start `^1.167.0` | Keep Router and Start's static SPA/prerendering setup; no application server is introduced. |
| Vite / Tailwind | Vite `^7.0.0`, Tailwind `^4.0.0` | Keep with matching plugins and worker/asset support. |
| Zod / t3-env / Jotai | Zod `^4.0.0`, env `^0.13.0`, Jotai `^2.19.0` | Keep explicit boundary validation and one UI projection store. |
| LiteRT.js | `@litertjs/core ^2.5.3` | Keep optional local scoring, with no model download required to play. |
| IWSDK / Three.js | Absent | Add pinned `@iwsdk/core` and matching Vite development plugin plus compatible Three.js. |
| SQLite | Absent | Add official `@sqlite.org/sqlite-wasm` with an explicit worker-owned OPFS VFS. |
| Firebase / CLI / Rules testing | Firebase `^12.16.0`, CLI `^15.24.0`, rules unit testing `^5.0.1` | Remove all three from the starter, including emulator/Java infrastructure. |
| IndexedDB wrapper | `idb ^8.0.0` | Remove as application-domain persistence; SQLite replaces it. |
| PixiJS | `pixi.js ^8.18.1` | Remove runtime, examples, test fixtures, and skills. |
| anime.js | `animejs ^4.0.0` | Remove because this starter has no necessary DOM-animation use. IWSDK systems own world transforms. |
| Storybook / Playwright | Storybook `^10.0.0`, Playwright `^1.59.0` | Keep component stories and real browser integration coverage. |
| Biome / Stylelint / SonarJS | Biome `^2.4.0`, Stylelint `^16.0.0`, SonarJS `^4.0.3` | Keep formatting, CSS checks, and focused static analysis as explicit gates. |
| React Doctor / Fallow | `npx -y ...@latest` commands | Do not copy unpinned network-executed release commands. Retain useful checks through versioned tooling and reviewable project gates. |
| TanStack devtools, React Scan, chokidar watchers | Optional source development dependencies | Keep only if actually used. Do not copy always-running watcher sidecars or unused packages into the template. |

## Scripts and CI

| Source entry point | Decision | Replacement |
| --- | --- | --- |
| `scripts/check-remote-state-boundary.sh` | Replace | Local architecture checks enforce pure domain code, worker persistence ownership, and absence of old providers. Firebase-specific regex assertions cannot validate SQLite correctness. |
| `scripts/check-deployment-policy.sh` | Remove | It mandates the old Firebase production project and optional Pages mirror. Neither is a starter prerequisite. |
| `scripts/check-template.sh` | Replace | `scripts/check-template.ts` generates a uniquely owned temporary independent workspace, performs a frozen install, exercises the real Turbo generator, and checks both apps. It never removes a fixed `apps/test-project` directory. |
| `scripts/check-lockfile.sh` | Replace behavior | Generated checks use uniquely owned OS temporary directories outside the source checkout and cannot add fixture apps to the real workspace lockfile. The independent clone first installs with `--frozen-lockfile`. |
| `scripts/check-ignore-policy.sh` | Adapt behavior | Explicit ignores cover build/cache/runtime artifacts and environments. The generator separately uses an allowlist and refuses to copy credentials or local databases. |
| `scripts/install-hooks.sh`, package `prepare` | Remove implicit side effect | Generating/installing a starter does not mutate the user's Git hooks. Run explicit quality commands locally and in CI. |
| `scripts/resolve-app-filter.ts`, `scripts/run-app-task.ts` | Simplify | Default `dev` selects `apps/web`. Other applications run with an explicit Turbo filter. Builds check all workspaces. |
| `apps/web/scripts/sync-litert-assets.ts` | Remove default sync | LiteRT model integration requires explicitly supplied compatible runtime/model assets. The heuristic example does not need them. SQLite's Wasm is emitted by Vite; local XR controller assets have a separate owned synchronization script. |
| `apps/web/scripts/build-sitemap.ts` | Remove/replace | The starter has no Snapmatch marketing sitemap or canonical production URL. |
| `firebase:*`, `test:rules`, `test:runtime-emulator`, `test:emulators`, `typecheck:rules` | Remove | Local command/persistence unit tests and real-browser worker/OPFS tests replace provider tests. |
| `gen:app` / `turbo/generators/config.ts` | Replace implementation | `bun run gen:app <name>` and `bunx turbo gen app` share the same canonical copy implementation. |
| New `gen:workspace` | Add | `bun run gen:workspace ../my-app` creates an independent Turborepo with skills, configuration, packages, and the neutral working example. |
| `.github/workflows/ci.yml` | Adapt | Install the pinned lockfile and run explicit checks. Remove Java, emulator setup, Firebase environment values, and assumptions about `main` analysis commands. |
| `.github/workflows/deploy.yml` | Remove | The old optional Pages workflow and `PAGES_ENABLED` policy concern the source deployment. No source-hosting automation is copied. |
| `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json` | Remove | No provider resources, Auth declarations, indexes, security rules, or production project IDs enter the starter runtime. |

## Environment inventory

| Source variables | Decision |
| --- | --- |
| `VITE_FIREBASE_ENABLED`, `VITE_FIREBASE_USE_EMULATORS`, `VITE_FIREBASE_DOMAIN_SYNC_ENABLED` | Remove, rather than leaving disabled flags over dormant provider code. |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID` | Remove all Firebase configuration requirements. No values are migrated. |
| `VITE_GAME_TITLE`, `VITE_SITE_URL`, `VITE_SITE_DESCRIPTION`, `VITE_OG_IMAGE`, `VITE_AUTHOR_NAME`, `VITE_AUTHOR_URL`, `VITE_TWITTER_HANDLE` | Replace product-specific configuration with neutral app metadata and validated local options. |
| `VITE_API_BASE` | Remove unused remote API boundary. |
| `VITE_ENABLE_TANSTACK_DEVTOOLS` | Retain only when the related optional development integration is used. |
| `BASE_PATH` | Keep base-path correctness as a Vite concern; do not inherit a particular hosting provider or origin. |
| `SNAPMATCH_APP_FILTER`, `SNAPMATCH_APP`, `TURBO_APP_FILTER`, `APP_NAME` | Replace bespoke source selection with explicit Turbo filters and a clear default app. |
| `PAGES_ENABLED`, `FIREBASE_SKIP_UPDATE_CHECK`, Firebase CLI credentials | Remove source deployment/emulator requirements. |
| `NODE_ENV`, `CI`, Playwright configuration | Keep ordinary local tooling concerns. |

Tracked source `.env`, `.env.production`, `.env.example`, and template equivalents are not copied.
Only a newly authored neutral `.env.example` can be included by the generator. It excludes `.env`
and every other `.env.*` filename, along with `.npmrc`, private-key files, and user databases.

## Tests and documentation

| Source files or coverage | Decision |
| --- | --- |
| `packages/schemas/src/{domain,protocol,reducer,primitives,index}.test.ts` | Replace old domain assertions with local deterministic transitions, actor/revision/decision validation, save compatibility, and supported example rules. Preserve the pure-test pattern. |
| App `state/remote/*.test.ts` and root `tests/firestore*.test.ts` | Replace with serialized-command, duplicate-receipt, rollback, save/reload, ownership, and worker failure coverage. Emulator assertion counts are historical and are not claimed as new coverage. |
| App IDB migration, hydration-retention, storage-schema, and app-scope tests | Replace with SQL migrations and explicit persistence/identity tests. SQLite must be exercised in a real browser as well as an independently testable repository. |
| `app/env.test.ts`, `router.test.ts`, `lib/litert-runtime.test.ts` | Preserve relevant validation intent; update contracts for the neutral local application and model adapter. |
| `tests/health-card.story.spec.ts`, `pixi-canvas-demo.story.spec.ts` | Replace old UI fixtures with local controls and IWSDK behavior. Remove Pixi assertions. |
| `tests/seo.app.spec.ts`, `tests/fixtures.ts`, `playwright.config.ts`, `.storybook/*` | Adapt to current routes, local runtime ownership, semantic controls, and reproducible browser setup. |
| `tests/shell.offline.spec.ts` | Replace skipped source expectations with actual asset-only service-worker and offline reload tests. Persistence and application offline loading remain separate claims. |
| The 25 duplicated template test files | Remove duplicate sources; all generated apps copy the current canonical app tests. |
| New generator tests | Test safe naming, containment, no overwrite, concurrent creation, scoped IDs, binary assets, cleanup, symlink rejection, credential exclusion, and repeated workspace generation. |
| `AGENTS.md`, `CLAUDE.md` | Rewrite local authority and generator guidance. Remove source Linear project routing, Firestore-first requirements, production deployment instructions, and obsolete Playwright approval language. |
| `STATE_ARCHITECTURE.md` | Supersede with a local architecture decision record. Preserve the useful principle that accepted persistence precedes published durable success. |
| `WIREFRAMES.md`, `_docs/game-summary.md`, source `README.md` | Replace source product screens and deployment instructions with starter setup, working-example behavior, extension boundaries, and physical-device qualification steps. |
| `.agents/skills/**`, `.claude/skills/**`, `skills-lock.json` | Audit every entry, remove obsolete stacks, consolidate duplicated guidance, and create modern IWSDK/SQLite/LiteRT skills. See the separate exhaustive skill audit. |
| `.claude/commands/*`, `.claude/agents/parti-emblem-architect.md` | Do not copy old prompt/server-management shortcuts or unrelated specialist agents into the neutral starter. |
| `.fallowrc.json`, `doctor.config.json`, `biome.json`, `stylelint.config.mjs`, `.stylelintignore`, app Sonar configuration | Retain only configuration consumed by current versioned gates. Do not leave suppressions or file globs for removed source code. |

## Generator contract

`apps/web` is the single canonical application template. There is no second source tree under
`turbo/generators/templates`. New apps receive their own `appConfig.appId` and package identity;
that identity namespaces database and lock ownership. Shared package names do not change when
adding an app to the same workspace.

Independent workspace generation copies an explicit root-file/directory allowlist and only
`apps/web`, even if the source workspace contains additional apps. It rewrites the internal
workspace scope, root package name, lockfile workspace entries, and primary app configuration.
Official `@iwsdk/*` imports remain unchanged. The generated workspace can generate another
workspace, or additional apps, using the same commands.

Both generators validate names, refuse existing destinations (including empty directories),
reject source symlinks rather than follow them, preserve binary assets, exclude built/runtime
assets and local data, and clean up only output directories they exclusively created. They do
not install dependencies, initialize Git, deploy, or modify services. `check:template` performs
installation and validation explicitly in its own disposable output.

When the source contains Biome configuration, generation uses the source's installed Biome to
format and organize imports in the new output only. Changing a scope can change alphabetical
import order and line lengths; formatting the actual output keeps the standard lint gate useful.
Run `bun install` in the source before using its generators.

The actual definition of the export allowlist is in `scripts/create-workspace.ts`; tests and
documentation live beside that implementation so its safety and reproducibility stay reviewable.

## Local XR input assets

IWSDK 0.5.3's default input visuals reference a public controller-model CDN. This starter maps
that exact SDK URL prefix through the public Three.js `LoadingManager` to `xr-profiles/` on the
application's own base path. `sync-xr-assets.ts` copies six profile folders from the pinned
`@webxr-input-profiles/assets` 1.0.19 package, its MIT license and source notice, and a file-size /
SHA-256 manifest. The copied set contains Quest Touch Plus, Touch Plus v2, Touch Pro, generic
trigger, generic trigger/squeeze/thumbstick, and generic hand visuals. These assets enter the
same replaceable asset cache as the application and are regenerated for each app clone.

The inspected GLBs embed their buffers and images and do not require Draco/KTX2 decoders.
No third-party runtime asset download is required for these supported profiles. Other device
models are not bundled by default; adding them requires an explicit asset/profile qualification.
Local asset availability is not evidence that physical Quest rendering or controllers were tested.
