import { Decision, Response, semanticHash } from "@iwsdk-apps/contracts";
import {
  DRIVER_VERSION,
  type Driver,
  heuristicDriver,
  scriptedDriver,
} from "@iwsdk-apps/simulation";
import { z } from "zod";

const Script = z.strictObject({
  schema: z.literal("commander-driver-script/1"),
  startingRevision: z.number().int().nonnegative(),
  steps: z
    .array(
      z.strictObject({ actor: z.string().min(1), kind: Decision.shape.kind, response: Response }),
    )
    .min(1),
});
export async function selectDriver(
  path?: string,
): Promise<{ version: string; driver: Driver; source: unknown }> {
  if (!path) return { version: DRIVER_VERSION, driver: heuristicDriver, source: null };
  const script = Script.parse(await Bun.file(path).json());
  return {
    version: `scripted/1:${await semanticHash(script)}`,
    driver: scriptedDriver(script.steps, script.startingRevision),
    source: script,
  };
}
