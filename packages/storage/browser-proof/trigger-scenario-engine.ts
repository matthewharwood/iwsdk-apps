import * as engine from "../../engine/src/index";
import { constructedTriggerStart } from "../test-fixtures/multi-trigger-adapter";

export * from "../../engine/src/index";

// Selected only by the standalone scenario proof's explicit bundle resolver. No
// normal application, engine package export or ordinary full-game proof imports it.
export function createMatch(...args: Parameters<typeof engine.createMatch>) {
  return constructedTriggerStart(args[0], args[1], engine);
}
