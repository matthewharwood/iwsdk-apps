import { archiveBuild } from "./evidence";
import { executeScenarioSuite } from "./scenario-evidence";

/** Execute actual rule/driver/storage assertions and retain their source and result evidence. */
export async function runScenarios(directory: string): Promise<void> {
  const buildHash = await archiveBuild(directory);
  const result = await executeScenarioSuite({
    workspace: process.cwd(),
    directory,
    buildHash,
    testRoots: [
      "packages/contracts/src",
      "packages/engine/src",
      "packages/simulation/src",
      "packages/storage/src",
    ],
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  console.log(`Scenario execution ${result.status}; retained at ${result.root}`);
  if (result.executionExitCode) process.exitCode = result.executionExitCode;
}
