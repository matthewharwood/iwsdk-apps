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
import snapshot from "./activation-source.json";
import { tokenSourcePayment } from "./token-source";

export { snapshot as activationSourceSnapshot };

const definitions = Object.fromEntries(
  snapshot.cards.map((row) => {
    const card = CardDefinition.parse(row.definition);
    return [card.id, card];
  }),
);
export function activationSourceCard(name: string): CardDefinition {
  const card = Object.values(definitions).find((card) => card.name === name);
  if (!card) throw new Error(`Missing authenticated activation fixture card: ${name}`);
  return card;
}
export async function activationSourceRelease(): Promise<ContentRelease> {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-activation-source-fixture/1",
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
    compilerVersion: "authenticated-activation-source-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  return { ...body, hash: await semanticHash(body) };
}
let admitted: Promise<{ release: ContentRelease; registry: ExecutionRegistry }> | undefined;
function sourceRegistry() {
  admitted ??= activationSourceRelease().then(async (release) => ({
    release,
    registry: await createFullExecutionRegistry(release),
  }));
  return admitted;
}
export async function activationSourceDeck(
  commander: string,
  names: string[],
): Promise<DeckRevision> {
  const leader = activationSourceCard(commander);
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
    id: `activation-source:${commander}:${(await semanticHash(names)).slice(0, 16)}`,
    commander: leader.id,
    entries: [
      ...unique.map((name) => ({ definition: activationSourceCard(name).id, count: 1 })),
      ...basics.map((name, index) => ({
        definition: activationSourceCard(name).id,
        count: Math.floor(remaining / basics.length) + Number(index < remaining % basics.length),
      })),
    ],
  };
  return { ...body, hash: await semanticHash(body) };
}
export type ActivationSourceFixture = {
  state: RulesState;
  registry: ExecutionRegistry;
  release: ContentRelease;
  source: string;
  history: { revision: number; response: Response; events: GameEvent[] }[];
  lands: Record<string, Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", string[]>>>;
};
export function activationSourceObject(f: ActivationSourceFixture, actor: string, name: string) {
  const entry = Object.values(f.state.objects).find(
    (entry) => entry.owner === actor && entry.definition === activationSourceCard(name).id,
  );
  if (!entry) throw new Error(`Missing owned source card ${actor}/${name}`);
  return entry;
}
export function activationSourceCommand(
  f: ActivationSourceFixture,
  response: Response,
): GameCommand {
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
export function activationSourceAnswer(f: ActivationSourceFixture, response: Response) {
  const result = transition(f.state, activationSourceCommand(f, response), f.registry);
  if (result.status !== "accepted") throw new Error(`${result.code}: ${result.message}`);
  f.state = result.state;
  f.history.push({ revision: f.state.revision, response, events: structuredClone(f.state.events) });
  assertInvariants(f.state, f.registry);
  return result;
}
/** Actual cards and legal100-card lists; selected hands/lands are declared constructed preconditions. */
export async function activationSourceFixture(
  commander: string,
  names: string[],
  opponent = "Tobias Andrion",
  otherNames: string[] = [],
  mode: MatchManifest["resolver"] = "full-scan",
  seats: 2 | 4 = 2,
): Promise<ActivationSourceFixture> {
  const { release, registry: full } = await sourceRegistry();
  const decks = await Promise.all([
    activationSourceDeck(commander, names),
    activationSourceDeck(opponent, otherNames),
  ]);
  if (seats === 4) decks.push(...decks.slice(0, 2));
  const artifact = mode === "full-scan" ? null : await createPreparedMatchArtifact(release, decks);
  const registry = artifact ? await admitPreparedMatchArtifact(artifact, release, decks) : full;
  const f: ActivationSourceFixture = {
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
  activationSourceAnswer(f, { kind: "starting-player", player: "A" });
  while (f.state.decision?.kind === "mulligan")
    activationSourceAnswer(f, { kind: "mulligan", keep: true });
  for (let n = 0; n < 16 && f.state.step !== "main1"; n++)
    activationSourceAnswer(f, { kind: "pass" });
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
      const entry = activationSourceObject(f, actor, name);
      if (entry.zone !== "hand" && !entry.commander)
        move(f.state, entry.id, "hand", "constructed authenticated source hand");
    }
    const kept = new Set(hand.map((name) => activationSourceCard(name).id));
    for (const id of [...player(f.state, actor).hand])
      if (!kept.has(f.state.objects[id]?.definition ?? ""))
        move(f.state, id, "library", "constructed undeclared hand isolation");
    const lands: ActivationSourceFixture["lands"][string] = {};
    for (const color of ["W", "U", "B", "R", "G"] as const) {
      const candidates = Object.values(f.state.objects)
        .filter(
          (entry) =>
            entry.owner === actor &&
            registry.definitions[entry.definition]?.types.includes("Land") &&
            registry.definitions[entry.definition]?.manaAbilities.includes(color),
        )
        .slice(0, 16);
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
export function activationSourceCast(
  f: ActivationSourceFixture,
  actor: string,
  name: string,
  target?: string,
) {
  for (let n = 0; n < f.state.players.length && f.state.decision?.actor !== actor; n++)
    activationSourceAnswer(f, { kind: "pass" });
  if (f.state.decision?.actor !== actor) throw new Error("Source caster lacks ordinary priority");
  const before = activationSourceObject(f, actor, name);
  activationSourceAnswer(f, { kind: "cast", card: before.id });
  if (target) activationSourceAnswer(f, { kind: "target", target });
  const printedCost = (snapshot.printedCosts as Record<string, string>)[name];
  if (printedCost === undefined) throw new Error("Missing pinned printed mana cost");
  const payment = tokenSourcePayment(f, actor, printedCost);
  const paid = activationSourceAnswer(f, payment);
  const top = f.state.stack.at(-1);
  if (top?.kind !== "spell") throw new Error("Paid source is not on stack");
  return {
    id: top.objectId,
    payment,
    event: paid.state.events.find((event) => event.type === "SpellCast"),
  };
}
export function activationSourceResolve(f: ActivationSourceFixture) {
  const top = f.state.stack.at(-1);
  if (!top) throw new Error("No source spell or ability to resolve");
  const same = () =>
    f.state.stack.some((entry) =>
      top.kind === "spell"
        ? entry.kind === "spell" && entry.objectId === top.objectId
        : top.kind === "triggered-ability"
          ? entry.kind === "triggered-ability" && entry.triggerId === top.triggerId
          : entry.kind === "activated-ability" && entry.abilityId === top.abilityId,
    );
  for (
    let n = 0;
    n < f.state.players.length && same() && f.state.decision?.kind === "priority";
    n++
  )
    activationSourceAnswer(f, { kind: "pass" });
  if (
    same() &&
    f.state.decision?.kind !== "trigger-payment" &&
    f.state.decision?.kind !== "damage-replacement" &&
    f.state.decision?.kind !== "commander-replacement"
  )
    throw new Error("Source did not resolve or request an owned resolution choice");
}
export function activationSourceDrain(f: ActivationSourceFixture) {
  for (
    let n = 0;
    n < 200 && (f.state.stack.length || f.state.decision?.kind === "trigger-order");
    n++
  ) {
    const decision = f.state.decision;
    if (!decision) throw new Error("No owned trigger action");
    activationSourceAnswer(
      f,
      decision.kind === "trigger-order"
        ? { kind: "trigger-order", triggers: [...decision.triggers].reverse() }
        : decision.kind === "trigger-payment"
          ? { kind: "trigger-payment", pay: false }
          : { kind: "pass" },
    );
  }
  if (f.state.stack.length || f.state.decision?.kind !== "priority")
    throw new Error("Activation scenario did not finish all mandatory abilities");
}
export function activationSourceInventory(f: ActivationSourceFixture, actor: string) {
  return Object.values(f.state.objects)
    .filter((entry) => entry.owner === actor && !entry.token)
    .map((entry) => `${entry.lineage}:${entry.definition}`)
    .sort();
}

/** Ordinary turn advancement without attacks; no private controller policy is claimed. */
export function activationSourceMain(f: ActivationSourceFixture, actor: string): void {
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
    activationSourceAnswer(f, response);
  }
  throw new Error("Bounded source turn advance exhausted");
}

/** Test-only scripted activation using an independently supplied printed mana cost. */
export function activationSourceActivate(
  f: ActivationSourceFixture,
  actor: string,
  name: string,
  printedMana: string,
  target?: string,
) {
  for (let n = 0; n < f.state.players.length && f.state.decision?.actor !== actor; n++)
    activationSourceAnswer(f, { kind: "pass" });
  const source = activationSourceObject(f, actor, name);
  activationSourceAnswer(f, { kind: "activate", source: source.id, programIndex: 0 });
  if (target) activationSourceAnswer(f, { kind: "activation-target", target });
  const payment = tokenSourcePayment(f, actor, printedMana);
  activationSourceAnswer(f, {
    kind: "activation-payment",
    sources: payment.sources,
    spend: payment.spend,
  });
  const top = f.state.stack.at(-1);
  if (top?.kind !== "activated-ability")
    throw new Error("Activated source did not create a noncard stack object");
  const ability = f.state.activatedAbilities?.[top.abilityId];
  if (!ability) throw new Error("Activated source lost its durable context");
  return structuredClone(ability);
}
export function activationSourcePermanent(
  f: ActivationSourceFixture,
  actor: string,
  name: string,
): string {
  activationSourceCast(f, actor, name);
  activationSourceResolve(f);
  return activationSourceObject(f, actor, name).id;
}
export function activationSourceNextTurn(f: ActivationSourceFixture, actor: string) {
  const other = f.state.players.find((seat) => !seat.lost && seat.id !== actor);
  if (!other) throw new Error("Source scenario needs another player");
  activationSourceMain(f, other.id);
  activationSourceMain(f, actor);
}
