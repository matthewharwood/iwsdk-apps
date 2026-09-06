import {
  type ContentRelease,
  canonicalJson,
  type ExecutionRegistry,
  GameCommand,
  type MatchManifest,
  type PlayerObservation,
  PreparedMatchArtifact,
  type RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { assertInvariants, createMatch, observe, transition } from "@iwsdk-apps/engine";
import { z } from "zod";
import {
  admitRegistry,
  type CommandRecord,
  ensure,
  MatchArchive,
  type Receipt,
  StorageError,
  verifyArchive,
  verifyDecks,
  verifyRelease,
} from "./records";
import type { Repository } from "./repository";

export { type CommandRecord, type MatchArchive, type Receipt, StorageError } from "./records";
export { createRepository, type Repository, type SqlDatabase, type SqlValue } from "./repository";

export type SubmitResult =
  | { status: "accepted"; receipt: Receipt }
  | { status: "rejected" | "unsupported" | "fault"; code: string; message: string };

export async function replayMatch(
  repo: Repository,
  release: ContentRelease,
  matchId: string,
): Promise<RulesState> {
  const archive = repo.load(matchId);
  if (!archive) throw new StorageError("MatchMissing", "No saved match has this identity.");
  return verifyArchive(archive, release);
}

export class Coordinator {
  private tail: Promise<void> = Promise.resolve();
  private closed = false;
  private constructor(
    private readonly repo: Repository,
    private readonly registry: ExecutionRegistry,
    private committed: RulesState,
  ) {}

  static async create(
    repo: Repository,
    source: ContentRelease,
    manifest: MatchManifest,
    preparedArtifact?: PreparedMatchArtifact,
  ): Promise<Coordinator> {
    const release = await verifyRelease(source);
    const artifact =
      preparedArtifact === undefined ? null : PreparedMatchArtifact.parse(preparedArtifact);
    const registry = await admitRegistry(release, manifest, artifact);
    const state = createMatch(manifest, registry);
    await verifyDecks(state);
    assertInvariants(state, registry);
    const hash = await semanticHash(state);
    repo.insert({
      schema: "commander-archive/2",
      preparedArtifact: artifact,
      releaseHash: release.hash,
      initial: state,
      current: state,
      initialHash: hash,
      currentHash: hash,
      records: [],
    });
    return new Coordinator(repo, registry, state);
  }

  static async open(
    repo: Repository,
    source: ContentRelease,
    matchId: string,
  ): Promise<Coordinator> {
    const release = await verifyRelease(source);
    const archive = repo.load(matchId);
    if (!archive) throw new StorageError("MatchMissing", "No saved match has this identity.");
    const state = await verifyArchive(archive, release);
    const registry = await admitRegistry(release, state.manifest, archive.preparedArtifact);
    return new Coordinator(repo, registry, state);
  }

  /** Privileged host inspection; never expose this method as the driver's observation. */
  current(): RulesState {
    return structuredClone(this.committed);
  }
  /** Privileged execution evidence; this is not a driver observation. */
  executionInfo(): {
    sourceReleaseHash: string;
    preparedArtifactHash: string | null;
    definitionCount: number;
  } {
    return {
      sourceReleaseHash: this.registry.sourceReleaseHash,
      preparedArtifactHash: this.registry.preparedArtifactHash,
      definitionCount: Object.keys(this.registry.definitions).length,
    };
  }
  get pendingActor(): string | null {
    return this.committed.decision?.actor ?? null;
  }
  view(actor: string): PlayerObservation {
    return observe(this.committed, this.registry, actor);
  }

  private queue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  submit(boundActor: string, input: unknown): Promise<SubmitResult> {
    // Capture at submission time, before another caller can mutate a queued input.
    const parsed = GameCommand.safeParse(input);
    return this.queue(async () => {
      if (this.closed)
        return { status: "fault", code: "Closed", message: "The match coordinator is closed." };
      if (!parsed.success)
        return {
          status: "rejected",
          code: "InvalidCommand",
          message: "Command does not match the versioned protocol.",
        };
      const command = parsed.data;
      if (
        command.actor !== boundActor ||
        !this.committed.players.some((seat) => seat.id === boundActor)
      )
        return {
          status: "rejected",
          code: "ActorMismatch",
          message: "Command actor differs from the bound seat.",
        };
      if (command.matchId !== this.committed.manifest.id)
        return {
          status: "rejected",
          code: "WrongMatch",
          message: "Command addresses another match.",
        };
      try {
        const requestHash = await semanticHash(command);
        const previous = this.repo.findRecord(command.matchId, command.commandId);
        if (previous) {
          ensure(
            (await semanticHash(previous.command)) === previous.requestHash &&
              (await semanticHash(previous.events)) === previous.receipt.eventHash,
            "Stored receipt request is damaged.",
          );
          if (
            previous.requestHash !== requestHash ||
            canonicalJson(previous.command) !== canonicalJson(command)
          )
            return {
              status: "rejected",
              code: "CommandConflict",
              message: "This command identity was already used for a different payload.",
            };
          return { status: "accepted", receipt: structuredClone(previous.receipt) };
        }
        const result = transition(this.committed, command, this.registry);
        if (result.status !== "accepted") return result;
        const receipt: Receipt = {
          schema: "commander-receipt/1",
          matchId: command.matchId,
          commandId: command.commandId,
          actor: command.actor,
          revision: result.state.revision,
          stateHash: await semanticHash(result.state),
          eventHash: await semanticHash(result.state.events),
        };
        const record: CommandRecord = {
          command,
          requestHash,
          receipt,
          events: result.state.events,
        };
        this.repo.append(this.committed.revision, result.state, record);
        this.committed = result.state;
        return { status: "accepted", receipt: structuredClone(receipt) };
      } catch (error) {
        return {
          status: "fault",
          code: error instanceof StorageError ? error.code : "PersistenceFailed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  close(): Promise<void> {
    return this.queue(async () => {
      if (!this.closed) {
        this.closed = true;
        this.repo.close();
      }
    });
  }
}

const ExportEnvelope = z.strictObject({
  format: z.literal("commander-logical-save/2"),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  payload: MatchArchive,
});

export async function exportMatch(
  repo: Repository,
  release: ContentRelease,
  matchId: string,
): Promise<string> {
  const payload = repo.load(matchId);
  if (!payload) throw new StorageError("MatchMissing", "No saved match has this identity.");
  await verifyArchive(payload, release);
  return canonicalJson({
    format: "commander-logical-save/2",
    checksum: await semanticHash(payload),
    payload,
  });
}

/** Import creates an additional match; it never replaces an existing match identity. */
export async function importMatch(
  repo: Repository,
  release: ContentRelease,
  text: string,
): Promise<RulesState> {
  if (new TextEncoder().encode(text).byteLength > 64 * 1024 * 1024)
    throw new StorageError("SaveTooLarge", "Logical save exceeds the 64 MiB import limit.");
  const envelope = ExportEnvelope.parse(JSON.parse(text));
  ensure(
    (await semanticHash(envelope.payload)) === envelope.checksum,
    "Logical save checksum does not match.",
  );
  const state = await verifyArchive(envelope.payload, release);
  repo.insert(envelope.payload);
  return state;
}
