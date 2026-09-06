# Dependency matrix

Inspected source: clean Snapmatch commit `ea33cd75c83a94e6bf2888b7ac5f9b9405fc6f9a`. Target pins were selected September 6, 2026 from installed source packages and official registry/package metadata. `bun.lock` records the complete transitive graph. Existing working versions were retained rather than upgrading all tools to latest.

| Subsystem | Target pin | Evidence/decision |
| --- | --- | --- |
| Bun | package manager 1.3.13; host 1.3.11 | Source package-manager declaration retained; host version used in recorded initial tests |
| Node |24.12.0 local;24 CI | Actual available supported runtime; engines>=22 |
| Turbo / generator |2.9.6 | Source installed versions |
| tsgo |7.0.0-dev.20260426.1 | Source native TypeScript checker |
| React / React DOM |19.2.7 | Source installed; single deduplicated pair |
| React Compiler |1.0.0 | Source plugin, wired through @vitejs/plugin-react5.0.4 |
| TanStack Router / Start |1.170.18 /1.168.32 | Source installed; static SPA prerender retained |
| Vite |7.3.6 | Source installed; module workers and Wasm URL imports verified |
| IWSDK core / dev plugin |0.5.3 /0.5.3 | Matching official packages and installed public API declarations |
| IWSDK development resolution |scene-composition0.5.3 / three-viewport-gizmo2.2.0 / msdf-generator1.2.4 | Direct dev dependencies let the plugin's optimizer resolve its packages with Bun's isolated linker |
| Three / types |0.181.2 /0.181.0 | Compatible with SDK types; Vite dedupes the application runtime |
| signals-core |1.14.4 | SDK internal signals; direct dependency supports Vite dedupe with Bun isolated linker |
| SQLite Wasm |3.53.0-build1 | Official package; worker `opfs-sahpool`, hashed app namespace, Web Locks single owner |
| LiteRT.js |2.5.3 | Source installed; optional adapter only |
| Jotai / Zod |2.20.2 /4.4.3 | Source installed; projections/runtime contracts |
| Tailwind |4.3.3 | Source installed, Vite plugin |
| t3-env / lucide-react |0.13.11 /1.25.0 | Source installed; optional public title config/icons |
| Storybook |10.5.2 | React-Vite, docs and accessibility addons |
| Playwright |1.61.1 | Actual installed Chromium browser testing |
| IWER |2.3.0 | Automated emulated-XR fixture only; never injected into production |
| XR input assets |1.0.19 | Selected pinned Quest/generic profiles copied with license and checksums to local assets |
| Biome / Stylelint |2.4.13 /16.26.1 | Source working versions |
| ESLint / SonarJS / TS ESLint |10.7.0 /4.2.0 /8.64.0 | Focused complementary static rules |

## Rendering and deployment implications

The application resolves one Three.js 0.181.2 runtime through Vite deduplication. The development plugin separately carries its upstream editor/emulator dependencies (including Three.js 0.184.0 and a super-three alias); these are not application runtime copies and are not forced onto an incompatible version with a global override.

TanStack Start renders HTML without calling Vite's `transformIndexHtml` hook. The quest-only serve plugin therefore imports IWSDK's official `/@iwer-injection-runtime` module before client hydration. This adapter and the dev tooling are excluded from production. `test:quest-dev` exercises the actual HTTPS plugin path separately from the production XR fixture.

The SDK creates a WebGLRenderer and PerspectiveCamera; this integration keeps its supported fixed near-top-down perspective camera and restores it after XR exits. It doesn't substitute an orthographic camera or require WebGPU. The public WebXR request/renderer session APIs are wrapped so denied requests reach the UI; IWSDK's convenience `launchXR` returns void and logs failures in this pin.

The SDK public entrypoint intentionally retains significant spatial UI/font/runtime code even with optional systems disabled. The initial production output before adding local controller profiles is about17MiB; its lazy table/runtime chunk is 6.4MB raw (~1.63MB gzip). Vite reports its default chunk-size advisory. This is an explicitly recorded dependency cost, not a claimed performance target or a suppressed warning. Controller models add additional local/offline download bytes. No private SDK import, modified node_modules file or fabricated performance result is used to hide the cost. A future reduction should use upstream-supported package splitting and be benchmarked on Quest.

SQLite WASM is about865KB raw (~402KB gzip) and runs only in the worker. The chosen SAH pool does not need the isolation headers required by the alternate proxy OPFS VFS. The package bundles other VFS support artifacts; their presence does not mean the application opens multiple database owners.

Production exposes static assets only. The asset service worker handles navigation fallback after Start prerender and ignores response `Vary` for immutable same-origin asset lookup: Vite's Origin-varying responses otherwise make module scripts miss an installed precache offline. A non-root `BASE_PATH` must be used consistently for Vite, static host and worker scope.

## Primary references

- [IWSDK repository](https://github.com/facebook/immersive-web-sdk) and [current setup guide](https://iwsdk.dev/guides/01-project-setup.html)
- [IWSDK React boundary](https://iwsdk.dev/guides/17-react-preact-2d-ui.html)
- [SQLite persistence](https://sqlite.org/wasm/doc/trunk/persistence.md) and [official Wasm package](https://github.com/sqlite/sqlite-wasm)
- [LiteRT.js](https://ai.google.dev/edge/litert/web)
- [WebXR input profiles](https://github.com/immersive-web/webxr-input-profiles)

Selected versions and installed type declarations were checked, not inferred from the attached brief's earlier documentation snapshots. Browser and generator execution evidence is in [validation](validation.md).
