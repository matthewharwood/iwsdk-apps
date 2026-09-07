import { expect, test } from "bun:test";
import {
  type CardDefinition,
  type Cost,
  MANA_COLORS,
  type MatchManifest,
  OrdinaryActivatedProgram,
} from "@iwsdk-apps/contracts";
import independent from "../test-fixtures/activation-expectations.json";
import {
  activationSourceActivate as activate,
  activationSourceCard as card,
  activationSourceDeck as deck,
  activationSourceFixture as fixture,
  activationSourceNextTurn as nextTurn,
  activationSourcePermanent as permanent,
  activationSourceRelease as release,
  activationSourceResolve as resolve,
} from "../test-fixtures/activation-source";
import snapshot from "../test-fixtures/activation-source.json";
import { characteristics } from "./characteristics";
import { player } from "./common";
import { admitDeck } from "./index";

const commanders: CardDefinition[] = snapshot.cards
  .map((row) => card(row.definition.name))
  .filter((card) => card.commanderEligible);
const expectations = independent.proposals.map((row) => ({
  ...row,
  expected: OrdinaryActivatedProgram.parse({
    schema: "commander-activated/1",
    id: "independent-whole-body-expectation",
    ...row.programExpectation,
    effects: row.programExpectation.effects.map((effect) => {
      if (!("grantKeywords" in effect)) return effect;
      const { grantKeywords, ...rest } = effect;
      return { ...rest, keywords: grantKeywords.map((keyword) => keyword.replaceAll(" ", "-")) };
    }),
  }),
}));
function manaText(cost: Cost | null): string {
  if (!cost) return "";
  return (
    (cost.generic ? `{${cost.generic}}` : "") +
      MANA_COLORS.flatMap((color) => Array.from({ length: cost[color] }, () => `{${color}}`)).join(
        "",
      ) || "{0}"
  );
}
function commanderFor(identity: readonly string[]): CardDefinition | undefined {
  return commanders
    .filter((card) =>
      identity.every((color) => card.colorIdentity.some((allowed) => allowed === color)),
    )
    .sort(
      (a, b) => a.colorIdentity.length - b.colorIdentity.length || a.name.localeCompare(b.name),
    )[0];
}

test("ACT-SRC32: all239 independent source obligations;234 legal compositions and five explicit color-identity gaps", async () => {
  expect(expectations).toHaveLength(239);
  const source = await release();
  const gaps: string[] = [];
  for (const row of expectations) {
    const bound = card(row.name);
    expect(bound.sourceVersion).toBe(row.sourceVersion);
    expect(bound.oracleText).toBe(row.completeOracleText);
    const leader = commanderFor(bound.colorIdentity);
    expect(!!leader).toBe(row.currentLegalDeckCompositionAvailable);
    if (!leader) {
      gaps.push(row.name);
      for (const candidate of commanders) {
        const invalid = await deck(candidate.name, [row.name]);
        expect(() => admitDeck(invalid, source)).toThrow();
      }
    }
  }
  expect(gaps.sort()).toEqual([
    "Angelfire Crusader",
    "Kranioceros",
    "Leaping Master",
    "Torch Drake",
    "Towering Thunderfist",
  ]);
});

for (const mode of [
  "full-scan",
  "prepared-scan",
  "prepared-indexed",
] satisfies MatchManifest["resolver"][]) {
  for (const row of expectations) {
    const leader = commanderFor(row.characteristics.colorIdentity);
    if (!leader) continue;
    test(`Actual source ${mode}: ${row.name} casts, pays and resolves its complete ${row.family} instruction`, async () => {
      const effect = row.expected.effects[0];
      const names = [row.name, ...(row.expected.target ? ["Memnite"] : [])];
      const f = await fixture(leader.name, names, "Tobias Andrion", [], mode);
      const source = permanent(f, "A", row.name);
      const target = row.expected.target ? permanent(f, "A", "Memnite") : source;
      if (row.expected.cost.tapSource && row.characteristics.types.includes("Creature"))
        nextTurn(f, "A");
      const before = characteristics(f.state, f.registry, target),
        hand = player(f.state, "A").hand.length,
        life = player(f.state, "A").life;
      const ability = activate(
        f,
        "A",
        row.name,
        manaText(row.expected.cost.mana),
        row.expected.target ? target : undefined,
      );
      expect(ability.source.definition).toBe(card(row.name).id);
      expect(ability.program.cost).toEqual(row.expected.cost);
      expect(f.state.objects[source]?.tapped).toBe(row.expected.cost.tapSource);
      expect(characteristics(f.state, f.registry, target)).toEqual(before);
      expect(player(f.state, "A").hand.length).toBe(hand);
      expect(player(f.state, "A").life).toBe(life);
      resolve(f);
      expect(
        f.state.events.some(
          (event) => event.type === "ActivatedAbilityResolved" && event.data.ability === ability.id,
        ),
      ).toBe(true);
      if (effect.kind === "draw")
        expect(player(f.state, "A").hand.length).toBe(hand + effect.amount);
      else if (effect.kind === "gain-life")
        expect(player(f.state, "A").life).toBe(life + effect.amount);
      else if (effect.kind === "tap") expect(f.state.objects[target]?.tapped).toBe(true);
      else {
        const power = (before.power ?? 0) + effect.powerDelta,
          toughness = (before.toughness ?? 0) + effect.toughnessDelta;
        if (toughness <= 0) expect(f.state.objects[target]).toBeUndefined();
        else {
          const after = characteristics(f.state, f.registry, target);
          expect(after.power).toBe(power);
          expect(after.toughness).toBe(toughness);
          expect(new Set(after.keywords)).toEqual(
            new Set([...before.keywords, ...effect.keywords]),
          );
        }
        expect(
          f.state.continuousEffects.find((entry) => entry.activation?.id === ability.id)
            ?.affectedObject,
        ).toBe(target);
      }
      expect(f.state.stack).toHaveLength(0);
    });
  }
}
