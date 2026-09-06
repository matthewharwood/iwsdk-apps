import { expect, test } from "bun:test";
import type { CatalogCard } from "@iwsdk-apps/catalog";
import type { Keyword, SpellEffect } from "@iwsdk-apps/contracts";
import { temporaryCandidate } from "../test-fixtures/temporary";
import {
  bindDevelopmentCard,
  parsePlainManaCost,
  reviewedTemporaryCreatureDefinition,
  TEMPORARY_CREATURE_BODIES,
  TEMPORARY_CREATURE_SPELLS,
} from "./index";

test("all97 reviewed source tuples require explicit opt-in and retain exact complete spell bodies", () => {
  expect(TEMPORARY_CREATURE_SPELLS.length).toBe(97);
  expect(Object.keys(TEMPORARY_CREATURE_BODIES).length).toBe(69);
  for (const source of TEMPORARY_CREATURE_SPELLS) {
    const card = temporaryCandidate(source);
    expect(bindDevelopmentCard(card, { spellFamilies: true }).kind).toBe("unsupported");
    const result = bindDevelopmentCard(card, { temporaryCreatureSpells: true });
    if (result.kind !== "bound") throw new Error(result.reason);
    expect(result.definition.manaCost).toEqual(parsePlainManaCost(source.manaCost));
    expect(result.definition.spellProgram?.target).toBe("creature");
    expect(result.definition.oracleText).toBe(source.oracleText);
    expect(result.definition.sourceVersion).toBe(source.sourceVersion);
    expect(reviewedTemporaryCreatureDefinition(result.definition)).toBe(true);
  }
});
test("reviewed source examples preserve signs, extreme loss, distinct keyword grants and final cantrip order", () => {
  const examples: { name: string; p: number; t: number; keywords: Keyword[]; draw: boolean }[] = [
    { name: "Giant Growth", p: 3, t: 3, keywords: [], draw: false },
    { name: "Auger Spree", p: 4, t: -4, keywords: [], draw: false },
    { name: "Overkill", p: 0, t: -9999, keywords: [], draw: false },
    { name: "Fervent Strike", p: 1, t: 0, keywords: ["first-strike", "haste"], draw: false },
    { name: "Horrid Vigor", p: 0, t: 0, keywords: ["deathtouch", "indestructible"], draw: false },
    { name: "Sangrite Surge", p: 3, t: 3, keywords: ["double-strike"], draw: false },
    { name: "Befuddle", p: -4, t: 0, keywords: [], draw: true },
    { name: "Moment of Defiance", p: 2, t: 1, keywords: ["lifelink"], draw: true },
    { name: "Impolite Entrance", p: 0, t: 0, keywords: ["trample", "haste"], draw: true },
  ];
  for (const row of examples) {
    const source = TEMPORARY_CREATURE_SPELLS.find((source) => source.name === row.name);
    if (!source) throw new Error("Missing source");
    const bound = bindDevelopmentCard(temporaryCandidate(source), {
      temporaryCreatureSpells: true,
    });
    if (bound.kind !== "bound") throw new Error(bound.reason);
    const expected: SpellEffect[] = [
      {
        kind: "modify-creature",
        powerDelta: row.p,
        toughnessDelta: row.t,
        keywords: row.keywords,
        duration: "until-end-of-turn",
      },
      ...(row.draw ? [{ kind: "draw" as const, recipient: "controller" as const, amount: 1 }] : []),
    ];
    expect(bound.definition.spellProgram?.effects).toEqual(expected);
  }
});
test("whole-body/source/characteristic mismatches never reduce to an admitted partial program", () => {
  const source = TEMPORARY_CREATURE_SPELLS.find((row) => row.name === "Giant Growth");
  if (!source) throw new Error("Missing source");
  const card = temporaryCandidate(source);
  const changedOracle: Partial<CatalogCard["oracle"]>[] = [
    { oracle_text: "Target creature you control gets +3/+3 until end of turn." },
    { oracle_text: "Up to two target creatures get +3/+3 until end of turn." },
    { oracle_text: "Target creature gets +X/+X until end of turn." },
    { oracle_text: "Target creature gets +3/+3 until your next turn." },
    { oracle_text: "Target creature gets +3/+3 until end of turn.\nDraw two cards." },
    { oracle_text: "Target creature gets +3/+3 until end of turn.\nUntap it." },
    {
      oracle_text: "Target creature gets +3/+3 and gains protection from black until end of turn.",
    },
    { oracle_text: "Target creature gets +3/+3 until end of turn.\nKicker {1}" },
    { mana_cost: "{G/P}" },
    { mana_cost: "{G/U}" },
    { mana_cost: "{G}{G}" },
    { cmc: 2 },
    { type_line: "Tribal Instant — Elf" },
    { keywords: ["Storm"] },
    { layout: "adventure" },
    { power: "1" },
    { color_identity: ["R"] },
    { colors: ["R"] },
  ];
  for (const oracle of changedOracle)
    expect(
      bindDevelopmentCard(
        { ...card, oracle: { ...card.oracle, ...oracle } },
        { spellFamilies: true, temporaryCreatureSpells: true },
      ).kind,
    ).toBe("unsupported");
  for (const mutation of [
    { identity: "other" },
    { versionHash: "0".repeat(64) },
    { sourceOrdinal: 0 },
    { bundleHash: "0".repeat(64) },
    { sourceArchiveHash: "0".repeat(64) },
  ])
    expect(
      bindDevelopmentCard({ ...card, ...mutation }, { temporaryCreatureSpells: true }).kind,
    ).toBe("unsupported");
  const bound = bindDevelopmentCard(card, { temporaryCreatureSpells: true });
  if (bound.kind !== "bound") throw new Error(bound.reason);
  for (const mutate of [
    (d: typeof bound.definition) => {
      d.sourceVersion = "0".repeat(64);
    },
    (d: typeof bound.definition) => {
      d.manaCost = { ...source.cost, generic: 9 };
    },
    (d: typeof bound.definition) => {
      d.keywords = ["haste"];
    },
    (d: typeof bound.definition) => {
      const effect = d.spellProgram?.effects[0];
      if (effect?.kind === "modify-creature") effect.toughnessDelta = 4;
    },
  ]) {
    const changed = structuredClone(bound.definition);
    mutate(changed);
    expect(reviewedTemporaryCreatureDefinition(changed)).toBe(false);
  }
});
