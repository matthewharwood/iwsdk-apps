import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outputDirectory = fileURLToPath(new URL("../.generated/", import.meta.url));
await mkdir(outputDirectory, { recursive: true });
const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL("../tests/xr-emulator.ts", import.meta.url))],
  outdir: outputDirectory,
  naming: "xr-emulator.js",
  target: "browser",
  format: "iife",
});
if (!result.success) throw new AggregateError(result.logs, "Could not build the XR test fixture.");
