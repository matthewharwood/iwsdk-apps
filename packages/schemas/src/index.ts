import { z } from "zod";

export const SeatSchema = z.enum(["human", "ai"]);
export type Seat = z.infer<typeof SeatSchema>;
export const TakeSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Take = z.infer<typeof TakeSchema>;
const IdSchema = z.string().min(1).max(128);
export const StorageNamespaceSchema = z
  .string()
  .max(128)
  .regex(/^(?:@[a-z][a-z0-9-]{0,62}\/)?[a-z][a-z0-9-]{0,62}$/);
const RevisionSchema = z.number().int().min(0).max(15);

export const GameEventSchema = z.strictObject({
  actor: SeatSchema,
  take: TakeSchema,
  remaining: z.number().int().min(0).max(14),
  revision: RevisionSchema,
});
export type GameEvent = z.infer<typeof GameEventSchema>;

export const GameStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  rulesVersion: z.literal(1),
  gameId: IdSchema,
  revision: RevisionSchema,
  decisionId: z.string().min(1).max(160),
  remaining: z.number().int().min(0).max(15),
  turn: SeatSchema,
  winner: SeatSchema.nullable(),
  history: z.array(GameEventSchema).max(15),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type GameState = z.infer<typeof GameStateSchema>;

// An actor is deliberately absent: the coordinator binds the submitting seat.
export const GameCommandSchema = z.strictObject({
  schemaVersion: z.literal(1),
  gameId: IdSchema,
  commandId: IdSchema,
  expectedRevision: RevisionSchema,
  decisionId: z.string().min(1).max(160),
  take: TakeSchema,
});
export type GameCommand = z.infer<typeof GameCommandSchema>;

export const CommandReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  commandId: IdSchema,
  gameId: IdSchema,
  actor: SeatSchema,
  take: TakeSchema,
  previousRevision: RevisionSchema,
  revision: RevisionSchema,
  decisionId: z.string().min(1).max(160),
  acceptedAt: z.iso.datetime(),
});
export type CommandReceipt = z.infer<typeof CommandReceiptSchema>;
export const AcceptedCommandSchema = z.strictObject({
  command: GameCommandSchema,
  receipt: CommandReceiptSchema,
});
export type AcceptedCommand = z.infer<typeof AcceptedCommandSchema>;
export const SavedGameSchema = z.strictObject({
  state: GameStateSchema,
  accepted: z.array(AcceptedCommandSchema).max(15),
});
export type SavedGame = z.infer<typeof SavedGameSchema>;
export const SaveEnvelopeSchema = z.strictObject({
  format: z.literal("iwsdk-token-table-save"),
  formatVersion: z.literal(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  payload: SavedGameSchema,
});

// This example is perfect-information. Future games must redact secrets here.
export const AiObservationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  gameId: IdSchema,
  expectedRevision: RevisionSchema,
  decisionId: z.string().min(1).max(160),
  remaining: z.number().int().min(1).max(15),
  legalChoices: z.array(TakeSchema).min(1).max(3),
});
export type AiObservation = z.infer<typeof AiObservationSchema>;
export const AiResultSchema = z.strictObject({
  requestId: IdSchema,
  observation: AiObservationSchema,
  take: TakeSchema,
  policy: z.enum(["heuristic", "litert"]),
});
export type AiResult = z.infer<typeof AiResultSchema>;
export const AiRequestSchema = z.strictObject({
  requestId: IdSchema,
  observation: AiObservationSchema,
  delayMs: z.number().min(0).max(3000),
});

export const ModelManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: IdSchema,
  rulesVersion: z.literal(1),
  encoderVersion: z.literal("token-table-v1"),
  modelUrl: z.string().min(1).max(2048),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  inputShape: z.tuple([z.literal(1), z.literal(1)]),
  outputShape: z.tuple([z.literal(1), z.literal(3)]),
  dataType: z.literal("float32"),
  accelerator: z.enum(["wasm", "webgpu"]),
});
export type ModelManifest = z.infer<typeof ModelManifestSchema>;

export const SessionSnapshotSchema = z.strictObject({
  status: z.enum(["loading", "ready", "error", "closed"]),
  game: GameStateSchema.nullable(),
  error: z.string().nullable(),
  aiThinking: z.boolean(),
  storage: z.literal("sqlite-opfs").nullable(),
  ai: z.literal("heuristic"),
});
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;

const RequestIdSchema = z.string().min(1).max(128);
export const SessionRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("start"),
    id: RequestIdSchema,
    namespace: StorageNamespaceSchema,
    aiDelayMs: z.number().min(0).max(3000),
  }),
  z.strictObject({ type: z.literal("submit"), id: RequestIdSchema, command: GameCommandSchema }),
  z.strictObject({ type: z.literal("new-game"), id: RequestIdSchema }),
  z.strictObject({ type: z.literal("export"), id: RequestIdSchema }),
  z.strictObject({ type: z.literal("import"), id: RequestIdSchema, json: z.string().max(100_000) }),
  z.strictObject({ type: z.literal("close"), id: RequestIdSchema }),
]);
export type SessionRequest = z.infer<typeof SessionRequestSchema>;
export const SessionResponseSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("snapshot"), snapshot: SessionSnapshotSchema }),
  z.strictObject({
    type: z.literal("result"),
    id: RequestIdSchema,
    receipt: CommandReceiptSchema.optional(),
    json: z.string().optional(),
  }),
  z.strictObject({ type: z.literal("error"), id: RequestIdSchema, message: z.string() }),
]);
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
