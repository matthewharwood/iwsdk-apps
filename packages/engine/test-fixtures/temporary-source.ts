import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  ENGINE_VERSION,
  type ExecutionRegistry,
  emptyMana,
  type GameEvent,
  type Keyword,
  type MatchManifest,
  type Response,
  SERIALIZER_VERSION,
} from "@iwsdk-apps/contracts";
import { move, player } from "../src/common";
import { assertInvariants, createMatch, transition } from "../src/index";
import { givePriority } from "../src/turns";

/** Deliberately constructed board/hand/mana around an unchanged source spell; not a full-game fixture. */
export function temporarySourceFixture(
  spell: CardDefinition,
  options: { targetToughness?: number; targetKeywords?: Keyword[] } = {},
) {
  const commander: CardDefinition = {
    id: "scenario:commander",
    oracleId: "synthetic-five-color-unit",
    sourceVersion: "f".repeat(64),
    name: "Synthetic source-cast commander",
    typeLine: "Legendary Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: ["Legendary"],
    colors: ["W", "U", "B", "R", "G"],
    colorIdentity: ["W", "U", "B", "R", "G"],
    manaCost: { ...emptyMana(), generic: 0 },
    manaValue: 0,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: true,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "source-cast-scenario/1",
  };
  const target: CardDefinition = {
    ...commander,
    id: "scenario:target",
    oracleId: "synthetic-target",
    name: "Synthetic target body",
    typeLine: "Creature",
    supertypes: [],
    colors: [],
    colorIdentity: [],
    commanderEligible: false,
    toughness: options.targetToughness ?? 12000,
    keywords: options.targetKeywords ?? ["vigilance"],
  };
  const other: CardDefinition = {
    ...target,
    id: "scenario:other",
    oracleId: "synthetic-other",
    name: "Synthetic untouched body",
    toughness: 12000,
    keywords: ["vigilance"],
  };
  const land: CardDefinition = {
    ...target,
    id: "scenario:land",
    oracleId: "synthetic-land",
    name: "Synthetic Plains",
    typeLine: "Basic Land — Plains",
    types: ["Land"],
    subtypes: ["Plains"],
    supertypes: ["Basic"],
    power: null,
    toughness: null,
    keywords: [],
    manaAbilities: ["W"],
    colorIdentity: ["W"],
    manaCost: null,
    manaValue: 0,
    deckLimit: null,
  };
  const definitions = [commander, target, other, land, spell];
  const registry: ExecutionRegistry = {
    sourceReleaseHash: "e".repeat(64),
    preparedArtifactHash: null,
    definitions: Object.fromEntries(definitions.map((d) => [d.id, structuredClone(d)])),
  };
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: `source-cast:${spell.oracleId}`,
    releaseHash: registry.sourceReleaseHash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 41,
    driverSeed: 1,
    driverVersion: "constructed-source-cast/1",
    mode: "two-seat",
    resolver: "full-scan",
    seats: ["A", "B"].map((id) => ({
      id,
      deck: {
        id: "source-cast-unit-deck",
        hash: "d".repeat(64),
        commander: commander.id,
        entries: definitions.map((d) => ({ definition: d.id, count: d.id === land.id ? 96 : 1 })),
      },
    })),
  };
  let state = createMatch(manifest, registry);
  const history: GameEvent[] = [];
  const send = (response: Response) => {
    const decision = state.decision;
    if (!decision) throw new Error("Missing pending scenario decision");
    const result = transition(
      state,
      {
        schema: CONTRACT_VERSION,
        matchId: manifest.id,
        commandId: `source-cast:${state.revision}`,
        actor: decision.actor,
        revision: state.revision,
        decisionId: decision.id,
        response,
      },
      registry,
    );
    if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
    state = result.state;
    assertInvariants(state, registry);
    history.push(...state.events);
  };
  send({ kind: "starting-player", player: "A" });
  while (state.decision?.kind === "mulligan") send({ kind: "mulligan", keep: true });
  for (let n = 0; n < 16 && state.step !== "main1"; n++) send({ kind: "pass" });
  if (state.step !== "main1") throw new Error("Main phase precondition not reached");
  function locate(owner: string, id: string) {
    const object = Object.values(state.objects).find(
      (o) => o.owner === owner && o.definition === id,
    );
    if (!object) throw new Error(`Missing ${owner}/${id}`);
    return object;
  }
  const targetObject = move(
    state,
    locate("B", target.id).id,
    "battlefield",
    "constructed target-board precondition",
  );
  const otherObject = move(
    state,
    locate("B", other.id).id,
    "battlefield",
    "constructed non-target board precondition",
  );
  const initialSpell = locate("A", spell.id);
  const held =
    initialSpell.zone === "hand"
      ? initialSpell
      : move(state, initialSpell.id, "hand", "constructed source-card hand precondition");
  if (!spell.manaCost) throw new Error("Source spell lacks cost");
  const { generic, ...colors } = spell.manaCost;
  const spend = { ...colors, C: colors.C + generic };
  player(state, "A").mana = { ...spend };
  givePriority(state, registry, "A");
  history.length = 0;
  const pendingDecision = () => state.decision;
  const cast = () => {
    send({ kind: "cast", card: held.id });
    if (state.decision?.kind !== "target") throw new Error("No target choice");
    if (!state.decision.cards.includes(targetObject.id)) throw new Error("Source target excluded");
    send({ kind: "target", target: targetObject.id });
    if (pendingDecision()?.kind !== "payment") throw new Error("No payment choice");
    send({ kind: "payment", sources: [], spend });
    const top = state.stack.at(-1);
    if (top?.kind !== "spell") throw new Error("No source spell on stack");
    return top.objectId;
  };
  const resolve = () => {
    const depth = state.stack.length;
    for (let n = 0; n < 4 && state.stack.length === depth; n++) send({ kind: "pass" });
    if (state.stack.length >= depth) throw new Error("Source spell did not resolve");
  };
  return {
    registry,
    spell,
    targetId: targetObject.id,
    targetLineage: targetObject.lineage,
    otherId: otherObject.id,
    history,
    cast,
    resolve,
    send,
    get state() {
      return state;
    },
  };
}
