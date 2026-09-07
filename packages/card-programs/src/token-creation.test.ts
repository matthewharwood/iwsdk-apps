import { expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  type CardDefinition,
  canonicalJson,
  SpellProgram,
  semanticHash,
  TokenTemplate,
} from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/token-creation.json";
import { bindDevelopmentCard } from "./index";
import {
  bindFixedTokenSpell,
  FIXED_TOKEN_SPELLS,
  FIXED_TOKEN_TEMPLATES,
  FIXED_TOKEN_VERSION,
  reviewedFixedTokenDefinition,
  reviewedTokenTemplate,
} from "./token-creation";

const candidates = fixture.records.map((row) => CatalogCardSchema.parse(row));
const allPreviousOptions = {
  creatureReturnSpells: true,
  counterSpells: true,
  spellFamilies: true,
  selfEntryTriggers: true,
  selfEntrySequences: true,
  temporaryCreatureSpells: true,
  keywordReminders: true,
};
function candidate(name: string): CatalogCard {
  const result = candidates.find((card) => card.oracle.name === name);
  if (!result) throw new Error(`Missing authenticated fixture: ${name}`);
  return structuredClone(result);
}
function bound(name: string): CardDefinition {
  const result = bindFixedTokenSpell(candidate(name));
  if (!result) throw new Error(`Missing fixed token binding: ${name}`);
  return result;
}

test("all27 exact producers require opt-in and bind the independently proposed fixed count and template", async () => {
  expect(FIXED_TOKEN_SPELLS).toHaveLength(27);
  expect(candidates).toHaveLength(31);
  for (const recipe of FIXED_TOKEN_SPELLS) {
    const card = candidate(recipe.name);
    expect(await semanticHash(card.oracle)).toBe(card.versionHash);
    expect(bindDevelopmentCard(card, allPreviousOptions).kind).toBe("unsupported");
    const result = bindDevelopmentCard(card, { ...allPreviousOptions, fixedTokenSpells: true });
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw new Error(result.reason);
    expect(result.recipes).toEqual([FIXED_TOKEN_VERSION]);
    expect(result.definition.spellProgram).toEqual(
      SpellProgram.parse(
        fixture.expectedPrograms[recipe.identity as keyof typeof fixture.expectedPrograms],
      ),
    );
    expect(result.definition).toMatchObject({
      id: `oracle:${card.identity}`,
      oracleId: card.identity,
      sourceVersion: card.versionHash,
      name: card.oracle.name,
      oracleText: card.oracle.oracle_text,
      typeLine: card.oracle.type_line,
      types: [card.oracle.type_line],
      colors: card.oracle.colors,
      colorIdentity: card.oracle.color_identity,
      manaValue: card.oracle.cmc,
      keywords: [],
      subtypes: [],
      supertypes: [],
      power: null,
      toughness: null,
      commanderEligible: false,
      deckLimit: 1,
    });
    expect(result.definition.manaCost).toEqual(recipe.cost);
    expect(Object.values(recipe.cost).reduce((a, b) => a + b, 0)).toBe(card.oracle.cmc ?? -1);
    expect(reviewedFixedTokenDefinition(result.definition)).toBe(true);
    expect(result.definition.obligations).not.toContain("rule:undefined");
    expect(FIXED_TOKEN_TEMPLATES[recipe.templateId]).toBeDefined();
  }
});

test("all20 auxiliary identities recompute from the production versioned template payload", async () => {
  expect(Object.keys(FIXED_TOKEN_TEMPLATES)).toHaveLength(20);
  const referenced = new Set(FIXED_TOKEN_SPELLS.map((source) => source.templateId));
  expect([...referenced].sort()).toEqual(Object.keys(FIXED_TOKEN_TEMPLATES).sort());
  for (const [identity, template] of Object.entries(FIXED_TOKEN_TEMPLATES)) {
    const { id, ...payload } = template;
    expect(id).toBe(identity);
    expect(id).toBe(`token-template:${await semanticHash(payload)}`);
    expect(TokenTemplate.parse(template)).toEqual(template);
    expect(template).toEqual(
      TokenTemplate.parse(fixture.templates[identity as keyof typeof fixture.templates]),
    );
    expect(reviewedTokenTemplate(template)).toBe(true);
    expect("oracleId" in template).toBe(false);
    expect("sourceVersion" in template).toBe(false);
    expect("commander" in template.characteristics).toBe(false);
    expect("isCard" in template.characteristics).toBe(false);
    expect(template.characteristics.name.endsWith(" Token")).toBe(true);
    expect(template.characteristics.manaCost).toBeNull();
    expect(template.characteristics.manaValue).toBe(0);
    expect(template.characteristics.types).toEqual(["Creature"]);
  }
});

