# Optional local LiteRT.js policy

The requested “LightRT” is interpreted as Google's **LiteRT.js**, already present in Snapmatch. The starter retains the source-tested `@litertjs/core` 2.5.3. It does not include a trained model, a training pipeline or a learned-policy performance claim.

The active `ai.worker` runs `chooseHeuristic`: leave a multiple of four when possible. Every decision is checked against the current game ID, revision, decision ID and legal candidates; timeout or worker failure uses a legal heuristic response. New games/imports cancel old work.

`@iwsdk-apps/ai/litert` exports `createLiteRtPolicy(manifest, wasmDirectory, signal)`. Import it only inside the AI worker after an explicit feature choice. Host a real compatible `.tflite` file and the installed runtime's `wasm/` assets on the app origin. The adapter verifies the model hash, input/output dtype and tensor shapes, uses the manifest accelerator, disposes tensor outputs and the compiled model, and exposes `choose`/`close`.

Current demonstration encoder contract is `token-table-v1`: a Float32 input `[1,1]` containing remaining tokens / 15, and Float32 output `[1,3]` containing scores for taking one, two and three. Invalid/unavailable actions are excluded after inference. Manifest schema is in `packages/schemas`; `chooseWithFallback` in `packages/ai` demonstrates safe error fallback. A real product must version its own encoder and model together.

Run inference in the worker and retain its bounded scheduling/cancellation wrapper. Promise cancellation cannot interrupt a GPU dispatch; terminate the worker when required and drop late results. Do not add model initialization to React render or static prerender. The active sample does not fetch any LiteRT runtime or model. Adding a model requires explicit asset download/offline-readiness handling and independent CPU/WebGPU + active-XR measurements.

Primary sources: [Google LiteRT.js guide](https://ai.google.dev/edge/litert/web), [runtime source](https://github.com/google-ai-edge/LiteRT/tree/main/litert/js). Installed package declarations are authoritative for the pinned API.
