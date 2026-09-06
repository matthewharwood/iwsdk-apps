import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkspace } from "./create-workspace";

const root = fileURLToPath(new URL("..", import.meta.url));
// Outside the source checkout: tools must not inherit its .generated/ ignore globs.
const temporary = await mkdtemp(join(tmpdir(), "iwsdk-template-check-"));
const owner = crypto.randomUUID();
const marker = join(temporary, ".template-check-owner");
await writeFile(marker, owner, { flag: "wx" });

async function run(cwd: string, args: string[]): Promise<void> {
  console.info(`Template check: ${args.join(" ")}`);
  const process = Bun.spawn(args, {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: { ...Bun.env, CI: "1", TMPDIR: temporary },
  });
  const exitCode = await process.exited;
  if (exitCode !== 0)
    throw new Error(`Generated workspace check failed (${exitCode}): ${args.join(" ")}`);
}

try {
  const workspace = await createWorkspace({
    sourceRoot: root,
    destination: join(temporary, "workspace"),
    name: "verified-starter",
  });
  // First prove a standalone clone can install without modifying its copied lockfile.
  await run(workspace, ["bun", "install", "--frozen-lockfile"]);
  // Exercise Turbo's real adapter, then install the new workspace before checking it.
  await run(workspace, ["bunx", "turbo", "gen", "app", "--args", "generated-example"]);
  const appManifest = JSON.parse(
    await readFile(join(workspace, "apps/generated-example/package.json"), "utf8"),
  ) as { name?: string };
  if (appManifest.name !== "@verified-starter/generated-example") {
    throw new Error("Turbo did not generate the expected application package.");
  }
  await run(workspace, ["bun", "install"]);
  await run(workspace, ["bun", "run", "check:fast"]);
  await run(workspace, ["bun", "run", "build"]);
  console.info("Standalone workspace and generated application checks passed.");
} finally {
  // Never delete a named application or user-supplied destination as part of validation.
  if ((await readFile(marker, "utf8")) === owner) {
    await rm(temporary, { recursive: true, force: true });
  }
}
