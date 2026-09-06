import type { SpellProgram } from "@iwsdk-apps/contracts";

export interface ReviewedSpell {
  name: string;
  identity: string;
  sourceVersion: string;
  type: "Instant" | "Sorcery";
  cost: string;
  text: string;
  program: SpellProgram;
}
export const SPELL_RECIPE_VERSION = "reviewed-spell/1";
/** Exact pinned Oracle identities and complete text; no general English matcher. */
export const REVIEWED_SPELLS: readonly ReviewedSpell[] = [
  {
    name: "Divination",
    identity: "273b339c-964b-4a18-8eb5-ceb8abcdfd9e",
    sourceVersion: "00d836618ec785082d7ed41e79f928fd91f7d0d4533f8364856c9349b6271111",
    type: "Sorcery",
    cost: "{2}{U}",
    text: "Draw two cards.",
    program: {
      schema: "commander-spell/1",
      target: null,
      effects: [{ kind: "draw", recipient: "controller", amount: 2 }],
    },
  },
  {
    name: "Inspiration",
    identity: "8f32ceb2-92c2-4dde-bf73-40bb79c3fcef",
    sourceVersion: "5027154446951c932a29f443e58f0c460fddb2e8cfdde09b794d952886515e7b",
    type: "Instant",
    cost: "{3}{U}",
    text: "Target player draws two cards.",
    program: {
      schema: "commander-spell/1",
      target: "player",
      effects: [{ kind: "draw", recipient: "target", amount: 2 }],
    },
  },
  {
    name: "Flame Slash",
    identity: "8d98d674-6811-4d45-b22a-63792e272a2b",
    sourceVersion: "b721f5cd16dd0022b25263d63370733655604485b0171cfadb049cbfd30b3b7a",
    type: "Sorcery",
    cost: "{R}",
    text: "Flame Slash deals 4 damage to target creature.",
    program: {
      schema: "commander-spell/1",
      target: "creature",
      effects: [{ kind: "damage", amount: 4 }],
    },
  },
  {
    name: "Sacred Nectar",
    identity: "30870ee5-6ad7-48a9-983e-d3b018f2344f",
    sourceVersion: "bb5769a40aeefe2133158550beb137a5eb3f6336cec08803fde46c700d9f6af7",
    type: "Sorcery",
    cost: "{1}{W}",
    text: "You gain 4 life.",
    program: {
      schema: "commander-spell/1",
      target: null,
      effects: [{ kind: "gain-life", recipient: "controller", amount: 4 }],
    },
  },
  {
    name: "Revitalize",
    identity: "b1385b03-cb4b-4812-857f-7421f1df39af",
    sourceVersion: "fb337595e5e3fe9197aed80a12cd72f5589c2db771395a9c332463d67e54b608",
    type: "Instant",
    cost: "{1}{W}",
    text: "You gain 3 life.\nDraw a card.",
    program: {
      schema: "commander-spell/1",
      target: null,
      effects: [
        { kind: "gain-life", recipient: "controller", amount: 3 },
        { kind: "draw", recipient: "controller", amount: 1 },
      ],
    },
  },
  {
    name: "Healing Hands",
    identity: "3cc48835-3ac0-4774-b380-f9b21d2dc974",
    sourceVersion: "af2404a81f140ec8ce239547591f32c21ca0f35a98f598d680e4820d9764da29",
    type: "Sorcery",
    cost: "{2}{W}",
    text: "Target player gains 4 life.\nDraw a card.",
    program: {
      schema: "commander-spell/1",
      target: "player",
      effects: [
        { kind: "gain-life", recipient: "target", amount: 4 },
        { kind: "draw", recipient: "controller", amount: 1 },
      ],
    },
  },
  {
    name: "Sorin's Thirst",
    identity: "ff27ff37-96c0-41af-8881-a078e884e67b",
    sourceVersion: "54ce92b3ffdee84710e229293608d9ee2c474fdaeb277a1bc17934363c2e309d",
    type: "Instant",
    cost: "{B}{B}",
    text: "Sorin's Thirst deals 2 damage to target creature and you gain 2 life.",
    program: {
      schema: "commander-spell/1",
      target: "creature",
      effects: [
        { kind: "damage", amount: 2 },
        { kind: "gain-life", recipient: "controller", amount: 2 },
      ],
    },
  },
];
