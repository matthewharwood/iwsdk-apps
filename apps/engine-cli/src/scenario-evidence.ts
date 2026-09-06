import { lstat, mkdir, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { semanticHash } from "@iwsdk-apps/contracts";
import { z } from "zod";
import { writeEvidence } from "./evidence";

const packages = [
  "packages/contracts",
  "packages/rule-selection",
  "packages/catalog",
  "packages/card-programs",
  "packages/compiler",
  "packages/engine",
  "packages/simulation",
  "packages/storage",
  "apps/engine-cli",
];
const rootConfiguration = ["package.json", "bun.lock", "tsconfig.json", "bunfig.toml"];
const archivedConfiguration = new Set([
  "package.json",
  "bun.lock",
  ...packages.map((p) => `${p}/package.json`),
]);
const Archive = z.strictObject({
  schema: z.literal("commander-executable-snapshot/1"),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.array(z.strictObject({ path: z.string(), text: z.string() })),
});
type CapturedFile = { path: string; sha256: string; base64: string };
type Capture = {
  schema: "commander-scenario-source-capture/1";
  hash: string;
  files: CapturedFile[];
};
const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

async function statIfPresent(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

/** Capture bytes, including binary fixtures, without following sources outside the workspace. */
async function capture(workspace: string): Promise<Capture> {
  const files: CapturedFile[] = [];
  async function collect(path: string): Promise<void> {
    const absolute = resolve(workspace, path);
    const info = await statIfPresent(absolute);
    if (!info) return;
    if (info.isSymbolicLink())
      throw new Error(`Scenario capture refuses a source symlink: ${path}`);
    if (info.isDirectory()) {
      for (const child of await readdir(absolute)) await collect(`${path}/${child}`);
    } else if (info.isFile()) {
      const bytes = await readFile(absolute);
      files.push({ path, sha256: sha256(bytes), base64: bytes.toString("base64") });
    } else throw new Error(`Scenario capture requires ordinary files: ${path}`);
  }
  for (const root of packages) {
    for (const path of [
      "src",
      "test-fixtures",
      "fixtures",
      "package.json",
      "tsconfig.json",
      "bunfig.toml",
    ])
      await collect(`${root}/${path}`);
  }
  for (const path of rootConfiguration) await collect(path);
  await collect("packages/tsconfig");
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { schema: "commander-scenario-source-capture/1", hash: await semanticHash(files), files };
}

function isArchivedRuntime(path: string): boolean {
  return (
    archivedConfiguration.has(path) ||
    (path.endsWith(".ts") &&
      !path.endsWith(".test.ts") &&
      packages.some((root) => path.startsWith(`${root}/src/`)))
  );
}

async function verifyArchivedRuntime(
  directory: string,
  hash: string,
  before: Capture,
): Promise<void> {
  const archive = Archive.parse(
    await Bun.file(resolve(directory, "builds", hash, "source.json")).json(),
  );
  if (archive.hash !== hash || (await semanticHash(archive.files)) !== hash)
    throw new Error("Archived runtime source identity mismatch.");
  const actual = before.files.filter((file) => isArchivedRuntime(file.path));
  const expected = new Map(
    archive.files.map((file) => [file.path, Buffer.from(file.text).toString("base64")]),
  );
  if (
    expected.size !== archive.files.length ||
    actual.length !== expected.size ||
    actual.some((file) => expected.get(file.path) !== file.base64)
  )
    throw new Error("Live runtime files differ from the archived build before scenario execution.");
}

function verifyTestRoots(testRoots: string[], before: Capture): void {
  if (
    !testRoots.length ||
    testRoots.some(
      (path) =>
        path.split("/").includes("..") ||
        !packages.some((root) => path === `${root}/src` || path.startsWith(`${root}/src/`)) ||
        !before.files.some((file) => file.path === path || file.path.startsWith(`${path}/`)),
    )
  )
    throw new Error("Scenario test roots must select captured package source paths.");
}

function changedPaths(before: Capture, after: Capture): string[] {
  const old = new Map(before.files.map((file) => [file.path, file.sha256]));
  const next = new Map(after.files.map((file) => [file.path, file.sha256]));
  return [...new Set([...old.keys(), ...next.keys()])]
    .filter((path) => old.get(path) !== next.get(path))
    .sort();
}

export type ScenarioExecution = {
  root: string;
  status: "passed" | "failed";
  executionExitCode: number;
  stdout: string;
  stderr: string;
};

/** Real Bun execution with a retained before/after source boundary. Test roots are explicit in the assignment. */
export async function executeScenarioSuite(options: {
  workspace: string;
  directory: string;
  buildHash: string;
  testRoots: string[];
}): Promise<ScenarioExecution> {
  const { workspace, directory, buildHash, testRoots } = options;
  const root = resolve(directory, "scenario-runs", crypto.randomUUID());
  await mkdir(root, { recursive: true });
  const argv = [
    process.execPath,
    "test",
    ...testRoots,
    "--reporter=junit",
    `--reporter-outfile=${resolve(root, "junit.xml")}`,
  ];
  await writeEvidence(resolve(root, "assignment.json"), {
    schema: "commander-scenario-execution/2",
    buildHash,
    argv,
    workspace,
    runtime: {
      name: `bun/${Bun.version}`,
      executable: process.execPath,
      sha256: sha256(await readFile(process.execPath)),
    },
    scope:
      "Actual engine/protocol/driver/native-storage suites; authored high-risk scenario drafts are not automatically counted as executed.",
    capture: {
      packageRoots: packages,
      packagePaths: [
        "src",
        "test-fixtures",
        "fixtures",
        "package.json",
        "tsconfig.json",
        "bunfig.toml",
      ],
      rootConfiguration,
      sharedConfiguration: "packages/tsconfig",
      dependencies:
        "Installed dependency bytes are not archived; bun.lock and the actual Bun executable are pinned.",
      guard:
        "Before/after equality detects retained changes; this is not isolation against a transient edit restored during execution.",
    },
  });
  let before: Capture | null = null;
  let after: Capture | null = null;
  let exitCode: number | null = null;
  let stdout = "";
  let stderr = "";
  let stage = "preflight";
  let runtimeVerified = false;
  const errors: { stage: string; message: string }[] = [];
  try {
    before = await capture(workspace);
    await writeEvidence(resolve(root, "sources-before.json"), before);
    verifyTestRoots(testRoots, before);
    await verifyArchivedRuntime(directory, buildHash, before);
    runtimeVerified = true;
    stage = "execution";
    const child = Bun.spawn(argv, { cwd: workspace, stdout: "pipe", stderr: "pipe" });
    [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
  } catch (error) {
    errors.push({ stage, message: error instanceof Error ? error.message : String(error) });
  }
  try {
    after = await capture(workspace);
    await writeEvidence(resolve(root, "sources-after.json"), after);
  } catch (error) {
    errors.push({
      stage: "postflight",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const changes = before && after ? changedPaths(before, after) : null;
  const sourcesUnchanged =
    before !== null && after !== null && changes?.length === 0 && before.hash === after.hash;
  if (!sourcesUnchanged)
    errors.push({
      stage: "postflight",
      message:
        "Scenario source/test/fixture/configuration capture changed or could not be completed.",
    });
  const junit = Bun.file(resolve(root, "junit.xml"));
  const junitSha256 = (await junit.exists())
    ? sha256(new Uint8Array(await junit.arrayBuffer()))
    : null;
  if (exitCode !== null && junitSha256 === null)
    errors.push({ stage: "execution", message: "Bun did not retain the required JUnit report." });
  await Bun.write(resolve(root, "stdout.txt"), stdout);
  await Bun.write(resolve(root, "stderr.txt"), stderr);
  const status = exitCode === 0 && errors.length === 0 ? "passed" : "failed";
  const executionExitCode = status === "passed" ? 0 : exitCode || 1;
  await writeEvidence(resolve(root, "result.json"), {
    schema: "commander-scenario-result/2",
    buildHash,
    status,
    exitCode,
    executionExitCode,
    fullHighRiskScenarioGateSatisfied: false,
    archivedRuntimeVerifiedBeforeExecution: runtimeVerified,
    beforeHash: before?.hash ?? null,
    afterHash: after?.hash ?? null,
    sourcesUnchanged,
    changedPaths: changes,
    errors,
    junit: junitSha256 ? { path: "junit.xml", sha256: junitSha256 } : null,
  });
  return { root, status, executionExitCode, stdout, stderr };
}
