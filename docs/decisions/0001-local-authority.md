# Decision 0001: a local authority and a reusable application scaffold

Accepted 2026-09-06. Source inspected: Snapmatch `ea33cd75c83a94e6bf2888b7ac5f9b9405fc6f9a`, clean working tree. The user clarified delivery as a reusable starter and working example. The MTG brief is product context, not a request to ship Commander in this repository.

The pure TypeScript core determines legal transitions. A serialized coordinator in `game.worker` commits the candidate state, accepted command and receipt together to SQLite before publishing to React/Jotai and IWSDK. A separate AI worker selects from legal candidates, using the same coordinator validation path. App state is independent of rendering frame rate or XR session transitions.

Select the official SQLite Wasm package and `opfs-sahpool` VFS for a single database owner per app namespace. This VFS runs in a worker without the COOP/COEP requirement of the proxy OPFS VFS. Web Locks hold ownership until DB close and pool shutdown. Other tabs show an explicit already-open error. SQLite is the only durable game store. Failure never masquerades as a successful temporary save. Catalogs and user state should get separate tables/migrations when a product adds a catalog; the starter does not add empty catalog subsystems.

Retain Snapmatch's Bun/Turbo/tsgo, React Compiler, TanStack Start static SPA/Router, Tailwind, Jotai, Zod and relevant quality practices. Replace its Firebase/IDB reconciliation model and Pixi renderer. Firebase is absent from runtime/configuration/generator and no production resources are changed. IWSDK and a deduplicated Three.js render the same objects in desktop and XR; a fixed perspective camera is supported cleanly by IWSDK's native world API. Spatial actions use the same IWSDK RayInteractable/Pressed path as desktop canvas actions.

The canonical `apps/web` is the template, avoiding drift between two source copies. A new workspace is an allowlisted source snapshot with renamed internal scope and database identity; generated source contains no environment secrets or old provider configuration. React/DOM owns accessible browser controls; in-world meshes provide all gameplay choices, restart confirmation, status and exit. No locomotion or grabbing modifies game rules.

The working fixture is the public-information take-away game: start with fifteen tokens, take one to three, last token wins. It deliberately makes no claim of MTG support. A real optional LiteRT adapter accepts a compatible caller-supplied manifest and model. The included opponent is a deterministic heuristic; a learned policy requires a separate model and evaluation effort.

Save export is a portable, integrity-checked JSON domain envelope, not a copy of private OPFS backing files. It contains the complete game state/history and is labeled as a full local save. Import requires explicit replacement in the UI and validates format, versions, checksum and replay consistency before a transactional replacement.

Asset-only offline caching runs after TanStack prerender and waits for successful installation before reporting readiness. Static assets are versioned by content; new workers wait for current clients to close. Physical Quest persistence, controls, comfort and frame-time measurements remain a manual qualification gate.
