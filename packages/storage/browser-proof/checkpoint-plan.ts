import { type ContentRelease, canonicalJson, Digest, semanticHash } from "@iwsdk-apps/contracts";
import { z } from "zod";
import { ensure, MatchArchive, verifyArchive } from "../src/records";

/** File inputs are project-root relative and may not traverse or select a remote source. */
export const RelativeProofPath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.includes(":") &&
      !value.includes("\0") &&
      value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
    "Use a project-root-relative path without traversal or URI syntax",
  );
const Name = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const Case = z
  .strictObject({
    name: Name,
    finalSave: RelativeProofPath,
    checkpoints: z
      .array(z.strictObject({ name: Name, save: RelativeProofPath }))
      .min(1)
      .max(16),
  })
  .refine(
    (row) => new Set(row.checkpoints.map((item) => item.name)).size === row.checkpoints.length,
    "Checkpoint names must be unique within a case",
  );
export const CheckpointPlan = z
  .strictObject({
    schema: z.literal("commander-checkpoint-proof/1"),
    release: RelativeProofPath,
    cases: z.array(Case).min(1).max(6),
  })
  .refine(
    (plan) => new Set(plan.cases.map((row) => row.name)).size === plan.cases.length,
    "Case names must be unique",
  );
export type CheckpointPlan = z.infer<typeof CheckpointPlan>;
export const LogicalSave = z.strictObject({
  format: z.literal("commander-logical-save/2"),
  checksum: Digest,
  payload: MatchArchive,
});
export type LogicalSave = z.infer<typeof LogicalSave>;

export async function verifyLogicalSave(
  text: string,
  release: ContentRelease,
): Promise<LogicalSave> {
  ensure(new TextEncoder().encode(text).byteLength <= 64 * 1024 * 1024, "Proof save exceeds64MiB");
  const envelope = LogicalSave.parse(JSON.parse(text));
  ensure(
    (await semanticHash(envelope.payload)) === envelope.checksum,
    "Proof save checksum differs",
  );
  ensure(envelope.payload.records.length <= 20_000, "Proof tape exceeds20,000 accepted commands");
  await verifyArchive(envelope.payload, release);
  return envelope;
}
/** Called after real-engine validation of both archives; names alone never establish a prefix. */
export function assertCheckpointPrefix(final: MatchArchive, checkpoint: MatchArchive): void {
  ensure(
    checkpoint.records.length <= final.records.length,
    "Checkpoint is later than stopped final",
  );
  ensure(
    checkpoint.releaseHash === final.releaseHash && checkpoint.initialHash === final.initialHash,
    "Checkpoint release or initial pin differs",
  );
  ensure(
    canonicalJson(checkpoint.initial) === canonicalJson(final.initial),
    "Checkpoint belongs to a different initial match",
  );
  ensure(
    canonicalJson(checkpoint.preparedArtifact) === canonicalJson(final.preparedArtifact),
    "Checkpoint prepared artifact differs",
  );
  ensure(
    canonicalJson(checkpoint.records) ===
      canonicalJson(final.records.slice(0, checkpoint.records.length)),
    "Checkpoint is not an exact command/receipt/event prefix",
  );
  const expectedHash = checkpoint.records.at(-1)?.receipt.stateHash ?? final.initialHash;
  ensure(
    checkpoint.currentHash === expectedHash,
    "Checkpoint current hash is not its retained boundary",
  );
}

/** The storage namespace protocol is lowercase even though ISO timestamps contain T/Z. */
export function checkpointNamespace(runId: string, caseIndex: number): string {
  ensure(
    Number.isSafeInteger(caseIndex) && caseIndex >= 0 && caseIndex < 6,
    "Invalid proof case index",
  );
  const namespace = `checkpoint-${runId.toLowerCase()}-${caseIndex}`;
  ensure(
    namespace.length <= 180 && /^[a-z0-9][a-z0-9._-]*$/.test(namespace),
    "Invalid proof namespace",
  );
  return namespace;
}
