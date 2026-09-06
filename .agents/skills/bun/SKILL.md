---
name: bun
description: Manage Bun workspace dependencies and lockfiles, write repository tooling, and run pure unit tests. Use for Bun installation/runtime/test problems; browser SQLite and XR behavior require browser verification.
---

# Bun toolchain

Read the root `packageManager` field for the pinned version; do not repeat a version in a skill that can drift. Keep `bun.lock` tracked and use `bun install --frozen-lockfile` for reproducibility. Target dependencies at the package that imports them; root development dependencies are shared tooling. Workspace packages use `workspace:*`.

Use root scripts for supported workflows and `bunx` when invoking an installed tool directly is useful. Inspect executable resolution when a tool requires Node; do not change the project's application runtime to accommodate a CLI. Browser code is bundled by Vite, and cannot use `Bun.file`, `Bun.serve`, `bun:sqlite`, Node filesystem APIs or shell helpers.

Use `bun:test` for pure domain transitions, legal actions, deterministic policy decisions, replay validation, schemas, worker-protocol helpers, and generator behavior. Check meaningful invariants and failure paths. Browser mocks do not establish OPFS, WASM serving, input permissions, WebGL, or XR support. Those belong to [Playwright](../playwright/SKILL.md) and device tests.

Repository scripts must report failures through exit codes, preserve argv boundaries, and fail before overwriting existing data. Avoid concatenating untrusted names into shell commands. Retain child-process handles and stop only owned processes; do not run blanket `pkill` or kill whichever process happens to occupy a port.

When adding dependencies, update the lockfile and verify the actual generated workspace installs. Do not delete the lockfile or suppress install scripts to hide an incompatibility. Use [Bun documentation](https://bun.sh/docs) and the installed CLI help for flags that differ by version.
