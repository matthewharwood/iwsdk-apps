import { expect, test } from "bun:test";
import {
  CHANCE_VERSION,
  CONTRACT_VERSION,
  ENGINE_VERSION,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  conditionalSourceDeck,
  conditionalSourceRelease,
} from "../../engine/test-fixtures/conditional-source";
import { Coordinator, exportMatch } from "../src/index";
import { openNativeRepository } from "../src/native";
import {
  assertCheckpointPrefix,
  CheckpointPlan,
  checkpointNamespace,
  RelativeProofPath,
  verifyLogicalSave,
} from "./checkpoint-plan";

const plan: CheckpointPlan = {
  schema: "commander-checkpoint-proof/1",
  release: "inputs/release.json",
  cases: [
    {
      name: "full-scan",
      finalSave: "inputs/final.json",
      checkpoints: [{ name: "pending", save: "inputs/pending.json" }],
    },
  ],
};
test("checkpoint plan is strict, bounded, unambiguous and accepts project-relative files only", () => {
  expect(CheckpointPlan.parse(plan)).toEqual(plan);
  const firstCase = plan.cases[0];
  if (!firstCase) throw new Error("Missing test plan case");
  for (const path of [
    "/tmp/save.json",
    "../save.json",
    "inputs/../save.json",
    "https://example.test/a",
    "inputs\\save.json",
    "inputs//save.json",
    "./save.json",
  ])
    expect(RelativeProofPath.safeParse(path).success).toBe(false);
  for (const bad of [
    { ...plan, skipReplay: true },
    { ...plan, cases: [] },
    { ...plan, cases: [...plan.cases, ...plan.cases] },
    {
      ...plan,
      cases: [
        {
          ...plan.cases[0],
          checkpoints: [...firstCase.checkpoints, ...firstCase.checkpoints],
        },
      ],
    },
  ])
    expect(CheckpointPlan.safeParse(bad).success).toBe(false);
});
test("actual native archives verify checksums and real-engine replay before exact prefix admission", async () => {
  const release = await conditionalSourceRelease();
  const deck = await conditionalSourceDeck("Donatello, Turtle Techie", [
    "Scholar of Stars",
    "Memnite",
  ]);
  const repo = openNativeRepository(":memory:");
  const c = await Coordinator.create(repo, release, {
    schema: "commander-match/1",
    id: "checkpoint-plan-unit",
    releaseHash: release.hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 7,
    driverSeed: 9,
    driverVersion: "checkpoint-test/1",
    mode: "two-seat",
    resolver: "full-scan",
    seats: [
      { id: "A", deck },
      { id: "B", deck },
    ],
  });
  try {
    const before = await verifyLogicalSave(
      await exportMatch(repo, release, c.current().manifest.id),
      release,
    );
    const decision = c.current().decision;
    if (!decision) throw new Error("Missing initial chooser");
    const receipt = await c.submit(decision.actor, {
      schema: CONTRACT_VERSION,
      matchId: c.current().manifest.id,
      commandId: "choice",
      actor: decision.actor,
      revision: 0,
      decisionId: decision.id,
      response: { kind: "starting-player", player: "A" },
    });
    expect(receipt.status).toBe("accepted");
    const text = await exportMatch(repo, release, c.current().manifest.id);
    const final = await verifyLogicalSave(text, release);
    expect(() => assertCheckpointPrefix(final.payload, before.payload)).not.toThrow();
    expect(() => assertCheckpointPrefix(before.payload, final.payload)).toThrow("later");
    await expect(
      verifyLogicalSave(JSON.stringify({ ...final, checksum: "f".repeat(64) }), release),
    ).rejects.toThrow("checksum");
    const changed = structuredClone(final.payload);
    const changedPlayer = changed.current.players[0];
    if (!changedPlayer) throw new Error("Missing test player");
    changedPlayer.life--;
    changed.currentHash = await semanticHash(changed.current);
    await expect(
      verifyLogicalSave(
        JSON.stringify({ ...final, payload: changed, checksum: await semanticHash(changed) }),
        release,
      ),
    ).rejects.toThrow("replayed");
    const different = structuredClone(final.payload);
    const changedRecord = different.records[0];
    if (!changedRecord) throw new Error("Missing recorded test command");
    changedRecord.receipt.actor = changedRecord.receipt.actor === "A" ? "B" : "A";
    expect(() => assertCheckpointPrefix(final.payload, different)).toThrow("exact");
    const wrongInitial = structuredClone(before.payload);
    wrongInitial.initial.manifest.gameSeed++;
    expect(() => assertCheckpointPrefix(final.payload, wrongInitial)).toThrow("initial");
  } finally {
    await c.close();
  }
});

test("ISO timestamp namespaces satisfy the actual lowercase storage protocol across cases and imports", () => {
  const runId = "2026-09-07T01-25-31-202Z-76c24403";
  const first = checkpointNamespace(runId, 0);
  expect(first).toBe("checkpoint-2026-09-07t01-25-31-202z-76c24403-0");
  for (const index of [0, 1, 2, 5]) {
    const namespace = checkpointNamespace(runId, index);
    expect(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(namespace)).toBe(true);
    expect(/^[a-z0-9][a-z0-9._-]*$/.test(`${namespace}-import-11`)).toBe(true);
  }
  expect(checkpointNamespace(runId, 1)).not.toBe(first);
  expect(() => checkpointNamespace(runId, -1)).toThrow("index");
  expect(() => checkpointNamespace(runId, 6)).toThrow("index");
  expect(() => checkpointNamespace("bad/run", 0)).toThrow("namespace");
});
