/// <reference lib="webworker" />
import { chooseHeuristic } from "@iwsdk-apps/ai";
import { observeForAi } from "@iwsdk-apps/game-core";
import {
  AiResultSchema,
  type GameState,
  SessionRequestSchema,
  type SessionResponse,
  type SessionSnapshot,
} from "@iwsdk-apps/schemas";
import { openBrowserRepository } from "@iwsdk-apps/storage-sqlite/browser";
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import { LocalCoordinator } from "./coordinator";

const scope = self as DedicatedWorkerGlobalScope;
let coordinator: LocalCoordinator | null = null;
let aiWorker: Worker | null = null;
let aiTimer: ReturnType<typeof setTimeout> | undefined;
let aiGeneration = 0;
let aiDelayMs = 550;
let stopped = false;
let handling: Promise<void> = Promise.resolve();
let snapshot: SessionSnapshot = {
  status: "loading",
  game: null,
  error: null,
  aiThinking: false,
  storage: null,
  ai: "heuristic",
};

function send(message: SessionResponse): void {
  scope.postMessage(message);
}
function publish(update: Partial<SessionSnapshot>): void {
  snapshot = { ...snapshot, ...update };
  send({ type: "snapshot", snapshot });
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function cancelAi(): void {
  aiGeneration += 1;
  aiWorker?.terminate();
  aiWorker = null;
  if (aiTimer !== undefined) clearTimeout(aiTimer);
  aiTimer = undefined;
}

function scheduleAi(state: GameState): void {
  cancelAi();
  if (stopped || state.turn !== "ai" || state.winner !== null) return;
  const generation = aiGeneration;
  const observation = observeForAi(state);
  const requestId = crypto.randomUUID();
  let finished = false;
  const finish = async (take: 1 | 2 | 3): Promise<void> => {
    if (finished || stopped || generation !== aiGeneration) return;
    finished = true;
    const current = coordinator?.getSnapshot();
    if (
      !coordinator ||
      !current ||
      current.gameId !== observation.gameId ||
      current.revision !== observation.expectedRevision ||
      current.decisionId !== observation.decisionId
    )
      return;
    cancelAi();
    try {
      await coordinator.submit(
        {
          schemaVersion: 1,
          commandId: `ai-${requestId}`,
          gameId: observation.gameId,
          expectedRevision: observation.expectedRevision,
          decisionId: observation.decisionId,
          take,
        },
        "ai",
      );
    } catch (error) {
      publish({
        aiThinking: false,
        error: `The opponent's move could not be saved. Reload to retry from the last saved turn. ${message(error)}`,
      });
    }
  };
  const fallback = () => {
    void finish(chooseHeuristic(observation));
  };
  // A crashed or timed-out policy cannot deadlock the session.
  aiTimer = setTimeout(fallback, aiDelayMs + 2000);
  try {
    aiWorker = new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" });
    aiWorker.onerror = (event) => {
      event.preventDefault();
      fallback();
    };
    aiWorker.onmessage = (event: MessageEvent<unknown>) => {
      const result = AiResultSchema.safeParse(event.data);
      if (
        !result.success ||
        result.data.requestId !== requestId ||
        JSON.stringify(result.data.observation) !== JSON.stringify(observation) ||
        !observation.legalChoices.includes(result.data.take)
      ) {
        fallback();
        return;
      }
      void finish(result.data.take);
    };
    aiWorker.postMessage({ requestId, observation, delayMs: aiDelayMs });
  } catch {
    fallback();
  }
}

function accepted(state: GameState): void {
  publish({
    status: "ready",
    game: state,
    error: null,
    storage: "sqlite-opfs",
    aiThinking: state.turn === "ai" && state.winner === null,
  });
  scheduleAi(state);
}

async function handle(data: unknown): Promise<void> {
  const parsed = SessionRequestSchema.safeParse(data);
  if (!parsed.success) {
    publish({ error: "The session received a malformed request." });
    return;
  }
  const request = parsed.data;
  try {
    if (request.type === "start") {
      if (coordinator) throw new Error("The session is already started.");
      aiDelayMs = request.aiDelayMs;
      const repository = await openBrowserRepository(
        request.namespace,
        new URL(sqliteWasmUrl, scope.location.href).href,
      );
      coordinator = new LocalCoordinator(repository, accepted);
      try {
        await coordinator.start();
      } catch (error) {
        await coordinator.close();
        coordinator = null;
        throw error;
      }
      send({ type: "result", id: request.id });
      return;
    }
    if (request.type === "close") {
      stopped = true;
      cancelAi();
      await coordinator?.close();
      coordinator = null;
      publish({ status: "closed", aiThinking: false });
      send({ type: "result", id: request.id });
      scope.close();
      return;
    }
    if (!coordinator) throw new Error("The local table is not ready.");
    if (request.type === "submit") {
      const receipt = await coordinator.submit(request.command, "human");
      send({ type: "result", id: request.id, receipt });
    } else if (request.type === "new-game" || request.type === "import") {
      cancelAi();
      if (request.type === "new-game") await coordinator.newGame();
      else await coordinator.importSave(request.json);
      send({ type: "result", id: request.id });
    } else if (request.type === "export") {
      send({ type: "result", id: request.id, json: await coordinator.exportSave() });
    }
  } catch (error) {
    publish({ status: coordinator ? "ready" : "error", error: message(error), aiThinking: false });
    send({ type: "error", id: request.id, message: message(error) });
    // A rejected import must not strand an existing AI decision.
    if (request.type === "import" || request.type === "new-game") {
      const state = coordinator?.getSnapshot();
      if (state?.turn === "ai" && state.winner === null) {
        publish({ aiThinking: true });
        scheduleAi(state);
      }
    }
  }
}

scope.onmessage = (event: MessageEvent<unknown>) => {
  handling = handling
    .then(() => handle(event.data))
    .catch((error: unknown) => {
      publish({ status: "error", error: message(error), aiThinking: false });
    });
};
