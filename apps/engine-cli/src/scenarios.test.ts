import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { semanticHash } from "@iwsdk-apps/contracts";
import { executeScenarioSuite } from "./scenario-evidence";

async function fixture(
  body = "expect(1 + 1).toBe(2);",
  extra?: { path: string; bytes: Uint8Array },
) {
  const workspace = await mkdtemp(resolve(tmpdir(), "scenario-evidence-"));
  const directory = resolve(workspace, ".evidence");
  const runtime = "export const version = 'fixture';\n";
  await mkdir(resolve(workspace, "packages/engine/src"), { recursive: true });
  await Bun.write(resolve(workspace, "packages/engine/src/index.ts"), runtime);
  await Bun.write(
    resolve(workspace, "packages/engine/src/proof.test.ts"),
    `import { expect, test } from 'bun:test';\nimport { unlink } from 'node:fs/promises';\ntest('retained proof', async () => { ${body} });\n`,
  );
  if (extra) await Bun.write(resolve(workspace, extra.path), extra.bytes);
  const files = [{ path: "packages/engine/src/index.ts", text: runtime }];
  const buildHash = await semanticHash(files);
  await Bun.write(
    resolve(directory, "builds", buildHash, "source.json"),
    JSON.stringify({ schema: "commander-executable-snapshot/1", hash: buildHash, files }),
  );
  const run = () =>
    executeScenarioSuite({ workspace, directory, buildHash, testRoots: ["packages/engine/src"] });
  const close = () => rm(workspace, { recursive: true, force: true });
  return { workspace, directory, buildHash, run, close };
}
async function result(root: string) {
  return await Bun.file(resolve(root, "result.json")).json();
}

test("scenario execution retains exact runtime, test, binary fixture and configuration bytes with real JUnit", async () => {
  const f = await fixture(undefined, {
    path: "packages/engine/test-fixtures/payload.bin",
    bytes: new Uint8Array([0, 255, 254, 13, 10]),
  });
  try {
    await Bun.write(resolve(f.workspace, "bunfig.toml"), "[test]\ntimeout = 5000\n");
    const run = await f.run();
    expect(run.status).toBe("passed");
    const report = await result(run.root);
    expect(report).toMatchObject({
      exitCode: 0,
      executionExitCode: 0,
      sourcesUnchanged: true,
      archivedRuntimeVerifiedBeforeExecution: true,
      fullHighRiskScenarioGateSatisfied: false,
      changedPaths: [],
      errors: [],
    });
    expect(report.beforeHash).toBe(report.afterHash);
    const snapshot = await Bun.file(resolve(run.root, "sources-before.json")).json();
    const payload = snapshot.files.find((file: { path: string }) =>
      file.path.endsWith("payload.bin"),
    );
    expect([...Buffer.from(payload.base64, "base64")]).toEqual([0, 255, 254, 13, 10]);
    expect(
      snapshot.files.some((file: { path: string }) => file.path.endsWith("proof.test.ts")),
    ).toBe(true);
    expect(snapshot.files.some((file: { path: string }) => file.path === "bunfig.toml")).toBe(true);
    const junit = await Bun.file(resolve(run.root, "junit.xml")).text();
    expect(junit).toContain('name="retained proof"');
    expect(report.junit.sha256).toHaveLength(64);
  } finally {
    await f.close();
  }
});

test("runtime drift before execution is retained as failure and the test process never starts", async () => {
  const f = await fixture("await Bun.write('started.txt', 'bad'); expect(true).toBe(true);");
  try {
    await Bun.write(
      resolve(f.workspace, "packages/engine/src/index.ts"),
      "export const version = 'changed';\n",
    );
    const run = await f.run();
    expect(run.status).toBe("failed");
    const report = await result(run.root);
    expect(report).toMatchObject({
      exitCode: null,
      executionExitCode: 1,
      archivedRuntimeVerifiedBeforeExecution: false,
      junit: null,
    });
    expect(report.errors[0].message).toContain("differ from the archived build");
    expect(await Bun.file(resolve(f.workspace, "started.txt")).exists()).toBe(false);
    expect(await Bun.file(resolve(run.root, "sources-before.json")).exists()).toBe(true);
  } finally {
    await f.close();
  }
});

