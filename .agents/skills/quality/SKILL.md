---
name: quality
description: Run and maintain the starter's Biome, Stylelint, SonarJS, type, unit, build and browser quality gates. Use for gate failures or tooling configuration, with checks appropriate to the actual change.
---

# Quality gates

Read root/workspace scripts to discover what `bun run check:fast` and `bun run check` currently execute. Do not infer passing browser coverage from lint or a build. Run focused checks during implementation, then the required gate for the completed scope. Report exact checks and meaningful limitations.

- Biome owns configured code formatting/lint. Generated outputs and dependencies should be excluded deliberately, not through broad ignores that hide source.
- Stylelint owns CSS validation, including the configured Tailwind syntax. Do not create conflicting formatter/linter ownership.
- SonarJS is the focused local ESLint plugin pass. Keep rule policy proportional to actual bugs/complexity; no server, scanner account or provider token is needed.
- Typechecking, pure unit tests, real production build and browser behavior each supply distinct evidence. Include shared packages and the actual generated workspace in appropriate checks; a missing canonical template must fail clearly.

Fix the underlying defect before suppressing a finding. A narrow suppression for an upstream limitation needs a specific reason. Do not skip tests, weaken assertions, or silently fall back to an older build to produce a green gate. Tests should verify observable behavior and important invariants, not mirror implementation text.

Keep configuration shared where it is actually reusable. A library update may require deliberate rule changes; do not paste config for another major. Do not add a score-based scanner or dead-code tool simply because an old skill listed it.

For dev-server conflicts, inspect the owned process and actual port. Stop only processes created for this task/workspace after identifying them. Blanket `pkill`, port-wide `kill -9`, deleting lockfiles, and cache wipes are not standard verification steps.

Foundational changes also need a generated app to pass. See [Turborepo](../turborepo/SKILL.md). Physical XR evidence remains separate from [Playwright](../playwright/SKILL.md).
