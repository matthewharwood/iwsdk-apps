---
name: playwright
description: Verify browser routes, worker messaging, real SQLite OPFS persistence, WASM loading and desktop/XR fallbacks with Playwright. Use for browser integration tests and production-artifact smoke checks.
---

# Browser verification

Use `bun run test:browser` and inspect the configured projects and web-server setup. Run app integration tests against a fresh built artifact when asset paths, workers, WASM or prerender are involved. Story tests can target Storybook's iframe. Keep pure engine/schema tests in Bun.

Use accessible role/name locators and awaited web-first assertions; see [Playwright assertions](https://playwright.dev/docs/test-assertions). Keep test state isolated per browser context, except deliberate reload/second-tab scenarios that share one origin. Use reduced motion by default for ordinary UI tests. Do not replace OPFS with an IndexedDB mock or assume native SQLite verifies the browser VFS.

For persistence, make a legal move, assert the committed result/storage mode, reload, and compare resumed state/revision. Exercise contention with two pages in the same browser context so both address the same pool. A new context would miss the conflict. A silent memory fallback must fail a durable-save test.

For replay/import, test invalid versions, illegal actions and truncated input without losing the current save. For workers, check initialization errors, stale result handling and rejected commands. React's development Strict Mode effect replay requires a development-server test in addition to production tests. Exercise same-document route remounts and verify the document was not reloaded, which would hide teardown/startup races. For LiteRT, verify real runtime/model requests and known fixture output, and identify the actual backend used.

Capture page errors and failed asset requests. Assert missing `.wasm`, worker and model paths do not receive the SPA's HTML. Report any external asset fetches that violate the app's self-hosted boundary. Stable UI evidence and screenshots are helpful alongside behavior assertions.

Do not label emulated XR or a browser without a headset as a physical XR pass. IWER exercises scene/input integration; real headset checks still cover entry, selection, exit and comfort. Network-free operation after load and warm-cache offline navigation need separate assertions. Do not mark PWA support complete without a working service worker/cache lifecycle.

Implement relevant tests within the user's authorized work. The source repository's per-test approval ritual is not part of this starter. Preserve actual user preferences and task permissions, and keep any unavailable device/environment evidence explicit.
