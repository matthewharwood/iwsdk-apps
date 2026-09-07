import type { CatalogCard } from "@iwsdk-apps/catalog";
import {
  CardDefinition,
  type Cost,
  canonicalJson,
  EntryObserverProgram,
  type Keyword,
  type ManaColor,
} from "@iwsdk-apps/contracts";

export const ENTRY_OBSERVER_VERSION = "entry-observer-permanent/1";
export const ENTRY_OBSERVER_SOURCE_BUNDLE =
  "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df";
export const ENTRY_OBSERVER_ARCHIVE =
  "ffb464b35a97613efa7927f5c05bdef3b8385b7d82ecf4f50f7487a9ab6c2274";
export const ENTRY_OBSERVER_RULES_HASH =
  "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f";
export const ENTRY_OBSERVER_RESEARCH_HASH =
  "d971fd6a914cdf462384235b291efab7f5c2fb654935d435453d93550a6a658c";
export const ENTRY_OBSERVER_RULES = [
  "109.2",
  "109.5",
  "113.6",
  "113.7a",
  "113.8",
  "117.2a",
  "117.2e",
  "117.5",
  "603.1",
  "603.2",
  "603.2c",
  "603.3a",
  "603.3b",
  "603.6a",
  "603.6b",
  "603.10",
  "608.2c",
  "608.2n",
  "700.7",
  "704.3",
  "903.5c",
] as const;
export interface EntryObserverPermanentSource {
  identity: string;
  sourceVersion: string;
  sourceOrdinal: number;
  rawRecordHash: string;
  name: string;
  oracleText: string;
  manaCost: string;
  cost: Cost;
  manaValue: number;
  typeLine: string;
  types: string[];
  supertypes: string[];
  subtypes: string[];
  colors: ManaColor[];
  colorIdentity: ManaColor[];
  power: number | null;
  toughness: number | null;
  oracleKeywords: string[];
  intrinsicKeywords: Keyword[];
  observerProgram: EntryObserverProgram;
  commanderEligible: boolean;
  digital: boolean;
  games: string[];
}
/** Twenty authenticated complete mandatory bodies; source binding does not certify execution. */
export const ENTRY_OBSERVER_PERMANENTS: readonly EntryObserverPermanentSource[] = [
  {
    identity: "0109432d-5a2a-456f-ad39-b75cb4c73420",
    sourceVersion: "921fc65567afb4c9d87053550dbd367c749f583374bd69e3642911e3e5cfb87f",
    sourceOrdinal: 165,
    rawRecordHash: "a346e799c29defa4b607bd96db8c52e7716e2051a5e2027ef3bb727f87ec2bbe",
    name: "Bogwater Lumaret",
    oracleText: "Whenever this creature or another creature you control enters, you gain 1 life.",
    manaCost: "{B}{G}",
    cost: {
      W: 0,
      U: 0,
      B: 1,
      R: 0,
      G: 1,
      C: 0,
      generic: 0,
    },
    manaValue: 2,
    typeLine: "Creature — Spirit Frog",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Spirit", "Frog"],
    colors: ["B", "G"],
    colorIdentity: ["B", "G"],
    power: 2,
    toughness: 2,
    oracleKeywords: [],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:0109432d-5a2a-456f-ad39-b75cb4c73420:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "self-or-filter",
          filter: {
            types: ["Creature"],
            controller: "source-controller",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "mtgo", "arena"],
  },
  {
    identity: "0715e860-3b3b-4331-9718-207973e94fee",
    sourceVersion: "0fe0e7b2da68aed3c80f5cac13c1ab4fb4eeac9ae7d613fab840a19cb487334a",
    sourceOrdinal: 1120,
    rawRecordHash: "8d656c19b35cb11cc1010520020978e9053cba8aa08ee9b5d589ba2ec8c55e0d",
    name: "Tatyova, Benthic Druid",
    oracleText: "Landfall — Whenever a land you control enters, you gain 1 life and draw a card.",
    manaCost: "{3}{G}{U}",
    cost: {
      W: 0,
      U: 1,
      B: 0,
      R: 0,
      G: 1,
      C: 0,
      generic: 3,
    },
    manaValue: 5,
    typeLine: "Legendary Creature — Merfolk Druid",
    types: ["Creature"],
    supertypes: ["Legendary"],
    subtypes: ["Merfolk", "Druid"],
    colors: ["G", "U"],
    colorIdentity: ["G", "U"],
    power: 3,
    toughness: 3,
    oracleKeywords: ["Landfall"],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:0715e860-3b3b-4331-9718-207973e94fee:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Land"],
            controller: "source-controller",
            excludeSource: false,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
        {
          kind: "draw",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: true,
    digital: false,
    games: ["paper", "arena", "mtgo"],
  },
  {
    identity: "20faefbd-059c-4aae-81e3-31683bf9f7bf",
    sourceVersion: "0ad28dfd7a67b8fb74d6a525438e64bcc97785759ce7fe746462a784a95f8d70",
    sourceOrdinal: 4983,
    rawRecordHash: "a139f799f6ea306821ff8ea03006b360fbdc9992dff7934b8aba5817a8bd21b3",
    name: "Jaddi Offshoot",
    oracleText: "Defender\nLandfall — Whenever a land you control enters, you gain 1 life.",
    manaCost: "{G}",
    cost: {
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 1,
      C: 0,
      generic: 0,
    },
    manaValue: 1,
    typeLine: "Creature — Plant",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Plant"],
    colors: ["G"],
    colorIdentity: ["G"],
    power: 0,
    toughness: 3,
    oracleKeywords: ["Defender", "Landfall"],
    intrinsicKeywords: ["defender"],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:20faefbd-059c-4aae-81e3-31683bf9f7bf:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Land"],
            controller: "source-controller",
            excludeSource: false,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "mtgo"],
  },
  {
    identity: "263b526c-8b81-44ee-a7c4-5c24bf9b42a4",
    sourceVersion: "f4c6ee162464ecf2736217b5a17913a100ceb1a1ffdba98c2ca70db724fff9f6",
    sourceOrdinal: 5743,
    rawRecordHash: "377daa0cd951dd83bff853a001388e33ec5d145b89ea8cdf18457df531b0f219",
    name: "Kazandu Nectarpot",
    oracleText: "Landfall — Whenever a land you control enters, you gain 1 life.",
    manaCost: "{1}{G}",
    cost: {
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 1,
      C: 0,
      generic: 1,
    },
    manaValue: 2,
    typeLine: "Creature — Insect",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Insect"],
    colors: ["G"],
    colorIdentity: ["G"],
    power: 1,
    toughness: 3,
    oracleKeywords: ["Landfall"],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:263b526c-8b81-44ee-a7c4-5c24bf9b42a4:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Land"],
            controller: "source-controller",
            excludeSource: false,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["arena", "paper", "mtgo"],
  },
  {
    identity: "3d4bec90-7bbc-4385-a2b8-303c7a8d0a0f",
    sourceVersion: "09dfb1ed868ab291fe67001520f066584c5ab364f4fcc5f351828261cac104de",
    sourceOrdinal: 9216,
    rawRecordHash: "3bdfc14b473410da26339bfd83bb052e689fab3cb352466b2ad707186978549d",
    name: "Virulent Emissary",
    oracleText: "Deathtouch\nWhenever another creature you control enters, you gain 1 life.",
    manaCost: "{G}",
    cost: {
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 1,
      C: 0,
      generic: 0,
    },
    manaValue: 1,
    typeLine: "Creature — Elf Assassin",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Elf", "Assassin"],
    colors: ["G"],
    colorIdentity: ["G"],
    power: 1,
    toughness: 1,
    oracleKeywords: ["Deathtouch"],
    intrinsicKeywords: ["deathtouch"],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:3d4bec90-7bbc-4385-a2b8-303c7a8d0a0f:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Creature"],
            controller: "source-controller",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "arena", "mtgo"],
  },
  {
    identity: "3f8f0ce9-d2ce-45cc-9fbf-0e2819b07a3e",
    sourceVersion: "f1cd5237e33d5e99722d00d010ad551211c07f0e7fda0555811c5020b7a668f7",
    sourceOrdinal: 9554,
    rawRecordHash: "34ed339d5840e7fa979677717884ce07dd7682efc0bf1741f03b96628d409619",
    name: "Kor Celebrant",
    oracleText: "Whenever this creature or another creature you control enters, you gain 1 life.",
    manaCost: "{2}{W}",
    cost: {
      W: 1,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 2,
    },
    manaValue: 3,
    typeLine: "Creature — Kor Cleric",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Kor", "Cleric"],
    colors: ["W"],
    colorIdentity: ["W"],
    power: 1,
    toughness: 4,
    oracleKeywords: [],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:3f8f0ce9-d2ce-45cc-9fbf-0e2819b07a3e:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "self-or-filter",
          filter: {
            types: ["Creature"],
            controller: "source-controller",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["arena", "paper", "mtgo"],
  },
  {
    identity: "4a782bf9-4051-4613-8852-33b0d85a0edd",
    sourceVersion: "25efd0f053b9b5de1f784faa6795ef8cf3acbcb4346d6b139a4e43b48fd630e4",
    sourceOrdinal: 11175,
    rawRecordHash: "b7ee1ff2ca5c6e224efdb6d40cc59e42986cbfca03b416466d94bda7ce02ab5e",
    name: "Ajani's Welcome",
    oracleText: "Whenever a creature you control enters, you gain 1 life.",
    manaCost: "{W}",
    cost: {
      W: 1,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 0,
    },
    manaValue: 1,
    typeLine: "Enchantment",
    types: ["Enchantment"],
    supertypes: [],
    subtypes: [],
    colors: ["W"],
    colorIdentity: ["W"],
    power: null,
    toughness: null,
    oracleKeywords: [],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:4a782bf9-4051-4613-8852-33b0d85a0edd:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Creature"],
            controller: "source-controller",
            excludeSource: false,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["arena", "paper", "mtgo"],
  },
  {
    identity: "63686c6b-9051-4002-aa8e-da8a3021330f",
    sourceVersion: "9dbc7aeaedf5803c4541336ca0c58574c7da58c63bd33a892cd4d3e932ba9346",
    sourceOrdinal: 14902,
    rawRecordHash: "a0dfcd135f33f9136adc12c8c80334c1e4399c99596cd99dd5c1a168fb695426",
    name: "Lifecreed Duo",
    oracleText: "Flying\nWhenever another creature you control enters, you gain 1 life.",
    manaCost: "{1}{W}",
    cost: {
      W: 1,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 1,
    },
    manaValue: 2,
    typeLine: "Creature — Bat Bird",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Bat", "Bird"],
    colors: ["W"],
    colorIdentity: ["W"],
    power: 1,
    toughness: 2,
    oracleKeywords: ["Flying"],
    intrinsicKeywords: ["flying"],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:63686c6b-9051-4002-aa8e-da8a3021330f:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Creature"],
            controller: "source-controller",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "mtgo", "arena"],
  },
  {
    identity: "69b9fa68-b409-4de1-9a40-5262386a0180",
    sourceVersion: "49776a31a1883e1bd5540f20d1349fbe65ddbc2c7eb1c8581428b4d5d8ec1198",
    sourceOrdinal: 15891,
    rawRecordHash: "31bd01919511b995f50fac8c3c57ed4fd9ce50df41905d9e4d4a7bd669851313",
    name: "Healer of the Pride",
    oracleText: "Whenever another creature you control enters, you gain 2 life.",
    manaCost: "{3}{W}",
    cost: {
      W: 1,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 3,
    },
    manaValue: 4,
    typeLine: "Creature — Cat Cleric",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Cat", "Cleric"],
    colors: ["W"],
    colorIdentity: ["W"],
    power: 2,
    toughness: 3,
    oracleKeywords: [],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:69b9fa68-b409-4de1-9a40-5262386a0180:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Creature"],
            controller: "source-controller",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 2,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "mtgo"],
  },
  {
    identity: "6ca2a89e-7032-4864-b4e9-66f3178f90ab",
    sourceVersion: "f5159db1f4805e6e97ae566e5ee0481d6aaae8a607bb88fa2a6fc88b90e2e609",
    sourceOrdinal: 16315,
    rawRecordHash: "6011bdeb26196d5023ffa1f8181c10bec7ba4a7451391cdd2c15b3c3e2590738",
    name: "Essence Warden",
    oracleText: "Whenever another creature enters, you gain 1 life.",
    manaCost: "{G}",
    cost: {
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 1,
      C: 0,
      generic: 0,
    },
    manaValue: 1,
    typeLine: "Creature — Elf Shaman",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Elf", "Shaman"],
    colors: ["G"],
    colorIdentity: ["G"],
    power: 1,
    toughness: 1,
    oracleKeywords: [],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:6ca2a89e-7032-4864-b4e9-66f3178f90ab:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Creature"],
            controller: "any",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper"],
  },
  {
    identity: "70af9a03-20d6-44e3-a181-b60e80bff643",
    sourceVersion: "b753a49dc3c04891742cf0ad6cf93cd527204a28598069cd606ab9e29006cf16",
    sourceOrdinal: 16905,
    rawRecordHash: "346afe994fe5c4ed4f893c038ab59027cf5679b4d26ec45c04c59d76aed0c205",
    name: "Social Climber",
    oracleText: "Alliance — Whenever another creature you control enters, you gain 1 life.",
    manaCost: "{2}{G}",
    cost: {
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 1,
      C: 0,
      generic: 2,
    },
    manaValue: 3,
    typeLine: "Creature — Human Druid",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Human", "Druid"],
    colors: ["G"],
    colorIdentity: ["G"],
    power: 3,
    toughness: 2,
    oracleKeywords: ["Alliance"],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:70af9a03-20d6-44e3-a181-b60e80bff643:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Creature"],
            controller: "source-controller",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "mtgo", "arena"],
  },
  {
    identity: "72c6174c-fa2c-4ff2-b76e-eb6e890e97c9",
    sourceVersion: "4876fe1aafda4aad31227f553ef363ed62a6652d11b291307c87c990fd0618aa",
    sourceOrdinal: 17256,
    rawRecordHash: "6618d9501d7d71984606a63e8a02dd73ef34f89ac68eeac9cdaad5940a0692c9",
    name: "Fateful Discovery",
    oracleText: "Whenever an artifact you control enters, draw a card.",
    manaCost: "{3}{U}{U}",
    cost: {
      W: 0,
      U: 2,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 3,
    },
    manaValue: 5,
    typeLine: "Enchantment",
    types: ["Enchantment"],
    supertypes: [],
    subtypes: [],
    colors: ["U"],
    colorIdentity: ["U"],
    power: null,
    toughness: null,
    oracleKeywords: [],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:72c6174c-fa2c-4ff2-b76e-eb6e890e97c9:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Artifact"],
            controller: "source-controller",
            excludeSource: false,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "draw",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "mtgo", "arena"],
  },
  {
    identity: "77ccbea1-70af-4194-adad-39a904221c75",
    sourceVersion: "f94080713ee7ab46e81cc6e746642d5e3e56a0462a37a70439aeaa20d4d1dfc0",
    sourceOrdinal: 17994,
    rawRecordHash: "f390d256aeb374f8290201f652a5b2ffe5a079023c40c9358e37ea2eac945597",
    name: "Eidolon of Blossoms",
    oracleText:
      "Constellation — Whenever this creature or another enchantment you control enters, draw a card.",
    manaCost: "{2}{G}{G}",
    cost: {
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 2,
      C: 0,
      generic: 2,
    },
    manaValue: 4,
    typeLine: "Enchantment Creature — Spirit",
    types: ["Enchantment", "Creature"],
    supertypes: [],
    subtypes: ["Spirit"],
    colors: ["G"],
    colorIdentity: ["G"],
    power: 2,
    toughness: 2,
    oracleKeywords: ["Constellation"],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:77ccbea1-70af-4194-adad-39a904221c75:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "self-or-filter",
          filter: {
            types: ["Enchantment"],
            controller: "source-controller",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "draw",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "mtgo"],
  },
  {
    identity: "7de464e3-fae3-44cc-8233-776fc727c00a",
    sourceVersion: "1af87031b9fb4a17adb286a33d90b6da176ec78c3d10cbe51c02be186226cc30",
    sourceOrdinal: 18936,
    rawRecordHash: "02238eaedbe81402f651ab05036ebb8790775e0fad443d8fd93833a081bdc384",
    name: "Dazzling Angel",
    oracleText: "Flying\nWhenever another creature you control enters, you gain 1 life.",
    manaCost: "{2}{W}",
    cost: {
      W: 1,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 2,
    },
    manaValue: 3,
    typeLine: "Creature — Angel",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Angel"],
    colors: ["W"],
    colorIdentity: ["W"],
    power: 2,
    toughness: 3,
    oracleKeywords: ["Flying"],
    intrinsicKeywords: ["flying"],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:7de464e3-fae3-44cc-8233-776fc727c00a:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Creature"],
            controller: "source-controller",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "arena", "mtgo"],
  },
  {
    identity: "92226fd2-ad93-4722-89a0-ca88ea03e1b4",
    sourceVersion: "bab14ff96d96e75974c7cc36c77c1e2f1a370aa45638082552c1ac687187dd3b",
    sourceOrdinal: 21967,
    rawRecordHash: "064c6a4982959c0873a413c5a04d0f2868b700b3d28058e5ddccc82d0047d96d",
    name: "Eumidian Terrabotanist",
    oracleText: "Landfall — Whenever a land you control enters, you gain 1 life.",
    manaCost: "{1}{G}",
    cost: {
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 1,
      C: 0,
      generic: 1,
    },
    manaValue: 2,
    typeLine: "Creature — Insect Druid",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Insect", "Druid"],
    colors: ["G"],
    colorIdentity: ["G"],
    power: 2,
    toughness: 3,
    oracleKeywords: ["Landfall"],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:92226fd2-ad93-4722-89a0-ca88ea03e1b4:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Land"],
            controller: "source-controller",
            excludeSource: false,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "arena", "mtgo"],
  },
  {
    identity: "a2652158-e63f-477b-b328-cae7ef2263bd",
    sourceVersion: "f92a7405decf3cf9492a88ae58d1127fd544d45fa074c44bf69261d4cca7d535",
    sourceOrdinal: 24440,
    rawRecordHash: "a632b08e6fa69172ca847ddcabbcd6d089a75bf6f5a7d3baaffff41442e6cf7c",
    name: "Nexus Wardens",
    oracleText:
      "Reach\nConstellation — Whenever an enchantment you control enters, you gain 2 life.",
    manaCost: "{2}{G}",
    cost: {
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 1,
      C: 0,
      generic: 2,
    },
    manaValue: 3,
    typeLine: "Creature — Satyr Archer",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Satyr", "Archer"],
    colors: ["G"],
    colorIdentity: ["G"],
    power: 1,
    toughness: 4,
    oracleKeywords: ["Reach", "Constellation"],
    intrinsicKeywords: ["reach"],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:a2652158-e63f-477b-b328-cae7ef2263bd:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Enchantment"],
            controller: "source-controller",
            excludeSource: false,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 2,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["arena", "paper", "mtgo"],
  },
  {
    identity: "c7107a2d-2dcf-42e9-9ea9-d0fc0d6d2ec6",
    sourceVersion: "af7b0392380aef74f9def2c37d0af1e09bed69e3fe4db4f653cfd36cfd081762",
    sourceOrdinal: 29929,
    rawRecordHash: "c515b376cc8f3fad0e0651700a4ec000b8aabaf8958cc145e4d0f0a4459298f4",
    name: "Impassioned Orator",
    oracleText: "Whenever another creature you control enters, you gain 1 life.",
    manaCost: "{1}{W}",
    cost: {
      W: 1,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 1,
    },
    manaValue: 2,
    typeLine: "Creature — Human Cleric",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Human", "Cleric"],
    colors: ["W"],
    colorIdentity: ["W"],
    power: 2,
    toughness: 2,
    oracleKeywords: [],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:c7107a2d-2dcf-42e9-9ea9-d0fc0d6d2ec6:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Creature"],
            controller: "source-controller",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["arena", "paper", "mtgo"],
  },
  {
    identity: "d812fc6d-b96d-4986-b171-9f3feee603dc",
    sourceVersion: "6d7d904cf5934c572c543bed10704fdb891f51aec606821b36910256326f407d",
    sourceOrdinal: 32542,
    rawRecordHash: "65787f67f737ee1ea4d52943b569179d8651a386748c163854cf019ddfc81ea9",
    name: "Hinterland Sanctifier",
    oracleText: "Whenever another creature you control enters, you gain 1 life.",
    manaCost: "{W}",
    cost: {
      W: 1,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 0,
    },
    manaValue: 1,
    typeLine: "Creature — Rabbit Cleric",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Rabbit", "Cleric"],
    colors: ["W"],
    colorIdentity: ["W"],
    power: 1,
    toughness: 2,
    oracleKeywords: [],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:d812fc6d-b96d-4986-b171-9f3feee603dc:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Creature"],
            controller: "source-controller",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "arena", "mtgo"],
  },
  {
    identity: "df63e124-1542-48d6-b255-cf45855f1e93",
    sourceVersion: "dde8aed24f770f4cc6f8a7e6bb46870e35b80e677eb65d03eb76222b966da5c5",
    sourceOrdinal: 33618,
    rawRecordHash: "76c9d9352ce7ec8ea83da688318ad84a3c73e25f5c63da889319556e8603f939",
    name: "Woodland Liege",
    oracleText: "Whenever a Beast you control enters, draw a card.",
    manaCost: "{2}{G}",
    cost: {
      W: 0,
      U: 0,
      B: 0,
      R: 0,
      G: 1,
      C: 0,
      generic: 2,
    },
    manaValue: 3,
    typeLine: "Creature — Elf Druid Noble",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Elf", "Druid", "Noble"],
    colors: ["G"],
    colorIdentity: ["G"],
    power: 2,
    toughness: 2,
    oracleKeywords: [],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:df63e124-1542-48d6-b255-cf45855f1e93:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: [],
            subtype: "Beast",
            controller: "source-controller",
            excludeSource: false,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "draw",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "arena", "mtgo"],
  },
  {
    identity: "f3fad295-1af2-4ecc-8546-b121ad6be27b",
    sourceVersion: "64b2ad144dfbf7d22db5dfc53aa703939e23b1d8bc8348462c5834b5b0f3d832",
    sourceOrdinal: 36818,
    rawRecordHash: "f778b4df02aa8cecec67da39924a3d016ca0b37ca9ea4c871c30d9c49209a533",
    name: "Soul Warden",
    oracleText: "Whenever another creature enters, you gain 1 life.",
    manaCost: "{W}",
    cost: {
      W: 1,
      U: 0,
      B: 0,
      R: 0,
      G: 0,
      C: 0,
      generic: 0,
    },
    manaValue: 1,
    typeLine: "Creature — Human Cleric",
    types: ["Creature"],
    supertypes: [],
    subtypes: ["Human", "Cleric"],
    colors: ["W"],
    colorIdentity: ["W"],
    power: 1,
    toughness: 1,
    oracleKeywords: [],
    intrinsicKeywords: [],
    observerProgram: {
      schema: "commander-entry-observer/1",
      id: "entry-observer:f3fad295-1af2-4ecc-8546-b121ad6be27b:0",
      trigger: {
        kind: "permanent-enters-battlefield",
        view: "post-committed-event",
        placementClass: "ordinary",
        sourceZone: "battlefield",
        occurrence: "each-matching-object",
        subject: {
          kind: "filter",
          filter: {
            types: ["Creature"],
            controller: "any",
            excludeSource: true,
            token: "any",
          },
        },
      },
      choice: {
        kind: "mandatory",
      },
      effects: [
        {
          kind: "gain-life",
          recipient: "trigger-controller",
          amount: 1,
        },
      ],
    },
    commanderEligible: false,
    digital: false,
    games: ["paper", "mtgo"],
  },
];

