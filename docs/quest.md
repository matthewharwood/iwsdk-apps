# Quest development and qualification

The starter uses IWSDK 0.5.3 and Three.js WebGL rendering. It has no locomotion and places a shared table in front of the viewer. Desktop uses a fixed perspective camera; XR uses tracked views on the same scene and local session. Spatial TAKE 1/2/3, status, confirmed New Game and Exit VR work through the IWSDK input path. Optional hand tracking is requested, while controllers remain the qualification target.

## Reach a secure origin

Use a stable LAN hostname/IP that the headset can reach. Headset `localhost` points to the headset. The desktop development default is http://localhost:3000, which desktop browsers treat as trustworthy but is not a remote Quest origin.

Prepare a TLS certificate trusted by the Quest browser for your chosen hostname/IP. Follow your organization's trusted development certificate process, or use device USB reverse forwarding and a browser-supported trustworthy local origin. Do not add untrusted-certificate bypass flags to production or claim a certificate warning establishes a secure context.

```sh
XR_CERT=/absolute/path/lan-cert.pem XR_KEY=/absolute/path/lan-key.pem bun run dev:quest
```

`dev:quest` binds port 3000 on all interfaces, uses the supplied certificate, and enables matching IWSDK development tooling. Its IWER injection is dev-only and excludes the actual Quest browser. Keep certificate keys outside the repository; `.certs/` is ignored. Check the Vite terminal for the actual origin and verify the browser reports a secure context and `navigator.xr.isSessionSupported('immersive-vr')` before expecting Enter VR.

`bun run test:quest-dev` checks this exact development-plugin integration on local port 3145, including official IWER injection and VR entry/exit. It uses `openssl` to create and then remove a disposable certificate and scopes certificate-error tolerance to its isolated test browser. It does not install a certificate authority or configure headset trust.

For final offline tests, build and host `dist/client` using a static HTTPS server at the same stable origin. Development intentionally does not cache the app. Use `/` or build with `BASE_PATH=/your-app/`; serve all assets under that prefix and rewrite unknown navigation paths under it to that prefix's `index.html`. HTML and `sw.js` should be revalidated, and content-hashed `/assets/` may use immutable caching.

## Physical-device checklist (unverified)

Record headset model, Quest browser/OS versions, origin, build identity and date. Use a real Quest 3:

- Start a desktop-view game, enter VR, take choices using left/right controller rays, finish a game, confirm New Game, exit and re-enter. Verify identities/revision and save remain unchanged by mode transitions.
- Confirm 3D labels/action targets are legible seated, controls are reachable, and Exit VR remains available even during a storage error. Check system session interruption and resumption.
- Refresh during an AI turn, reject a second database-owning tab, grant/deny persistence, export a backup in normal browser mode and restore it on another origin/device.
- Wait for offline readiness, block network access, reload, enter VR and confirm local assets, controller models, workers and saved state load. File import/export uses the conventional browser, not an in-headset blocking gameplay dialog.
- Measure frame-time distribution (initial target 72 Hz ≈13.9ms/frame), sustained memory pressure and AI/storage latency over a complete match. These are targets, not measured claims.

No physical headset was available to the implementation agent. Automated IWER evidence is documented separately in validation and never substitutes for this checklist.

Primary references: [IWSDK testing](https://iwsdk.dev/guides/02-testing-experience.html), [WebXR requestSession](https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/requestSession), [SQLite SAH pool persistence](https://sqlite.org/wasm/doc/trunk/persistence.md).
