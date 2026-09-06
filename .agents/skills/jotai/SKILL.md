---
name: jotai
description: Maintain Jotai snapshots and derived UI state over the local game worker. Use for hydration, command actions, revision ordering and React/XR state subscriptions; SQLite remains durable authority.
---

# Jotai projections

Create an explicitly owned store for the mounted app or isolated story. Keep serializable committed snapshots, loading/error state and derived selectors in atoms. Workers, Worlds, SQLite connections, tensors and pending RPC maps belong in client services.

Initialize once through the game-worker client. Parse returned messages, then publish the hydrated snapshot. A UI command sets its own pending status, invokes the worker, and applies the validated committed response. A SQL failure leaves the last committed snapshot intact. Do not add atom-level localStorage/IndexedDB persistence that creates another authority.

Use expected revisions/request IDs to reject stale responses. Reset/import changes should invalidate outstanding AI and command responses. Atomic publication should keep state, legal actions and result information from the same revision together. Separate transient progress indicators from domain snapshots.

Use derived atoms for turn labels, legal controls and view models. Subscribe narrowly with `useAtomValue` and send actions through the app's facade. XR observes the same snapshot and dispatches the same action type as React. Neither renderer should mutate a shared snapshot in place.

Stories use a fresh store with explicit states and deterministic command callbacks. Real persistence tests use the real worker/browser path. Test hydration failures and command rejection as states users can recover from, not as permanently unresolved Suspense promises.
