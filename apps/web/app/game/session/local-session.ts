import {
  type CommandReceipt,
  type GameCommand,
  type SessionRequest,
  SessionRequestSchema,
  type SessionResponse,
  SessionResponseSchema,
  type SessionSnapshot,
  type Take,
} from "@iwsdk-apps/schemas";

export type { SessionSnapshot } from "@iwsdk-apps/schemas";
export interface LocalSession {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  submit(input: { take: Take; commandId?: string }): Promise<CommandReceipt>;
  newGame(): Promise<void>;
  exportSave(): Promise<string>;
  /** Explicitly replaces the one active save after validation; caller presents this policy. */
  importSave(json: string): Promise<void>;
  close(): Promise<void>;
}

type Result = Extract<SessionResponse, { type: "result" }>;
type Pending = {
  resolve: (value: Result) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

// Route changes / StrictMode remounts share a document and await graceful VFS
// teardown. Other tabs have their own map and still fail fast on the Web Lock.
const sessionLifetimes = new Map<string, Promise<void>>();

// Construct only after client mount. Importing this module during prerender is safe.
export function createLocalSession(
  options: { namespace?: string; aiDelayMs?: number } = {},
): LocalSession {
  const namespace = options.namespace ?? "web";
  let snapshot: SessionSnapshot = {
    status: "loading",
    game: null,
    error: null,
    aiThinking: false,
    storage: null,
    ai: "heuristic",
  };
  const listeners = new Set<() => void>();
  const pending = new Map<string, Pending>();
  const commands = new Map<string, GameCommand>();
  let worker: Worker | null = null;
  let starting: Promise<void> | null = null;
  let closing: Promise<void> | null = null;
  let closed = false;
  let releaseOwnership = () => {};

  function publish(next: SessionSnapshot): void {
    snapshot = next;
    for (const listener of listeners) listener();
  }
  function fail(error: Error): void {
    worker?.terminate();
    worker = null;
    releaseOwnership();
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
    if (!closed) publish({ ...snapshot, status: "error", error: error.message, aiThinking: false });
  }
  function send(request: SessionRequest): Promise<Result> {
    const parsed = SessionRequestSchema.parse(request);
    if (!worker)
      return Promise.reject(
        new Error("The local session worker is unavailable. Reload to restore the saved table."),
      );
    return new Promise<Result>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          fail(
            new Error(
              "The local worker stopped responding. Reload to recover the last saved table.",
            ),
          ),
        30_000,
      );
      pending.set(parsed.id, { resolve, reject, timer });
      worker?.postMessage(parsed);
    });
  }
  function ready(): void {
    if (closed || snapshot.status !== "ready" || !snapshot.game)
      throw new Error("The local table is not ready.");
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (closed) return Promise.reject(new Error("The local session is closed."));
      if (starting) return starting;
      const predecessor = sessionLifetimes.get(namespace);
      let releaseLifetime = () => {};
      const lifetime = new Promise<void>((resolve) => {
        releaseLifetime = resolve;
      });
      sessionLifetimes.set(namespace, lifetime);
      releaseOwnership = () => {
        void Promise.resolve(predecessor).then(() => {
          releaseLifetime();
          if (sessionLifetimes.get(namespace) === lifetime) sessionLifetimes.delete(namespace);
        });
      };
      starting = (async () => {
        await predecessor;
        if (closed) throw new Error("The local session closed before startup.");
        worker = new Worker(new URL("../workers/game.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.onerror = (event) => {
          event.preventDefault();
          fail(new Error(event.message || "The local game worker crashed."));
        };
        worker.onmessageerror = () =>
          fail(new Error("The local worker sent an unreadable message."));
        worker.onmessage = (event: MessageEvent<unknown>) => {
          const parsed = SessionResponseSchema.safeParse(event.data);
          if (!parsed.success) {
            fail(new Error("The local worker returned an invalid response."));
            return;
          }
          const response = parsed.data;
          if (response.type === "snapshot") {
            if (!closed) publish(response.snapshot);
            return;
          }
          const item = pending.get(response.id);
          if (!item) return;
          clearTimeout(item.timer);
          pending.delete(response.id);
          if (response.type === "error") item.reject(new Error(response.message));
          else item.resolve(response);
        };
        await send({
          type: "start",
          id: crypto.randomUUID(),
          namespace,
          aiDelayMs: options.aiDelayMs ?? 550,
        });
      })().catch((error: unknown) => {
        fail(error instanceof Error ? error : new Error(String(error)));
        releaseOwnership();
        throw error;
      });
      return starting;
    },
    async submit(input) {
      ready();
      const game = snapshot.game;
      if (!game) throw new Error("The local table has no game.");
      const commandId = input.commandId ?? crypto.randomUUID();
      const previous = commands.get(commandId);
      if (previous && previous.take !== input.take)
        throw new Error("This command ID was already used for a different move.");
      const command: GameCommand = previous ?? {
        schemaVersion: 1,
        gameId: game.gameId,
        commandId,
        expectedRevision: game.revision,
        decisionId: game.decisionId,
        take: input.take,
      };
      commands.set(commandId, command);
      const result = await send({ type: "submit", id: crypto.randomUUID(), command });
      if (!result.receipt) throw new Error("The worker did not acknowledge a durable move.");
      return result.receipt;
    },
    async newGame() {
      ready();
      await send({ type: "new-game", id: crypto.randomUUID() });
      commands.clear();
    },
    async exportSave() {
      ready();
      const result = await send({ type: "export", id: crypto.randomUUID() });
      if (typeof result.json !== "string") throw new Error("The worker did not return a save.");
      return result.json;
    },
    async importSave(json) {
      ready();
      await send({ type: "import", id: crypto.randomUUID(), json });
      commands.clear();
    },
    close() {
      if (closing) return closing;
      closed = true;
      closing = (async () => {
        try {
          if (worker) await send({ type: "close", id: crypto.randomUUID() });
        } finally {
          fail(new Error("The local session was closed."));
          publish({ ...snapshot, status: "closed", aiThinking: false });
          listeners.clear();
          releaseOwnership();
        }
      })();
      return closing;
    },
  };
}
