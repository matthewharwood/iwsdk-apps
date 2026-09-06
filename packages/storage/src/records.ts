import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
} from "@iwsdk-apps/compiler/prepared";
import {
  ContentRelease,
  canonicalJson,
  Digest,
  ENGINE_VERSION,
  type ExecutionRegistry,
  GameCommand,
  GameEvent,
  Id,
  type MatchManifest,
  Natural,
  PreparedMatchArtifact,
  RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { assertInvariants, createMatch, transition } from "@iwsdk-apps/engine";
import { z } from "zod";

export class StorageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export const Receipt = z.strictObject({
  schema: z.literal("commander-receipt/1"),
  matchId: Id,
  commandId: Id,
  actor: Id,
  revision: Natural,
  stateHash: Digest,
  eventHash: Digest,
});
export type Receipt = z.infer<typeof Receipt>;
export const CommandRecord = z.strictObject({
  command: GameCommand,
  requestHash: Digest,
  receipt: Receipt,
  events: z.array(GameEvent),
});
export type CommandRecord = z.infer<typeof CommandRecord>;
export const MatchArchive = z.strictObject({
  schema: z.literal("commander-archive/2"),
  preparedArtifact: PreparedMatchArtifact.nullable(),
  releaseHash: Digest,
  initial: RulesState,
  current: RulesState,
  initialHash: Digest,
  currentHash: Digest,
  records: z.array(CommandRecord).max(100_000),
});
export type MatchArchive = z.infer<typeof MatchArchive>;

export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new StorageError("IntegrityFailure", message);
}

export async function verifyRelease(input: ContentRelease): Promise<ContentRelease> {
  const release = ContentRelease.parse(input);
  const { hash, ...payload } = release;
  ensure(
    (await semanticHash(payload)) === hash,
    "Content release hash does not match its payload.",
  );
  return release;
}

export async function verifyDecks(state: RulesState): Promise<void> {
  for (const seat of state.manifest.seats) {
    const { hash, ...payload } = seat.deck;
    ensure(
      (await semanticHash(payload)) === hash,
      `Deck revision hash does not match seat ${seat.id}.`,
    );
  }
}

/** Pure admission validates actual source bytes and the exact ordered deck closure. */
export async function admitRegistry(
  source: ContentRelease,
  manifest: MatchManifest,
  artifact: PreparedMatchArtifact | null,
): Promise<ExecutionRegistry> {
  ensure(manifest.releaseHash === source.hash, "Manifest source release pin differs.");
  ensure(source.processorAbi === ENGINE_VERSION, "Content processor ABI differs from this engine.");
  if (manifest.resolver === "full-scan") {
    ensure(
      artifact === null && manifest.preparedArtifactHash === undefined,
      "Full-scan requires the full source registry without a prepared artifact.",
    );
    return createFullExecutionRegistry(source);
  }
  ensure(artifact !== null, "Prepared resolver requires its persisted artifact.");
  ensure(manifest.preparedArtifactHash === artifact.hash, "Prepared artifact pin differs.");
  return admitPreparedMatchArtifact(
    artifact,
    source,
    manifest.seats.map((seat) => seat.deck),
  );
}

/** Re-execute the real engine; stored final state is never its own replay oracle. */
export async function verifyArchive(
  input: MatchArchive,
  source: ContentRelease,
): Promise<RulesState> {
  const archive = MatchArchive.parse(input);
  const release = await verifyRelease(source);
  ensure(archive.releaseHash === release.hash, "Save requires a different content release.");
  await verifyDecks(archive.initial);
  const registry = await admitRegistry(release, archive.initial.manifest, archive.preparedArtifact);
  let state = createMatch(archive.initial.manifest, registry);
  assertInvariants(state, registry);
  ensure(
    state.revision === 0 && archive.initial.revision === 0,
    "Initial checkpoint must be revision zero.",
  );
  ensure(
    (await semanticHash(state)) === archive.initialHash &&
      canonicalJson(state) === canonicalJson(archive.initial),
    "Initial checkpoint does not match deterministic match creation.",
  );
  const commands = new Set<string>();
  for (const record of archive.records) {
    ensure(!commands.has(record.command.commandId), "Repeated durable command identity.");
    commands.add(record.command.commandId);
    ensure(
      (await semanticHash(record.command)) === record.requestHash,
      "Command request hash mismatch.",
    );
    const result = transition(state, record.command, registry);
    ensure(result.status === "accepted", `Replay rejected command ${record.command.commandId}.`);
    state = result.state;
    const receipt = record.receipt;
    ensure(
      receipt.matchId === state.manifest.id &&
        receipt.commandId === record.command.commandId &&
        receipt.actor === record.command.actor &&
        receipt.revision === state.revision,
      "Receipt identity or revision mismatch.",
    );
    ensure(
      (await semanticHash(state)) === receipt.stateHash,
      `Replay boundary hash mismatch at revision ${state.revision}.`,
    );
    ensure(
      (await semanticHash(state.events)) === receipt.eventHash &&
        canonicalJson(state.events) === canonicalJson(record.events),
      `Replay event batch mismatch at revision ${state.revision}.`,
    );
  }
  ensure(
    (await semanticHash(state)) === archive.currentHash &&
      canonicalJson(state) === canonicalJson(archive.current),
    "Current checkpoint is not the replayed command result.",
  );
  assertInvariants(state, registry);
  return state;
}
