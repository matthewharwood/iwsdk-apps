import { beforeAll, expect, test } from "bun:test";
import {
  canonicalJson,
  EntryObserverProgram,
  type GameEvent,
  Keyword,
  RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { createFullExecutionRegistry } from "../../compiler/src/prepared";
import { REVIEWED_SOURCE_BINDINGS } from "../../compiler/src/reviewed-source-bindings";
import {
  observerSourceAnswer as answer,
  observerSourceCard as card,
  observerSourceCast as cast,
  observerSourceDrain as drain,
  observerSourceFixture as fixture,
  observerSourceInventory as inventory,
  type ObserverSourceFixture,
  observerSourceRelease,
  observerSourceObject as owned,
  observerSourceResolve as resolve,
  observerSourceSnapshot as snapshot,
} from "../test-fixtures/entry-observer-source";
import { characteristics } from "./characteristics";
import { move, player } from "./common";
import { admitDeck, assertInvariants, observe } from "./index";
import { givePriority } from "./turns";

// Expected effects and subjects below were authored from complete Oracle bodies,
// independently of the executable IR. All selected hands/mana are explicit
// constructed preconditions in otherwise legally admitted 100-card inventories.
const cases = [
  {
    name: "Bogwater Lumaret",
    commander: "Yargle and Multani",
    witness: "Memnite",
    gain: 1,
    draw: 0,
    self: true,
  },
  {
    name: "Tatyova, Benthic Druid",
    commander: "Tatyova, Benthic Druid",
    witness: "Forest",
    gain: 1,
    draw: 1,
    self: false,
  },
  {
    name: "Jaddi Offshoot",
    commander: "Jasmine Boreal",
    witness: "Forest",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Kazandu Nectarpot",
    commander: "Jasmine Boreal",
    witness: "Forest",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Eumidian Terrabotanist",
    commander: "Jasmine Boreal",
    witness: "Forest",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Virulent Emissary",
    commander: "Yargle and Multani",
    witness: "Memnite",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Lifecreed Duo",
    commander: "Jasmine Boreal",
    witness: "Memnite",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Dazzling Angel",
    commander: "Jasmine Boreal",
    witness: "Memnite",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Social Climber",
    commander: "Jasmine Boreal",
    witness: "Memnite",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Impassioned Orator",
    commander: "Jasmine Boreal",
    witness: "Memnite",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Hinterland Sanctifier",
    commander: "Jasmine Boreal",
    witness: "Memnite",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Kor Celebrant",
    commander: "Jasmine Boreal",
    witness: "Memnite",
    gain: 1,
    draw: 0,
    self: true,
  },
  {
    name: "Ajani's Welcome",
    commander: "Jasmine Boreal",
    witness: "Memnite",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Healer of the Pride",
    commander: "Jasmine Boreal",
    witness: "Memnite",
    gain: 2,
    draw: 0,
    self: false,
  },
  {
    name: "Soul Warden",
    commander: "Jasmine Boreal",
    witness: "Memnite",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Essence Warden",
    commander: "Jasmine Boreal",
    witness: "Memnite",
    gain: 1,
    draw: 0,
    self: false,
  },
  {
    name: "Fateful Discovery",
    commander: "Tatyova, Benthic Druid",
    witness: "Memnite",
    gain: 0,
    draw: 1,
    self: false,
  },
  {
    name: "Eidolon of Blossoms",
    commander: "Jasmine Boreal",
    witness: "Gaea's Anthem",
    gain: 0,
    draw: 1,
    self: true,
  },
  {
    name: "Nexus Wardens",
    commander: "Jasmine Boreal",
    witness: "Gaea's Anthem",
    gain: 2,
    draw: 0,
    self: false,
  },
  {
    name: "Woodland Liege",
    commander: "Jasmine Boreal",
    witness: "Primal Huntbeast",
    gain: 0,
    draw: 1,
    self: false,
  },
];
function events(f: ObserverSourceFixture, from = 0): GameEvent[] {
  return f.history.slice(from).flatMap((row) => row.events);
}
function captures(f: ObserverSourceFixture) {
  return Object.values(f.state.abilities).filter((ability) => "entry" in ability);
}
function landInHand(f: ObserverSourceFixture): string {
  const entry = Object.values(f.state.objects).find(
    (o) => o.owner === "A" && o.definition === card("Forest").id && o.zone === "library",
  );
  if (!entry) throw new Error("Missing actual Forest in legal deck");
  const id = move(f.state, entry.id, "hand", "declared selected source land").id;
  givePriority(f.state, f.registry, "A");
  return id;
}
function assertEffectEvents(actual: GameEvent[], gain: number, draw: number) {
  const gains = actual.filter((e) => e.type === "LifeGained");
  const draws = actual.filter((e) => e.type === "CardDrawn");
  expect(gains).toHaveLength(gain ? 1 : 0);
  if (gain) expect(gains[0]?.data.amount).toBe(gain);
  expect(draws).toHaveLength(draw);
  const effects = actual
    .filter((e) => e.type === "LifeGained" || e.type === "CardDrawn")
    .map((e) => e.type);
  expect(effects).toEqual([
    ...(gain ? ["LifeGained"] : []),
    ...Array.from({ length: draw }, () => "CardDrawn"),
  ]);
}
beforeAll(async () => {
  const { hash, ...body } = snapshot;
  expect(hash).toBe("43fe3d58b243ccd8b3c68dcccec80d758d5a7dcb5768fdd70cb3e272da884102");
  expect(await semanticHash(body)).toBe(hash);
  expect(snapshot.originReleaseHash).toBe(
    "19b625376b02555521b2f0cea2a33097299bac813e65b682725982e61bfd948d",
  );
  expect(snapshot.originPrimaryCount).toBe(1190);
  expect(snapshot.completeCommanderInventory).toHaveLength(40);
  expect(snapshot.cases.map((r) => r.facts.name).sort()).toEqual(cases.map((r) => r.name).sort());
  for (const row of snapshot.cards) {
    expect(await semanticHash(row.definition)).toBe(row.definitionHash);
    expect(REVIEWED_SOURCE_BINDINGS[row.definition.oracleId]?.definitionHash).toBe(
      row.definitionHash,
    );
  }
  for (const row of snapshot.sourceRecords) {
    expect(await semanticHash(row.oracle)).toBe(row.sourceVersion);
    const definition = card(row.oracle.name);
    expect(definition.sourceVersion).toBe(row.sourceVersion);
    expect(definition.oracleId).toBe(row.identity);
    expect(definition.oracleText).toBe(row.oracle.oracle_text ?? "");
    expect(definition.typeLine).toBe(row.oracle.type_line);
    expect(snapshot.printedCosts[row.oracle.name as keyof typeof snapshot.printedCosts]).toBe(
      row.oracle.mana_cost,
    );
  }
  for (const row of snapshot.cases) {
    expect(card(row.facts.name).triggerPrograms).toEqual([
      EntryObserverProgram.parse(row.proposedObserverProgram),
    ]);
    expect(card(row.facts.name).keywords).toEqual(
      Keyword.array().parse(row.facts.intrinsicKeywords),
    );
  }
  const release = await observerSourceRelease();
  const registry = await createFullExecutionRegistry(release);
  expect(Object.keys(registry.definitions)).toHaveLength(83);
  expect(registry.sourceReleaseHash).toBe(release.hash);
  expect(release.hash).not.toBe(snapshot.originReleaseHash);
});
for (const scenario of cases)
  test(`${scenario.name}: actual printed cost, legal source cast and matching entry execute the complete mandatory body`, async () => {
    const land = scenario.witness === "Forest";
    const f = await fixture(scenario.commander, [
      scenario.name,
      ...(land ? [] : [scenario.witness]),
    ]);
    const selectedLand = land ? landInHand(f) : null;
    const originalInventory = [inventory(f, "A"), inventory(f, "B")];
    for (const seat of f.state.manifest.seats) admitDeck(seat.deck, f.registry);
    expect(originalInventory.map((a) => a.length)).toEqual([100, 100]);
    const before = owned(f, "A", scenario.name);
    const announcedAt = f.history.length;
    const paid = cast(f, "A", scenario.name);
    expect(paid.event?.data.paid).toEqual(paid.payment.spend);
    expect(owned(f, "A", scenario.name).zone).toBe("stack");
    expect(captures(f)).toEqual([]);
    resolve(f);
    const source = owned(f, "A", scenario.name);
    expect(source.zone).toBe("battlefield");
    expect(source.generation).toBe(before.generation + 2);
    expect(captures(f)).toHaveLength(scenario.self ? 1 : 0);
    if (scenario.self) {
      expect(captures(f)[0]?.entry.subject.id).toBe(source.id);
      expect(player(f.state, "A").life).toBe(40);
    }
    drain(f);
    assertEffectEvents(
      events(f, announcedAt),
      scenario.self ? scenario.gain : 0,
      scenario.self ? scenario.draw : 0,
    );
    const life = player(f.state, "A").life;
    const hand = player(f.state, "A").hand.length;
    const witnessAt = f.history.length;
    let subjectId: string;
    if (land) {
      if (!selectedLand) throw new Error("Missing selected land");
      answer(f, { kind: "land", card: selectedLand });
      const subject = captures(f)[0]?.entry.subject;
      if (!subject) throw new Error("Missing land context");
      subjectId = subject.id;
      expect(player(f.state, "A").landsPlayed).toBe(1);
      expect(events(f, witnessAt).some((e) => e.type === "SpellAnnounced")).toBe(false);
    } else {
      cast(f, "A", scenario.witness);
      resolve(f);
      subjectId = owned(f, "A", scenario.witness).id;
    }
    const captured = captures(f);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.entry.subject.id).toBe(subjectId);
    expect(captured[0]?.source.id).toBe(source.id);
    expect(captured[0]?.sourceVersion).toBe(card(scenario.name).sourceVersion);
    expect(captured[0]?.entry.subjectVersion).toBe(card(scenario.witness).sourceVersion);
    expect(captured[0]?.controller).toBe("A");
    expect(player(f.state, "A").life).toBe(life);
    expect(
      events(f, witnessAt).filter((e) => e.type === "LifeGained" || e.type === "CardDrawn"),
    ).toHaveLength(0);
    drain(f);
    expect(player(f.state, "A").life).toBe(life + scenario.gain);
    expect(player(f.state, "A").hand.length).toBe(hand - 1 + scenario.draw);
    assertEffectEvents(events(f, witnessAt), scenario.gain, scenario.draw);
    expect(events(f, witnessAt).filter((e) => e.type === "TriggeredAbilityResolved")).toHaveLength(
      1,
    );
    expect([inventory(f, "A"), inventory(f, "B")]).toEqual(originalInventory);
  });
