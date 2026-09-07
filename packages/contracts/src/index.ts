import { z } from "zod";
import { StaticCreatureBonus } from "./static-bonus";
import { SelfEntryProgram } from "./triggers";

export { ReviewedCreatureSubtype, StaticCreatureBonus } from "./static-bonus";
export {
  OrderedSelfEntryProgram,
  SelfEntryEffect,
  SelfEntryProgram,
  SingleSelfEntryProgram,
  selfEntryEffects,
} from "./triggers";

export const CONTRACT_VERSION = "commander-contract/1";
export const ENGINE_VERSION = "commander-engine/0.13.0";
export const CHANCE_VERSION = "xorshift32-fisher-yates/1";
export const SERIALIZER_VERSION = "sorted-json/1";
export const Id = z.string().min(1).max(240);
export const Digest = z.string().regex(/^[a-f0-9]{64}$/);
export const Natural = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const ManaColor = z.enum(["W", "U", "B", "R", "G", "C"]);
export type ManaColor = z.infer<typeof ManaColor>;
export const MANA_COLORS = ManaColor.options;
export const Mana = z.strictObject({
  W: Natural,
  U: Natural,
  B: Natural,
  R: Natural,
  G: Natural,
  C: Natural,
});
export type Mana = z.infer<typeof Mana>;
export const Cost = Mana.extend({ generic: Natural });
export type Cost = z.infer<typeof Cost>;
export function emptyMana(): Mana {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}
export const Keyword = z.enum([
  "flying",
  "reach",
  "vigilance",
  "haste",
  "defender",
  "menace",
  "trample",
  "first-strike",
  "double-strike",
  "deathtouch",
  "lifelink",
  "indestructible",
  "hexproof",
  "shroud",
  "flash",
]);
export type Keyword = z.infer<typeof Keyword>;
export const TokenTemplateId = z.string().regex(/^token-template:[a-f0-9]{64}$/);
export const TokenTemplate = z.strictObject({
  schema: z.literal("fixed-token-template/1"),
  id: TokenTemplateId,
  rulesHash: Digest,
  characteristics: z.strictObject({
    name: z.string().min(1),
    types: z.tuple([z.literal("Creature")]),
    subtypes: z.array(z.string().min(1)).min(1).max(8),
    supertypes: z.tuple([]),
    colors: z
      .array(z.enum(["W", "U", "B", "R", "G"]))
      .max(5)
      .refine((values) => new Set(values).size === values.length),
    manaCost: z.null(),
    manaValue: z.literal(0),
    power: z.number().int().min(0).max(100_000),
    toughness: z.number().int().min(0).max(100_000),
    keywords: z
      .array(Keyword)
      .max(15)
      .refine((values) => new Set(values).size === values.length),
  }),
});
export type TokenTemplate = z.infer<typeof TokenTemplate>;
export const TokenOrigin = z.strictObject({
  creator: Id,
  creationEvent: Natural,
  ordinal: Natural.max(3),
  source: z.strictObject({
    id: Id,
    lineage: Id,
    generation: Natural,
    definition: Id,
    owner: Id,
    controller: Id,
    zone: z.literal("stack"),
  }),
  sourceVersion: Digest,
  programIndex: z.literal(0),
});
export type TokenOrigin = z.infer<typeof TokenOrigin>;

