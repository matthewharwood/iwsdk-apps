import { canonicalJson, PendingDamageFrame, type PlayerObservation } from "@iwsdk-apps/contracts";
import { z } from "zod";
import type { MatchArchive } from "../src/index";

/** Pause after an accepted rewrite while the affected player still owes another choice. */
export function atDamageReplacementStage(view: PlayerObservation): boolean {
  const decision = view.decision;
  const choice = decision?.damageReplacement;
  return (
    decision?.kind === "damage-replacement" &&
    decision.actor === view.player &&
    !!choice &&
    choice.version > 0 &&
    choice.occurrences.some((row) => row.effects.length > 0)
  );
}
/** Privileged proof capture is never supplied to the gameplay driver. */
export function damageReplacementEvidence(archive: Pick<MatchArchive, "records" | "current">) {
  const proposals = [],
    rewrites = [],
    commits = [];
  for (const record of archive.records)
    for (const event of record.events) {
      const row = {
        revision: record.receipt.revision,
        event,
        actor: record.command.actor,
        response: record.command.response,
      };
      if (event.type === "DamageBatchProposed") proposals.push(row);
      if (event.type === "DamageRewritten") rewrites.push(row);
      if (event.type === "DamageBatchCommitted") commits.push(row);
    }
  const manifest = archive.current.manifest;
  return {
    context: {
      matchId: manifest.id,
      releaseHash: manifest.releaseHash,
      engineVersion: manifest.engineVersion,
      serializer: manifest.serializer,
      chance: manifest.chance,
      gameSeed: manifest.gameSeed,
      driverSeed: manifest.driverSeed,
      driverVersion: manifest.driverVersion,
      mode: manifest.mode,
      resolver: manifest.resolver,
      preparedArtifactHash: manifest.preparedArtifactHash ?? null,
      seats: manifest.seats.map((seat) => ({ id: seat.id, deckHash: seat.deck.hash })),
    },
    proposals,
    rewrites,
    commits,
    frames: archive.current.frames.filter((frame) => frame.kind === "pending-damage"),
    decision: archive.current.decision,
    priorityPlayer: archive.current.priorityPlayer,
  };
}
const CommittedBatch = z.strictObject({
  eventId: z.string(),
  version: z.number().int().nonnegative(),
  occurrences: PendingDamageFrame.shape.occurrences,
  rewrites: PendingDamageFrame.shape.rewrites,
});
function foldRewrites(
  frame: PendingDamageFrame,
  rewrites: PendingDamageFrame["rewrites"],
): PendingDamageFrame["occurrences"] | null {
  const occurrences = frame.occurrences.map(({ original }) => ({
    original,
    amount: original.amount,
    applied: [] as string[],
  }));
  if (new Set(occurrences.map((row) => row.original.id)).size !== occurrences.length) return null;
  for (const [index, rewrite] of rewrites.entries()) {
    const entry = occurrences.find((row) => row.original.id === rewrite.occurrenceId);
    if (
      !entry ||
      entry.amount <= 0 ||
      rewrite.version !== index + 1 ||
      rewrite.actor !== entry.original.affectedPlayer ||
      rewrite.before !== entry.amount ||
      entry.applied.includes(rewrite.effect.id)
    )
      return null;
    const program = rewrite.effect.program;
    if (program.source === "spell" && !entry.original.source.isSpell) return null;
    if (
      program.kind === "prevention" &&
      (entry.original.recipient.kind !== "player" ||
        entry.original.recipient.id !== rewrite.effect.provider.controller)
    )
      return null;
    const prevented =
      program.kind === "prevention" && entry.original.source.preventable
        ? Math.min(entry.amount, program.amount)
        : 0;
    const after =
      program.kind === "prevention"
        ? entry.amount - prevented
        : program.operation.kind === "multiply"
          ? entry.amount * program.operation.factor
          : Math.max(0, entry.amount - program.operation.amount);
    if (!Number.isSafeInteger(after) || rewrite.after !== after || rewrite.prevented !== prevented)
      return null;
    entry.amount = after;
    entry.applied.push(rewrite.effect.id);
  }
  return occurrences;
}
function pendingDomainMatches(
  frame: PendingDamageFrame,
  pending: ReturnType<typeof damageReplacementEvidence>,
): boolean {
  const decision = pending.decision,
    choice = decision?.damageReplacement;
  if (!decision || !choice || choice.occurrences.length === 0) return false;
  return choice.occurrences.every((row) => {
    const entry = frame.occurrences.find((candidate) => candidate.original.id === row.id);
    return (
      !!entry &&
      entry.original.affectedPlayer === decision.actor &&
      row.amount === entry.amount &&
      row.source === entry.original.source.object.id &&
      row.preventable === entry.original.source.preventable &&
      row.recipient.kind === entry.original.recipient.kind &&
      row.recipient.id === entry.original.recipient.id &&
      row.effects.length > 0 &&
      row.effects.every((effect) => !entry.applied.includes(effect.id))
    );
  });
}
/** Same proposal and rewrite prefix must continue through accepted owned answers to one actual commit. */
export function completedDamageReplacement(
  pending: ReturnType<typeof damageReplacementEvidence>,
  final: ReturnType<typeof damageReplacementEvidence>,
): boolean {
  if (
    pending.frames.length !== 1 ||
    pending.priorityPlayer !== null ||
    canonicalJson(pending.context) !== canonicalJson(final.context)
  )
    return false;
  const parsedFrame = PendingDamageFrame.safeParse(pending.frames[0]);
  if (!parsedFrame.success) return false;
  const frame = parsedFrame.data,
    decision = pending.decision;
  if (
    !frame ||
    decision?.kind !== "damage-replacement" ||
    frame.version < 1 ||
    decision.damageReplacement?.eventId !== frame.eventId ||
    decision.damageReplacement.version !== frame.version ||
    frame.rewrites.length !== frame.version ||
    decision.revision !== frame.proposedAtRevision + frame.version ||
    !pendingDomainMatches(frame, pending) ||
    canonicalJson(foldRewrites(frame, frame.rewrites)) !== canonicalJson(frame.occurrences) ||
    canonicalJson(frame.origin.data) !==
      canonicalJson({
        eventId: frame.eventId,
        host: frame.host,
        occurrences: frame.occurrences.map((row) => row.original),
      })
  )
    return false;
  const proposals = final.proposals.filter((row) => row.event.data.eventId === frame.eventId);
  if (
    proposals.length !== 1 ||
    proposals[0]?.revision !== frame.proposedAtRevision ||
    canonicalJson(proposals[0]?.event) !== canonicalJson(frame.origin) ||
    canonicalJson(pending.proposals.filter((row) => row.event.data.eventId === frame.eventId)) !==
      canonicalJson(proposals)
  )
    return false;
  const commits = final.commits.filter((row) => row.event.data.eventId === frame.eventId);
  if (commits.length !== 1) return false;
  const commit = commits[0];
  if (!commit || commit.revision <= decision.revision) return false;
  const result = CommittedBatch.safeParse(commit.event.data);
  if (!result.success) return false;
  const body = result.data;
  if (
    body.version <= frame.version ||
    body.rewrites.length !== body.version ||
    canonicalJson(foldRewrites(frame, body.rewrites)) !== canonicalJson(body.occurrences) ||
    canonicalJson(body.rewrites.slice(0, frame.version)) !== canonicalJson(frame.rewrites) ||
    canonicalJson(body.occurrences.map((row) => row.original)) !==
      canonicalJson(frame.occurrences.map((row) => row.original))
  )
    return false;
  const rows = final.rewrites.filter((row) => row.event.data.eventId === frame.eventId);
  if (
    rows.length !== body.version ||
    canonicalJson(pending.rewrites.filter((row) => row.event.data.eventId === frame.eventId)) !==
      canonicalJson(rows.slice(0, frame.version))
  )
    return false;
  for (const [index, rewrite] of body.rewrites.entries()) {
    const row = rows[index];
    if (
      !row ||
      rewrite.version !== index + 1 ||
      row.revision !== frame.proposedAtRevision + index + 1 ||
      canonicalJson(row.event.data) !== canonicalJson({ eventId: frame.eventId, ...rewrite }) ||
      row.response.kind !== "damage-replacement" ||
      row.actor !== rewrite.actor ||
      row.response.eventId !== frame.eventId ||
      row.response.eventVersion !== index ||
      row.response.occurrenceId !== rewrite.occurrenceId ||
      row.response.effectId !== rewrite.effect.id
    )
      return false;
    if (
      index === frame.version &&
      (row.revision !== decision.revision + 1 ||
        row.actor !== decision.actor ||
        !decision.damageReplacement.occurrences.some(
          (occurrence) =>
            occurrence.id === rewrite.occurrenceId &&
            occurrence.effects.some(
              (effect) =>
                effect.id === rewrite.effect.id &&
                effect.provider === rewrite.effect.provider.id &&
                effect.definition === rewrite.effect.provider.definition &&
                canonicalJson(effect.program) === canonicalJson(rewrite.effect.program),
            ),
        ))
    )
      return false;
  }
  return (
    rows.at(-1)?.revision === commit.revision &&
    rows.at(-1)?.actor === commit.actor &&
    canonicalJson(rows.at(-1)?.response) === canonicalJson(commit.response) &&
    !final.frames.some((current) => current.eventId === frame.eventId)
  );
}