test("token characteristics follow producer text even when a related printing omits haste or uses a shorter label", () => {
  const source = FIXED_TOKEN_SPELLS.find((row) => row.name === "Flurry of Horns");
  if (!source) throw new Error("Missing Flurry of Horns");
  const provenance = fixture.provenance.find((row) => row.identity === source.identity);
  expect(provenance?.relatedTokenEvidence.fullPrintedBody).toBe("");
  expect(provenance?.relatedTokenEvidence.printedKeywords).toEqual([]);
  expect(FIXED_TOKEN_TEMPLATES[source.templateId]?.characteristics).toMatchObject({
    name: "Minotaur Token",
    types: ["Creature"],
    subtypes: ["Minotaur"],
    colors: ["R"],
    power: 2,
    toughness: 3,
    keywords: ["haste"],
  });
  expect(bound(source.name).keywords).toEqual([]);
  const rals = FIXED_TOKEN_SPELLS.find((row) => row.name === "Ral's Reinforcements");
  if (!rals) throw new Error("Missing Ral's Reinforcements");
  expect(bound(rals.name).colorIdentity).toEqual(["R"]);
  expect(FIXED_TOKEN_TEMPLATES[rals.templateId]?.characteristics.colors).toEqual(["U", "R"]);
});

test("four authenticated whole-body contrasts remain excluded for hybrid payment or the ordinary spell-type boundary", async () => {
  expect(fixture.excluded).toHaveLength(4);
  expect(fixture.excluded.map((row) => row.name).sort()).toEqual([
    "Elemental Summoning",
    "Inkling Summoning",
    "Spectral Procession",
    "Spirit Summoning",
  ]);
  for (const excluded of fixture.excluded) {
    const card = candidate(excluded.name);
    expect(await semanticHash(card.oracle)).toBe(card.versionHash);
    expect(bindFixedTokenSpell(card)).toBeNull();
    expect(bindDevelopmentCard(card, { ...allPreviousOptions, fixedTokenSpells: true }).kind).toBe(
      "unsupported",
    );
    expect(FIXED_TOKEN_SPELLS.some((row) => row.identity === card.identity)).toBe(false);
  }
});

test("every producer rejects altered complete-body, cost, provenance and characteristic inputs", () => {
  const changes: ((card: CatalogCard) => void)[] = [
    (card) => {
      card.identity = "unknown";
    },
    (card) => {
      card.oracle.oracle_id = "unknown";
    },
    (card) => {
      card.versionHash = "0".repeat(64);
    },
    (card) => {
      card.sourceOrdinal++;
    },
    (card) => {
      card.sourceArchiveHash = "0".repeat(64);
    },
    (card) => {
      card.bundleHash = "0".repeat(64);
    },
    (card) => {
      card.oracle.name += " altered";
    },
    (card) => {
      card.oracle.type_line = card.oracle.type_line === "Instant" ? "Sorcery" : "Instant";
    },
    (card) => {
      card.oracle.type_line = "Sorcery — Lesson";
    },
    (card) => {
      card.oracle.layout = "split";
    },
    (card) => {
      card.oracle.card_faces = [];
    },
    (card) => {
      card.oracle.mana_cost = "{X}{W}";
    },
    (card) => {
      card.oracle.mana_cost = "{2/W}";
    },
    (card) => {
      card.oracle.mana_cost = "{W/P}";
    },
    (card) => {
      card.oracle.cmc = 99;
    },
    (card) => {
      card.oracle.power = "1";
    },
    (card) => {
      card.oracle.toughness = "1";
    },
    (card) => {
      card.oracle.colors = [];
    },
    (card) => {
      card.oracle.color_identity = [];
    },
    (card) => {
      card.oracle.keywords = ["Convoke"];
    },
    (card) => {
      card.oracle.all_parts = [];
    },
    (card) => {
      card.eligibility = [];
    },
    (card) => {
      card.oracle.oracle_text += "\nDraw a card.";
    },
    (card) => {
      card.oracle.oracle_text += " ";
    },
  ];
  for (const recipe of FIXED_TOKEN_SPELLS)
    for (const change of changes) {
      const altered = candidate(recipe.name);
      change(altered);
      expect(bindFixedTokenSpell(altered)).toBeNull();
      expect(
        bindDevelopmentCard(altered, { ...allPreviousOptions, fixedTokenSpells: true }).kind,
      ).toBe("unsupported");
    }
});

