import type { PlayerObservation } from "@iwsdk-apps/contracts";
import {
  DRIVER_VERSION,
  type Driver,
  findPayment,
  heuristicDriver,
} from "../../simulation/src/index";

export const COMMANDER_RETURN_PROOF_DRIVER_VERSION = "commander-return-targets/2";
type VisibleObject = PlayerObservation["objects"][number];
function isReturn(object: VisibleObject): boolean {
  return object.card.spellProgram?.effects[0]?.kind === "return-to-hand";
}
function opposingCommanders(observation: PlayerObservation): VisibleObject[] {
  return observation.objects.filter(
    (object) =>
      object.commander &&
      object.zone === "battlefield" &&
      object.controller !== observation.player &&
      object.card.types.includes("Creature") &&
      !object.characteristics.keywords.includes("shroud") &&
      !object.characteristics.keywords.includes("hexproof"),
  );
}
/** Test policy uses only the actor's public view. It never changes RulesState or library order. */
export const commanderReturnProofDriver: Driver = (observation, seed) => {
  const decision = observation.decision;
  const commanders = opposingCommanders(observation);
  if (decision?.kind === "priority") {
    const available = observation.objects.filter((object) => decision.cards.includes(object.id));
    if (!commanders.length) {
      const held = new Set(available.filter(isReturn).map((object) => object.id));
      // This is the policy's considered legal subset; the original observation is not mutated.
      return heuristicDriver(
        {
          ...observation,
          decision: { ...decision, cards: decision.cards.filter((id) => !held.has(id)) },
        },
        seed,
      );
    }
    const land = available.find((object) => object.card.types.includes("Land"));
    if (land) return { kind: "land", card: land.id };
    const actor = observation.players.find((player) => player.id === observation.player);
    if (!actor) throw new Error("Missing proof actor");
    const returns = available.filter((object) => {
      const cost = decision.cardCosts[object.id];
      return (
        isReturn(object) && cost && findPayment(cost, actor.mana, decision.manaSources) !== null
      );
    });
    returns.sort(
      (a, b) =>
        Number(b.card.spellProgram?.effects.some((effect) => effect.kind === "draw")) -
          Number(a.card.spellProgram?.effects.some((effect) => effect.kind === "draw")) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const returning = returns[0];
    if (returning) return { kind: "cast", card: returning.id };
  }
  if (decision?.kind === "target") {
    const top = observation.stack.at(-1);
    const source =
      top?.kind === "spell"
        ? observation.objects.find((object) => object.id === top.objectId)
        : undefined;
    if (source && isReturn(source)) {
      const eligible = commanders.filter((object) => decision.cards.includes(object.id));
      eligible.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const target = eligible[0];
      if (target) return { kind: "target", target: target.id };
    }
  }
  return heuristicDriver(observation, seed);
};
export function proofDriverForVersion(version: string): Driver {
  if (version === COMMANDER_RETURN_PROOF_DRIVER_VERSION) return commanderReturnProofDriver;
  if (version === DRIVER_VERSION) return heuristicDriver;
  throw new Error(`Unknown proof driver version: ${version}`);
}
