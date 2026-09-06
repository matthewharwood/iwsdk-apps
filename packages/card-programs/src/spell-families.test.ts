import { expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import { SpellProgram } from "@iwsdk-apps/contracts";
import { bindDevelopmentCard, bindExactSpellFamily } from "./index";

function candidate(text: string, changes: Record<string, unknown> = {}): CatalogCard {
  return CatalogCardSchema.parse({
    identity: "10000000-0000-4000-8000-000000000001",
    versionHash: "1".repeat(64),
    sourceArchiveHash: "2".repeat(64),
    sourceOrdinal: 1,
    bundleHash: "3".repeat(64),
    eligibility: [
      {
        role: "main-deck",
        status: "candidate",
        reason: "synthetic-constructor-fixture",
        sourceHash: "4".repeat(64),
      },
    ],
    oracle: {
      object: "card",
      id: "10000000-0000-4000-8000-000000000002",
      oracle_id: "10000000-0000-4000-8000-000000000001",
      name: "Fixture Spell",
      layout: "normal",
      lang: "en",
      released_at: "2020-01-01",
      set: "fixture",
      collector_number: "1",
      legalities: { commander: "legal" },
      games: ["paper"],
      color_identity: ["R"],
      colors: ["R"],
      keywords: [],
      type_line: "Instant",
      mana_cost: "{2}{R}",
      cmc: 3,
      oracle_text: text,
      ...changes,
    },
  });
}

test("finite complete text families preserve recipient, count, target domain, and written sequence", () => {
  const fixtures: [string, SpellProgram][] = [
    [
      "Draw a card.",
      {
        schema: "commander-spell/1",
        target: null,
        effects: [{ kind: "draw", recipient: "controller", amount: 1 }],
      },
    ],
    [
      "Draw three cards.",
      {
        schema: "commander-spell/1",
        target: null,
        effects: [{ kind: "draw", recipient: "controller", amount: 3 }],
      },
    ],
    [
      "Target player draws seven cards.",
      {
        schema: "commander-spell/1",
        target: "player",
        effects: [{ kind: "draw", recipient: "target", amount: 7 }],
      },
    ],
    [
      "You gain 8 life.",
      {
        schema: "commander-spell/1",
        target: null,
        effects: [{ kind: "gain-life", recipient: "controller", amount: 8 }],
      },
    ],
    [
      "Target player gains 7 life.",
      {
        schema: "commander-spell/1",
        target: "player",
        effects: [{ kind: "gain-life", recipient: "target", amount: 7 }],
      },
    ],
    [
      "Fixture Spell deals 5 damage to target creature.",
      { schema: "commander-spell/1", target: "creature", effects: [{ kind: "damage", amount: 5 }] },
    ],
    [
      "Fixture Spell deals 3 damage to target creature and you gain 3 life.",
      {
        schema: "commander-spell/1",
        target: "creature",
        effects: [
          { kind: "damage", amount: 3 },
          { kind: "gain-life", recipient: "controller", amount: 3 },
        ],
      },
    ],
    [
      "You gain 6 life.\nDraw a card.",
      {
        schema: "commander-spell/1",
        target: null,
        effects: [
          { kind: "gain-life", recipient: "controller", amount: 6 },
          { kind: "draw", recipient: "controller", amount: 1 },
        ],
      },
    ],
    [
      "Target player gains 4 life.\nDraw a card.",
      {
        schema: "commander-spell/1",
        target: "player",
        effects: [
          { kind: "gain-life", recipient: "target", amount: 4 },
          { kind: "draw", recipient: "controller", amount: 1 },
        ],
      },
    ],
  ];
  for (const [text, program] of fixtures) {
    const result = bindDevelopmentCard(candidate(text), { spellFamilies: true });
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw new Error("Expected complete family binding");
    expect(result.definition.spellProgram).toEqual(program);
    expect(SpellProgram.safeParse(program).success).toBe(true);
    expect(result.definition.sourceVersion).toBe("1".repeat(64));
    expect(result.recipes).toHaveLength(2);
    expect(bindDevelopmentCard(candidate(text)).kind).toBe("unsupported");
  }
});

test("whole-body matching rejects extra paragraphs, independent targets, modifiers, and unreviewed amounts", () => {
  for (const text of [
    "Draw three cards.\nDiscard a card.",
    "Draw three cards.\n",
    " Draw three cards.",
    "Draw three cards. (Then shuffle.)",
    "Draw three cards instead.",
    "Draw X cards.",
    "Draw five cards.",
    "Target opponent draws two cards.",
    "Each player draws two cards.",
    "Target player draws two cards.\nTarget player gains 7 life.",
    "Target player draws two cards and gains 7 life.",
    "You may draw two cards.",
    "Fixture Spell deals 4 damage to any target.",
    "Fixture Spell deals 4 damage to target creature an opponent controls.",
    "Fixture Spell deals 4 damage to target creature with flying.",
    "Fixture Spell deals 4 damage divided as you choose among two target creatures.",
    "Fixture Spell deals X damage to target creature.",
    "Another Spell deals 4 damage to target creature.",
    "Fixture Spell deals 4 damage to target creature. It can't be regenerated.",
    "Fixture Spell deals 2 damage to target creature and you gain 3 life.",
    "You gain 4 life.\nDraw two cards.",
    "Draw a card.\nYou gain 4 life.",
    "You gain 99999 life.",
  ]) {
    expect(bindExactSpellFamily("Fixture Spell", text)).toBeNull();
    expect(bindDevelopmentCard(candidate(text), { spellFamilies: true }).kind).toBe("unsupported");
  }
});

test("spell families require ordinary complete faces, supported card types, fixed plain costs, and consistent source metadata", () => {
  for (const changes of [
    { layout: "split" },
    { card_faces: [] },
    { type_line: "Instant — Arcane" },
    { type_line: "Kindred Instant — Elf" },
    { type_line: "Creature — Wizard" },
    { mana_cost: "{X}{U}" },
    { mana_cost: "{U/P}" },
    { mana_cost: "{G/U}" },
    { mana_cost: "" },
    { mana_cost: "{2}{U}", cmc: 4 },
    { keywords: ["Flashback"] },
    { oracle_id: "10000000-0000-4000-8000-000000000099" },
  ])
    expect(
      bindDevelopmentCard(candidate("Draw two cards.", changes), { spellFamilies: true }).kind,
    ).toBe("unsupported");
  const input = candidate("Draw two cards.");
  input.eligibility[0] = {
    role: "main-deck",
    status: "unresolved",
    reason: "needs-policy-review",
    sourceHash: "4".repeat(64),
  };
  expect(bindDevelopmentCard(input, { spellFamilies: true }).kind).toBe("unsupported");
});

test("an altered explicitly pinned card cannot bypass its source check via the generic family option", () => {
  const input = candidate("Draw two cards.", {
    oracle_id: "273b339c-964b-4a18-8eb5-ceb8abcdfd9e",
    name: "Divination",
    type_line: "Sorcery",
    mana_cost: "{2}{U}",
  });
  input.identity = "273b339c-964b-4a18-8eb5-ceb8abcdfd9e";
  expect(bindDevelopmentCard(input, { spellFamilies: true })).toEqual({
    kind: "unsupported",
    reason: "reviewed-spell-source-mismatch",
  });
});

test("destroy and exile bind only their complete creature-target bodies after primitive validation", () => {
  for (const kind of ["destroy", "exile"] as const) {
    const text = kind === "destroy" ? "Destroy target creature." : "Exile target creature.";
    const result = bindDevelopmentCard(candidate(text), { spellFamilies: true });
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw new Error("Expected exact removal recipe");
    expect(result.definition.spellProgram).toEqual({
      schema: "commander-spell/1",
      target: "creature",
      effects: [{ kind }],
    });
    expect(result.definition.obligations).toContain(
      kind === "destroy" ? "rule:701.8a" : "rule:701.13a",
    );
  }
  for (const text of [
    "Destroy target nonblack creature.",
    "Destroy target creature. It can't be regenerated.",
    "Destroy target creature or planeswalker.",
    "Destroy target creature. Draw a card.",
    "Destroy all creatures.",
    "Exile target creature an opponent controls.",
    "Exile target creature until this spell leaves the stack.",
    "Exile target creature. Its controller gains 3 life.",
    "Exile up to one target creature.",
  ])
    expect(bindDevelopmentCard(candidate(text), { spellFamilies: true }).kind).toBe("unsupported");
  expect(
    bindDevelopmentCard(candidate("Exile target creature.", { mana_cost: "{W/B}{W/B}{W/B}" }), {
      spellFamilies: true,
    }),
  ).toEqual({
    kind: "unsupported",
    reason: "spell-family-requires-plain-cost-and-exact-mana-value",
  });
});