test("passing Bun assertions cannot pass the runner after a runtime edit", async () => {
  const f = await fixture(
    "await Bun.write('packages/engine/src/index.ts', 'export const changed = true;'); expect(true).toBe(true);",
  );
  try {
    const run = await f.run();
    const report = await result(run.root);
    expect(run.status).toBe("failed");
    expect(report).toMatchObject({
      exitCode: 0,
      executionExitCode: 1,
      sourcesUnchanged: false,
      changedPaths: ["packages/engine/src/index.ts"],
    });
    expect(await Bun.file(resolve(run.root, "junit.xml")).text()).toContain('failures="0"');
    expect(report.junit.sha256).toHaveLength(64);
  } finally {
    await f.close();
  }
});

test("passing assertions cannot hide edits to their own test, fixture and configuration", async () => {
  const f = await fixture(
    "await Bun.write('packages/engine/src/proof.test.ts', '// changed'); await Bun.write('packages/engine/test-fixtures/value.json', '{}'); await Bun.write('bunfig.toml', '[test]\\ntimeout = 5000'); expect(true).toBe(true);",
    {
      path: "packages/engine/test-fixtures/value.json",
      bytes: new TextEncoder().encode('{"before":true}'),
    },
  );
  try {
    const run = await f.run();
    const report = await result(run.root);
    expect(report.exitCode).toBe(0);
    expect(run.executionExitCode).toBe(1);
    expect(report.changedPaths).toEqual([
      "bunfig.toml",
      "packages/engine/src/proof.test.ts",
      "packages/engine/test-fixtures/value.json",
    ]);
    expect(report.beforeHash).not.toBe(report.afterHash);
  } finally {
    await f.close();
  }
});

test("added and removed source paths cannot retain a passing scenario identity", async () => {
  const f = await fixture(
    "await unlink('packages/engine/src/index.ts'); await Bun.write('packages/engine/src/extra.ts', 'export const added = true;'); expect(true).toBe(true);",
  );
  try {
    const run = await f.run();
    const report = await result(run.root);
    expect(report.exitCode).toBe(0);
    expect(run.status).toBe("failed");
    expect(report.changedPaths).toEqual([
      "packages/engine/src/extra.ts",
      "packages/engine/src/index.ts",
    ]);
  } finally {
    await f.close();
  }
});

test("ordinary assertion failure preserves actual JUnit, stderr and child exit without source drift", async () => {
  const f = await fixture("expect(1).toBe(2);");
  try {
    const run = await f.run();
    const report = await result(run.root);
    expect(run.status).toBe("failed");
    expect(report.exitCode).not.toBe(0);
    expect(report.sourcesUnchanged).toBe(true);
    expect(report.errors).toEqual([]);
    expect(await Bun.file(resolve(run.root, "junit.xml")).text()).toContain("<failure");
    expect(await Bun.file(resolve(run.root, "stderr.txt")).text()).toContain("Expected: 2");
  } finally {
    await f.close();
  }
});

test("a malformed archived source identity never reaches test execution", async () => {
  const f = await fixture();
  try {
    await Bun.write(
      resolve(f.directory, "builds", f.buildHash, "source.json"),
      JSON.stringify({ schema: "commander-executable-snapshot/1", hash: f.buildHash, files: [] }),
    );
    const run = await f.run();
    const report = await result(run.root);
    expect(report.exitCode).toBe(null);
    expect(report.errors[0].message).toContain("identity mismatch");
    expect(run.status).toBe("failed");
  } finally {
    await f.close();
  }
});

test("the host cannot select uncaptured tests and still produce scenario evidence", async () => {
  const f = await fixture();
  try {
    await Bun.write(
      resolve(f.workspace, "other/proof.test.ts"),
      "throw new Error('must not execute');",
    );
    const run = await executeScenarioSuite({
      workspace: f.workspace,
      directory: f.directory,
      buildHash: f.buildHash,
      testRoots: ["other"],
    });
    const report = await result(run.root);
    expect(run.status).toBe("failed");
    expect(report.exitCode).toBe(null);
    expect(report.errors[0].message).toContain("captured package source paths");
  } finally {
    await f.close();
  }
});

test("uncapturable source symlinks retain a failed run with no test execution", async () => {
  const f = await fixture();
  try {
    await symlink(
      resolve(f.workspace, "packages/engine/src/index.ts"),
      resolve(f.workspace, "packages/engine/src/external.ts"),
    );
    const run = await f.run();
    const report = await result(run.root);
    expect(run.status).toBe("failed");
    expect(report.exitCode).toBe(null);
    expect(report.sourcesUnchanged).toBe(false);
    expect(report.errors[0].message).toContain("source symlink");
    expect(await Bun.file(resolve(run.root, "stderr.txt")).exists()).toBe(true);
  } finally {
    await f.close();
  }
});
