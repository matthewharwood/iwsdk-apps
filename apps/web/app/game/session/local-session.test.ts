import { expect, test } from "bun:test";
import { createGame } from "@iwsdk-apps/game-core";
import type { SessionRequest, SessionResponse } from "@iwsdk-apps/schemas";
import { createLocalSession } from "./local-session";

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  requests: SessionRequest[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: { preventDefault(): void; message: string }) => void) | null = null;
  terminated = false;
  constructor() {
    ControlledWorker.instances.push(this);
  }
  postMessage(request: SessionRequest) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  emit(response: SessionResponse) {
    this.onmessage?.({ data: response } as MessageEvent<unknown>);
  }
  acknowledge(type: SessionRequest["type"]) {
    const request = this.requests.find((item) => item.type === type);
    if (!request) throw new Error(`No ${type} request was received.`);
    if (type === "start")
      this.emit({
        type: "snapshot",
        snapshot: {
          status: "ready",
          game: createGame("lifecycle-test", "2026-09-06T00:00:00.000Z"),
          error: null,
          aiThinking: false,
          storage: "sqlite-opfs",
          ai: "heuristic",
        },
      });
    this.emit({ type: "result", id: request.id });
  }
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function instance(index: number): ControlledWorker {
  const worker = ControlledWorker.instances[index];
  if (!worker) throw new Error(`Worker ${index} has not started.`);
  return worker;
}
async function withWorkers(run: () => Promise<void>): Promise<void> {
  const original = globalThis.Worker;
  ControlledWorker.instances = [];
  globalThis.Worker = ControlledWorker as unknown as typeof Worker;
  try {
    await run();
  } finally {
    globalThis.Worker = original;
  }
}

test("remount waits for the previous worker's storage-close acknowledgment", async () => {
  await withWorkers(async () => {
    const first = createLocalSession({ namespace: "lifecycle-graceful" });
    const startFirst = first.start();
    await tick();
    const closingFirst = first.close();
    const second = createLocalSession({ namespace: "lifecycle-graceful" });
    const startSecond = second.start();
    await tick();
    expect(ControlledWorker.instances).toHaveLength(1);
    instance(0).acknowledge("start");
    instance(0).acknowledge("close");
    await Promise.all([startFirst, closingFirst]);
    await tick();
    expect(instance(0).terminated).toBe(true);
    expect(ControlledWorker.instances).toHaveLength(2);
    instance(1).acknowledge("start");
    await startSecond;
    expect(second.getSnapshot().status).toBe("ready");
    const closingSecond = second.close();
    instance(1).acknowledge("close");
    await closingSecond;
  });
});

test("cleanup before initialization cannot create an orphan worker", async () => {
  await withWorkers(async () => {
    const first = createLocalSession({ namespace: "lifecycle-immediate" });
    const startFirst = first.start().catch((error: unknown) => error);
    await first.close();
    await startFirst;
    expect(ControlledWorker.instances).toHaveLength(0);
    const second = createLocalSession({ namespace: "lifecycle-immediate" });
    const starting = second.start();
    await tick();
    instance(0).acknowledge("start");
    await starting;
    const closing = second.close();
    instance(0).acknowledge("close");
    await closing;
  });
});

test("a canceled queued remount cannot let a third session bypass the active owner", async () => {
  await withWorkers(async () => {
    const first = createLocalSession({ namespace: "lifecycle-chain" });
    const startFirst = first.start();
    await tick();
    instance(0).acknowledge("start");
    await startFirst;
    const second = createLocalSession({ namespace: "lifecycle-chain" });
    const startSecond = second.start().catch((error: unknown) => error);
    await second.close();
    const third = createLocalSession({ namespace: "lifecycle-chain" });
    const startThird = third.start();
    await tick();
    expect(ControlledWorker.instances).toHaveLength(1);
    const closingFirst = first.close();
    instance(0).acknowledge("close");
    await closingFirst;
    await startSecond;
    await tick();
    expect(ControlledWorker.instances).toHaveLength(2);
    instance(1).acknowledge("start");
    await startThird;
    const closingThird = third.close();
    instance(1).acknowledge("close");
    await closingThird;
  });
});

test("a crashed worker releases same-document ownership for a safe retry", async () => {
  await withWorkers(async () => {
    const first = createLocalSession({ namespace: "lifecycle-crash" });
    const startFirst = first.start();
    await tick();
    instance(0).acknowledge("start");
    await startFirst;
    const second = createLocalSession({ namespace: "lifecycle-crash" });
    const startSecond = second.start();
    await tick();
    expect(ControlledWorker.instances).toHaveLength(1);
    instance(0).onerror?.({ preventDefault() {}, message: "worker crashed" });
    await tick();
    expect(first.getSnapshot().status).toBe("error");
    expect(instance(0).terminated).toBe(true);
    expect(ControlledWorker.instances).toHaveLength(2);
    instance(1).acknowledge("start");
    await startSecond;
    await first.close();
    const closing = second.close();
    instance(1).acknowledge("close");
    await closing;
  });
});
