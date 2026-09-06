# G2 scenario coverage audit — engine 0.7

The 24 original high-risk drafts remain unexecuted as complete scenario manifests. **G2 is not satisfied:** no risk family has its two required qualified contrasts. Existing unit and persistence tests establish narrower assertions that are useful inputs to those scenarios.

The machine-readable [audit](g2-scenario-audit-0.7.json) maps all 45 expected clauses individually. Four clauses have exact assertion matches, six have bounded matches, seven have analogous fixtures, and 28 have no joined executable assertion. These labels describe the relationship between an assertion and an expectation; they do not certify a scenario, rule, card, or obligation.

## Retained execution and review

A fresh production 0.7 run passed 136 tests with 1,642 assertions across contracts, engine, simulation, and native storage. The audit joins 17 exact test-file/test-name pairs to their assertion bodies, actual JUnit cases, captured file bytes, and source expectations. It retains the original drafts' source-span and version hashes. The before and after capture contains 95 files, including 20 test files, with no drift:

- Evidence: `.commander/evidence/g2-audit-0.7-20260906T211430Z-3322f955/`.
- Snapshot SHA-256: `e3d011b3503f16e43873d8b2efce371565374d2b66bce65d4dce02562e44e0ed`.
- JUnit SHA-256: `1fd351eb03900917911ccf8167f55c6864f5c938b75a5c15041e0c444bfb89e9`.

This review is independent of the original draft author. The reviewer authored some implementation tests; the map explicitly declines to claim independent review of every test author. It does not transfer historical 0.3/0.6 review merely because a test name recurs, count isolated 0.8 work as production 0.7 execution, or turn constructed trigger states into source-backed full games.

Reproduce the join without running tests or changing evidence:

```sh
python3 docs/commander/audit-g2-scenarios.py --check
```

The check reads preserved copies of all seven historical documentary/code inputs from the evidence directory, including the reviewed runner recovered from commit `8379836`. Its SHA-256 is `2be23f143708a6acfc5b9ed32f330ea1c0ef5fdb92918a55ed84dadcd03e364e`. The report links those preserved copies and retains their original paths as metadata. The input manifest and every preserved file have checked hashes, so newer runtime, draft, or documentary changes do not change this historical audit. The check fails if retained evidence bytes no longer match; inspect that drift before producing a later version. Its local archive dependencies remain required.

## Next work

First, register explicit versioned scenario adapters for exact contrasts already supported: ordinary composition admission/rejection, insufficient payment, six-power trample allocation, removal of a nontrampler's blocker, and hidden-library observations. Each needs declared setup assumptions, source/definition pins, owned decisions, scripted commands, checked intermediate boundaries, three-resolver comparison, persistence/replay evidence, and a separate source review. A generic Bun suite invocation does not provide that manifest-level join.

The largest missing semantic foundation is a durable pending-event replacement procedure: affected-player/controller choice, ordered application, and per-event applied-instance history. It enables the two-doubler and competing-replacement contrasts and the commander hand/library destination replacement that must occur before the zone change. Other substantial gaps are resolution-time owned choices and searches, multiple target slots, continuous-effect/control provenance, conditional/meta-trigger waves, and actual loop adjudication. The JSON proposes bounded executable follow-ups without inventing qualifying card bindings.

## Scenario runner gap

The preserved 0.7 `runScenarios` implementation retains real JUnit and correctly leaves the full gate false. Its build archive excludes tests, however, and it launches tests from the live checkout without a before/after source guard. An archived runtime hash therefore does not identify all bytes that its scenario run exercised. The fresh capture above repairs this audit's own evidence join only; the finding describes the preserved implementation, not the current runner.


## Later runner validation

The hardened runner was subsequently executed against the 0.7 suites, separately from the audit above. Run `.commander/scenario-runs/f10144e4-d20c-436a-8fc2-e6c27d55b8a8/` passed 136 tests with 1,642 assertions and retained real JUnit, child exit 0, archived-runtime verification, equal before/after captures, and an empty `changedPaths` list.

- Build: `62216a0b3c787c4d2686c06a92422e56063257a5cebe15e811aa6210c1742b06`.
- Before/after source capture: `f76b1543f15e8e9a0458296921d356386dfb2222549d1808f6f225b1e5cd5614`.
- JUnit: `857f2ccb9e03ed213a91fe3cb8ddfc89858578cb00f2e6061e932c216306c3b3`.

This later run validates the hardened host's evidence behavior. It is not an additional 24-draft execution, an additional set of unique semantic assertions, or a G2 pass. Installed dependency bytes are outside the capture, and before/after checks do not isolate transient edits that are restored during execution.
