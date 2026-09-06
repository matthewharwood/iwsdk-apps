---
name: turborepo
description: Maintain the Turborepo task graph, app generator, and blank workspace generator, including reproducible dependencies, safe destination handling, and generated-app verification.
---

# Turborepo and generators

Read root `package.json`, `turbo.json`, the generator scripts, and their source-inclusion policy before modifying workspace behavior. `apps/web` is the canonical runnable app template. Internal dependencies use `workspace:*` and scope `@iwsdk-apps/*`.

- `bun run gen:app <name>` adds an app to this workspace from the canonical template.
- `bun run gen:workspace <destination> [--name <name>]` creates an independent monorepo with a neutral runnable starter app, tooling, shared packages and skills. “Blank” means free of product-specific content and saves; the small token-game example is included to demonstrate the integration.
- `bun run dev`, `build`, `check:fast`, and `check` are the public workflow. Preserve explicit app selection when several workspaces exist; avoid guessing the first app.

Validate names and destinations before writing. Reject traversal, absolute app names, all existing targets (including empty directories), destination symlinks and recursive copies into the source. A failed generation must not overwrite user files. Copy source through an explicit inclusion policy; exclude `.git`, dependencies, build/cache files, local browser state, credentials and generated artifacts. Do not install dependencies or initialize Git as an undocumented side effect.

Namespace app database pools, storage keys, worker channels, manifests and package names together. A cloned app must not collide with its sibling's saved state. Keep templating limited to declared placeholders; JSON and TypeScript braces must survive unchanged.

Use Turbo's `tasks` schema. Mark long-running development tasks persistent and uncached. Cache outputs and environment inputs according to their actual effect; typechecking and linting should not claim build directories they do not create. Fail clearly when the canonical template or required package sources are missing; empty package shells are not a passing generator result.

For foundational changes, update the shared implementation, canonical app, generator substitutions, and owning skill/docs together. Exercise both public generators in disposable locations. Install, typecheck, unit-test and build the generated app, and verify the independent workspace contains the intended neutral example with distinct storage namespace. Do not prove a generator by testing only its source template. Test rejection of unsafe names and occupied destinations when changing generator logic.

Upstream reference: [Turborepo code generation](https://turborepo.com/docs/guides/generating-code). Prefer repository wrapper commands over upstream examples with different argument syntax.
