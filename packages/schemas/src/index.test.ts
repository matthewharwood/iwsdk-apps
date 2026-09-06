import { expect, test } from "bun:test";
import { GameCommandSchema, ModelManifestSchema, SessionRequestSchema } from "./index";

const command = {
  schemaVersion: 1,
  gameId: "g",
  commandId: "c",
  expectedRevision: 0,
  decisionId: "g:0",
  take: 2,
};

test("commands cannot supply an actor or bypass bounded legal action shapes", () => {
  expect(GameCommandSchema.safeParse(command).success).toBe(true);
  expect(GameCommandSchema.safeParse({ ...command, actor: "ai" }).success).toBe(false);
  expect(GameCommandSchema.safeParse({ ...command, take: 4 }).success).toBe(false);
  expect(GameCommandSchema.safeParse({ ...command, schemaVersion: 2 }).success).toBe(false);
});

test("worker namespaces cannot escape the application storage directory", () => {
  expect(
    SessionRequestSchema.safeParse({
      type: "start",
      id: "r",
      namespace: "../snapmatch",
      aiDelayMs: 0,
    }).success,
  ).toBe(false);
});

test("model manifests pin the actual feature/tensor contract", () => {
  const manifest = {
    schemaVersion: 1,
    id: "example",
    rulesVersion: 1,
    encoderVersion: "token-table-v1",
    modelUrl: "/models/policy.tflite",
    sha256: "a".repeat(64),
    inputShape: [1, 1],
    outputShape: [1, 3],
    dataType: "float32",
    accelerator: "wasm",
  };
  expect(ModelManifestSchema.safeParse(manifest).success).toBe(true);
  expect(ModelManifestSchema.safeParse({ ...manifest, inputShape: [1, 2] }).success).toBe(false);
});