const greenBlue = [
  { name: "Assault Zeppelid", power: 3, toughness: 3, keywords: ["flying", "trample"], draw: 0 },
  { name: "Drakewing Krasis", power: 3, toughness: 1, keywords: ["flying", "trample"], draw: 0 },
  { name: "Gaea's Skyfolk", power: 2, toughness: 2, keywords: ["flying"], draw: 0 },
  { name: "Jungle Barrier", power: 2, toughness: 6, keywords: ["defender"], draw: 1 },
  { name: "Merfolk Mistbinder", power: 2, toughness: 2, keywords: [], draw: 0 },
  {
    name: "Needlethorn Drake",
    power: 1,
    toughness: 1,
    keywords: ["flying", "deathtouch"],
    draw: 0,
  },
  {
    name: "Simic Sky Swallower",
    power: 6,
    toughness: 6,
    keywords: ["flying", "trample", "shroud"],
    draw: 0,
  },
  {
    name: "Venomthrope",
    power: 2,
    toughness: 2,
    keywords: ["flying", "deathtouch", "hexproof"],
    draw: 0,
  },
  {
    name: "Winged Coatl",
    power: 1,
    toughness: 1,
    keywords: ["flash", "flying", "deathtouch"],
    draw: 0,
  },
];
for (const scenario of greenBlue)
  test(`${scenario.name}: existing authenticated GU body casts under newly admitted Tatyova without a color waiver`, async () => {
    const f = await fixture("Tatyova, Benthic Druid", [scenario.name]);
    expect(snapshot.guExisting.map((r) => r.name).sort()).toEqual(
      greenBlue.map((r) => r.name).sort(),
    );
    cast(f, "A", "Tatyova, Benthic Druid");
    resolve(f);
    drain(f);
    const hand = player(f.state, "A").hand.length;
    const at = f.history.length;
    const paid = cast(f, "A", scenario.name);
    expect(paid.event?.data.paid).toEqual(paid.payment.spend);
    resolve(f);
    drain(f);
    const permanent = owned(f, "A", scenario.name);
    const actual = characteristics(f.state, f.registry, permanent.id);
    expect(actual.power).toBe(scenario.power);
    expect(actual.toughness).toBe(scenario.toughness);
    expect([...actual.keywords].sort()).toEqual(Keyword.array().parse(scenario.keywords).sort());
    expect(player(f.state, "A").hand.length).toBe(hand - 1 + scenario.draw);
    expect(events(f, at).filter((e) => e.type === "CardDrawn")).toHaveLength(scenario.draw);
    expect(
      events(f, at).filter(
        (e) =>
          e.type === "TriggerCaptured" && e.data.definition === card("Tatyova, Benthic Druid").id,
      ),
    ).toHaveLength(0);
    if (scenario.name === "Merfolk Mistbinder") {
      const tatyova = characteristics(
        f.state,
        f.registry,
        owned(f, "A", "Tatyova, Benthic Druid").id,
      );
      expect([tatyova.power, tatyova.toughness]).toEqual([4, 4]);
    }
  });
