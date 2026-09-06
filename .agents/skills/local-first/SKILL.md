---
name: local-first
description: Design or review the local WebXR application's domain-worker boundary, deterministic commands/replays, presentation projections, and optional AI worker. Use for cross-layer architecture changes and new game adapters.
---

# Local application boundaries

The starter is a reusable application platform plus a small take-1–3 token game demonstrating the contracts. That example is not a general card-game rules engine. Keep game content, rules and strategy out of a blank workspace's infrastructure.

The data flow is:

```text
DOM / XR input -> validated command -> game worker (pure engine + SQLite)
                                      | commit succeeds
                                      v
                                  snapshot -> Jotai -> DOM / XR
engine legal actions -> AI worker -> recommendation -> ordinary validated command
```

The engine owns legality and state transitions. It should take explicit state, actions and deterministic randomness as inputs; do not read wall time, DOM, renderer objects or network during reduction. Preserve seed/version/action ordering needed for replay. A replay must reproduce validated domain state, not merely restore a visual arrangement.

The game worker owns command serialization, revision checks and durable commits. SQLite is local authority. Jotai is the reactive projection, and IWSDK is presentation. Keep worker protocol schemas centralized. Error responses must identify the failed request without pretending a commit succeeded. Exact command retries preserve the original full envelope, including expected revision and decision ID; reusing only an ID with reconstructed current-state fields is a conflicting command. The convenience UI facade remembers those envelopes for its page session; durable receipt replay is a coordinator-level contract. See [SQLite](../sqlite/SKILL.md), [Zod](../zod/SKILL.md), and [Jotai](../jotai/SKILL.md) for their boundaries.

AI consumes bounded observations and legal actions in its own worker. Its output is advisory and revision-scoped. Read [LiteRT.js](../litertjs/SKILL.md) when using a model. Deterministic heuristics remain useful defaults and honest fallbacks.

The application is browser-local and serves static assets. Do not introduce cloud accounts, synchronization, telemetry, provider configuration, or a runtime server as an incidental dependency. Such product changes need an actual request. Network-free gameplay after load and cold offline launch are different capabilities: the latter requires an implemented, tested asset-cache/service-worker lifecycle.

For a new application, specify its action/state schema, legal-action generation, pure reducer, initial state, view model, and optional policy observation. Preserve infrastructure ownership. Apply reusable changes to the generator and test a generated app; keep product mechanics in the selected app or its own domain package.
