import { applyCommand, createGame, GameRuleError, validateSavedGame } from "@iwsdk-apps/game-core";
import {
  type CommandReceipt,
  type GameCommand,
  GameCommandSchema,
  type GameState,
  type SavedGame,
  type Seat,
} from "@iwsdk-apps/schemas";
import { exportSave, type GameRepository, importSave } from "@iwsdk-apps/storage-sqlite";

/** Serializes the complete read/validate/commit/publish boundary. */
export class LocalCoordinator {
  private current: GameState | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly repository: GameRepository,
    private readonly publish: (state: GameState) => void,
    private readonly identity: () => string = () => crypto.randomUUID(),
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  getSnapshot(): GameState | null {
    return this.current;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      if (this.closed) throw new Error("The local session is closed.");
      return operation();
    });
    this.queue = next.catch(() => {});
    return next;
  }

  private accept(state: GameState): void {
    this.current = state;
    this.publish(state);
  }

  start(): Promise<void> {
    return this.serialize(async () => {
      const saved = await this.repository.load();
      if (saved) this.accept(validateSavedGame(saved).state);
      else {
        const state = createGame(this.identity(), this.clock());
        await this.repository.replace({ state, accepted: [] });
        this.accept(state);
      }
    });
  }

  submit(input: GameCommand, seat: Seat): Promise<CommandReceipt> {
    return this.serialize(async () => {
      const command = GameCommandSchema.parse(input);
      const previous = await this.repository.findAccepted(command.commandId);
      if (previous) {
        if (
          JSON.stringify(previous.command) !== JSON.stringify(command) ||
          previous.receipt.actor !== seat
        ) {
          throw new GameRuleError(
            "command-id-conflict",
            "This command ID was already used for a different move.",
          );
        }
        return previous.receipt;
      }
      if (!this.current) throw new Error("The table has not loaded yet.");
      // Wall clock is metadata only; preserve monotonic diagnostic timestamps.
      const now = this.clock();
      const timestamp = now < this.current.updatedAt ? this.current.updatedAt : now;
      const candidate = applyCommand(this.current, command, seat, timestamp);
      const receipt: CommandReceipt = {
        schemaVersion: 1,
        commandId: command.commandId,
        gameId: candidate.gameId,
        actor: seat,
        take: command.take,
        previousRevision: command.expectedRevision,
        revision: candidate.revision,
        decisionId: command.decisionId,
        acceptedAt: timestamp,
      };
      await this.repository.commit(candidate, { command, receipt });
      this.accept(candidate);
      return receipt;
    });
  }

  newGame(): Promise<void> {
    return this.serialize(async () => {
      const state = createGame(this.identity(), this.clock());
      await this.repository.replace({ state, accepted: [] });
      this.accept(state);
    });
  }

  exportSave(): Promise<string> {
    return this.serialize(async () => {
      const saved = await this.repository.load();
      if (!saved) throw new Error("There is no saved game to export.");
      return exportSave(saved);
    });
  }

  importSave(json: string): Promise<void> {
    return this.serialize(async () => {
      const saved: SavedGame = await importSave(json);
      await this.repository.replace(saved);
      this.accept(saved.state);
    });
  }

  async close(): Promise<void> {
    await this.queue;
    if (this.closed) return;
    this.closed = true;
    this.repository.close();
  }
}