const keywordRules: Partial<Record<Keyword, string>> = {
  flying: "702.9",
  reach: "702.17",
  defender: "702.3",
  deathtouch: "702.2",
};
function definitionFor(recipe: EntryObserverPermanentSource): CardDefinition {
  const program = EntryObserverProgram.parse(recipe.observerProgram);
  const creature = recipe.types.includes("Creature");
  const rules = [
    ...ENTRY_OBSERVER_RULES,
    ...(creature ? ["302.1", "208.1"] : ["303.1", "303.2"]),
    ...recipe.intrinsicKeywords.map((keyword) => {
      const rule = keywordRules[keyword];
      if (!rule) throw new Error(`Unreviewed intrinsic observer keyword: ${keyword}`);
      return rule;
    }),
    ...(program.effects.some((effect) => effect.kind === "gain-life") ? ["119.3"] : []),
    ...(program.effects.some((effect) => effect.kind === "draw")
      ? ["121.1", "121.2", "121.4", "704.5b"]
      : []),
    ...(program.trigger.subject.filter.types.length === 0 ? ["205.3m", "308.2"] : []),
    ...(program.trigger.subject.filter.types[0] === "Land" ? ["305.1"] : []),
    ...(recipe.oracleKeywords.some((word) =>
      ["Landfall", "Constellation", "Alliance"].includes(word),
    )
      ? ["207.2c"]
      : []),
    ...(recipe.commanderEligible ? ["903.3"] : []),
  ];
  return CardDefinition.parse({
    id: `oracle:${recipe.identity}`,
    oracleId: recipe.identity,
    sourceVersion: recipe.sourceVersion,
    name: recipe.name,
    typeLine: recipe.typeLine,
    types: recipe.types,
    subtypes: recipe.subtypes,
    supertypes: recipe.supertypes,
    colors: recipe.colors,
    colorIdentity: recipe.colorIdentity,
    manaCost: recipe.cost,
    manaValue: recipe.manaValue,
    power: recipe.power,
    toughness: recipe.toughness,
    keywords: recipe.intrinsicKeywords,
    manaAbilities: [],
    oracleText: recipe.oracleText,
    commanderEligible: recipe.commanderEligible,
    deckLimit: 1,
    obligations: [...new Set(rules)].map((rule) => `rule:${rule}`),
    implementationRevision: ENTRY_OBSERVER_VERSION,
    triggerPrograms: [program],
  });
}
function sourceFacts(card: CatalogCard) {
  const o = card.oracle;
  return {
    name: o.name,
    oracleText: o.oracle_text ?? null,
    manaCost: o.mana_cost ?? null,
    manaValue: o.cmc ?? null,
    typeLine: o.type_line ?? null,
    colors: o.colors ?? null,
    colorIdentity: o.color_identity,
    power: o.power ?? null,
    toughness: o.toughness ?? null,
    oracleKeywords: o.keywords,
    digital: o.digital ?? null,
    games: o.games,
  };
}
function expectedFacts(recipe: EntryObserverPermanentSource) {
  return {
    name: recipe.name,
    oracleText: recipe.oracleText,
    manaCost: recipe.manaCost,
    manaValue: recipe.manaValue,
    typeLine: recipe.typeLine,
    colors: recipe.colors,
    colorIdentity: recipe.colorIdentity,
    power: recipe.power === null ? null : String(recipe.power),
    toughness: recipe.toughness === null ? null : String(recipe.toughness),
    oracleKeywords: recipe.oracleKeywords,
    digital: recipe.digital,
    games: recipe.games,
  };
}
export function bindEntryObserverPermanent(card: CatalogCard): CardDefinition | null {
  const recipe = ENTRY_OBSERVER_PERMANENTS.find((row) => row.identity === card.identity);
  if (!recipe) return null;
  const o = card.oracle;
  if (
    !card.eligibility.some((row) => row.role === "main-deck" && row.status === "candidate") ||
    (recipe.commanderEligible &&
      !card.eligibility.some((row) => row.role === "commander" && row.status === "candidate")) ||
    card.versionHash !== recipe.sourceVersion ||
    card.sourceOrdinal !== recipe.sourceOrdinal ||
    card.sourceArchiveHash !== ENTRY_OBSERVER_ARCHIVE ||
    card.bundleHash !== ENTRY_OBSERVER_SOURCE_BUNDLE ||
    o.oracle_id !== recipe.identity ||
    o.layout !== "normal" ||
    o.card_faces !== undefined ||
    o.loyalty !== undefined ||
    o.defense !== undefined ||
    o.hand_modifier !== undefined ||
    o.life_modifier !== undefined ||
    o.color_indicator !== undefined ||
    o.legalities.commander !== "legal" ||
    (recipe.power === null && (o.power !== undefined || o.toughness !== undefined)) ||
    canonicalJson(sourceFacts(card)) !== canonicalJson(expectedFacts(recipe))
  )
    return null;
  return definitionFor(recipe);
}
/** Exact reconstruction preserves the complete observer body, subject semantics and intrinsic abilities. */
export function reviewedEntryObserverDefinition(definition: CardDefinition): boolean {
  const recipe = ENTRY_OBSERVER_PERMANENTS.find((row) => row.identity === definition.oracleId);
  return recipe !== undefined && canonicalJson(definitionFor(recipe)) === canonicalJson(definition);
}
