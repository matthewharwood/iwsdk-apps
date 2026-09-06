# Local XR Starter

A reusable **application starter kit**: Bun + Turborepo, React/TanStack Start, IWSDK/Three.js, SQLite Wasm and an optional LiteRT.js adapter. Start in a browser, use the same table in VR, and save locally without accounts or a backend.

This is the reusable starter and working example selected for delivery. The attached MTG brief informed the boundaries; **this is not a Commander implementation**. The neutral example starts with fifteen tokens: take one, two or three, and take the last to win. The opponent uses a local heuristic. No trained model is shipped.

## Run it

Use Node 22 or newer and Bun 1.3.13 (the initial development machine also tested Bun 1.3.11).

```sh
bun install --frozen-lockfile
bun run dev
```

Open [localhost:3000](http://localhost:3000). Click **Take 1/2/3**, use the matching number keys, or click the buttons on the 3D table. Your game automatically restores after reload. Export a save before changing browser, device or origin. Import validates the checksum, schema/rules versions and replay history, then asks before replacing the current game. A second tab shows an already-open error; close the original tab and retry.

```sh
bun run build
bun run --cwd apps/web preview
```

The static artifact is `apps/web/dist/client`. TanStack's `dist/server` is a build/prerender artifact, not a deployed application server. Offline readiness is shown only after the production service worker has cached the assets. Development does not install a service worker. Local storage may be evicted unless the browser grants persistent storage; exported backups remain useful even when that request is granted.

## Generate another application

```sh
# Another independent app in this Turborepo
bun run gen:app my-table
bun install
bunx turbo run dev --filter=@iwsdk-apps/my-table

# A whole new Turborepo, ready to copy repeatedly
bun run gen:workspace ../my-xr-project --name my-xr-project
cd ../my-xr-project
bun install --frozen-lockfile
bun run dev
```

“Blank” means a neutral, runnable starting point with the small integration example and no product content, accounts or existing saves. The generator copies the canonical `apps/web`, shared packages, checks and project skills, assigns a new workspace scope/app identity, and keeps working inside each generated workspace. Replace the example rules/UI with your product; the infrastructure remains ready. It refuses all existing output directories and never copies `.git`, environment secrets, node_modules, caches, or local database files. It does not install dependencies or initialize Git without your own command.

Turbo's interactive entry point is also available: `bunx turbo gen app`. App dev servers default to the same port, so stop one before running another or pass a different Vite port. App IDs isolate local databases; browser origin changes still produce separate storage.

## Where to build

| Location | Responsibility |
| --- | --- |
| `apps/web/app/ui` | Accessible React shell and Jotai projection |
| `apps/web/app/game/scene` | One IWSDK world; desktop and spatial input |
| `apps/web/app/game/session` | Local worker session port |
| `apps/web/app/game/workers` | Serialized coordinator and separate AI worker |
| `packages/schemas` | Zod commands, decisions, saves and model manifests |
| `packages/game-core` | Pure deterministic rules and replay validation |
| `packages/storage-sqlite` | Parameterized SQL, migrations, atomic receipts/checkpoints, portable save envelope |
| `packages/ai` | Legal heuristic, feature encoder, optional lazy LiteRT adapter |
| `scripts` and `turbo/generators` | Repeatable app/workspace generators and checks |
| `.agents/skills` | Sixteen maintained, project-specific skills |

For a new product, replace the game state/commands and pure core first; then update the worker projections and scene. Both the AI and human must enter through the validated coordinator. Keep transforms in IWSDK, never in the rules or Jotai. Add a SQLite migration instead of resetting user data. See [architecture decision](docs/decisions/0001-local-authority.md) and [extension guide](docs/extending.md).

## Validate

```sh
bun run check:fast       # boundaries, lint, types, rules/storage/AI/generator unit tests
bun run check           # plus production build, browser+Storybook+dev tests and real generator smoke
bun run test:unit
bun run test:browser     # requires fresh build; starts its own local servers
bun run test:quest-dev   # actual IWSDK HTTPS development plugin and emulated VR smoke
bun run storybook       # localhost:6010
bun run check:template  # generates a workspace + app, frozen install, checks and builds them
```

If Chromium is not installed, run `bunx --cwd apps/web playwright install chromium` (or run `bunx playwright install chromium` inside `apps/web`). Tests use real OPFS/WASM and bundled IWER emulation without cloud credentials. Browser tests use local ports 3010, 3135 and 6010; the separate HTTPS development smoke uses 3145 and requires `openssl` to create a disposable test certificate. `check:fast` has no browser/server dependency.

[Validation evidence](docs/validation.md) records tests actually run and limitations. [Dependency matrix](docs/dependencies.md), [migration inventory](docs/migration-inventory.md), and [full skill audit](docs/skills-audit.md) record what was kept, changed and retired. The source Snapmatch checkout was read-only throughout.

## Quest and optional inference

Follow [Quest development and qualification](docs/quest.md) for a trusted HTTPS origin reachable from the headset. A browser/emulator test does not qualify physical Quest comfort or performance. Controller rays activate the same three spatial actions, status, new-game confirmation and Exit VR; entering/exiting VR preserves the session.

[LiteRT integration](docs/litert.md) explains the optional local model boundary. The default game works without a model or WebGPU. Rendering uses WebGL; inference acceleration is an independent choice.
