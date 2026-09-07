import { expect, test } from "bun:test";
import { GameEvent, PendingDamageFrame, type Response, semanticHash } from "@iwsdk-apps/contracts";
import { observe } from "../../engine/src/index";
import {
  damageSourceAnswer as answer,
  damageSourceCast as cast,
  damageSourceCommand as command,
  type DamageSourceFixture,
  damageSourceFixture as fixture,
  damageSourceMain as main,
  damageSourceObject as object,
  damageSourceResolve as resolve,
} from "../../engine/test-fixtures/damage-source";
import { heuristicDriver } from "../../simulation/src/driver";
import type { CommandRecord } from "../src/index";
import { completedDamageReplacement, damageReplacementEvidence } from "./damage-evidence";
import { atProofStage } from "./spell-evidence";

async function record(f: DamageSourceFixture, response: Response, records: CommandRecord[]) {
  const envelope = command(f, response);
  answer(f, response);
  records.push({
    command: envelope,
    requestHash: await semanticHash(envelope),
    receipt: {
      schema: "commander-receipt/1",
      matchId: envelope.matchId,
      commandId: envelope.commandId,
      actor: envelope.actor,
      revision: f.state.revision,
      stateHash: await semanticHash(f.state),
      eventHash: await semanticHash(f.state.events),
    },
    events: structuredClone(f.state.events),
  });
}
async function pending(mode: "full-scan" | "prepared-scan" | "prepared-indexed") {
  // Source-bound partial execution with explicitly selected hands/basic lands.
  // These local event excerpts are not a durable match archive or completed game.
  const f = await fixture(
    "Lady Orca",
    ["Furnace of Rath", "Dictate of the Twin Gods", "Sorin's Thirst"],
    "Jasmine Boreal",
    ["Ancient Brontodon"],
    mode,
  );
  cast(f, "A", "Furnace of Rath");
  resolve(f);
  cast(f, "A", "Dictate of the Twin Gods");
  resolve(f);
  main(f, "B");
  cast(f, "B", "Ancient Brontodon");
  resolve(f);
  main(f, "A");
  cast(f, "A", "Sorin's Thirst", object(f, "B", "Ancient Brontodon").id);
  const records: CommandRecord[] = [];
  while (f.state.decision?.kind === "priority") await record(f, { kind: "pass" }, records);
  expect(f.state.decision?.kind).toBe("damage-replacement");
  expect(atProofStage(observe(f.state, f.registry, "B"), "pending-damage")).toBe(false);
  await record(f, await heuristicDriver(observe(f.state, f.registry, "B"), 1), records);
  return { f, records };
}
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const)
  test(`${mode}: actual double rewrite remains owned and qualifies only after the same event commits`, async () => {
    const { f, records } = await pending(mode);
    const view = observe(f.state, f.registry, "B");
    expect(atProofStage(view, "pending-damage")).toBe(true);
    expect(atProofStage(observe(f.state, f.registry, "A"), "pending-damage")).toBe(false);
    expect("frames" in view).toBe(false);
    const selected = damageReplacementEvidence({
      current: structuredClone(f.state),
      records: structuredClone(records),
    });
    expect(selected.frames[0]?.version).toBe(1);
    expect(selected.frames[0]?.occurrences[0]?.amount).toBe(4);
    expect(object(f, "B", "Ancient Brontodon").damage).toBe(0);
    expect(f.state.players.find((p) => p.id === "A")?.life).toBe(40);
    expect(completedDamageReplacement(selected, selected)).toBe(false);
    const response = await heuristicDriver(view, 1);
    expect(response.kind).toBe("damage-replacement");
    await record(f, response, records);
    const final = damageReplacementEvidence({ current: f.state, records });
    expect(completedDamageReplacement(selected, final)).toBe(true);
    const otherMatch = structuredClone(final);
    otherMatch.context.matchId += ":other";
    expect(completedDamageReplacement(selected, otherMatch)).toBe(false);
    const otherRelease = structuredClone(final);
    otherRelease.context.releaseHash = "0".repeat(64);
    expect(completedDamageReplacement(selected, otherRelease)).toBe(false);
    expect(object(f, "B", "Ancient Brontodon").damage).toBe(8);
    expect(f.state.players.find((p) => p.id === "A")?.life).toBe(42);
    expect(object(f, "A", "Sorin's Thirst").zone).toBe("graveyard");
    expect(final.commits).toHaveLength(1);
    expect(final.rewrites).toHaveLength(2);
    const missingCommit = structuredClone(final);
    missingCommit.commits = [];
    expect(completedDamageReplacement(selected, missingCommit)).toBe(false);
    const duplicateCommit = structuredClone(final);
    duplicateCommit.commits.push(...structuredClone(final.commits));
    expect(completedDamageReplacement(selected, duplicateCommit)).toBe(false);
    const wrongActor = structuredClone(final);
    const last = wrongActor.rewrites.at(-1);
    if (!last) throw new Error("Missing source rewrite");
    last.actor = "A";
    expect(completedDamageReplacement(selected, wrongActor)).toBe(false);
    const wrongVersion = structuredClone(final);
    const lastVersion = wrongVersion.rewrites.at(-1);
    if (!lastVersion || lastVersion.response.kind !== "damage-replacement")
      throw new Error("Missing source answer");
    lastVersion.response.eventVersion = 0;
    expect(completedDamageReplacement(selected, wrongVersion)).toBe(false);
    const noOrigin = structuredClone(final);
    noOrigin.proposals = [];
    expect(completedDamageReplacement(selected, noOrigin)).toBe(false);
    const wrongPrefix = structuredClone(selected);
    const prefix = wrongPrefix.frames[0]?.rewrites[0];
    if (!prefix) throw new Error("Missing first rewrite");
    prefix.after++;
    expect(completedDamageReplacement(wrongPrefix, final)).toBe(false);
    const unrelated = structuredClone(final);
    const unrelatedCommit = unrelated.commits[0];
    if (!unrelatedCommit) throw new Error("Missing commit");
    unrelatedCommit.event.data.eventId = "different-damage";
    expect(completedDamageReplacement(selected, unrelated)).toBe(false);
    const wrongFinalAmount = structuredClone(final);
    const amountCommit = wrongFinalAmount.commits[0];
    if (!amountCommit) throw new Error("Missing amount commit");
    const amounts = PendingDamageFrame.shape.occurrences.parse(amountCommit.event.data.occurrences);
    const amount = amounts[0];
    if (!amount) throw new Error("Missing source occurrence");
    amount.amount += 100;
    amountCommit.event.data = GameEvent.shape.data.parse({
      ...amountCommit.event.data,
      occurrences: amounts,
    });
    expect(completedDamageReplacement(selected, wrongFinalAmount)).toBe(false);
    const noApplied = structuredClone(final);
    const appliedCommit = noApplied.commits[0];
    if (!appliedCommit) throw new Error("Missing applied commit");
    const applied = PendingDamageFrame.shape.occurrences.parse(
      appliedCommit.event.data.occurrences,
    );
    for (const row of applied) row.applied = [];
    appliedCommit.event.data = GameEvent.shape.data.parse({
      ...appliedCommit.event.data,
      occurrences: applied,
    });
    expect(completedDamageReplacement(selected, noApplied)).toBe(false);
    const noPendingRows = structuredClone(selected);
    noPendingRows.rewrites = [];
    expect(completedDamageReplacement(noPendingRows, final)).toBe(false);
    const wrongCommitResponse = structuredClone(final);
    const responseCommit = wrongCommitResponse.commits[0];
    if (!responseCommit) throw new Error("Missing response commit");
    responseCommit.response = { kind: "pass" };
    expect(completedDamageReplacement(selected, wrongCommitResponse)).toBe(false);
    const futureProposal = structuredClone(final);
    const movedProposal = futureProposal.proposals[0];
    if (!movedProposal) throw new Error("Missing source proposal");
    movedProposal.revision = f.state.revision + 100;
    expect(completedDamageReplacement(selected, futureProposal)).toBe(false);
    const wrongPendingResponse = structuredClone(selected);
    const pendingResponse = wrongPendingResponse.rewrites[0];
    if (!pendingResponse) throw new Error("Missing pending rewrite");
    pendingResponse.response = { kind: "pass" };
    expect(completedDamageReplacement(wrongPendingResponse, final)).toBe(false);
    const wrongHost = structuredClone(selected);
    const hostFrame = wrongHost.frames[0];
    if (!hostFrame || hostFrame.host.kind !== "spell-instruction")
      throw new Error("Missing source host");
    hostFrame.host.controller = "B";
    expect(completedDamageReplacement(wrongHost, final)).toBe(false);
  });
