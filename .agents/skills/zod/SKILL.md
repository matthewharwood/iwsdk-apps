---
name: zod
description: Define and evolve runtime contracts for worker messages, actions, saved state, replays, imports, model metadata and public configuration with Zod. Use when data crosses a trust or persistence boundary.
---

# Runtime contracts

Use the installed Zod major and derive types with `z.infer`/`z.input` as appropriate. Keep schemas shared between message producers and consumers. Parse worker ingress and egress, SQL-decoded JSON, imported/exported records, model metadata/results, route input, and public environment configuration before use.

Discriminated unions make worker request/result variants explicit. Include request IDs, expected revisions and schema/version tags where their semantics require them. Restrict identifiers, integer ranges and collection sizes. Reject unknown action fields when silently accepting them would hide a caller/version error. Distinguish protocol errors, illegal moves, storage failures and runtime failures.

Shape validation does not prove an action is legal in a particular state. Legality belongs to the pure domain engine after schema validation. Likewise a syntactically valid replay still needs transition/revision validation. Keep schemas independent of browser-only SDK objects.

Do not remove boundary parsing from production; persisted data and worker messages can be invalid there too. Component callback signatures and ephemeral SDK objects do not require serialization schemas. Model/World/tensor/database handles should never be accepted as durable records.

For migrations, parse the old version before transforming it and validate the new result. Preserve failure evidence without publishing invalid state. Prefer `safeParse` when errors are expected UX outcomes and `parse` when an enclosing boundary owns the failure. Render concise errors rather than dumping private state. Public `VITE_*` configuration is browser-visible; validate it without implying it can contain secrets.