test("Tatyova and Jaddi: ordinary legal land produces two owned occurrences; canonical restore retains both distinct contexts and effect order", async () => {
  const f = await fixture("Tatyova, Benthic Druid", ["Jaddi Offshoot"]);
  const land = landInHand(f);
  for (const name of ["Tatyova, Benthic Druid", "Jaddi Offshoot"]) {
    cast(f, "A", name);
    resolve(f);
    drain(f);
  }
  answer(f, { kind: "land", card: land });
  expect(f.state.decision?.kind).toBe("trigger-order");
  const ids = f.state.decision?.triggers;
  if (!ids) throw new Error("Missing order choice");
  expect(ids).toHaveLength(2);
  expect(new Set(captures(f).map((a) => a.entry.subject.id)).size).toBe(1);
  const restore = {
    ...f,
    state: RulesState.parse(JSON.parse(canonicalJson(f.state))),
    history: structuredClone(f.history),
  };
  expect(observe(f.state, f.registry, "B").decision).toBeNull();
  for (const branch of [f, restore]) {
    answer(branch, { kind: "trigger-order", triggers: [...ids].reverse() });
    drain(branch);
  }
  expect(f.state).toEqual(restore.state);
  expect(player(f.state, "A").life).toBe(42);
  expect(captures(f)).toEqual([]);
});
test("Queen's Commission: two actual providers capture four token-subject occurrences after two-token creation, then gain six", async () => {
  const f = await fixture("Jasmine Boreal", [
    "Soul Warden",
    "Healer of the Pride",
    "Queen's Commission",
  ]);
  for (const name of ["Soul Warden", "Healer of the Pride"]) {
    cast(f, "A", name);
    resolve(f);
    drain(f);
  }
  const life = player(f.state, "A").life;
  const at = f.history.length;
  cast(f, "A", "Queen's Commission");
  resolve(f);
  expect(captures(f)).toHaveLength(4);
  expect(new Set(captures(f).map((a) => a.id)).size).toBe(4);
  expect(new Set(captures(f).map((a) => a.entry.subject.id)).size).toBe(2);
  expect(captures(f).every((a) => a.entry.subject.token?.creator === "A")).toBe(true);
  expect(player(f.state, "A").life).toBe(life);
  expect(events(f, at).some((e) => e.type === "SpellResolved")).toBe(true);
  drain(f);
  expect(player(f.state, "A").life).toBe(life + 6);
  expect(events(f, at).filter((e) => e.type === "TriggeredAbilityResolved")).toHaveLength(4);
});
test("Soul Warden: actual opposing flash creature triggers any-controller text while the source owner's captured effect survives Repulse", async () => {
  const f = await fixture("Jasmine Boreal", ["Soul Warden"], "Tatyova, Benthic Druid", [
    "Winged Coatl",
    "Repulse",
  ]);
  cast(f, "A", "Soul Warden");
  resolve(f);
  drain(f);
  cast(f, "B", "Winged Coatl");
  resolve(f);
  const saved = captures(f)[0];
  if (!saved) throw new Error("Missing opposing creature observer");
  expect(saved.controller).toBe("A");
  expect(saved.entry.subject.controller).toBe("B");
  cast(f, "B", "Repulse", saved.source.id);
  resolve(f);
  expect(owned(f, "A", "Soul Warden").zone).toBe("hand");
  expect(captures(f)[0]).toEqual(saved);
  drain(f);
  expect(player(f.state, "A").life).toBe(41);
  expect(player(f.state, "B").life).toBe(40);
  assertInvariants(f.state, f.registry);
});
test("Counterspell: an actual paid observer spell that is countered never enters or creates its self occurrence", async () => {
  const f = await fixture("Jasmine Boreal", ["Eidolon of Blossoms"], "Tobias Andrion", [
    "Counterspell",
  ]);
  const at = f.history.length;
  const source = cast(f, "A", "Eidolon of Blossoms");
  cast(f, "B", "Counterspell", source.id);
  resolve(f);
  drain(f);
  expect(owned(f, "A", "Eidolon of Blossoms").zone).toBe("graveyard");
  expect(events(f, at).filter((e) => e.type === "TriggerCaptured")).toHaveLength(0);
  expect(events(f, at).filter((e) => e.type === "PermanentSpellResolved")).toHaveLength(0);
  expect(events(f, at).filter((e) => e.type === "SpellCast")).toHaveLength(2);
});
