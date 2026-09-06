import { mkdir, readdir, readFile, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { semanticHash } from "@iwsdk-apps/contracts";
import { z } from "zod";

export const EXECUTOR_OPTION = "executor-build";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const SourceSnapshot = z.strictObject({
  schema: z.literal("commander-executable-snapshot/1"),
  hash: digest,
  files: z.array(z.strictObject({ path: z.string(), text: z.string() })),
});
const ExecutableSnapshot = z.strictObject({
  schema: z.literal("commander-executable-bundle/1"),
  sourceHash: digest,
  executableHash: digest,
  runtime: z.string(),
  target: z.literal("bun"),
  entrypoint: z.literal("engine-cli.js"),
  sourceLoading: z.literal("captured-workspace-text"),
});

async function pinnedExecutor(directory: string): Promise<string | null> {
  const index = process.argv.indexOf(`--${EXECUTOR_OPTION}`);
  if (index < 0) return null;
  const hash = digest.parse(process.argv[index + 1]);
  const destination = resolve(directory, "builds", hash);
  const executablePath = resolve(destination, "engine-cli.js");
  if (!process.argv[1] || (await realpath(process.argv[1])) !== (await realpath(executablePath)))
    throw new Error("The executor pin is reserved for the preserved executable itself.");
  const source = SourceSnapshot.parse(await Bun.file(resolve(destination, "source.json")).json());
  const executable = ExecutableSnapshot.parse(
    await Bun.file(resolve(destination, "executable.json")).json(),
  );
  if (
    source.hash !== hash ||
    (await semanticHash(source.files)) !== hash ||
    executable.sourceHash !== hash
  )
    throw new Error("Preserved executable source identity mismatch.");
  const actualHash = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(executablePath).arrayBuffer())
    .digest("hex");
  if (actualHash !== executable.executableHash || executable.runtime !== `bun/${Bun.version}`)
    throw new Error("Preserved executable bytes or Bun runtime differ from the recorded build.");
  return hash;
}

export async function writeEvidence(path: string, data: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(data, null, 2)}\n`);
}
/** Preserve executable source, not just a hash of a moving uncommitted checkout. */
export async function archiveBuild(directory: string): Promise<string> {
  const pinned = await pinnedExecutor(directory);
  if (pinned) return pinned;
  const files: { path: string; text: string }[] = [];
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
  for (const root of packages) {
    for (const path of await readdir(resolve(root, "src"), { recursive: true })) {
      if (!path.endsWith(".ts") || path.endsWith(".test.ts")) continue;
      const full = resolve(root, "src", path);
      files.push({ path: relative(process.cwd(), full), text: await readFile(full, "utf8") });
    }
    files.push({
      path: `${root}/package.json`,
      text: await readFile(resolve(root, "package.json"), "utf8"),
    });
  }
  for (const path of ["package.json", "bun.lock"])
    files.push({ path, text: await readFile(path, "utf8") });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = await semanticHash(files);
  const destination = resolve(directory, "builds", hash);
  await mkdir(destination, { recursive: true });
  await writeEvidence(resolve(destination, "source.json"), {
    schema: "commander-executable-snapshot/1",
    hash,
    files,
  });
  const bundle = await Bun.build({
    entrypoints: [resolve("apps/engine-cli/src/index.ts")],
    target: "bun",
    format: "esm",
    plugins: [
      {
        name: "frozen-workspace-source",
        setup(build) {
          const captured = new Map(files.map((file) => [resolve(file.path), file.text]));
          const roots = packages.map((root) => `${resolve(root, "src")}${sep}`);
          build.onLoad({ filter: /\.ts$/ }, ({ path }) => {
            const contents = captured.get(path);
            if (contents !== undefined) return { contents, loader: "ts" };
            if (roots.some((root) => path.startsWith(root)))
              throw new Error(`Executable source was not captured: ${path}`);
            return undefined;
          });
        },
      },
    ],
  });
  if (!bundle.success)
    throw new AggregateError(bundle.logs, "Could not preserve the executable CLI bundle");
  const executable = bundle.outputs[0];
  if (!executable || bundle.outputs.length !== 1)
    throw new Error("Expected one self-contained CLI bundle");
  const bytes = await executable.arrayBuffer();
  const executableHash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const executablePath = resolve(destination, "engine-cli.js");
  const existing = Bun.file(executablePath);
  if (await existing.exists()) {
    const previousHash = new Bun.CryptoHasher("sha256")
      .update(await existing.arrayBuffer())
      .digest("hex");
    if (previousHash !== executableHash)
      throw new Error(
        "This source snapshot already has a different executable; refusing to overwrite evidence.",
      );
  } else await Bun.write(executablePath, bytes);
  await writeEvidence(resolve(destination, "executable.json"), {
    schema: "commander-executable-bundle/1",
    sourceHash: hash,
    executableHash,
    runtime: `bun/${Bun.version}`,
    target: "bun",
    entrypoint: "engine-cli.js",
    sourceLoading: "captured-workspace-text",
  });
  return hash;
}
