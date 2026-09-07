import {
  CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  type ExecutionRegistry,
  type GameCommand,
  type GameEvent,
  type MatchManifest,
  type Response,
  type RulesState,
  SERIALIZER_VERSION,
  semanticHash,
  TokenTemplate,
} from "@iwsdk-apps/contracts";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "../../compiler/src/prepared";
import { move, player } from "../src/common";
import { assertInvariants, createMatch, transition } from "../src/index";
import { givePriority } from "../src/turns";
import snapshot from "./damage-source.json";
import { tokenSourcePayment } from "./token-source";

export { snapshot as damageSourceSnapshot };

const definitions = Object.fromEntries(
  snapshot.cards.map((row) => {
    const card = CardDefinition.parse(row.definition);
    return [card.id, card];
  }),
);
export function damageSourceCard(name: string): CardDefinition {
  const card = Object.values(definitions).find((card) => card.name === name);
  if (!card) throw new Error(`Missing authenticated damage fixture card: ${name}`);
  return card;
}
export async function damageSourceRelease(): Promise<ContentRelease> {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-damage-source-fixture/1",
    sourceBundle: snapshot.sourceBundle,
    rulesHash: snapshot.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    tokenTemplates: Object.fromEntries(
      snapshot.tokenTemplates.map((raw) => {
        const token = TokenTemplate.parse(raw);
        return [token.id, token];
      }),
    ),
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "authenticated-damage-source-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  return { ...body, hash: await semanticHash(body) };
}
let admitted: Promise<{ release: ContentRelease; registry: ExecutionRegistry }> | undefined;
function sourceRegistry() {
  admitted ??= damageSourceRelease().then(async (release) => ({
    release,
    registry: await createFullExecutionRegistry(release),
  }));
  return admitted;
}
export async function damageSourceDeck(commander: string, names: string[]): Promise<DeckRevision> {
  const leader = damageSourceCard(commander);
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
  if (!basics.length) throw new Error("This fixture requires an ordinary basic land color");
  const unique = [...new Set([commander, ...names])];
  const remaining = 100 - unique.length;
  const body = {
    id: `damage-source:${commander}:${(await semanticHash(names)).slice(0, 16)}`,
    commander: leader.id,
    entries: [
      ...unique.map((name) => ({ definition: damageSourceCard(name).id, count: 1 })),
      ...basics.map((name, index) => ({
        definition: damageSourceCard(name).id,
        count: Math.floor(remaining / basics.length) + Number(index < remaining % basics.length),
      })),
    ],
  };
  return { ...body, hash: await semanticHash(body) };
}
export type DamageSourceFixture = {
  state: RulesState;
  registry: ExecutionRegistry;
  release: ContentRelease;
  source: string;
  history: { revision: number; response: Response; events: GameEvent[] }[];
  lands: Record<string, Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", string[]>>>;
};
export function damageSourceObject(f: DamageSourceFixture, actor: string, name: string) {
  const entry = Object.values(f.state.objects).find(
    (entry) => entry.owner === actor && entry.definition === damageSourceCard(name).id,
  );
  if (!entry) throw new Error(`Missing owned source card ${actor}/${name}`);
  return entry;
}
export function damageSourceCommand(f: DamageSourceFixture, response: Response): GameCommand {
  const decision = f.state.decision;
  if (!decision) throw new Error("No pending source scenario decision");
  return {
    schema: CONTRACT_VERSION,
    matchId: f.state.manifest.id,
    commandId: `source:${f.state.revision}`,
    actor: decision.actor,
    revision: f.state.revision,
    decisionId: decision.id,
    response,
  };
}
export function damageSourceAnswer(f: DamageSourceFixture, response: Response) {
  const result = transition(f.state, damageSourceCommand(f, response), f.registry);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
  f.history.push({ revision: f.state.revision, response, events: structuredClone(f.state.events) });
  assertInvariants(f.state, f.registry);
  return result;
}
/** Actual cards and legal100-card lists; selected hands/lands are declared constructed preconditions. */
export async function damageSourceFixture(
  commander: string,
  names: string[],
  opponent = "Tobias Andrion",
  otherNames: string[] = [],
  mode: MatchManifest["resolver"] = "full-scan",
  seats: 2 | 4 = 2,
): Promise<DamageSourceFixture> {
  const { release, registry: full } = await sourceRegistry();
  const decks = await Promise.all([
    damageSourceDeck(commander, names),
    damageSourceDeck(opponent, otherNames),
  ]);
  if (seats === 4) decks.push(...decks.slice(0, 2));
  const artifact = mode === "full-scan" ? null : await createPreparedMatchArtifact(release, decks);
  const registry = artifact ? await admitPreparedMatchArtifact(artifact, release, decks) : full;
  const f: DamageSourceFixture = {
    release,
    registry,
    source: "",
    history: [],
    lands: {},
    state: createMatch(
      {
        schema: "commander-match/1",
        id: "authenticated-damage-scenario",
        releaseHash: release.hash,
        engineVersion: ENGINE_VERSION,
        serializer: SERIALIZER_VERSION,
        chance: CHANCE_VERSION,
        gameSeed: 4,
        driverSeed: 1,
        driverVersion: "authenticated-damage-scenarios/1",
        mode: seats === 2 ? "two-seat" : "four-seat",
        resolver: mode,
        ...(artifact ? { preparedArtifactHash: artifact.hash } : {}),
        seats: decks.map((deck, index) => ({ id: String.fromCharCode(65 + index), deck })),
      },
      registry,
    ),
  };
  damageSourceAnswer(f, { kind: "starting-player", player: "A" });
  while (f.state.decision?.kind === "mulligan")
    damageSourceAnswer(f, { kind: "mulligan", keep: true });
  for (let n = 0; n < 16 && f.state.step !== "main1"; n++) damageSourceAnswer(f, { kind: "pass" });
  if (f.state.step !== "main1") throw new Error("Source scenario did not reach main phase");
  for (const [actor, hand] of [
    ["A", names],
    ["B", otherNames],
    ...(seats === 4
      ? ([
          ["C", names],
          ["D", otherNames],
        ] as const)
      : []),
  ] as const) {
    for (const name of hand) {
      const entry = damageSourceObject(f, actor, name);
      if (entry.zone !== "hand" && !entry.commander)
        move(f.state, entry.id, "hand", "constructed authenticated source hand");
    }
    const kept = new Set(hand.map((name) => damageSourceCard(name).id));
    for (const id of [...player(f.state, actor).hand])
      if (!kept.has(f.state.objects[id]?.definition ?? ""))
        move(f.state, id, "library", "constructed undeclared hand isolation");
    const lands: DamageSourceFixture["lands"][string] = {};
    for (const color of ["W", "U", "B", "R", "G"] as const) {
      const candidates = Object.values(f.state.objects)
        .filter(
          (entry) =>
            entry.owner === actor &&
            registry.definitions[entry.definition]?.manaAbilities.includes(color),
        )
        .slice(0, 10);
      lands[color] = candidates.map(
        (entry) =>
          move(f.state, entry.id, "battlefield", "constructed authenticated basic lands").id,
      );
    }
    f.lands[actor] = lands;
  }
  givePriority(f.state, registry, "A");
  assertInvariants(f.state, registry);
  return f;
}
export function damageSourceCast(
  f: DamageSourceFixture,
  actor: string,
  name: string,
  target?: string,
) {
  for (let n = 0; n < f.state.players.length && f.state.decision?.actor !== actor; n++)
    damageSourceAnswer(f, { kind: "pass" });
  if (f.state.decision?.actor !== actor) throw new Error("Source caster lacks ordinary priority");
  const before = damageSourceObject(f, actor, name);
  damageSourceAnswer(f, { kind: "cast", card: before.id });
  if (target) damageSourceAnswer(f, { kind: "target", target });
  const printedCost = (snapshot.printedCosts as Record<string, string>)[name];
  if (printedCost === undefined) throw new Error("Missing pinned printed mana cost");
  const payment = tokenSourcePayment(f, actor, printedCost);
  const paid = damageSourceAnswer(f, payment);
  const top = f.state.stack.at(-1);
  if (top?.kind !== "spell") throw new Error("Paid source is not on stack");
  return {
    id: top.objectId,
    payment,
    event: paid.state.events.find((event) => event.type === "SpellCast"),
  };
}
export function damageSourceResolve(f: DamageSourceFixture) {
  const top = f.state.stack.at(-1);
  if (!top) throw new Error("No source spell or ability to resolve");
  const same = () =>
    f.state.stack.some((entry) =>
      top.kind === "spell"
        ? entry.kind === "spell" && entry.objectId === top.objectId
        : entry.kind === "triggered-ability" && entry.triggerId === top.triggerId,
    );
  for (
    let n = 0;
    n < f.state.players.length && same() && f.state.decision?.kind === "priority";
    n++
  )
    damageSourceAnswer(f, { kind: "pass" });
  if (
    same() &&
    f.state.decision?.kind !== "trigger-payment" &&
    f.state.decision?.kind !== "damage-replacement" &&
    f.state.decision?.kind !== "commander-replacement"
  )
    throw new Error("Source did not resolve or request an owned resolution choice");
}
export function damageSourceDrain(f: DamageSourceFixture) {
  for (
    let n = 0;
    n < 200 && (f.state.stack.length || f.state.decision?.kind === "trigger-order");
    n++
  ) {
    const decision = f.state.decision;
    if (!decision) throw new Error("No owned trigger action");
    damageSourceAnswer(
      f,
      decision.kind === "trigger-order"
        ? { kind: "trigger-order", triggers: [...decision.triggers].reverse() }
        : decision.kind === "trigger-payment"
          ? { kind: "trigger-payment", pay: false }
          : { kind: "pass" },
    );
  }
  if (f.state.stack.length || f.state.decision?.kind !== "priority")
    throw new Error("Damage scenario did not finish all mandatory abilities");
}
export function damageSourceInventory(f: DamageSourceFixture, actor: string) {
  return Object.values(f.state.objects)
    .filter((entry) => entry.owner === actor && !entry.token)
    .map((entry) => `${entry.lineage}:${entry.definition}`)
    .sort();
}

/** Ordinary turn advancement without attacks; no private controller policy is claimed. */
export function damageSourceMain(f: DamageSourceFixture, actor: string): void {
  for (let n = 0; n < 300; n++) {
    const d = f.state.decision;
    if (
      f.state.activePlayer === actor &&
      f.state.step === "main1" &&
      d?.kind === "priority" &&
      d.actor === actor &&
      !f.state.stack.length
    )
      return;
    if (!d) throw new Error("Source scenario ended before requested main phase");
    const response: Response =
      d.kind === "trigger-order"
        ? { kind: "trigger-order", triggers: d.triggers }
        : d.kind === "trigger-payment"
          ? { kind: "trigger-payment", pay: false }
          : d.kind === "attack"
            ? { kind: "attack", attacks: [] }
            : d.kind === "discard"
              ? { kind: "discard", cards: d.cards.slice(0, d.count) }
              : { kind: "pass" };
    damageSourceAnswer(f, response);
  }
  throw new Error("Bounded source turn advance exhausted");
}