test("complete fixed-token source bodies never drop extra effects, targets, types or optional instructions", () => {
  for (const text of [
    "Create two 1/1 white Soldier artifact creature tokens.",
    "Create two tapped 1/1 white Soldier creature tokens.",
    "Create two 1/1 white Soldier creature tokens. Sacrifice them at the beginning of the next end step.",
    "Create two 1/1 white Soldier creature tokens with ward {1}.",
    "Create X 1/1 white Soldier creature tokens.",
    "You may create two 1/1 white Soldier creature tokens.",
    "Target player creates two 1/1 white Soldier creature tokens.",
    "Create a 1/1 white Soldier creature token and a 2/2 white Knight creature token.",
    "Create two tokens that are copies of target creature.",
    "Convoke\nCreate two 1/1 white Soldier creature tokens.",
    "As an additional cost to cast this spell, sacrifice a creature.\nCreate two 1/1 white Soldier creature tokens.",
  ]) {
    const card = candidate("Raise the Alarm");
    card.oracle.oracle_text = text;
    expect(bindDevelopmentCard(card, { ...allPreviousOptions, fixedTokenSpells: true }).kind).toBe(
      "unsupported",
    );
  }
});

test("recognized producer definitions cannot alter count, template, output program or source marker", () => {
  const changes: ((card: CardDefinition) => void)[] = [
    (card) => {
      const effect = card.spellProgram?.effects[0];
      if (effect?.kind === "create-token") effect.count = effect.count === 1 ? 2 : 1;
    },
    (card) => {
      const effect = card.spellProgram?.effects[0];
      if (effect?.kind === "create-token") effect.templateId = `token-template:${"0".repeat(64)}`;
    },
    (card) => {
      card.spellProgram = {
        schema: "commander-spell/1",
        target: null,
        effects: [{ kind: "draw", recipient: "controller", amount: 1 }],
      };
    },
    (card) => {
      delete card.spellProgram;
    },
    (card) => {
      card.implementationRevision = "commander-development-recipes/1";
    },
    (card) => {
      card.oracleText = "";
    },
    (card) => {
      card.sourceVersion = "0".repeat(64);
    },
    (card) => {
      card.oracleId = "unknown";
    },
    (card) => {
      card.manaCost = null;
    },
  ];
  for (const recipe of FIXED_TOKEN_SPELLS)
    for (const change of changes) {
      const card = bound(recipe.name);
      change(card);
      expect(reviewedFixedTokenDefinition(card)).toBe(false);
    }
});

test("a well-shaped auxiliary token is still rejected unless its full value matches the finite reviewed dictionary", async () => {
  for (const original of Object.values(FIXED_TOKEN_TEMPLATES)) {
    const changed = structuredClone(original);
    changed.characteristics.power++;
    expect(reviewedTokenTemplate(changed)).toBe(false);
    const { id: _id, ...payload } = changed;
    changed.id = `token-template:${await semanticHash(payload)}`;
    expect(TokenTemplate.safeParse(changed).success).toBe(true);
    expect(reviewedTokenTemplate(changed)).toBe(false);
    expect(canonicalJson(changed)).not.toBe(canonicalJson(original));
    const wrongRules = { ...original, rulesHash: "0".repeat(64) };
    expect(reviewedTokenTemplate(wrongRules)).toBe(false);
    expect(TokenTemplate.safeParse({ ...original, oracleId: "invented" }).success).toBe(false);
  }
});
