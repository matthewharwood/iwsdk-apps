import { mkdir, readFile, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { ContentRelease, semanticHash, sha256 } from "@iwsdk-apps/contracts";
import {
  assertCheckpointPrefix,
  CheckpointPlan,
  type LogicalSave,
  RelativeProofPath,
  verifyLogicalSave,
} from "./checkpoint-plan";

export type VerifiedCase = {
  name: string;
  final: LogicalSave;
  checkpoints: { name: string; save: LogicalSave }[];
};
export async function loadCheckpointInputs(root: string, planPath: string, output: string) {
  const hashes: Record<string, string> = {};
  async function read(relative: string) {
    RelativeProofPath.parse(relative);
    const path = await realpath(resolve(root, relative));
    if (!path.startsWith(`${await realpath(root)}${sep}`))
      throw new Error(`Proof input escapes project root: ${relative}`);
    const bytes = await readFile(path);
    hashes[relative] = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const target = join(output, "inputs", relative);
    await mkdir(resolve(target, ".."), { recursive: true });
    await Bun.write(target, bytes);
    return bytes.toString();
  }
  const plan = CheckpointPlan.parse(JSON.parse(await read(planPath)));
  const releaseBytes = await read(plan.release);
  const release = ContentRelease.parse(JSON.parse(releaseBytes));
  const { hash, ...body } = release;
  if ((await semanticHash(body)) !== hash) throw new Error("Source release checksum differs");
  const cases: VerifiedCase[] = [];
  for (const item of plan.cases) {
    const final = await verifyLogicalSave(await read(item.finalSave), release);
    const checkpoints = [];
    let previous = -1;
    for (const point of item.checkpoints) {
      const save = await verifyLogicalSave(await read(point.save), release);
      assertCheckpointPrefix(final.payload, save.payload);
      if (save.payload.records.length <= previous)
        throw new Error("Named checkpoints must be strictly increasing prefixes");
      previous = save.payload.records.length;
      checkpoints.push({ name: point.name, save });
    }
    cases.push({ name: item.name, final, checkpoints });
  }
  return { plan, release, releaseBytes, cases, inputHashes: hashes };
}
export async function captureCheckpointSources(root: string, output: string) {
  const paths = ["package.json", "bun.lock"];
  for (const pkg of [
    "contracts",
    "engine",
    "rule-selection",
    "simulation",
    "storage",
    "compiler",
    "card-programs",
  ]) {
    paths.push(`packages/${pkg}/package.json`);
    for await (const name of new Bun.Glob("src/**/*.ts").scan({ cwd: join(root, "packages", pkg) }))
      if (!name.endsWith(".test.ts")) paths.push(`packages/${pkg}/${name}`);
  }
  for await (const name of new Bun.Glob("*.ts").scan({
    cwd: join(root, "packages/storage/browser-proof"),
  }))
    if (!name.endsWith(".test.ts")) paths.push(`packages/storage/browser-proof/${name}`);
  const hashes: Record<string, string> = {};
  const sources: Record<string, string> = {};
  for (const path of paths.sort()) {
    const text = await readFile(join(root, path), "utf8");
    hashes[path] = await sha256(text);
    sources[path] = text;
  }
  await Bun.write(join(output, "sources.json"), JSON.stringify(sources, null, 2));
  return { hashes, sourceHash: await semanticHash(hashes) };
}
export async function changedCheckpointFiles(root: string, hashes: Record<string, string>) {
  const changed = [];
  for (const [path, hash] of Object.entries(hashes)) {
    try {
      if ((await sha256(await readFile(join(root, path), "utf8"))) !== hash) changed.push(path);
    } catch {
      changed.push(path);
    }
  }
  return changed;
}
