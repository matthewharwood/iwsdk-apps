---
name: storybook
description: Build and verify reusable React components in Storybook with shared Vite/Tailwind settings, deterministic Jotai fixtures, and interaction stories. Use for component states and Storybook configuration.
---

# Storybook components

Read the existing `.storybook` setup and installed Storybook version. Use `@storybook/react-vite`, shared styles/aliases and type-safe CSF stories. Keep Start's app/prerender plugin out of Storybook's standalone builder when sharing Vite fragments.

Give reusable visual components sibling stories covering useful empty, loading, active, disabled, error and completed states. Use `satisfies Meta<typeof Component>` and `StoryObj` to preserve argument types. A route wrapper or nonvisual module does not need a cosmetic story.

Fixtures should be explicit and deterministic. Use a fresh Jotai store per story and callback spies for component commands. Story rendering must not initialize a production database, resume real user saves or request an immersive session. An XR scene story owns and cleans up its preview runtime.

For Storybook 10 interaction helpers use the installed `storybook/test` surface; older `@storybook/test` examples may not match. Scope interactions to the story canvas, await actions/assertions and use accessible roles. Name stories intentionally because their IDs are consumed by external browser tests. See [Storybook interaction testing](https://storybook.js.org/docs/writing-tests/interaction-testing).

`bun run storybook` is the public development entry. A story rendering successfully does not prove the app's worker/persistence flow; cover that in [Playwright](../playwright/SKILL.md). Keep changes synchronized with the generator when they apply to future apps.
