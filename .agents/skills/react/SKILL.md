---
name: react
description: Build React 19 UI with the React Compiler, safe worker and IWSDK lifecycles, accessible desktop controls, and component states. Use for React implementation and lifecycle defects.
---

# React presentation

Render committed state using semantic components. Keep game rules and SQLite writes in the game worker. Local focus, disclosure and input-draft state may stay in React. Jotai publishes cross-component domain snapshots; see [Jotai](../jotai/SKILL.md).

The React Compiler handles routine memoization when enabled by the existing Vite configuration. Do not add `useMemo`, `useCallback` or `React.memo` automatically; use them only for a demonstrated identity/performance requirement the current setup does not address. Purity is still required: no worker creation, World creation, SQL, model loading, random state generation, or DOM mutation during render. See [React Compiler](https://react.dev/learn/react-compiler).

Own browser resources in effects or explicit client services. Cleanup listeners and subscriptions, guard async resolution after unmount, and preserve a single worker/World owner during Strict Mode remounts. React does not await an async effect cleanup: serialize a replacement session's startup behind the previous same-document session's completed shutdown. Preserve real second-tab rejection. UI rerenders must not reopen the database. A rejected startup promise must produce a visible error and a defined retry path rather than an infinite spinner.

Represent loading, ready, empty, temporary storage, locked storage and failure states explicitly. Disable pending or illegal actions based on the worker's snapshot. Keep keyboard and pointer operation possible without a headset. Provide accessible names, visible focus and announced outcomes; color alone is insufficient feedback. Essential immersive actions need XR controls as well as DOM controls.

Author sibling stories for reusable visual components using [Storybook](../storybook/SKILL.md). Test user-visible behavior at the smallest useful tier. Pure reducers do not need UI tests, and a structural route wrapper does not need a meaningless story merely because its file ends in `.tsx`.
