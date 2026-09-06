import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { archiveBuild, writeEvidence } from "./evidence";

/** Execute actual rule/driver/storage assertions and retain machine-readable output. */
export async function runScenarios(directory: string): Promise<void> {
  const root = resolve(directory, "scenario-runs", crypto.randomUUID());
  await mkdir(root, { recursive: true });
  const buildHash = await archiveBuild(directory);
  const tests = [
    "packages/contracts/src",
    "packages/engine/src",
    "packages/simulation/src",
    "packages/storage/src",
  ];
  const argv = [
    "bun",
    "test",
    ...tests,
    "--reporter=junit",
    `--reporter-outfile=${resolve(root, "junit.xml")}`,
  ];
  await writeEvidence(resolve(root, "assignment.json"), {
    schema: "commander-scenario-execution/1",
    buildHash,
    argv,
    scope:
      "Actual engine/protocol/driver/native-storage suites; authored high-risk scenario drafts are not automatically counted as executed.",
  });
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  await Bun.write(resolve(root, "stdout.txt"), stdout);
  await Bun.write(resolve(root, "stderr.txt"), stderr);
  await writeEvidence(resolve(root, "result.json"), {
    buildHash,
    exitCode,
    status: exitCode === 0 ? "passed" : "failed",
    fullHighRiskScenarioGateSatisfied: false,
    junit: "junit.xml",
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  console.log(`Scenario execution retained at ${root}`);
  if (exitCode) process.exitCode = exitCode;
}
