import { type ModelManifest, ModelManifestSchema } from "@iwsdk-apps/schemas";
import { chooseScoredAction, type DecisionPolicy, encodeObservation } from "./index";

async function checksum(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Optional integration point; no trained model is shipped or loaded by the demo. */
export async function createLiteRtPolicy(
  input: ModelManifest,
  wasmDirectory: string,
  signal?: AbortSignal,
): Promise<DecisionPolicy> {
  const manifest = ModelManifestSchema.parse(input);
  signal?.throwIfAborted();
  const url = new URL(manifest.modelUrl, globalThis.location.href);
  if (url.origin !== globalThis.location.origin)
    throw new Error("Host the model on the application origin for local inference.");
  const response = await fetch(url, { signal: signal ?? null });
  if (!response.ok) throw new Error(`Model download failed (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 32 * 1024 * 1024)
    throw new Error("The example model exceeds the 32 MiB limit.");
  if ((await checksum(bytes)) !== manifest.sha256)
    throw new Error("Model checksum does not match its manifest.");
  signal?.throwIfAborted();
  const runtime = await import("@litertjs/core");
  await (runtime.getGlobalLiteRtPromise() ?? runtime.loadLiteRt(wasmDirectory));
  signal?.throwIfAborted();
  const model = await runtime.loadAndCompile(bytes, { accelerator: manifest.accelerator });
  let activeRuns = 0;
  let closed = false;
  try {
    signal?.throwIfAborted();
    const inputs = model.getInputDetails();
    const outputs = model.getOutputDetails();
    if (
      inputs.length !== 1 ||
      outputs.length !== 1 ||
      inputs[0]?.dtype !== manifest.dataType ||
      outputs[0]?.dtype !== manifest.dataType ||
      JSON.stringify(Array.from(inputs[0]?.shape ?? [])) !== JSON.stringify(manifest.inputShape) ||
      JSON.stringify(Array.from(outputs[0]?.shape ?? [])) !== JSON.stringify(manifest.outputShape)
    ) {
      throw new Error("The model tensor contract does not match token-table-v1.");
    }
  } catch (error) {
    model.delete();
    throw error;
  }
  return {
    async choose(observation, decisionSignal) {
      decisionSignal?.throwIfAborted();
      if (closed) throw new Error("The model policy is closed.");
      activeRuns += 1;
      let tensor: InstanceType<typeof runtime.Tensor> | null = null;
      let outputs: Awaited<ReturnType<typeof model.run>> | null = null;
      try {
        tensor = new runtime.Tensor(encodeObservation(observation), manifest.inputShape);
        outputs = await model.run(tensor);
        decisionSignal?.throwIfAborted();
        if (closed) throw new Error("The model policy was closed while inference was running.");
        const output = Object.values(outputs)[0];
        if (!output) throw new Error("The model returned no tensor.");
        const data = await output.data();
        decisionSignal?.throwIfAborted();
        if (closed) throw new Error("The model policy was closed while output was being read.");
        return chooseScoredAction(observation, data);
      } finally {
        tensor?.delete();
        if (outputs) for (const output of Object.values(outputs)) output.delete();
        activeRuns -= 1;
        if (closed && activeRuns === 0) model.delete();
      }
    },
    close() {
      if (closed) return;
      closed = true;
      if (activeRuns === 0) model.delete();
    },
  };
}
