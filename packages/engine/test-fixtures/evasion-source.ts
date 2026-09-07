import {
  CardDefinition,
  CHANCE_VERSION,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  type ExecutionRegistry,
  type MatchManifest,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "../../compiler/src/prepared";
import { move, player } from "../src/common";
import { assertInvariants, createMatch } from "../src/index";
import { givePriority } from "../src/turns";
import {
  type ActivationSourceFixture,
  activationSourceAnswer as answer,
  activationSourceMain as main,
  activationSourceResolve as resolve,
} from "./activation-source";
import snapshot from "./evasion-source.json";
import { tokenSourcePayment } from "./token-source";

export { snapshot as evasionSourceSnapshot };
export type EvasionCase = (typeof snapshot.cases)[number];
export const evasionSourceCases = snapshot.cases;
const definitions = Object.fromEntries(
  snapshot.cards.map((row) => {
    const definition = CardDefinition.parse(row.definition);
    return [definition.id, definition];
  }),
);
export function evasionSourceCard(name: string): CardDefinition {
  const definition = Object.values(definitions).find((card) => card.name === name);
  if (!definition) throw new Error(`Missing authenticated evasion source ${name}`);
  return definition;
}
export const evasionCommanders = Object.values(definitions)
  .filter((card) => card.commanderEligible)
  .sort((a, b) => a.colorIdentity.length - b.colorIdentity.length || a.name.localeCompare(b.name));

export function evasionCommanderFor(colors: readonly string[]): string | null {
  return (
    evasionCommanders.find(
      (commander) =>
        commander.colorIdentity.length > 0 &&
        colors.every((color) => new Set<string>(commander.colorIdentity).has(color)),
    )?.name ?? null
  );
}
export async function evasionSourceRelease(): Promise<ContentRelease> {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-evasion-source-fixture/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "authenticated-evasion-source-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  return { ...body, hash: await semanticHash(body) };
}
let cached: Promise<{ release: ContentRelease; registry: ExecutionRegistry }> | undefined;
export function evasionSourceRegistry() {
  cached ??= evasionSourceRelease().then(async (release) => ({
    release,
    registry: await createFullExecutionRegistry(release),
  }));
  return cached;
}
export async function evasionSourceDeck(
  commander: string,
  names: readonly string[],
): Promise<DeckRevision> {
  const leader = evasionSourceCard(commander);
  const basicByColor: Record<string, string> = {
    W: "Plains",
    U: "Island",
    B: "Swamp",
    R: "Mountain",
    G: "Forest",
  };
  const basics = leader.colorIdentity
    .map((color) => basicByColor[color])
    .filter((name): name is string => !!name);
  if (!basics.length) throw new Error("This source fixture requires a colored commander");
  const unique = [...new Set([commander, ...names])];
  const remaining = 100 - unique.length;
  const body = {
    id: `evasion-source:${commander}:${(await semanticHash(names)).slice(0, 16)}`,
    commander: leader.id,
    entries: [
      ...unique.map((name) => ({ definition: evasionSourceCard(name).id, count: 1 })),
      ...basics.map((name, index) => ({
        definition: evasionSourceCard(name).id,
        count: Math.floor(remaining / basics.length) + Number(index < remaining % basics.length),
      })),
    ],
  };
  return { ...body, hash: await semanticHash(body) };
}
export type EvasionSourceFixture = ActivationSourceFixture;
export function evasionSourceObject(f: EvasionSourceFixture, actor: string, name: string) {
  const result = Object.values(f.state.objects).find(
    (object) => object.owner === actor && object.definition === evasionSourceCard(name).id,
  );
  if (!result) throw new Error(`Missing physical source ${actor}/${name}`);
  return result;
}

/** Legal100-card setup; the following declared hand/land isolation is deliberately constructed. */
export async function evasionSourceFixture(
  commander: string,
  hand: readonly string[],
  otherCommander: string,
  otherHand: readonly string[],
  mode: MatchManifest["resolver"],
): Promise<EvasionSourceFixture> {
  const { release, registry: full } = await evasionSourceRegistry();
  const decks = await Promise.all([
    evasionSourceDeck(commander, hand),
    evasionSourceDeck(otherCommander, otherHand),
  ]);
  const prepared = mode === "full-scan" ? null : await createPreparedMatchArtifact(release, decks);
  const registry = prepared ? await admitPreparedMatchArtifact(prepared, release, decks) : full;
  const f: EvasionSourceFixture = {
    release,
    registry,
    source: "",
    history: [],
    lands: {},
    state: createMatch(
      {
        schema: "commander-match/1",
        id: "authenticated-evasion-source-scenario",
        releaseHash: release.hash,
        engineVersion: ENGINE_VERSION,
        serializer: SERIALIZER_VERSION,
        chance: CHANCE_VERSION,
        gameSeed: 4,
        driverSeed: 1,
        driverVersion: "authenticated-evasion-scenarios/1",
        mode: "two-seat",
        resolver: mode,
        ...(prepared ? { preparedArtifactHash: prepared.hash } : {}),
        seats: decks.map((deck, index) => ({ id: index === 0 ? "A" : "B", deck })),
      },
      registry,
    ),
  };
  answer(f, { kind: "starting-player", player: "A" });
  while (f.state.decision?.kind === "mulligan") answer(f, { kind: "mulligan", keep: true });
  main(f, "A");
  for (const [actor, selected] of [
    ["A", hand],
    ["B", otherHand],
  ] as const) {
    for (const name of selected) {
      const object = evasionSourceObject(f, actor, name);
      if (!object.commander && object.zone !== "hand")
        move(f.state, object.id, "hand", "constructed authenticated evasion hand");
    }
    const retained = new Set(selected.map((name) => evasionSourceCard(name).id));
    for (const id of [...player(f.state, actor).hand])
      if (!retained.has(f.state.objects[id]?.definition ?? ""))
        move(f.state, id, "library", "constructed other-hand isolation");
    const lands: EvasionSourceFixture["lands"][string] = {};
    for (const color of ["W", "U", "B", "R", "G"] as const) {
      const cards = Object.values(f.state.objects)
        .filter(
          (object) =>
            object.owner === actor &&
            registry.definitions[object.definition]?.types.includes("Land") &&
            registry.definitions[object.definition]?.manaAbilities.includes(color),
        )
        .slice(0, 16);
      lands[color] = cards.map(
        (object) =>
          move(f.state, object.id, "battlefield", "constructed authenticated basic lands").id,
      );
    }
    f.lands[actor] = lands;
  }
  givePriority(f.state, registry, "A");
  assertInvariants(f.state, registry);
  return f;
}

export function evasionSourceCast(f: EvasionSourceFixture, actor: string, name: string) {
  main(f, actor);
  const before = evasionSourceObject(f, actor, name);
  answer(f, { kind: "cast", card: before.id });
  const printed = snapshot.cards.find((row) => row.definition.name === name)?.printedCost;
  if (printed === undefined) throw new Error("Missing pinned printed cast cost");
  const paid = answer(f, tokenSourcePayment(f, actor, printed));
  const event = paid.state.events.find((entry) => entry.type === "SpellCast");
  if (!event) throw new Error("Actual source cast was not committed");
  resolve(f);
  const object = evasionSourceObject(f, actor, name);
  if (object.zone !== "battlefield")
    throw new Error("Source creature did not resolve to battlefield");
  return { id: object.id, cast: structuredClone(event) };
}

export function evasionAttack(f: EvasionSourceFixture, ids: readonly string[]) {
  main(f, "A");
  const kind = () => f.state.decision?.kind;
  for (let n = 0; n < 12 && kind() !== "attack"; n++) answer(f, { kind: "pass" });
  if (kind() !== "attack") throw new Error("No ordinary attack declaration");
  answer(f, { kind: "attack", attacks: ids.map((attacker) => ({ attacker, defender: "B" })) });
  for (let n = 0; n < 8 && kind() !== "block"; n++) answer(f, { kind: "pass" });
  if (kind() !== "block") throw new Error("No ordinary blocker declaration");
}
