import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  ENGINE_VERSION,
  type ExecutionRegistry,
  emptyMana,
  type GameCommand,
  type MatchManifest,
  type Response,
  type RulesState,
  SERIALIZER_VERSION,
} from "@iwsdk-apps/contracts";
import { card, move, player } from "../src/common";
import { assertInvariants, createMatch, transition } from "../src/index";
import { givePriority } from "../src/turns";

// Pure-engine constructed scenarios. Synthetic definitions never pass production
// source admission and are not reported as source-backed full games.
function definition(id: string, change: Partial<CardDefinition> = {}): CardDefinition {
  return {
    id,
    oracleId: id,
    sourceVersion: "a".repeat(64),
    name: id,
    typeLine: "Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: [],
    colors: [],
    colorIdentity: [],
    manaCost: { ...emptyMana(), generic: 1 },
    manaValue: 1,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: false,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "constructed-counterspell/1",
    ...change,
  };
}
function counter(id: string, target: "spell" | "creature-spell" | "noncreature-spell") {
  return definition(id, {
    types: ["Instant"],
    typeLine: "Instant",
    power: null,
    toughness: null,
    manaCost: { ...emptyMana(), U: 1, generic: 1 },
    manaValue: 2,
    colorIdentity: ["U"],
    colors: ["U"],
    spellProgram: { schema: "commander-spell/1", target, effects: [{ kind: "counter" }] },
  });
}
export function counterFixture(seats: 2 | 4 = 2) {
  const definitions = [
    definition("commander", {
      commanderEligible: true,
      supertypes: ["Legendary"],
      typeLine: "Legendary Creature",
      colorIdentity: ["W", "U", "B", "R", "G"],
    }),
    definition("creature"),
    definition("artifact-creature", {
      typeLine: "Artifact Creature",
      types: ["Artifact", "Creature"],
    }),
    definition("enchantment-creature", {
      typeLine: "Enchantment Creature",
      types: ["Enchantment", "Creature"],
    }),
    definition("protected-creature", { keywords: ["shroud", "hexproof"] }),
    definition("trigger-creature", {
      triggerPrograms: [
        {
          schema: "commander-trigger/1",
          id: "self-entry-0",
          trigger: {
            kind: "self-enters-battlefield",
            view: "post-committed-event",
            placementClass: "ordinary",
          },
          choice: { kind: "mandatory" },
          effect: { kind: "draw", recipient: "trigger-controller", amount: 1 },
        },
      ],
    }),
    definition("draw-spell", {
      typeLine: "Instant",
      types: ["Instant"],
      power: null,
      toughness: null,
      spellProgram: {
        schema: "commander-spell/1",
        target: null,
        effects: [{ kind: "draw", recipient: "controller", amount: 2 }],
      },
    }),
    definition("destroy-spell", {
      typeLine: "Instant",
      types: ["Instant"],
      power: null,
      toughness: null,
      spellProgram: {
        schema: "commander-spell/1",
        target: "creature",
        effects: [{ kind: "destroy" }],
      },
    }),
    definition("land", {
      typeLine: "Basic Land — Island",
      types: ["Land"],
      subtypes: ["Island"],
      supertypes: ["Basic"],
      power: null,
      toughness: null,
      manaCost: null,
      manaValue: 0,
      manaAbilities: ["U"],
      colorIdentity: ["U"],
      deckLimit: null,
    }),
    counter("counter", "spell"),
    counter("creature-counter", "creature-spell"),
    counter("noncreature-counter", "noncreature-spell"),
  ];
  const registry: ExecutionRegistry = {
    sourceReleaseHash: "c".repeat(64),
    preparedArtifactHash: null,
    definitions: Object.fromEntries(definitions.map((row) => [row.id, row])),
  };
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: "constructed-counters",
    releaseHash: registry.sourceReleaseHash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 4,
    driverSeed: 1,
    driverVersion: "constructed-counters/1",
    mode: seats === 2 ? "two-seat" : "four-seat",
    resolver: "full-scan",
    seats: ["A", "B", "C", "D"].slice(0, seats).map((id) => ({
      id,
      deck: {
        id: "counter-scenario-deck",
        hash: "b".repeat(64),
        commander: "commander",
        entries: definitions.map((row) => ({
          definition: row.id,
          count: row.id === "land" ? 101 - definitions.length : 1,
        })),
      },
    })),
  };
  const f = { registry, state: createMatch(manifest, registry) };
  answer(f, { kind: "starting-player", player: "A" });
  while (f.state.decision?.kind === "mulligan") answer(f, { kind: "mulligan", keep: true });
  for (let n = 0; n < 16 && f.state.step !== "main1"; n++) answer(f, { kind: "pass" });
  if (f.state.step !== "main1") throw new Error("Main phase precondition not reached");
  for (const seat of f.state.players) seat.mana = { ...emptyMana(), U: 30, C: 30 };
  // Move selected physical cards to hand as explicit preconditions; cast/targets/payment
  // and subsequent priority/resolution always go through ordinary transition commands.
  for (const seat of f.state.players)
    for (const row of definitions.filter((row) => !["land", "commander"].includes(row.id))) {
      const object = locate(f, seat.id, row.id);
      if (object.zone !== "hand") move(f.state, object.id, "hand", "constructed counterspell hand");
    }
  givePriority(f.state, registry, "A");
  return f;
}
export type CounterFixture = { registry: ExecutionRegistry; state: RulesState };
export function locate(f: CounterFixture, owner: string, definitionId: string) {
  const object = Object.values(f.state.objects).find(
    (row) => row.owner === owner && row.definition === definitionId,
  );
  if (!object) throw new Error(`Missing ${owner}/${definitionId}`);
  return object;
}
export function command(f: CounterFixture, response: Response): GameCommand {
  const decision = f.state.decision;
  if (!decision) throw new Error("No pending counterspell scenario decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: f.state.manifest.id,
    commandId: `counter-scenario:${f.state.revision}`,
    actor: decision.actor,
    revision: f.state.revision,
    decisionId: decision.id,
    response,
  };
}
export function answer(f: CounterFixture, response: Response) {
  const result = transition(f.state, command(f, response), f.registry);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
  assertInvariants(f.state, f.registry);
  return result;
}
export function announce(f: CounterFixture, actor: string, id: string): string {
  for (let n = 0; n < f.state.players.length && f.state.decision?.actor !== actor; n++)
    answer(f, { kind: "pass" });
  if (f.state.decision?.kind !== "priority" || f.state.decision.actor !== actor)
    throw new Error("Actor did not receive ordinary priority");
  answer(f, { kind: "cast", card: locate(f, actor, id).id });
  const frame = f.state.frames.at(-1);
  if (frame?.kind !== "casting") throw new Error("Casting frame absent");
  return frame.card;
}
export function cast(f: CounterFixture, actor: string, id: string, target?: string): string {
  const spell = announce(f, actor, id);
  if (target !== undefined) answer(f, { kind: "target", target });
  if (f.state.decision?.kind !== "payment") throw new Error("No payment decision");
  const cost = f.state.decision.cost;
  if (!cost) throw new Error("No announced cost");
  const { generic, ...colors } = cost;
  answer(f, { kind: "payment", sources: [], spend: { ...colors, C: colors.C + generic } });
  if (card(f.state, f.registry, spell).id !== id) throw new Error("Wrong source spell");
  return spell;
}
export function resolveOne(f: CounterFixture): void {
  const top = JSON.stringify(f.state.stack.at(-1));
  for (let n = 0; n < f.state.players.length && JSON.stringify(f.state.stack.at(-1)) === top; n++)
    answer(f, { kind: "pass" });
  if (JSON.stringify(f.state.stack.at(-1)) === top) throw new Error("Stack top did not finish");
}
export function owner(f: CounterFixture, id: string) {
  return player(f.state, id);
}
