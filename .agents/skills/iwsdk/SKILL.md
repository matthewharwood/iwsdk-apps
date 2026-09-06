---
name: iwsdk
description: Build and debug Immersive Web SDK scenes, controller interactions, Three.js resources, and WebXR session lifecycle in this starter. Use for XR or desktop 3D presentation; domain rules and durable state belong to the game worker.
---

# Immersive Web SDK

Use `@iwsdk/core` as the 3D presentation and WebXR runtime. This starter initially pins IWSDK 0.5.3 and matching Three 0.181.2; read the lockfile and installed declarations for subsequent changes. Read the selected app's existing XR adapter first. Online examples can describe a different IWSDK release: feature option names, scene formats, entity lifecycle, and teardown APIs have changed. The matching declarations decide the usable API. Do not regenerate the whole workspace with an upstream scaffold when adding a scene here.

## Ownership and initialization

- React owns the host element and loading/error controls. Create the World asynchronously in an effect or the app's client adapter; never initialize WebGL or read `navigator` during render, import evaluation, or prerender.
- IWSDK owns its renderer, camera/player rig, entity systems, and frame loop. Attach presentation objects to its scene/entity hierarchy; do not create a competing Three renderer or animation loop.
- Keep exactly one live World per mounted scene. Handle cancellation while `World.create()` is pending: if the mount has gone away, immediately clean up the resolved World. Exercise mount/unmount/remount with Strict Mode and HMR.
- Subscribe to committed domain snapshots and render them. Pointer/controller input emits the same typed action as the DOM UI. An object's transform, visibility, or grasp state cannot determine a legal game move.
- Prefer IWSDK's supported Three exports or exactly matching Three dependency version. Mixing engine copies can break identity checks and resource assumptions.

## Input and XR lifecycle

Offer immersive entry through a visible user action after detecting secure-context and session support. A support check is not a granted session: handle denial, unavailable hardware, and a session that ends externally. Resolve the World before the action so initialization does not consume the activation window. Use the installed SDK's session helper rather than bypassing its input/player integration.

Controllers must operate the actual board: give actionable objects unambiguous targets, map selection to validated domain actions, and clear highlights as legal actions change. Test desktop pointer/keyboard equivalents as well. Ordinary HTML controls do not automatically become visible or selectable in an immersive headset session; make essential actions available in the scene.

Use sensible world scale, comfortable reach and readable spatial labels. Avoid forced camera motion for a stationary tabletop interaction. Respect reduced motion for decorative effects while keeping the head-tracked render loop active. Pause expensive derived work when the session/page is hidden.

## Resource lifecycle and performance

Read the installed World teardown implementation. End an active session, unsubscribe application listeners, destroy owned entities/systems, stop the SDK loop through its supported lifecycle, and release application-owned geometries/materials/textures. Do not assume a generic `dispose()` method exists or that World teardown disposes every custom GPU resource. Do not dispose assets still shared by another scene.

Reuse static geometry/materials, avoid per-frame allocations, and update labels/highlights when their values change. Keep SQLite, model loading and inference outside the rendering thread. Enable physics, grabbing, locomotion, spatial UI, and their assets only when the interaction needs them. Do not equate WebGPU inference support with WebXR rendering compatibility.

## Verification

Use ordinary `bun run dev` for the desktop loop and the selected app's `dev:quest` command for the opt-in `XR_DEV=true` IWSDK development tooling. Keep the matching `@iwsdk/vite-plugin-dev` integration out of normal production configuration. A remote headset needs a trusted HTTPS origin; a LAN HTTP address does not inherit localhost's secure-context exception.

TanStack Start renders HTML without Vite's `transformIndexHtml` injection. Preserve the quest-only `iwsdkStartClient` serve transform in `apps/web/vite.config.ts`: it imports the official `/@iwer-injection-runtime` before client hydration, excluding SSR and production builds. Bun's isolated linker also requires the app's direct development dependencies `@iwsdk/scene-composition` (0.5.3), `three-viewport-gizmo` (2.2.0), and `@zappar/msdf-generator` (1.2.4) for the plugin's optimizer. Preserve application Three deduplication without globally overriding the development tools' separate Three bundles or internal aliases. Run `bun run test:quest-dev` after changing this integration; it verifies the real HTTPS plugin, secure context, official Meta Quest 3 IWER identity, loaded scene, immersive entry/exit, and absence of page errors. This remains emulator evidence.

Verify that a real scene draws, actions are routed to the worker, state resumes, unsupported XR falls back cleanly, and remount does not leak canvases/listeners. IWER is useful for emulated input; report it as emulation. Headset entry, selection, exit, comfort, and sustained frame rate need physical-device evidence. A desktop screenshot does not verify those properties.

Official references, checked 2026-09-06: [overview](https://developers.meta.com/horizon/documentation/iwsdk/guides/overview/), [World concepts](https://developers.meta.com/horizon/documentation/iwsdk/concepts/ecs/world/), [World API](https://iwsdk.dev/api/core/classes/World.html), [source and releases](https://github.com/facebook/immersive-web-sdk), [WebXR capability guidance](https://developers.meta.com/horizon/documentation/web/webxr-overview/).
