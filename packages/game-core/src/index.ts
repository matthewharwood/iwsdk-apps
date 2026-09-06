import {
  type AiObservation,
  type GameCommand,
  GameCommandSchema,
  type GameState,
  GameStateSchema,
  type SavedGame,
  SavedGameSchema,
  type Seat,
  type Take,
} from "@iwsdk-apps/schemas";

export class GameRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GameRuleError";
  }
}

export function decisionId(gameId: string, revision: number): string {
  return `${gameId}:${revision}`;
}

// Identity and diagnostic timestamps are injected. Rules never read clock/randomness.
export function createGame(gameId: string, timestamp: string): GameState {
  return GameStateSchema.parse({
    schemaVersion: 1,
    rulesVersion: 1,
    gameId,
    revision: 0,
    decisionId: decisionId(gameId, 0),
    remaining: 15,
    turn: "human",
    winner: null,
    history: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function getLegalChoices(state: GameState): Take[] {
  return state.winner === null
    ? ([1, 2, 3] as const).filter((take) => take <= state.remaining)
    : [];
}

export function applyCommand(
  state: GameState,
  input: GameCommand,
  actor: Seat,
  timestamp: string,
): GameState {
  const command = GameCommandSchema.parse(input);
  if (command.gameId !== state.gameId)
    throw new GameRuleError("wrong-game", "This move belongs to another game.");
  if (command.expectedRevision !== state.revision || command.decisionId !== state.decisionId) {
    throw new GameRuleError(
      "stale-decision",
      "The table changed. Choose again from the current turn.",
    );
  }
  if (state.winner !== null) throw new GameRuleError("finished", "This game has already finished.");
  if (actor !== state.turn) throw new GameRuleError("wrong-seat", "It is not your turn.");
  if (!getLegalChoices(state).includes(command.take))
    throw new GameRuleError("illegal-choice", "That many tokens are not available.");
  const remaining = state.remaining - command.take;
  const revision = state.revision + 1;
  return GameStateSchema.parse({
    ...state,
    remaining,
    revision,
    decisionId: decisionId(state.gameId, revision),
    turn: remaining === 0 ? actor : actor === "human" ? "ai" : "human",
    winner: remaining === 0 ? actor : null,
    updatedAt: timestamp,
    history: [...state.history, { actor, take: command.take, remaining, revision }],
  });
}

export function observeForAi(state: GameState): AiObservation {
  if (state.turn !== "ai" || state.winner !== null)
    throw new GameRuleError("no-ai-decision", "No AI decision is pending.");
  return {
    schemaVersion: 1,
    gameId: state.gameId,
    expectedRevision: state.revision,
    decisionId: state.decisionId,
    remaining: state.remaining,
    legalChoices: getLegalChoices(state),
  };
}

// Validate semantic consistency by replay, not just the shape of an imported checkpoint.
export function validateSavedGame(input: unknown): SavedGame {
  const save = SavedGameSchema.parse(input);
  let replay = createGame(save.state.gameId, save.state.createdAt);
  if (save.accepted.length !== save.state.history.length)
    throw new GameRuleError("corrupt-save", "The command history is incomplete.");
  const ids = new Set<string>();
  for (const accepted of save.accepted) {
    const { command, receipt } = accepted;
    if (ids.has(command.commandId))
      throw new GameRuleError("corrupt-save", "A command is duplicated in the save.");
    ids.add(command.commandId);
    if (
      receipt.commandId !== command.commandId ||
      receipt.gameId !== command.gameId ||
      receipt.take !== command.take ||
      receipt.previousRevision !== replay.revision ||
      receipt.revision !== replay.revision + 1 ||
      receipt.decisionId !== command.decisionId ||
      receipt.acceptedAt < replay.updatedAt
    ) {
      throw new GameRuleError("corrupt-save", "A receipt does not match the saved command.");
    }
    replay = applyCommand(replay, command, receipt.actor, receipt.acceptedAt);
  }
  if (JSON.stringify(replay) !== JSON.stringify(save.state)) {
    throw new GameRuleError("corrupt-save", "The checkpoint does not match its accepted history.");
  }
  return save;
}
