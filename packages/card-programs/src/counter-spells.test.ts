import { expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import {
  type CardDefinition,
  canonicalJson,
  SpellProgram,
  semanticHash,
} from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/counter-spells.json";
import {
  bindCounterSpell,
  COUNTER_SPELL_RULES,
  COUNTER_SPELLS,
  reviewedCounterSpellDefinition,
} from "./counter-spells";
import { bindDevelopmentCard } from "./index";

const candidates = fixture.records.map((row) => CatalogCardSchema.parse(row));
function candidate(name = "Counterspell"): CatalogCard {
  const card = candidates.find((row) => row.oracle.name === name);
  if (!card) throw new Error(`Missing authenticated fixture ${name}`);
  return structuredClone(card);
}

test("seven authenticated counterspell bodies bind exact reviewed target restrictions only when enabled", async () => {
  expect(COUNTER_SPELLS).toHaveLength(7);
  for (const card of candidates) {
    expect(await semanticHash(card.oracle)).toBe(card.versionHash);
    expect(bindDevelopmentCard(card).kind).toBe("unsupported");
    const result = bindDevelopmentCard(card, { counterSpells: true });
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw new Error(result.reason);
    expect(result.definition.spellProgram).toEqual(
      SpellProgram.parse(
        fixture.expectedPrograms[card.identity as keyof typeof fixture.expectedPrograms],
      ),
    );
    expect(result.definition.oracleText).toBe(card.oracle.oracle_text ?? "");
    expect(result.definition.sourceVersion).toBe(card.versionHash);
    expect(result.definition.obligations).toEqual(
      COUNTER_SPELL_RULES.map((rule) => `rule:${rule}`),
    );
    expect(reviewedCounterSpellDefinition(result.definition)).toBe(true);
  }
});

test("counterspell binding rejects unreviewed metadata, source provenance and characteristic changes", () => {
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
      card.oracle.type_line = "Sorcery";
    },
    (card) => {
      card.oracle.type_line = "Tribal Instant — Wizard";
    },
    (card) => {
      card.oracle.layout = "split";
    },
    (card) => {
      card.oracle.card_faces = [];
    },
    (card) => {
      card.oracle.mana_cost = "{U/P}{U}";
    },
    (card) => {
      card.oracle.mana_cost = "{X}{U}";
    },
    (card) => {
      card.oracle.cmc = 3;
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
  for (const change of changes) {
    const card = candidate();
    change(card);
    expect(bindCounterSpell(card)).toBeNull();
    expect(bindDevelopmentCard(card, { counterSpells: true }).kind).toBe("unsupported");
  }
});

test("complete-body counterspell grammar rejects additional or substituted semantics without stripping them", () => {
  for (const text of [
    "counter target spell.",
    "Counter target spell. ",
    "Counter target creature spell.",
    "Counter target spell unless its controller pays {3}.",
    "Counter target spell.\nDraw a card.",
    "Counter target spell you don't control.",
    "This spell can't be countered.\nCounter target spell.",
    "Counter target spell, activated ability, or triggered ability.",
    "Counter target spell. (It doesn't resolve.)",
    "Counter target spell. If that spell is countered this way, exile it instead.",
    "As an additional cost to cast this spell, return a land you control to its owner's hand.\nCounter target spell.",
  ]) {
    const card = candidate();
    card.oracle.oracle_text = text;
    expect(bindDevelopmentCard(card, { counterSpells: true }).kind).toBe("unsupported");
  }
});

test("counterspell dependency declaration reconstructs every field rather than trusting recipe labels", () => {
  const changes: ((card: CardDefinition) => void)[] = [
    (card) => {
      card.spellProgram = {
        schema: "commander-spell/1",
        target: card.spellProgram?.target === "spell" ? "creature-spell" : "spell",
        effects: [{ kind: "counter" }],
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
  for (const card of candidates) {
    const definition = bindCounterSpell(card);
    if (!definition) throw new Error("Missing bound fixture");
    for (const change of changes) {
      const altered = structuredClone(definition);
      change(altered);
      expect(canonicalJson(altered)).not.toBe(canonicalJson(definition));
      expect(reviewedCounterSpellDefinition(altered)).toBe(false);
    }
  }
});
