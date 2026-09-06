# Validation evidence

Run date: September 6, 2026. Environment: macOS arm64, Node 24.12.0, Bun 1.3.11, Playwright 1.61.1 Chromium with SwiftShader for headless WebGL. This is evidence for the reusable starter and its fifteen-token fixture, not an MTG game or physical headset qualification.

**Final full gate: `bun run check` passed with exit code 0.** This ran the complete root checks, 40 unit tests (55,397 assertions), 10 browser tests, the HTTPS IWSDK development-plugin smoke and the independent generated-workspace gate in one invocation.

## Executed

- `bun install --frozen-lockfile` in an independent generated workspace: installed the pinned graph without changing its copied lockfile.
- `bun run check:fast`: local-state boundary scan, Biome with warnings treated as errors, Stylelint, focused SonarJS, root/package/app tsgo, and 40 unit tests passed (55,397 assertions at the final run).
- `bun run build`: production browser bundle and TanStack static prerender passed; post-prerender asset cache generated. Vite's known SDK chunk-size advisory remains visible and is documented below.
- `bun run test:browser`:10/10 real Chromium tests passed in 37.8 seconds. This includes real SQLite Wasm/OPFS and real workers, not mocked browser persistence.
- `bun run test:quest-dev`: actual HTTPS IWSDK development-plugin startup passed, including secure context, official Meta Quest 3 emulator identity, SQLite scene readiness and VR entry/exit without page errors. Its disposable certificate is trusted only by the isolated test browser; no certificate authority is installed.
- `BASE_PATH=/starter/ bun run --cwd apps/web build` followed by targeted offline and XR browser tests:2/2 passed. Verified cached deep-link fallback, SQLite resume, local controller assets, XR action/exit/reentry under a deployment prefix. The delivered production artifact was then restored to the default `/` base.
- 16/16 canonical skills passed the official skill validator; local reference links resolve. Every source skill and mirror received a disposition. All 135 source entrypoint hashes remained unchanged, and Snapmatch's original Git checkout remained clean at `ea33cd75c83a94e6bf2888b7ac5f9b9405fc6f9a`.

## Behaviors covered

| Area | Evidence |
| --- | --- |
| Rules | Every reachable take-away branch terminates legally; wrong game/seat, stale revision/decision and invalid take are rejected |
| Durability | Real SQLite transaction rollback after receipt insertion; no publication on failed commit; close/reopen restores state and accepted receipt |
| Retry | Concurrent identical commands apply once; command-ID content conflicts fail; original full command can recover its durable receipt after restart |
| Save transfer | SHA256, version, structural and replay-consistency checks; explicit UI replacement; malformed import preserves the current game |
| AI | Every reachable legal choice supported, deterministic heuristic, legal output masking, cancellation and failed-inference fallback |
| Lifecycle | Same-document ownership waits for teardown; canceled queued remount and crashed workers release correctly; real dev StrictMode and SPA route remount restore one session |
| Browser | Complete human/AI match, reload, second-tab rejection/retry, export/import, keyboard, responsive viewport, no-XR fallback |
| Offline | Asset installation/readiness, external networking blocked, reload/continue, unknown-route fallback and return |
| Emulated XR | First XR entry happens offline; right-controller ray activates TAKE 2 through IWSDK; durable human/AI REV 2; in-world EXIT VR; re-entry retains state; no failed asset requests or page errors |
| Headset development tooling | Real HTTPS Vite dev plugin injects official IWER before Start hydration; secure context, scene initialization and emulated session entry/exit pass |
| UI components | Storybook control interaction and disabled legal-choice states |
| Generator | Name/path validation, no overwrite, concurrent output claim, no secret/database/cache copying, binary assets, symlink rejection, clone of a clone, real Turbo adapter |

The browser XR fixture is an IWER test bundle in ignored `.generated`; it is not a production dependency or evidence of actual Quest frame timing. The development plugin is enabled only through the explicit headset development command.

## Defects found and fixed during implementation

The browser tests caught scoped app IDs being rejected by the initial namespace validator. Storage now validates the complete canonical app ID and hashes it into a safe VFS directory without lossy string normalization.

Independent development tests exposed StrictMode replacing a session before the previous SQLite owner had shut down. The same-document lifecycle now serializes replacement behind teardown while retaining immediate rejection for a genuinely separate tab.

Offline module-script requests initially missed Vite's Origin-varying precache entries. Immutable same-origin asset lookup now ignores `Vary`, and both root/subdirectory offline tests pass. SDK controller models also initially pointed at a public CDN; pinned licensed assets now load through the public LoadingManager URL mapper and are included in the offline cache.

The generated-workspace gate now executes outside the source's ignored `.generated` directory so Biome actually checks the independent output. It verifies the app manifest after the real Turbo adapter, since an unsuccessful interactive generator can otherwise return a misleading zero exit status.

The separate HTTPS smoke caught development-plugin dependencies that Bun's isolated linker could not resolve, plus missing emulator injection because Start bypasses Vite's HTML transform hook. Explicit development dependencies and a quest-only client transform now load the official IWSDK runtime before hydration; a permanent smoke test covers this exact path.

## Limits and remaining qualification

- Physical Quest 3 testing has not been performed. Seated readability, hand tracking, interruption behavior, device storage and sustained frame-time/memory targets remain unverified. Use the checklist in `quest.md`.
- The working opponent is a heuristic. The optional LiteRT adapter is typechecked and its encoders/fallback semantics have unit coverage; no real trained model was supplied, run or benchmarked.
- Browser tests use Chromium. Safari/Firefox browser persistence have not been qualified here.
- Baseline full static output is approximately 29.1MB raw including selected local controller profiles (~11.2MB). The lazy SDK scene/runtime chunk is 6.4MB raw (~1.63MB gzip), which triggers Vite's default 500KB advisory. All browser functionality passed, but production optimization and physical headset budgets need measurements. No warnings were hidden by increasing the threshold.
- The fixture has public information only. Its full game snapshot must be replaced with a redacted bound-player view before adding private hands/library order. There is no multiplayer protocol implementation, full MTG engine, card catalog or claimed Commander coverage.
- The UI's short `submit({take,commandId})` retains an original envelope only during one facade lifetime. Cross-reload exact retry is supported at the full versioned GameCommand/coordinator boundary; a reconstructed command with the same ID but different revision is rejected safely.

## Independent generated-workspace gate

`bun run check:template` passed: independent frozen install (1,121 packages), real Turbo app generation, second-app dependency linking, full boundary/lint/root-and-workspace typechecking, 40 tests, and production/prerender/offline builds for both the canonical and generated apps. The generator formats only its newly created output using the installed source Biome, because scope renaming can change import order and line wrapping. It still does not install dependencies, initialize Git, or modify an existing destination.
