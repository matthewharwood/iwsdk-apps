---
name: litertjs
description: Add and operate browser-local LiteRT.js inference, including self-hosted WASM and tflite models, accelerator fallback, model I/O contracts, tensor cleanup, and legal-action ranking. LightRT in this project's brief refers to Google's LiteRT.js.
---

# LiteRT.js

Use `@litertjs/core` for optional local inference in the AI worker. Read the existing adapter and installed declarations first. Keep the shipped deterministic heuristic available; a missing or failing model must not stop a local game.

## Integration boundary

- The rules engine supplies the legal action set. AI ranks those actions; it does not invent legal moves, bypass phase/turn checks, or commit state.
- Include the relevant revision/request ID in inference messages. Discard stale results after a new action, reset, or unmount. The game worker revalidates the chosen action at commit time.
- Features sent to AI must respect the intended player's information. Do not leak hidden state into a policy observation merely because both workers run on one device.
- Keep model/runtime/tensor objects outside React state, Jotai, and SQLite. Persist only deliberately retained serializable outcomes and model metadata.
- A tiny arithmetic fixture proves runtime plumbing. Label it a fixture; it does not prove trained policy quality or game strategy.

## Model contract

Before adding UI, establish model version, source/license, input/output names, shapes, dtypes, preprocessing, output interpretation, and maximum input size. Validate `getInputDetails()` and `getOutputDetails()` against that contract and test known vectors. Conversion may reorder or rename tensors. A successfully loaded file alone does not validate its outputs. See [LiteRT Web guide](https://ai.google.dev/edge/litert/web).

Load the runtime and compile the model lazily when requested, never at app startup merely to display an AI label. Self-host WASM assets from the exact installed package and `.tflite` files under base-aware app URLs. Use the repository's asset-copy command instead of a CDN or hand-copied binaries. Reuse one runtime initialization promise per worker. Bound model size and concurrent requests. A failed initialization must settle callers and offer a deliberate retry or heuristic fallback.

Use WASM as the compatibility path. Treat WebGPU as a measured optimization, with full-model WASM fallback on compilation/inference failure. WebNN and mixed backend execution have additional JSPI requirements; enable only after checking the pinned runtime and actual browser support. Runtime variant selection is a worker-session decision. Do not enable threads by assumption: they have separate isolation requirements. See [runtime package](https://github.com/google-ai-edge/LiteRT/tree/main/litert/js/packages/core) and [getting started](https://developers.google.com/edge/litert/web/get_started).

## Memory, latency, and verification

Use the installed types to determine whether `run()` returns a tensor array or named map. Do not copy an example that refers to an undeclared input or calls `delete()` on an ordinary array. Release every input, output, copied/moved tensor, and compiled model using `finally` or a clearly owned lifecycle. Avoid double deletion when aliases refer to the same tensor. Await in-flight inference before disposing a model. Keep GPU readback explicit and minimize copies.

Test preprocessing and decoding as pure functions. Test real fixture inference in the browser worker with production-served WASM, a missing model, unsupported acceleration, stale result handling and resource cleanup. Record which backend actually ran. Profile headset responsiveness while inference runs; an AI worker does not eliminate CPU/GPU contention. Offline inference is verified only after all runtime/model assets needed by that variant have been cached and exercised without network.
