import { expect, test } from "bun:test";
import {
  parsePlainManaCost,
  proposeSelfEntryBody,
  REVIEWED_SPELLS,
} from "@iwsdk-apps/card-programs";
import {
  CardDefinition,
  ContentRelease,
  type DeckRevision,
  emptyMana,
  type Keyword,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { admitDeck } from "@iwsdk-apps/engine";
import reminderFixture from "../test-fixtures/reminder-deck.json";
import {
  makeDevelopmentDecks,
  makeKeywordReminderDecks,
  REVIEWED_RULES_HASH,
  SPELL_DECK_PROFILES,
  TRIGGER_DECK_PROFILES,
} from "./index";

async function fixtureRelease(): Promise<ContentRelease> {
  const definitions: Record<string, CardDefinition> = {};
  function add(id: string, changes: Partial<CardDefinition>) {
    definitions[id] = CardDefinition.parse({
      id,
      oracleId: id,
      sourceVersion: "1".repeat(64),
      name: id,
      typeLine: "Creature — Fixture",
      types: ["Creature"],
      subtypes: ["Fixture"],
      supertypes: [],
      colors: ["G"],
      colorIdentity: ["G"],
      manaCost: { ...emptyMana(), generic: 2, G: 1 },
      manaValue: 3,
      power: 3,
      toughness: 3,
      keywords: [],
      manaAbilities: [],
      oracleText: "",
      commanderEligible: false,
      deckLimit: 1,
      obligations: ["rule:302"],
      implementationRevision: "synthetic-composition-fixture",
      ...changes,
    });
  }
  add("fixture:jasmine", {
    name: "Jasmine Boreal",
    commanderEligible: true,
    colorIdentity: ["G", "W"],
    supertypes: ["Legendary"],
  });
  add("fixture:lady", {
    name: "The Lady of the Mountain",
    commanderEligible: true,
    colorIdentity: ["G", "R"],
    supertypes: ["Legendary"],
  });
  const keywords: Keyword[] = [
    "flying",
    "vigilance",
    "first-strike",
    "lifelink",
    "trample",
    "haste",
    "menace",
    "reach",
  ];
  for (let index = 0; index < 100; index++)
    add(`fixture:creature:${index}`, {
      manaValue: (index % 7) + 1,
      keywords: index < 16 ? [keywords[index % 8] as Keyword] : [],
      manaAbilities: index >= 16 && index < 20 ? ["G"] : [],
    });
  for (const [name, color] of [
    ["Forest", "G"],
    ["Plains", "W"],
    ["Mountain", "R"],
  ] as const)
    add(`fixture:${name}`, {
      name,
      types: ["Land"],
      supertypes: ["Basic"],
      subtypes: [name],
      manaAbilities: [color],
      colorIdentity: [color],
      colors: [],
      manaCost: null,
      manaValue: 0,
      power: null,
      toughness: null,
      deckLimit: null,
    });
  const base = {
    schema: "commander-content/1" as const,
    id: "synthetic-composition-only",
    sourceBundle: "2".repeat(64),
    rulesHash: REVIEWED_RULES_HASH,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "fixture",
    processorAbi: "fixture",
  };
  return ContentRelease.parse({ ...base, hash: await semanticHash(base) });
}

function assertFamilyCoverage(release: ContentRelease, families: DeckRevision[]) {
  const allSpells = Object.values(release.definitions)
    .filter((definition) => definition.spellProgram)
    .map((definition) => definition.id)
    .sort();
  const covered = new Set<string>();
  for (const deck of families.slice(14)) {
    const commander = release.definitions[deck.commander];
    if (!commander) throw new Error("Missing family commander");
    expect(deck.entries.reduce((sum, entry) => sum + entry.count, 0)).toBe(100);
    expect(
      deck.entries.filter((entry) => entry.count > 1).reduce((sum, entry) => sum + entry.count, 0),
    ).toBe(39);
    const included = deck.entries
      .map((entry) => release.definitions[entry.definition])
      .filter((definition) => definition?.spellProgram);
    const compatible = Object.values(release.definitions).filter(
      (definition) =>
        definition.spellProgram &&
        definition.colorIdentity.every((color) => commander.colorIdentity.includes(color)),
    );
    expect(included.map((definition) => definition?.id).sort()).toEqual(
      compatible.map((definition) => definition.id).sort(),
    );
    for (const definition of included) if (definition) covered.add(definition.id);
    expect(() => admitDeck(deck, release)).not.toThrow();
  }
  expect([...covered].sort()).toEqual(allSpells);
}

async function assertTriggerComposition(releaseInput: ContentRelease, template: CardDefinition) {
  const release = structuredClone(releaseInput);
  const profile = TRIGGER_DECK_PROFILES[1];
  if (!profile?.commanderSourceVersion) throw new Error("Missing pinned trigger commander");
  release.definitions["fixture:sivitri"] = {
    ...template,
    id: "fixture:sivitri",
    oracleId: "fixture:sivitri",
    name: profile.commander,
    sourceVersion: profile.commanderSourceVersion,
    commanderEligible: true,
    supertypes: ["Legendary"],
    colorIdentity: ["B", "U"],
  };
  // These are isolated composition fixtures, not source-card execution evidence.
  for (const [id, colorIdentity, text] of [
    ["fixture:green-entry", ["G"], "When this creature enters, draw a card."],
    ["fixture:blue-black-entry", ["U", "B"], "When this creature enters, you gain 3 life."],
  ] as const) {
    const proposal = proposeSelfEntryBody(text);
    if (!proposal) throw new Error("Missing fixture constructor");
    release.definitions[id] = {
      ...template,
      id,
      oracleId: id,
      name: id,
      colorIdentity: [...colorIdentity],
      manaValue: Object.values(template.manaCost ?? {}).reduce((sum, amount) => sum + amount, 0),
      oracleText: text,
      triggerPrograms: [proposal.program],
      implementationRevision: "self-entry-creature/1",
    };
  }
  const { hash: _oldHash, ...body } = release;
  release.hash = await semanticHash(body);
  const baseline = await makeDevelopmentDecks(release, { includeFamilyDecks: true });
  const expanded = await makeDevelopmentDecks(release, { includeTriggerDecks: true });
  expect(expanded).toHaveLength(19);
  expect(expanded.slice(0, 17)).toEqual(baseline);
  expect(
    baseline
      .flatMap((deck) => deck.entries)
      .some((entry) => release.definitions[entry.definition]?.triggerPrograms),
  ).toBe(false);
  expect(new Set(expanded.map((deck) => deck.hash)).size).toBe(19);
  const included = new Set<string>();
  for (const deck of expanded.slice(17)) {
    expect(() => admitDeck(deck, release)).not.toThrow();
    expect(deck.entries.reduce((sum, entry) => sum + entry.count, 0)).toBe(100);
    expect(
      deck.entries
        .filter((entry) => entry.count > 1)
        .map((entry) => entry.count)
        .sort(),
    ).toEqual([19, 20]);
    expect(new Set(deck.entries.map((entry) => entry.definition)).size).toBe(deck.entries.length);
    for (const entry of deck.entries)
      if (release.definitions[entry.definition]?.triggerPrograms) included.add(entry.definition);
  }
  expect([...included].sort()).toEqual(["fixture:blue-black-entry", "fixture:green-entry"]);
  for (const change of ["altered-program", "uncovered-color", "commander-source"]) {
    const altered = structuredClone(release);
    const trigger = altered.definitions["fixture:green-entry"];
    const commander = altered.definitions["fixture:sivitri"];
    if (!trigger?.triggerPrograms?.[0] || !commander) throw new Error("Missing trigger fixture");
    if (change === "altered-program" && trigger.triggerPrograms[0].schema === "commander-trigger/1")
      trigger.triggerPrograms[0].effect.amount = 2;
    if (change === "uncovered-color") trigger.colorIdentity = ["R"];
    if (change === "commander-source") commander.sourceVersion = "0".repeat(64);
    const { hash: _hash, ...changedBody } = altered;
    altered.hash = await semanticHash(changedBody);
    await expect(makeDevelopmentDecks(altered, { includeTriggerDecks: true })).rejects.toThrow();
  }
}

test("twelve deterministic composition fixtures preserve count, singleton, color and source-release hashes", async () => {
  const release = await fixtureRelease();
  const decks = await makeDevelopmentDecks(release, { includeSpellDecks: false });
  expect(decks).toHaveLength(12);
  expect(new Set(decks.map((deck) => deck.hash)).size).toBe(12);
  expect(await makeDevelopmentDecks(release, { includeSpellDecks: false })).toEqual(decks);
  for (const deck of decks) {
    const { hash, ...body } = deck;
    expect(hash).toBe(await semanticHash(body));
    expect(deck.entries.reduce((sum, entry) => sum + entry.count, 0)).toBe(100);
    expect(deck.entries.filter((entry) => entry.count === 1)).toHaveLength(61);
    expect(() => admitDeck(deck, release)).not.toThrow();
  }
});

test("spell deck profiles retain seven pinned programs, legal 100-card composition, and 39 basics", async () => {
  const release = await fixtureRelease();
  const template = release.definitions["fixture:creature:50"];
  if (!template) throw new Error("Missing composition template");
  // Filler creatures are synthetic composition fixtures; only the declared spell/commander pins are source references.
  for (let i = 0; i < 70; i++)
    release.definitions[`colorless:${i}`] = {
      ...template,
      id: `colorless:${i}`,
      name: `Colorless fixture ${i}`,
      oracleId: `colorless:${i}`,
      colors: [],
      colorIdentity: [],
      manaCost: { ...emptyMana(), generic: 3 },
    };
  for (const profile of SPELL_DECK_PROFILES) {
    const id = `commander:${profile.code}`;
    release.definitions[id] = {
      ...template,
      id,
      oracleId: id,
      name: profile.commander,
      sourceVersion: profile.commanderSourceVersion ?? "",
      supertypes: ["Legendary"],
      colorIdentity: profile.code.startsWith("wu") ? ["W", "U"] : ["B", "R"],
      commanderEligible: true,
    };
  }
  for (const [name, color] of [
    ["Island", "U"],
    ["Swamp", "B"],
  ] as const) {
    const land = release.definitions["fixture:Forest"];
    if (!land) throw new Error("Missing land template");
    release.definitions[`fixture:${name}`] = {
      ...land,
      id: `fixture:${name}`,
      name,
      subtypes: [name],
      manaAbilities: [color],
      colorIdentity: [color],
    };
  }
  for (const recipe of REVIEWED_SPELLS) {
    const manaCost = parsePlainManaCost(recipe.cost);
    if (!manaCost) throw new Error("Missing reviewed cost");
    const colors = (["W", "U", "B", "R", "G"] as const).filter((color) => manaCost[color] > 0);
    release.definitions[recipe.identity] = {
      ...template,
      id: recipe.identity,
      oracleId: recipe.identity,
      sourceVersion: recipe.sourceVersion,
      name: recipe.name,
      types: [recipe.type],
      typeLine: recipe.type,
      subtypes: [],
      colors,
      colorIdentity: colors,
      manaCost,
      manaValue: Object.values(manaCost).reduce((sum, amount) => sum + amount, 0),
      power: null,
      toughness: null,
      oracleText: recipe.text,
      spellProgram: recipe.program,
    };
  }
  const { hash: _hash, ...body } = release;
  release.hash = await semanticHash(body);
  const decks = await makeDevelopmentDecks(release);
  expect(decks).toHaveLength(14);
  const spells = new Set<string>();
  for (const deck of decks.slice(12)) {
    expect(deck.entries.reduce((sum, entry) => sum + entry.count, 0)).toBe(100);
    expect(
      deck.entries
        .filter((entry) => entry.count > 1)
        .map((entry) => entry.count)
        .sort(),
    ).toEqual([19, 20]);
    expect(new Set(deck.entries.map((entry) => entry.definition)).size).toBe(deck.entries.length);
    expect(() => admitDeck(deck, release)).not.toThrow();
    for (const entry of deck.entries) {
      const definition = release.definitions[entry.definition];
      if (definition?.spellProgram) {
        spells.add(definition.name);
        const recipe = REVIEWED_SPELLS.find((entry) => entry.name === definition.name);
        if (!recipe) throw new Error("Spell has no pinned recipe");
        expect(definition.sourceVersion).toBe(recipe.sourceVersion);
      }
    }
  }
  expect([...spells].sort()).toEqual(REVIEWED_SPELLS.map((recipe) => recipe.name).sort());
  const jasmine = release.definitions["fixture:jasmine"];
  if (!jasmine) throw new Error("Missing Jasmine fixture");
  jasmine.sourceVersion = "715ac4501a52d881b939d5793a333b1e407382c7aec56be50a2e2f2b4159d7b5";
  release.definitions["family:draw-three"] = {
    ...template,
    id: "family:draw-three",
    oracleId: "family:draw-three",
    name: "Synthetic family draw",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    subtypes: [],
    colors: ["U"],
    colorIdentity: ["U"],
    manaCost: { ...emptyMana(), generic: 4, U: 1 },
    manaValue: 5,
    power: null,
    toughness: null,
    oracleText: "Draw three cards.",
    implementationRevision: "exact-spell-families/1",
    spellProgram: {
      schema: "commander-spell/1",
      target: null,
      effects: [{ kind: "draw", recipient: "controller", amount: 3 }],
    },
  };
  const { hash: _familyHash, ...familyBody } = release;
  release.hash = await semanticHash(familyBody);
  const families = await makeDevelopmentDecks(release, { includeFamilyDecks: true });
  expect(families).toHaveLength(17);
  expect(new Set(families.map((deck) => deck.hash)).size).toBe(17);
  assertFamilyCoverage(release, families);
  await assertTriggerComposition(release, template);
  const tampered = structuredClone(release);
  const alteredSpell = tampered.definitions["family:draw-three"];
  if (!alteredSpell) throw new Error("Missing family spell");
  alteredSpell.spellProgram = {
    schema: "commander-spell/1",
    target: null,
    effects: [{ kind: "draw", recipient: "controller", amount: 2 }],
  };
  const { hash: _tamperedHash, ...tamperedBody } = tampered;
  tampered.hash = await semanticHash(tamperedBody);
  await expect(makeDevelopmentDecks(tampered, { includeFamilyDecks: true })).rejects.toThrow(
    "Unreviewed or altered spell family definition",
  );
  const first = REVIEWED_SPELLS[0];
  if (!first) throw new Error("Missing spell source");
  delete release.definitions[first.identity];
  const { hash: _previous, ...missingBody } = release;
  release.hash = await semanticHash(missingBody);
  await expect(makeDevelopmentDecks(release)).rejects.toThrow(
    "Missing source-bound spell Divination",
  );
});

test("tampered releases and missing composition dependencies fail explicitly", async () => {
  const release = await fixtureRelease();
  await expect(makeDevelopmentDecks({ ...release, hash: "0".repeat(64) })).rejects.toThrow(
    "Content release hash mismatch",
  );
  delete release.definitions["fixture:Forest"];
  const { hash: _hash, ...body } = release;
  release.hash = await semanticHash(body);
  await expect(makeDevelopmentDecks(release)).rejects.toThrow("Expected two matching basic lands");
});

test("explicit reminder fixtures preserve authenticated frozen revisions and account for incompatible identities", async () => {
  const body = {
    schema: "commander-content/1" as const,
    id: "authenticated-reminder-composition-fixture",
    sourceBundle: reminderFixture.sourceBundle,
    rulesHash: reminderFixture.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: reminderFixture.definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(reminderFixture.definitions).length,
    compilerVersion: "fixture",
    processorAbi: reminderFixture.processorAbi,
  };
  const release = ContentRelease.parse({ ...body, hash: await semanticHash(body) });
  const frozen = [reminderFixture.deck];
  const before = JSON.stringify(frozen);
  const result = await makeKeywordReminderDecks(release, frozen);
  expect(JSON.stringify(result.decks.slice(0, 1))).toBe(before);
  expect(JSON.stringify(frozen)).toBe(before);
  expect(result.decks).toHaveLength(3);
  expect(result.report.coveredBindings).toBe(49);
  expect(result.report.coveredDefinitionIds).toEqual(
    [...reminderFixture.coveredAnnotationIds].sort(),
  );
  expect(result.report.excluded).toMatchObject([
    { name: "Jungle Barrier", reason: "no-compatible-implemented-commander-in-release" },
  ]);
  expect(result.report.executedGames).toBe(0);
  for (const deck of result.decks.slice(1)) {
    expect(() => admitDeck(deck, release)).not.toThrow();
    expect(
      deck.entries
        .filter((entry) => release.definitions[entry.definition]?.supertypes.includes("Basic"))
        .reduce((sum, row) => sum + row.count, 0),
    ).toBe(39);
  }
  const corrupt = structuredClone(frozen);
  const first = corrupt[0];
  if (!first) throw Error("Missing deck");
  first.hash = "f".repeat(64);
  await expect(makeKeywordReminderDecks(release, corrupt)).rejects.toThrow(
    "Frozen deck hash mismatch",
  );
  const changed = structuredClone(release);
  const card = changed.definitions[reminderFixture.coveredAnnotationIds[0] ?? ""];
  if (!card) throw Error("Missing annotation");
  card.oracleText += "\nThis creature can't block.";
  const { hash: _hash, ...rest } = changed;
  changed.hash = await semanticHash(rest);
  await expect(makeKeywordReminderDecks(changed, frozen)).rejects.toThrow(
    "Unauthenticated definition",
  );
});
