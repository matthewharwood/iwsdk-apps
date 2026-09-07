import { beforeAll, expect, test } from "bun:test";
import { CardDefinition, type GameEvent, type Keyword, semanticHash } from "@iwsdk-apps/contracts";
import { temporarySourceFixture } from "../test-fixtures/temporary-source";
import sourceFixture from "../test-fixtures/temporary-source.json";
import { player } from "./common";
import { observe } from "./index";

const SOURCE_RELEASE = "8abe41532a96354af76d414d6c1c56e74c8142b126bb6cb7b8cac806c7380edd";
const FIXTURE_HASH = "45dd1d4ee1c812026917546426d0d52e0e46b118ad0a174b2548e8d6946343ae";
const cases = sourceFixture.cards.map((row) => ({
  hash: row.definitionHash,
  card: CardDefinition.parse(row.definition),
}));
beforeAll(async () => {
  const { hash, ...body } = sourceFixture;
  expect(sourceFixture.sourceReleaseHash).toBe(SOURCE_RELEASE);
  expect(sourceFixture.sourceBundle).toBe(
    "6284360d10b959270061e1e0e165cd24a7b16b877bb8b0c70a848114a24355df",
  );
  expect(sourceFixture.rulesHash).toBe(
    "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f",
  );
  expect(hash).toBe(FIXTURE_HASH);
  expect(await semanticHash(body)).toBe(FIXTURE_HASH);
  expect(cases).toHaveLength(97);
  expect(new Set(cases.map((row) => row.card.oracleId)).size).toBe(97);
  for (const row of cases) expect(await semanticHash(row.card)).toBe(row.hash);
});

// Independent test-only reading of the printed complete Oracle instruction. This
// never reads SpellProgram, compiler recipes, continuous-effect records or engine
// characteristic helpers to construct an expected outcome. It is not runtime parsing.
function expectedFromSource(oracleText: string) {
  const lines = oracleText.split("\n");
  const body = lines[0];
  if (!body || lines.length > 2 || (lines.length === 2 && lines[1] !== "Draw a card."))
    throw new Error("Unreviewed complete source body");
  const keywords: Keyword[] = [];
  const labels: Record<string, Keyword> = {
    flying: "flying",
    haste: "haste",
    trample: "trample",
    reach: "reach",
    lifelink: "lifelink",
    deathtouch: "deathtouch",
    indestructible: "indestructible",
    "first strike": "first-strike",
    "double strike": "double-strike",
  };
  const stats =
    /^Target creature gets ([+-]\d+)\/([+-]\d+)(?: and gains ([a-z ]+))? until end of turn\.$/.exec(
      body,
    );
  const grant = /^Target creature gains ([a-z ]+) until end of turn\.$/.exec(body);
  if (!stats && !grant) throw new Error(`Unreviewed source instruction ${body}`);
  const granted = stats?.[3] ?? grant?.[1];
  for (const name of granted?.split(" and ") ?? []) {
    const keyword = labels[name];
    if (!keyword) throw new Error(`Unreviewed printed keyword ${name}`);
    keywords.push(keyword);
  }
  return {
    powerDelta: Number(stats?.[1] ?? 0),
    toughnessDelta: Number(stats?.[2] ?? 0),
    keywords,
    draw: lines.length === 2,
  };
}
function eventIndex(events: GameEvent[], type: string) {
  const index = events.findIndex((event) => event.type === type);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}
function shown(f: ReturnType<typeof temporarySourceFixture>, objectId: string) {
  const object = observe(f.state, f.registry, "A").objects.find((o) => o.id === objectId);
  if (!object) throw new Error(`Missing public ${objectId}`);
  return object;
}

