import { describe, expect, test } from "bun:test";
import { type CatalogCard, CatalogCardSchema } from "@iwsdk-apps/catalog";
import { bindDevelopmentCard, parsePlainManaCost, REVIEWED_SPELLS } from "./index";

function candidate(changes: Record<string, unknown> = {}): CatalogCard {
  return CatalogCardSchema.parse({
    identity: "00000000-0000-4000-8000-000000000001",
    versionHash: "1".repeat(64),
    sourceArchiveHash: "2".repeat(64),
    sourceOrdinal: 12,
    bundleHash: "3".repeat(64),
    oracle: {
      object: "card",
      id: "00000000-0000-4000-8000-000000000002",
      oracle_id: "00000000-0000-4000-8000-000000000001",
      name: "Recipe fixture",
      layout: "normal",
      lang: "en",
      released_at: "2020-01-01",
      set: "fixture",
      collector_number: "1",
      legalities: { commander: "legal" },
      games: ["paper"],
      color_identity: ["G"],
      colors: ["G"],
      keywords: [],
      type_line: "Creature — Elf",
      mana_cost: "{1}{G}",
      cmc: 2,
      power: "2",
      toughness: "3",
      oracle_text: "",
      ...changes,
    },
    eligibility: [
      {
        role: "main-deck",
        status: "candidate",
        reason: "source-fixture",
        sourceHash: "4".repeat(64),
      },
    ],
  });
}

describe("reviewed recipe binding", () => {
  test("seven complete pinned spell records bind typed ordered programs and reject altered sources", () => {
    for (const recipe of REVIEWED_SPELLS) {
      const input = candidate({
        oracle_id: recipe.identity,
        name: recipe.name,
        type_line: recipe.type,
        mana_cost: recipe.cost,
        cmc: Object.values(parsePlainManaCost(recipe.cost) ?? {}).reduce(
          (sum, amount) => sum + amount,
          0,
        ),
        oracle_text: recipe.text,
      });
      input.identity = recipe.identity;
      input.versionHash = recipe.sourceVersion;
      const result = bindDevelopmentCard(input);
      expect(result.kind).toBe("bound");
      if (result.kind !== "bound") throw new Error("Expected reviewed spell");
      expect(result.definition.spellProgram).toEqual(recipe.program);
      expect(result.definition.sourceVersion).toBe(recipe.sourceVersion);
      for (const changed of [
        { ...input, versionHash: "f".repeat(64) },
        { ...input, oracle: { ...input.oracle, oracle_text: `${recipe.text}\nDraw a card.` } },
        { ...input, oracle: { ...input.oracle, mana_cost: "{0}" } },
      ])
        expect(bindDevelopmentCard(changed).kind).toBe("unsupported");
    }
    expect(
      bindDevelopmentCard(candidate({ type_line: "Instant", oracle_text: "Draw two cards." })).kind,
    ).toBe("unsupported");
  });
  test("source identity and exact characteristics bind without invented behavior", () => {
    const result = bindDevelopmentCard(candidate());
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw new Error("Expected recipe");
    expect(result.definition).toMatchObject({
      power: 2,
      toughness: 3,
      manaValue: 2,
      sourceVersion: "1".repeat(64),
      keywords: [],
      manaAbilities: [],
      deckLimit: 1,
      commanderEligible: false,
    });
    expect(result.definition.manaCost).toMatchObject({ generic: 1, G: 1 });
  });
  test("keyword labels and mana clauses compose only when all text is accounted for", () => {
    const result = bindDevelopmentCard(
      candidate({
        oracle_text: "Flying, vigilance\n{T}: Add {G}.",
        keywords: ["Flying", "Vigilance"],
      }),
    );
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw new Error("Expected recipe");
    expect(result.definition.keywords).toEqual(["flying", "vigilance"]);
    expect(result.definition.manaAbilities).toEqual(["G"]);
    expect(result.definition.obligations).toContain("rule:702.9");
    expect(result.definition.obligations).toContain("rule:605.1a");
    expect(
      bindDevelopmentCard(candidate({ oracle_text: "Flying\nThis creature can't block." })).kind,
    ).toBe("unsupported");
    expect(
      bindDevelopmentCard(candidate({ oracle_text: "Flying (This creature can't block.)" })).kind,
    ).toBe("unsupported");
    expect(bindDevelopmentCard(candidate({ oracle_text: "{T}: Add {G}. Draw a card." })).kind).toBe(
      "unsupported",
    );
    expect(bindDevelopmentCard(candidate({ oracle_text: "{T}: Add {G}{G}." })).kind).toBe(
      "unsupported",
    );
  });
  test("symbolic stats, hybrid/X costs, hidden faces, unsupported types and unknown text stay unsupported", () => {
    for (const change of [
      { power: "*" },
      { toughness: "1+*" },
      { mana_cost: "{X}{G}" },
      { mana_cost: "{G/W}" },
      { cmc: 4 },
      { type_line: "World Creature — Elf" },
      { layout: "transform" },
      { oracle_text: "Changeling" },
      { oracle_text: "When this creature enters, draw a card." },
    ])
      expect(bindDevelopmentCard(candidate(change)).kind).toBe("unsupported");
  });
  test("basic land intrinsic mana comes from its exact basic type, not guessed text", () => {
    const result = bindDevelopmentCard(
      candidate({
        name: "Forest",
        type_line: "Basic Land — Forest",
        mana_cost: "",
        cmc: 0,
        power: undefined,
        toughness: undefined,
        oracle_text: "({T}: Add {G}.)",
      }),
    );
    expect(result.kind).toBe("bound");
    if (result.kind !== "bound") throw new Error("Expected basic land");
    expect(result.definition).toMatchObject({
      manaAbilities: ["G"],
      deckLimit: null,
      manaCost: null,
      power: null,
    });
    expect(
      bindDevelopmentCard(
        candidate({
          name: "Forest",
          type_line: "Basic Land — Forest",
          mana_cost: "",
          cmc: 0,
          oracle_text: "When this land enters, draw a card.",
        }),
      ).kind,
    ).toBe("unsupported");
    expect(
      bindDevelopmentCard(
        candidate({
          name: "Snow-Covered Forest",
          type_line: "Basic Snow Land — Forest",
          mana_cost: "",
          cmc: 0,
        }),
      ).kind,
    ).toBe("unsupported");
  });
  test("noncandidate data cannot acquire a definition through the compiler", () => {
    const card = candidate();
    card.eligibility = card.eligibility.map((row) => ({ ...row, status: "unresolved" }));
    expect(bindDevelopmentCard(card)).toEqual({
      kind: "unsupported",
      reason: "not-observed-main-deck-candidate",
    });
  });
});

test("plain cost grammar rejects every unconsumed token", () => {
  expect(parsePlainManaCost("{2}{G}{C}")).toMatchObject({ generic: 2, G: 1, C: 1 });
  for (const cost of [
    "",
    "{S}",
    "{2/G}",
    "{G/P}",
    "{X}",
    "{G} extra",
    "{G}{?}",
    "{-1}",
    "{9007199254740992}",
  ])
    expect(parsePlainManaCost(cost)).toBeNull();
});
