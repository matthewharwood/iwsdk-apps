import { expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  type CardDefinition,
  canonicalJson,
  SpellProgram,
  semanticHash,
} from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/creature-return.json";
import {
  bindCreatureReturnSpell,
  CREATURE_RETURN_RULES,
  CREATURE_RETURN_SPELLS,
  reviewedCreatureReturnSpellDefinition,
} from "./creature-return";
import { bindDevelopmentCard } from "./index";

const candidates = fixture.records.map((row) => CatalogCardSchema.parse(row));
function candidate(name = "Repulse"): CatalogCard {
  const found = candidates.find((card) => card.oracle.name === name);
  if (!found) throw new Error(`Missing authenticated fixture: ${name}`);
  return structuredClone(found);
}

test("five frozen creature-return bodies bind exact independently proposed ordered programs only when enabled", async () => {
  expect(CREATURE_RETURN_SPELLS).toHaveLength(5);
  expect(candidates).toHaveLength(5);
  for (const card of candidates) {
    expect(await semanticHash(card.oracle)).toBe(card.versionHash);
    expect(bindDevelopmentCard(card).kind).toBe("unsupported");
    const result = bindDevelopmentCard(card, { creatureReturnSpells: true });
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw new Error(result.reason);
    expect(result.definition.spellProgram).toEqual(
      SpellProgram.parse(
        fixture.expectedPrograms[card.identity as keyof typeof fixture.expectedPrograms],
      ),
    );
    expect(result.definition.oracleText).toBe(card.oracle.oracle_text ?? "");
    expect(result.definition.typeLine).toBe(card.oracle.type_line ?? "");
    expect(result.definition.manaValue).toBe(card.oracle.cmc ?? -1);
    expect(result.definition.sourceVersion).toBe(card.versionHash);
    expect(result.definition.obligations).toEqual(
      CREATURE_RETURN_RULES.map((rule) => `rule:${rule}`),
    );
    expect(reviewedCreatureReturnSpellDefinition(result.definition)).toBe(true);
  }
});

test("return bindings reject unreviewed provenance and characteristics even with a recognized identity", () => {
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
      card.bundleHash = "0".repeat(64);
    },
    (card) => {
      card.sourceArchiveHash = "0".repeat(64);
    },
    (card) => {
      card.sourceOrdinal += 1;
    },
    (card) => {
      card.oracle.name = "Unknown";
    },
    (card) => {
      card.oracle.type_line = card.oracle.type_line === "Instant" ? "Sorcery" : "Instant";
    },
    (card) => {
      card.oracle.type_line = "Kindred Instant — Wizard";
    },
    (card) => {
      card.oracle.layout = "split";
    },
    (card) => {
      card.oracle.card_faces = [];
    },
    (card) => {
      card.oracle.mana_cost = "{X}{U}";
    },
    (card) => {
      card.oracle.mana_cost = "{U/P}";
    },
    (card) => {
      card.oracle.cmc = 99;
    },
    (card) => {
      card.oracle.power = "2";
    },
    (card) => {
      card.oracle.toughness = "2";
    },
    (card) => {
      card.oracle.colors = ["B"];
    },
    (card) => {
      card.oracle.color_identity = ["U", "R"];
    },
    (card) => {
      card.oracle.keywords = ["Flashback"];
    },
    (card) => {
      card.eligibility = [];
    },
  ];
  for (const original of candidates)
    for (const change of changes) {
      const card = structuredClone(original);
      change(card);
      expect(bindCreatureReturnSpell(card)).toBeNull();
      expect(bindDevelopmentCard(card, { creatureReturnSpells: true }).kind).toBe("unsupported");
    }
});

test("complete return bodies never discard target restrictions, optional effects or additional costs", () => {
  for (const text of [
    "Return target creature to its owner's hand. You may draw a card.",
    "Return target creature to its owner's hand.\nDraw two cards.",
    "Return target creature to its owner's hand.\nIts controller draws a card.",
    "Return target creature you control to its owner's hand.\nDraw a card.",
    "Return target nonland permanent to its owner's hand.\nDraw a card.",
    "Return up to one target creature to its owner's hand.\nDraw a card.",
    "Return target creature with mana value 3 or less to its owner's hand.",
    "Return target creature to its owner's hand. Its controller loses 1 life.",
    "Kicker {1}\nReturn target creature to its owner's hand.",
    "As an additional cost to cast this spell, sacrifice a creature.\nReturn target creature to its owner's hand.",
    "Draw a card.\nReturn target creature to its owner's hand.",
    "Return target creature to its owner's hand.\nDraw a card. ",
  ]) {
    const card = candidate();
    card.oracle.oracle_text = text;
    expect(bindDevelopmentCard(card, { creatureReturnSpells: true }).kind).toBe("unsupported");
  }
});

test("return dependency declarations reconstruct source characteristics and ordered effects", () => {
  const changes: ((card: CardDefinition) => void)[] = [
    (card) => {
      card.spellProgram = {
        schema: "commander-spell/1",
        target: "creature",
        effects: [{ kind: "return-to-hand" }],
      };
    },
    (card) => {
      card.spellProgram = {
        schema: "commander-spell/1",
        target: null,
        effects: [{ kind: "draw", recipient: "controller", amount: 1 }],
      };
    },
    (card) => {
      card.oracleText = "";
    },
    (card) => {
      card.implementationRevision = "commander-development-recipes/1";
    },
    (card) => {
      card.id = "other";
    },
    (card) => {
      card.sourceVersion = "0".repeat(64);
    },
    (card) => {
      card.manaCost = null;
    },
    (card) => {
      card.types = ["Instant", "Creature"];
    },
  ];
  const definition = bindCreatureReturnSpell(candidate());
  if (!definition) throw new Error("Missing bound fixture");
  for (const change of changes) {
    const altered = structuredClone(definition);
    change(altered);
    expect(canonicalJson(altered)).not.toBe(canonicalJson(definition));
    expect(reviewedCreatureReturnSpellDefinition(altered)).toBe(false);
  }
});
