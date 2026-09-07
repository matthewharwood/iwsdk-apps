import {
  type CardDefinition,
  type MatchManifest,
  StaticCreatureBonus,
} from "@iwsdk-apps/contracts";
import { move } from "../src/common";
import { admitDeck } from "../src/index";
import { givePriority } from "../src/turns";
import { type CounterFixture, counterFixture, locate } from "./counterspells";

export function bonus(change: Partial<StaticCreatureBonus> = {}): StaticCreatureBonus {
  return StaticCreatureBonus.parse({
    schema: "static-creature-bonus/1",
    kind: "static-creature-bonus",
    activeZone: "battlefield",
    controller: "source-current",
    excludeSource: true,
    predicate: { kind: "all" },
    powerDelta: 1,
    toughnessDelta: 1,
    layer: "7c",
    ...change,
  });
}
export function replaceDefinition(f: CounterFixture, id: string, changes: Partial<CardDefinition>) {
  const existing = f.registry.definitions[id];
  if (!existing) throw new Error(`Missing constructed slot: ${id}`);
  f.registry.definitions[id] = { ...existing, ...changes };
  for (const seat of f.state.manifest.seats) admitDeck(seat.deck, f.registry);
}
/** All cards/boards in this fixture are constructed CR scenarios, never authenticated sources. */
export function staticFixture(mode: MatchManifest["resolver"] = "full-scan", seats: 2 | 4 = 2) {
  const f = counterFixture(seats);
  f.state.manifest.resolver = mode;
  if (mode !== "full-scan") {
    const pin = "f".repeat(64);
    f.state.manifest.preparedArtifactHash = pin;
    f.registry.preparedArtifactHash = pin;
  }
  replaceDefinition(f, "commander", {
    power: 3,
    toughness: 3,
    keywords: ["deathtouch", "lifelink"],
    staticPrograms: [bonus({ predicate: { kind: "legendary" }, powerDelta: 2, toughnessDelta: 2 })],
  });
  replaceDefinition(f, "creature", { power: 1, toughness: 1, subtypes: ["Soldier"] });
  replaceDefinition(f, "protected-creature", {
    keywords: [],
    power: 2,
    toughness: 2,
    subtypes: ["Soldier"],
    staticPrograms: [bonus({ powerDelta: 0, toughnessDelta: 1 })],
  });
  replaceDefinition(f, "enchantment-creature", {
    types: ["Enchantment"],
    typeLine: "Enchantment",
    power: null,
    toughness: null,
    staticPrograms: [bonus({ excludeSource: false })],
  });
  givePriority(f.state, f.registry, "A");
  return f;
}
export function enter(f: CounterFixture, id: string, actor = "A") {
  return move(f.state, locate(f, actor, id).id, "battlefield", "constructed static board").id;
}