export const CreatureModifier = z.strictObject({
  kind: z.literal("modify-creature"),
  powerDelta: z.number().int().min(-100_000).max(100_000),
  toughnessDelta: z.number().int().min(-100_000).max(100_000),
  keywords: z
    .array(Keyword)
    .max(15)
    .refine((values) => new Set(values).size === values.length),
  duration: z.literal("until-end-of-turn"),
});
export type CreatureModifier = z.infer<typeof CreatureModifier>;
export const DerivedCharacteristics = z.strictObject({
  power: z.number().int().nullable(),
  toughness: z.number().int().nullable(),
  keywords: z.array(Keyword),
});
export type DerivedCharacteristics = z.infer<typeof DerivedCharacteristics>;
export const SpellEffect = z.discriminatedUnion("kind", [
  CreatureModifier,
  z.strictObject({
    kind: z.literal("create-token"),
    recipient: z.literal("controller"),
    count: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    templateId: TokenTemplateId,
  }),
  z.strictObject({
    kind: z.literal("draw"),
    recipient: z.enum(["controller", "target"]),
    amount: Natural.min(1).max(100_000),
  }),
  z.strictObject({
    kind: z.literal("gain-life"),
    recipient: z.enum(["controller", "target"]),
    amount: Natural.min(1).max(100_000),
  }),
  z.strictObject({ kind: z.literal("damage"), amount: Natural.min(1).max(100_000) }),
  z.strictObject({ kind: z.literal("destroy") }),
  z.strictObject({ kind: z.literal("exile") }),
  z.strictObject({ kind: z.literal("counter") }),
  z.strictObject({ kind: z.literal("return-to-hand") }),
]);
export type SpellEffect = z.infer<typeof SpellEffect>;
/** Executable instructions; reviewed source compilation assigns these, never runtime prose. */
export const SpellProgram = z
  .strictObject({
    schema: z.literal("commander-spell/1"),
    target: z
      .enum(["player", "creature", "spell", "creature-spell", "noncreature-spell"])
      .nullable(),
    effects: z.array(SpellEffect).min(1).max(16),
  })
  .superRefine((program, context) => {
    if (
      program.effects.some((effect) => effect.kind === "create-token") &&
      (program.target !== null || program.effects.length !== 1)
    )
      context.addIssue({
        code: "custom",
        message: "Fixed token programs require one nontargeted controller creation instruction.",
      });

    const returning = program.effects.some((effect) => effect.kind === "return-to-hand");
    const followup = program.effects[1];
    if (
      returning &&
      (program.target !== "creature" ||
        program.effects[0]?.kind !== "return-to-hand" ||
        program.effects.length > 2 ||
        (followup !== undefined &&
          !(
            followup.kind === "draw" &&
            followup.recipient === "controller" &&
            followup.amount === 1
          )))
    )
      context.addIssue({
        code: "custom",
        message:
          "Return programs support one creature return, optionally followed by controller draw one.",
      });
    const stackTarget =
      program.target === "spell" ||
      program.target === "creature-spell" ||
      program.target === "noncreature-spell";
    const counter = program.effects.some((effect) => effect.kind === "counter");
    if (stackTarget !== counter || (counter && program.effects.length !== 1))
      context.addIssue({
        code: "custom",
        message:
          "This program version requires exactly one counter instruction with a spell target.",
      });
    const targets = program.effects.filter(
      (effect) => !("recipient" in effect) || effect.recipient === "target",
    );
    if ((program.target === null) !== (targets.length === 0))
      context.addIssue({
        code: "custom",
        message: "The target domain must agree with its target-using effects.",
      });
    if (program.target === "creature" && targets.some((effect) => "recipient" in effect))
      context.addIssue({
        code: "custom",
        message: "A creature cannot be the recipient of drawing cards or gaining life.",
      });
    if (
      program.effects.some((effect) => effect.kind === "modify-creature") &&
      program.target !== "creature"
    )
      context.addIssue({
        code: "custom",
        message: "Temporary creature modifiers require a creature target.",
      });
    const removalIndex = program.effects.findIndex(
      (effect) => effect.kind === "destroy" || effect.kind === "exile",
    );
    if (removalIndex >= 0 && program.target !== "creature")
      context.addIssue({
        code: "custom",
        message: "Destroy and exile programs require a creature target.",
      });
    if (
      removalIndex >= 0 &&
      program.effects
        .slice(removalIndex + 1)
        .some((effect) => !("recipient" in effect) || effect.recipient === "target")
    )
      context.addIssue({
        code: "custom",
        message: "This program version cannot reference the target after a removal instruction.",
      });
  });
