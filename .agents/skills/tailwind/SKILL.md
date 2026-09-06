---
name: tailwind
description: Maintain Tailwind CSS v4, shared design tokens and accessible responsive styles for the desktop UI and Storybook. Use for CSS/UI styling, not spatial Three.js materials.
---

# Tailwind and desktop UI

Use the existing `@tailwindcss/vite` integration, `@import "tailwindcss"`, and CSS-first tokens. Keep application and Storybook styles aligned. Do not add a separate legacy Tailwind configuration or duplicate token definitions to fix a missing class. See [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite).

Keep class names statically discoverable. Map finite states to complete class strings instead of constructing class fragments from values. Use CSS custom properties for genuinely dynamic values and preserve readable contrast in selected, disabled, error and focus states.

The canvas host needs explicit nonzero dimensions and responsive resizing. Provide a usable desktop interface at touch/tablet sizes, with visible focus and sufficiently separated actions. Respect reduced motion for decorative transitions. Layout CSS does not alter spatial scale or XR raycast targets; coordinate those through the IWSDK adapter.

Run the configured Stylelint check for CSS and Biome for its configured code surfaces. Preserve Tailwind directive support. Avoid permanent `will-change`, gratuitous animation dependencies and scrolling/layout effects that obscure controls.
