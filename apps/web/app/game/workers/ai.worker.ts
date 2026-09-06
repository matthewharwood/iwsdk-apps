/// <reference lib="webworker" />
import { chooseHeuristic } from "@iwsdk-apps/ai";
import { AiRequestSchema, type AiResult } from "@iwsdk-apps/schemas";

const scope = self as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<unknown>) => {
  const request = AiRequestSchema.parse(event.data);
  // Work is strictly bounded to three legal candidates. Terminating this worker
  // cancels both the optional presentation delay and future expensive policies.
  setTimeout(() => {
    const result: AiResult = {
      requestId: request.requestId,
      observation: request.observation,
      take: chooseHeuristic(request.observation),
      policy: "heuristic",
    };
    scope.postMessage(result);
  }, request.delayMs);
};