export type SpellProgram = z.infer<typeof SpellProgram>;
export const CardDefinition = z.strictObject({
  id: Id,
  oracleId: Id,
  sourceVersion: Digest,
  name: z.string().min(1),
  typeLine: z.string(),
  types: z.array(z.string()),
  subtypes: z.array(z.string()),
  supertypes: z.array(z.string()),
  colors: z.array(ManaColor),
  colorIdentity: z.array(ManaColor),
  manaCost: Cost.nullable(),
  manaValue: Natural,
  power: z.number().int().nullable(),
  toughness: z.number().int().nullable(),
  keywords: z.array(Keyword),
  manaAbilities: z.array(ManaColor),
  oracleText: z.string(),
  commanderEligible: z.boolean(),
  deckLimit: Natural.nullable(),
  obligations: z.array(Id),
  implementationRevision: Id,
  spellProgram: SpellProgram.optional(),
  triggerPrograms: z.array(SelfEntryProgram).min(1).max(1).optional(),
  staticPrograms: z.tuple([StaticCreatureBonus]).optional(),
});
export type CardDefinition = z.infer<typeof CardDefinition>;
export const ContentRelease = z.strictObject({
  schema: z.literal("commander-content/1"),
  id: Id,
  hash: Digest,
  sourceBundle: Id,
  rulesHash: Digest,
  profile: z.literal("tabletop-commander"),
  assurance: z.literal("development-subset"),
  definitions: z.record(Id, CardDefinition),
  tokenTemplates: z.record(TokenTemplateId, TokenTemplate).optional(),
  unsupportedOracleIds: z.array(Id),
  eligibleDenominator: Natural,
  compilerVersion: Id,
  processorAbi: Id,
});
export type ContentRelease = z.infer<typeof ContentRelease>;
export const DeckRevision = z.strictObject({
  id: Id,
  hash: Digest,
  commander: Id,
  entries: z
    .array(z.strictObject({ definition: Id, count: Natural.min(1) }))
    .min(1)
    .max(100),
});
export type DeckRevision = z.infer<typeof DeckRevision>;
export const MatchManifest = z.strictObject({
  schema: z.literal("commander-match/1"),
  id: Id,
  releaseHash: Digest,
  engineVersion: z.literal(ENGINE_VERSION),
  serializer: z.literal(SERIALIZER_VERSION),
  chance: z.literal(CHANCE_VERSION),
  gameSeed: z.number().int().min(1).max(0xffffffff),
  driverSeed: z.number().int().min(1).max(0xffffffff),
  driverVersion: Id,
  mode: z.enum(["two-seat", "four-seat"]),
  seats: z
    .array(z.strictObject({ id: Id, deck: DeckRevision }))
    .min(2)
    .max(4),
  resolver: z.enum(["full-scan", "prepared-scan", "prepared-indexed"]),
  preparedArtifactHash: Digest.optional(),
});
export type MatchManifest = z.infer<typeof MatchManifest>;
export const Zone = z.enum([
  "library",
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "command",
  "stack",
]);
export type Zone = z.infer<typeof Zone>;
export const GameObject = z.strictObject({
  id: Id,
  lineage: Id,
  generation: Natural,
  definition: Id,
  owner: Id,
  controller: Id,
  zone: Zone,
  tapped: z.boolean(),
  controlledSinceTurn: Natural,
  damage: Natural,
  deathtouchDamage: z.boolean(),
  counters: z.record(z.string(), z.number().int()),
  commander: z.boolean(),
  commanderMoveOffered: z.boolean(),
  spellState: z.strictObject({ target: Id.nullable() }).optional(),
  token: TokenOrigin.optional(),
});
export type GameObject = z.infer<typeof GameObject>;
/** Noncard ability context survives changes to or removal of its physical source. */
export const TriggeredAbility = z.strictObject({
  id: Id,
  source: GameObject,
  sourceVersion: Digest,
  controller: Id,
  program: SelfEntryProgram,
  eventIndex: Natural,
  occurrenceOrdinal: Natural,
});
export type TriggeredAbility = z.infer<typeof TriggeredAbility>;
export const StackEntry = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("spell"), objectId: Id }),
  z.strictObject({ kind: z.literal("triggered-ability"), triggerId: Id }),
]);
export type StackEntry = z.infer<typeof StackEntry>;
export const TriggerPlacement = z.strictObject({
  phase: z.enum(["ordinary", "triggered-by-trigger"]),
  cohort: z.array(Id),
  remainingPlayers: z.array(Id),
});
export const PlayerState = z.strictObject({
  id: Id,
  life: z.number().int(),
  poison: Natural,
  lost: z.boolean(),
  lossReason: z.string().nullable(),
  library: z.array(Id),
  hand: z.array(Id),
  graveyard: z.array(Id),
  mana: Mana,
  landsPlayed: Natural,
  commanderCasts: z.record(Id, Natural),
  commanderDamage: z.record(Id, Natural),
  drawnFromEmptyLibrary: z.boolean(),
  mulligans: Natural,
  keptHand: z.boolean(),
  lastTurnStarted: Natural,
});
export type PlayerState = z.infer<typeof PlayerState>;
export const Step = z.enum([
  "setup",
  "upkeep",
  "draw",
  "main1",
  "begin-combat",
  "attackers",
  "blockers",
  "first-strike-damage",
  "combat-damage",
  "end-combat",
  "main2",
  "end",
  "cleanup",
]);
export type Step = z.infer<typeof Step>;
export const PaymentSource = z.strictObject({ object: Id, color: ManaColor });
export const Attack = z.strictObject({ attacker: Id, defender: Id });
export const Block = z.strictObject({ blocker: Id, attacker: Id });
export const Response = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("trigger-order"), triggers: z.array(Id) }),
  z.strictObject({ kind: z.literal("starting-player"), player: Id }),
  z.strictObject({ kind: z.literal("mulligan"), keep: z.boolean() }),
  z.strictObject({ kind: z.literal("bottom"), cards: z.array(Id).max(7) }),
  z.strictObject({ kind: z.literal("pass") }),
  z.strictObject({ kind: z.literal("land"), card: Id }),
  z.strictObject({ kind: z.literal("cast"), card: Id }),
  z.strictObject({ kind: z.literal("target"), target: Id }),
  z.strictObject({ kind: z.literal("mana"), source: PaymentSource }),
  z.strictObject({
    kind: z.literal("payment"),
    sources: z.array(PaymentSource).max(100),
    spend: Mana,
  }),
  z.strictObject({ kind: z.literal("cancel-cast") }),
  z.strictObject({ kind: z.literal("attack"), attacks: z.array(Attack).max(1000) }),
  z.strictObject({ kind: z.literal("block"), blocks: z.array(Block).max(1000) }),
  z.strictObject({
    kind: z.literal("damage"),
    allocations: z.array(z.strictObject({ source: Id, target: Id, amount: Natural })).max(2000),
  }),
  z.strictObject({ kind: z.literal("commander-zone"), move: z.boolean() }),
  z.strictObject({ kind: z.literal("commander-replacement"), move: z.boolean() }),
  z.strictObject({ kind: z.literal("discard"), cards: z.array(Id).max(1000) }),
]);
export type Response = z.infer<typeof Response>;
export const GameCommand = z.strictObject({
  schema: z.literal(CONTRACT_VERSION),
  matchId: Id,
  commandId: Id,
  actor: Id,
  revision: Natural,
  decisionId: Id,
  response: Response,
});
export type GameCommand = z.infer<typeof GameCommand>;
export const Decision = z.strictObject({
  id: Id,
  actor: Id,
  revision: Natural,
  kind: z.enum([
    "trigger-order",
    "starting-player",
    "mulligan",
    "bottom",
    "priority",
    "target",
    "payment",
    "attack",
    "block",
    "damage",
    "commander-zone",
    "commander-replacement",
    "discard",
  ]),
  context: z.string(),
  count: Natural,
  cards: z.array(Id),
  triggers: z.array(Id),
  players: z.array(Id),
  manaSources: z.array(z.strictObject({ object: Id, colors: z.array(ManaColor) })),
  cost: Cost.nullable(),
  cardCosts: z.record(Id, Cost),
  damageDomain: z.array(
    z.strictObject({
      source: Id,
      power: Natural,
      targets: z.array(
        z.strictObject({ id: Id, kind: z.enum(["player", "creature"]), lethal: Natural }),
      ),
      tramplePlayer: Id.nullable(),
    }),
  ),
});
export type Decision = z.infer<typeof Decision>;
export const GameEvent = z.strictObject({
  index: Natural,
  epoch: Natural,
  type: Id,
  visibility: z.union([z.literal("public"), z.literal("judge"), z.array(Id)]),
  cause: Id,
  data: z.record(z.string(), z.json()),
});
export type GameEvent = z.infer<typeof GameEvent>;
export const CombatState = z.strictObject({
  attacks: z.array(Attack),
  blocks: z.array(Block),
  blocked: z.array(Id),
  remainingDefenders: z.array(Id),
  damageActors: z.array(Id),
  allocations: z.array(z.strictObject({ source: Id, target: Id, amount: Natural })),
  firstStrikeParticipants: z.array(Id),
});
/** A single uncommitted hand movement; general competing replacement ordering is not represented. */
export const ResolvingSpellFrame = z.strictObject({
  kind: z.literal("resolving-spell"),
  source: GameObject,
  sourceVersion: Digest,
  controller: Id,
  program: SpellProgram,
  target: Id,
  effectIndex: Natural.max(15),
  pendingMovement: z.strictObject({
    id: Id,
    proposedAtEvent: Natural,
    before: GameObject,
    destination: z.literal("hand"),
    replacement: z.literal("commander-hand/1"),
  }),
});
export type ResolvingSpellFrame = z.infer<typeof ResolvingSpellFrame>;
export const Frame = z.discriminatedUnion("kind", [
  ResolvingSpellFrame,
  z.strictObject({
    kind: z.literal("casting"),
    card: Id,
    actor: Id,
    cost: Cost,
    origin: GameObject,
    handIndex: Natural.nullable(),
    target: Id.nullable(),
  }),
  z.strictObject({
    kind: z.literal("commander-zone"),
    cards: z.array(Id),
    resume: z.literal("checkpoint"),
  }),
]);
export const ContinuousEffect = z.strictObject({
  id: Id,
  source: GameObject,
  sourceVersion: Digest,
  controller: Id,
  programIndex: Natural.max(15),
  eventIndex: Natural,
  affectedObject: Id,
  expiresAfterTurn: Natural.min(1),
  modifier: CreatureModifier,
});
export type ContinuousEffect = z.infer<typeof ContinuousEffect>;
export const RulesState = z.strictObject({
  schema: z.literal("commander-state/1"),
  manifest: MatchManifest,
  revision: Natural,
  epoch: Natural,
  turn: Natural,
  startingPlayerChooser: Id,
  startingPlayer: Id.nullable(),
  activePlayer: Id.nullable(),
  priorityPlayer: Id.nullable(),
  eventSequence: Natural,
  setupChoices: z.record(Id, z.boolean()),
  step: Step,
  consecutivePasses: Natural,
  cleanupPriority: z.boolean(),
  players: z.array(PlayerState),
  objects: z.record(Id, GameObject),
  stack: z.array(StackEntry),
  abilities: z.record(Id, TriggeredAbility),
  continuousEffects: z.array(ContinuousEffect),
  pendingTriggers: z.array(Id),
  triggerPlacement: TriggerPlacement.nullable(),
  chanceState: z.number().int().min(1).max(0xffffffff),
  chanceOperations: Natural,
  combat: CombatState,
  frames: z.array(Frame),
  decision: Decision.nullable(),
  events: z.array(GameEvent),
  outcome: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("ongoing") }),
    z.strictObject({ kind: z.literal("win"), winner: Id, reason: z.string() }),
    z.strictObject({ kind: z.literal("draw"), reason: z.string() }),
  ]),
  coverage: z.record(Id, Natural),
});
export type RulesState = z.infer<typeof RulesState>;
export const RunStatus = z.enum([
  "running",
  "paused",
  "completed",
  "driver-failed",
  "unsupported",
  "engine-failed",
  "budget-exhausted",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;
export type PlayerObservation = {
  matchId: string;
  player: string;
  revision: number;
  turn: number;
  step: Step;
  startingPlayerChooser: string;
  startingPlayer: string | null;
  activePlayer: string | null;
  outcome: RulesState["outcome"];
  players: {
    id: string;
    life: number;
    lost: boolean;
    handCount: number;
    libraryCount: number;
    /** Public CR 103.5 setup history; the first multiplayer mulligan still counts here. */
    mulligans: number;
    keptHand: boolean;
    /** This round's declaration; null means not declared or the round has finished. */
    mulliganDeclaration: boolean | null;
    mana: Mana;
    commanderDamage: Record<string, number>;
  }[];
  objects: (GameObject &
    (
      | { card: CardDefinition; tokenTemplate: null }
      | { card: null; tokenTemplate: TokenTemplate }
    ) & { characteristics: DerivedCharacteristics })[];
  decision: Decision | null;
  combat: RulesState["combat"];
  stack: StackEntry[];
  abilities: (TriggeredAbility & { sourceCard: CardDefinition })[];
};

/** Canonical semantic encoding. Undefined/nonfinite/cyclic values must never become silent nulls. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(input: unknown): string {
    if (input === null || typeof input === "boolean" || typeof input === "string")
      return JSON.stringify(input);
    if (typeof input === "number" && Number.isFinite(input)) return JSON.stringify(input);
    if (typeof input !== "object" || input === null)
      throw new Error("Non-serializable semantic value");
    if (ancestors.has(input)) throw new Error("Cyclic semantic value");
    ancestors.add(input);
    try {
      const prototype = Object.getPrototypeOf(input);
      if (Array.isArray(input)) {
        if (prototype !== Array.prototype || Reflect.ownKeys(input).length !== input.length + 1)
          throw new Error("Semantic arrays must be dense and contain only indexed values");
        const values: string[] = [];
        for (let index = 0; index < input.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
          if (!descriptor?.enumerable || !("value" in descriptor))
            throw new Error("Semantic arrays cannot contain holes or accessors");
          values.push(encode(descriptor.value));
        }
        return `[${values.join(",")}]`;
      }
      if (prototype !== Object.prototype && prototype !== null)
        throw new Error("Semantic objects must be plain records");
      const keys = Reflect.ownKeys(input);
      if (keys.some((key) => typeof key !== "string"))
        throw new Error("Semantic objects cannot contain symbol keys");
      const entries = (keys as string[]).sort().map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (!descriptor?.enumerable || !("value" in descriptor))
          throw new Error("Semantic objects cannot contain hidden properties or accessors");
        return `${JSON.stringify(key)}:${encode(descriptor.value)}`;
      });
      return `{${entries.join(",")}}`;
    } finally {
      // Shared acyclic references are ordinary repeated JSON values, not cycles.
      ancestors.delete(input);
    }
  }
  return encode(value);
}
export async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function semanticHash(value: unknown): Promise<string> {
  return sha256(canonicalJson(value));
}

export {
  type ExecutionRegistry,
  PreparedClosure,
  PreparedDefinitionReference,
  PreparedMatchArtifact,
} from "./prepared";
