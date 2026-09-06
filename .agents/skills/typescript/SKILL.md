---
name: typescript
description: Maintain strict TypeScript and tsgo configuration across app, worker and tooling packages. Use for type-checking failures, shared configuration, package exports, and browser/worker environment types.
---

# TypeScript

Read shared tsconfig packages and installed `@typescript/native-preview` before editing configuration. `tsgo --noEmit` checks types; Vite/Bun handle bundling and execution. Do not assume a native-preview release is interchangeable with any online TypeScript example.

Keep browser and worker globals in their appropriate compilation environments. UI types should not need `DedicatedWorkerGlobalScope`, and a worker should not gain access to `document` through a loose ambient declaration. Prefer explicit worker entrypoint config or a narrow, documented global typing boundary.

Derive boundary types from [Zod](../zod/SKILL.md). Normal internal function signatures, component callbacks, platform/SDK interfaces and generics do not need invented runtime schemas. Do not duplicate an existing schema with a hand-written interface.

Keep type-only imports explicit. Resolve cross-workspace imports through declared exports and dependencies; do not use casts or broad path aliases to hide a missing package export. Treat unknown inputs as unknown until parsed. A single adapter cast may bridge an upstream incomplete declaration after runtime validation; explain it and avoid spreading it through callers.

Generated route trees belong to the routing plugin. Do not patch generated types to make checks pass. Generated app and independent-workspace checks must cover the shared packages that export the real types.
