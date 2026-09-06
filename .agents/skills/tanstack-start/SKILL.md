---
name: tanstack-start
description: Maintain TanStack Start SPA mode, file-based routes, static prerendering, browser-only initialization, error boundaries and deep-link hosting in this starter.
---

# TanStack Start SPA

Read the installed Start version and existing Vite configuration first. Use SPA mode and the configured prerendered shell. Deploy only the verified static client artifact. A build may create server-side intermediate files for prerendering; their existence does not prove the application needs a runtime server. Do not add server functions/routes or private credentials to implement a local action.

SPA mode still prerenders a root shell. Keep `window`, `navigator`, Worker/WebGL initialization, SQLite and LiteRT out of import-time execution and prerender. Place browser services behind client effects or lazy boundaries. Keep pending UI deterministic. See [SPA mode](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode).

Routes live in the app's configured routes directory. Let the plugin generate the route tree; keep it outside that scanned directory. Use typed links/navigation and parse route/search input using the shared schemas. Routes consume the command/snapshot facade rather than reaching into workers or database handles.

Preserve root and router fallback/error/not-found handling. A build failure must fail prerender instead of quietly emitting a branded success page. Intent preloading may warm code but must not launch a game, open another database connection, or mutate saved state.

Verify the configured shell filename in the build output; do not assume the framework's default `_shell.html` is `index.html`. Configure the selected static host to serve real assets first and rewrite page navigations to that shell. Missing WASM/model/worker assets must not be rewritten to HTML. Build all asset paths from the configured base, including dynamic imports and worker URLs. Validate deep-link refresh on the served artifact.

Offline launch requires an actual asset-cache lifecycle and production browser test. Persistent game data alone does not establish offline shell support. Do not copy provider-specific publishing commands into the generic template.