for (const { card } of cases) {
  const printed = expectedFromSource(card.oracleText);
  test(`source ${card.name}: real printed cost, target and complete temporary effect resolve through commands`, () => {
    const f = temporarySourceFixture(card);
    const originalDefinition = structuredClone(card);
    expect(
      f.state.manifest.seats.every(
        (seat) => seat.deck.entries.reduce((n, entry) => n + entry.count, 0) === 100,
      ),
    ).toBe(true);
    const handBefore = player(f.state, "A").hand.length,
      libraryBefore = player(f.state, "A").library.length;
    const otherHandBefore = player(f.state, "B").hand.length;
    const sourceObject = f.cast();
    expect(shown(f, f.targetId).characteristics).toEqual({
      power: 2,
      toughness: 12000,
      keywords: ["vigilance"],
    });
    expect(
      f.history.some(
        (event) => event.type === "SpellAnnounced" && event.data.definition === card.id,
      ),
    ).toBe(true);
    expect(
      f.history
        .filter((event) => event.type === "DecisionAnswered")
        .slice(0, 3)
        .map((event) => event.data.kind),
    ).toEqual(["priority", "target", "payment"]);
    f.resolve();
    expect(f.state.objects[sourceObject]).toBeUndefined();
    const affected = shown(f, f.targetId);
    expect(affected.characteristics).toEqual({
      power: 2 + printed.powerDelta,
      toughness: 12000 + printed.toughnessDelta,
      keywords: ["vigilance", ...printed.keywords],
    });
    expect(affected.card?.power).toBe(2);
    expect(affected.card?.toughness).toBe(12000);
    expect(shown(f, f.otherId).characteristics).toEqual({
      power: 2,
      toughness: 12000,
      keywords: ["vigilance"],
    });
    expect(player(f.state, "A").hand.length).toBe(handBefore - 1 + Number(printed.draw));
    expect(player(f.state, "A").library.length).toBe(libraryBefore - Number(printed.draw));
    expect(player(f.state, "B").hand.length).toBe(otherHandBefore);
    const events = f.state.events;
    const created = eventIndex(events, "ContinuousEffectCreated"),
      resolved = eventIndex(events, "SpellResolved");
    expect(created).toBeLessThan(resolved);
    const draws = events.filter((event) => event.type === "CardDrawn");
    expect(draws).toHaveLength(Number(printed.draw));
    if (printed.draw) {
      const drawn = draws[0];
      if (!drawn) throw new Error("Missing expected draw");
      expect(eventIndex(events, "CardDrawn")).toBeGreaterThan(created);
      expect(eventIndex(events, "CardDrawn")).toBeLessThan(resolved);
      expect(drawn.visibility).toEqual(["A"]);
      expect(
        observe(f.state, f.registry, "B").objects.some((object) => object.id === drawn.data.object),
      ).toBe(false);
    }
    expect(events.some((event) => event.type === "CreaturesDiedBatch")).toBe(false);
    expect(f.registry.definitions[card.id]).toEqual(originalDefinition);
  });
  if (printed.toughnessDelta < 0)
    test(`source ${card.name}: printed toughness reduction reaches zero before the post-resolution death checkpoint`, () => {
      const f = temporarySourceFixture(card, {
        targetToughness: -printed.toughnessDelta,
        targetKeywords: ["indestructible"],
      });
      const libraryBefore = player(f.state, "A").library.length;
      f.cast();
      f.resolve();
      expect(f.state.objects[f.targetId]).toBeUndefined();
      const newObject = Object.values(f.state.objects).find(
        (object) => object.lineage === f.targetLineage,
      );
      expect(newObject?.zone).toBe("graveyard");
      expect(newObject?.id).not.toBe(f.targetId);
      const events = f.state.events;
      const resolved = eventIndex(events, "SpellResolved"),
        death = eventIndex(events, "CreaturesDiedBatch");
      expect(eventIndex(events, "ContinuousEffectCreated")).toBeLessThan(resolved);
      expect(resolved).toBeLessThan(death);
      expect(f.state.coverage["rule:704.5f"]).toBeGreaterThan(0);
      expect(
        events.some(
          (event) => event.type === "CreatureDestroyed" || event.type === "NoncombatDamageDealt",
        ),
      ).toBe(false);
      expect(player(f.state, "A").library.length).toBe(libraryBefore - Number(printed.draw));
      if (printed.draw) expect(eventIndex(events, "CardDrawn")).toBeLessThan(resolved);
    });
}
