import { type AttachmentProgram, emptyMana, type MatchManifest } from "@iwsdk-apps/contracts";
import { givePriority } from "../src/turns";
import { answer, type CounterFixture, counterFixture } from "./counterspells";
import { replaceDefinition } from "./static-bonus";
export const auraProgram = (
  power = 1,
  toughness = 2,
  keywords: AttachmentProgram["attachedModifier"]["keywords"] = [],
): AttachmentProgram => ({
  schema: "commander-aura/1",
  enchant: "creature",
  attachedModifier: { powerDelta: power, toughnessDelta: toughness, keywords },
});
export const equipProgram = (
  cost = 1,
  power = 2,
  toughness = 0,
  keywords: AttachmentProgram["attachedModifier"]["keywords"] = [],
): AttachmentProgram => ({
  schema: "commander-equipment/1",
  attachedModifier: { powerDelta: power, toughnessDelta: toughness, keywords },
  equip: {
    schema: "commander-equip/1",
    id: "equip:0",
    sourceZone: "battlefield",
    timing: "sorcery",
    cost: { mana: { ...emptyMana(), generic: cost }, tapSource: false },
    target: "creature-you-control",
    effects: [{ kind: "attach-source", recipient: "target" }],
  },
});
/** Synthetic source definitions and selected hands/mana; no production admission or full-game claim. */
export function attachmentFixture(
  mode: MatchManifest["resolver"] = "full-scan",
  seats: 2 | 4 = 2,
): CounterFixture {
  const f = counterFixture(seats);
  f.state.manifest.resolver = mode;
  if (mode !== "full-scan") {
    f.registry.preparedArtifactHash = "f".repeat(64);
    f.state.manifest.preparedArtifactHash = f.registry.preparedArtifactHash;
  }
  replaceDefinition(f, "enchantment-creature", {
    types: ["Enchantment"],
    subtypes: ["Aura"],
    typeLine: "Enchantment — Aura",
    power: null,
    toughness: null,
    attachmentProgram: auraProgram(),
  });
  replaceDefinition(f, "artifact-creature", {
    types: ["Artifact"],
    subtypes: ["Equipment"],
    typeLine: "Artifact — Equipment",
    power: null,
    toughness: null,
    attachmentProgram: equipProgram(),
  });
  givePriority(f.state, f.registry, "A");
  return f;
}
export function equip(f: CounterFixture, source: string, target: string): string {
  answer(f, { kind: "activate", source, programIndex: 0 });
  const frame = f.state.frames.at(-1);
  if (frame?.kind !== "activating") throw new Error("No equip proposal");
  const id = frame.abilityId;
  answer(f, { kind: "activation-target", target });
  const cost = f.state.decision?.cost;
  if (!cost) throw new Error("No equip cost");
  const { generic, ...mana } = cost;
  answer(f, { kind: "activation-payment", sources: [], spend: { ...mana, C: mana.C + generic } });
  return id;
}
