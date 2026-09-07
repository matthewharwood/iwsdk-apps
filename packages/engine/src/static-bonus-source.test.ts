import { beforeAll, expect, test } from "bun:test";
import {
  CardDefinition,
  canonicalJson,
  DerivedCharacteristics,
  Keyword,
  RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { createFullExecutionRegistry } from "../../compiler/src/prepared";
import { REVIEWED_SOURCE_BINDINGS } from "../../compiler/src/reviewed-source-bindings";
import {
  staticSourceAnswer,
  staticSourceCard,
  staticSourceCast,
  staticSourceCommand,
  staticSourceDeck,
  staticSourceFixture,
  staticSourceInventory,
  staticSourceObject,
  staticSourceRelease,
  staticSourceResolve,
  staticSourceSnapshot,
} from "../test-fixtures/static-bonus-source";
import { characteristics } from "./characteristics";
import { move, object, player } from "./common";
import { legalSpellTargets } from "./effects";
import { admitDeck, assertInvariants, observe, transition } from "./index";
import { givePriority } from "./turns";

// Expected stats are retained from complete source bodies reviewed before runtime
// implementation. These are actual source casts with explicit constructed hands/lands,
// not randomly drawn games or a waiver of Commander composition.
const cases = staticSourceSnapshot.cases.filter((row) => row.commander !== null);
const excluded = staticSourceSnapshot.cases.filter((row) => row.commander === null);
beforeAll(async () => {
  const { hash, ...body } = staticSourceSnapshot;
  expect(hash).toBe("fb34eeb825b345303a819c667154fb526dc0c9ea6683fe993661796878545a0e");
  expect(await semanticHash(body)).toBe(hash);
  expect(staticSourceSnapshot.qualifiedReleaseHash).toBe(
    "7f1e1b65f7134dce4add33ded2019720f74b44f0c9c194dbc34e182383914bdf",
  );
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1190);
  expect(staticSourceSnapshot.fullCommanderScan).toHaveLength(39);
  expect(cases).toHaveLength(38);
  expect(excluded.map((row) => row.name).sort()).toEqual([
    "Inspiring Veteran",
    "Kargan Warleader",
    "Merfolk Mistbinder",
  ]);
  for (const row of staticSourceSnapshot.cards) {
    expect(await semanticHash(row.definition)).toBe(row.definitionHash);
    expect(REVIEWED_SOURCE_BINDINGS[row.definition.oracleId]?.definitionHash).toBe(
      row.definitionHash,
    );
  }
  for (const row of staticSourceSnapshot.sourceRecords) {
    const definition = staticSourceCard(row.facts.name);
    expect(definition.sourceVersion).toBe(row.sourceVersion);
    expect(definition.oracleId).toBe(row.identity);
    expect(definition.oracleText).toBe(row.facts.oracleText);
    expect(definition.typeLine).toBe(row.facts.typeLine);
    expect(definition.staticPrograms).toEqual(
      CardDefinition.shape.staticPrograms.parse(row.proposedStaticPrograms),
    );
    expect(definition.keywords).toEqual(Keyword.array().parse(row.facts.intrinsicKeywords));
  }
  const release = await staticSourceRelease();
  const registry = await createFullExecutionRegistry(release);
  expect(registry.sourceReleaseHash).toBe(release.hash);
  expect(release.hash).not.toBe(staticSourceSnapshot.qualifiedReleaseHash);
  expect(Object.keys(registry.definitions)).toHaveLength(108);
});
for (const scenario of cases) {
  test(`${scenario.name}: authenticated source casts and resolves its complete static body in a legal100-card deck`, async () => {
    if (!scenario.commander || !scenario.recipient)
      throw new Error("Qualified scenario lacks its ordinary legal deck");
    const names = [...new Set([scenario.name, scenario.recipient])];
    const f = await staticSourceFixture(scenario.commander, names);
    const physical = [staticSourceInventory(f, "A"), staticSourceInventory(f, "B")];
    expect(physical.map((a) => a.length)).toEqual([100, 100]);
    for (const seat of f.state.manifest.seats) admitDeck(seat.deck, f.registry);
    if (scenario.recipient !== scenario.name) {
      staticSourceCast(f, "A", scenario.recipient);
      staticSourceResolve(f);
    }
    const original = staticSourceObject(f, "A", scenario.name);
    const generation = original.generation;
    const paid = staticSourceCast(f, "A", scenario.name);
    expect(paid.event?.data.paid).toEqual(paid.payment.spend);
    expect(object(f.state, paid.id).zone).toBe("stack");
    if (scenario.recipient !== scenario.name) {
      const recipient = staticSourceObject(f, "A", scenario.recipient);
      const base = staticSourceCard(scenario.recipient);
      expect(characteristics(f.state, f.registry, recipient.id).power).toBe(base.power);
      expect(characteristics(f.state, f.registry, recipient.id).toughness).toBe(base.toughness);
    }
    staticSourceResolve(f);
    const source = staticSourceObject(f, "A", scenario.name);
    const recipient = staticSourceObject(f, "A", scenario.recipient);
    expect(source).toMatchObject({
      owner: "A",
      controller: "A",
      zone: "battlefield",
      commander: scenario.name === scenario.commander,
    });
    expect(source.generation).toBe(generation + 2);
    expect(source.id).not.toBe(paid.id);
    expect(characteristics(f.state, f.registry, source.id)).toEqual(
      DerivedCharacteristics.parse(scenario.expectedSource),
    );
    expect(characteristics(f.state, f.registry, recipient.id)).toEqual(
      DerivedCharacteristics.parse(scenario.expectedRecipient),
    );
    expect(
      f.state.events.some(
        (event) =>
          event.type === "PermanentSpellResolved" && event.data.definition === source.definition,
      ),
    ).toBe(true);
    expect(f.state.continuousEffects).toEqual([]);
    const shown = observe(f.state, f.registry, "B").objects.find((entry) => entry.id === source.id);
    expect(shown?.card?.oracleText).toBe(staticSourceCard(scenario.name).oracleText);
    expect([staticSourceInventory(f, "A"), staticSourceInventory(f, "B")]).toEqual(physical);
    expect(Object.isFrozen(f.registry.definitions[source.definition])).toBe(true);
    const restored = RulesState.parse(JSON.parse(canonicalJson(f.state)));
    assertInvariants(restored, f.registry);
    expect(observe(restored, f.registry, "B")).toEqual(observe(f.state, f.registry, "B"));
    const evidenceRoot = process.env.STATIC_SOURCE_EVIDENCE_DIR;
    if (evidenceRoot) {
      const definition = staticSourceCard(scenario.name);
      await Bun.write(
        `${evidenceRoot}/cards/${definition.oracleId}.json`,
        `${JSON.stringify(
          {
            schema: "static-source-execution-result/1",
            scenario: scenario.name,
            kind: "authenticated-source-cast-with-constructed-hands-and-basic-lands",
            fullSourceReleaseHash: staticSourceSnapshot.qualifiedReleaseHash,
            fixtureReleaseHash: f.release.hash,
            sourceVersion: definition.sourceVersion,
            definitionHash: await semanticHash(definition),
            manifest: f.state.manifest,
            sourceBefore: original,
            cast: paid,
            sourceAfter: source,
            recipient: scenario.recipient,
            actualSource: characteristics(f.state, f.registry, source.id),
            actualRecipient: characteristics(f.state, f.registry, recipient.id),
            expectedSource: scenario.expectedSource,
            expectedRecipient: scenario.expectedRecipient,
            resolutionEvents: f.state.events,
            physicalCounts: physical.map((cards) => cards.length),
            finalStateHash: await semanticHash(f.state),
            revision: f.state.revision,
            fullGame: false,
          },
          null,
          2,
        )}\n`,
      );
    }
  });
}
for (const scenario of excluded) {
  test(`${scenario.name}: exactsource is retained but all39 admitted commanders reject its color identity`, async () => {
    const release = await staticSourceRelease();
    const registry = await createFullExecutionRegistry(release);
    const card = staticSourceCard(scenario.name);
    expect(card.staticPrograms).toHaveLength(1);
    for (const leader of staticSourceSnapshot.fullCommanderScan) {
      expect(card.colorIdentity.every((color) => leader.colorIdentity.includes(color))).toBe(false);
      const deck = await staticSourceDeck(leader.name, [scenario.name]);
      expect(deck.entries.reduce((sum, row) => sum + row.count, 0)).toBe(100);
      expect(() => admitDeck(deck, registry)).toThrow("outside commander color identity");
    }
  });
}
test("Arvad is a legal WB commander; Call to the Feast creates nonlegendary Vampires without Arvad's legendary bonus", async () => {
  const f = await staticSourceFixture("Arvad the Cursed", [
    "Arvad the Cursed",
    "Isamaru, Hound of Konda",
    "Call to the Feast",
    "Legion Lieutenant",
  ]);
  staticSourceCast(f, "A", "Isamaru, Hound of Konda");
  staticSourceResolve(f);
  const initial = staticSourceObject(f, "A", "Arvad the Cursed");
  expect(initial.zone).toBe("command");
  const lineage = initial.lineage;
  staticSourceCast(f, "A", "Arvad the Cursed");
  staticSourceResolve(f);
  expect(player(f.state, "A").commanderCasts[lineage]).toBe(1);
  const isamaru = staticSourceObject(f, "A", "Isamaru, Hound of Konda");
  expect(characteristics(f.state, f.registry, isamaru.id)).toEqual({
    power: 4,
    toughness: 4,
    keywords: [],
  });
  staticSourceCast(f, "A", "Call to the Feast");
  staticSourceResolve(f);
  const tokens = Object.values(f.state.objects).filter((entry) => entry.token);
  expect(tokens).toHaveLength(3);
  for (const token of tokens) {
    expect(token.owner).toBe("A");
    expect(token.controller).toBe("A");
    expect(characteristics(f.state, f.registry, token.id)).toEqual({
      power: 1,
      toughness: 1,
      keywords: ["lifelink"],
    });
  }
  staticSourceCast(f, "A", "Legion Lieutenant");
  staticSourceResolve(f);
  for (const token of tokens)
    expect(characteristics(f.state, f.registry, token.id)).toEqual({
      power: 2,
      toughness: 2,
      keywords: ["lifelink"],
    });
  const arvad = staticSourceObject(f, "A", "Arvad the Cursed");
  expect(characteristics(f.state, f.registry, arvad.id)).toEqual({
    power: 4,
    toughness: 4,
    keywords: ["deathtouch", "lifelink"],
  });
  expect(staticSourceInventory(f, "A")).toHaveLength(100);
});
test("Gaea's Anthem is nontargeting: actual shroud and hexproof recipients receive its full bonus", async () => {
  const f = await staticSourceFixture("Jasmine Boreal", [
    "Gaea's Anthem",
    "Humble Budoka",
    "Primal Huntbeast",
  ]);
  for (const name of ["Humble Budoka", "Primal Huntbeast", "Gaea's Anthem"]) {
    staticSourceCast(f, "A", name);
    staticSourceResolve(f);
  }
  const budoka = staticSourceObject(f, "A", "Humble Budoka"),
    huntbeast = staticSourceObject(f, "A", "Primal Huntbeast");
  expect(characteristics(f.state, f.registry, budoka.id)).toEqual({
    power: 3,
    toughness: 3,
    keywords: ["shroud"],
  });
  expect(characteristics(f.state, f.registry, huntbeast.id)).toEqual({
    power: 4,
    toughness: 4,
    keywords: ["hexproof"],
  });
  const targets = legalSpellTargets(f.state, f.registry, "B", {
    schema: "commander-spell/1",
    target: "creature",
    effects: [{ kind: "destroy" }],
  }).cards;
  expect(targets).not.toContain(budoka.id);
  expect(targets).not.toContain(huntbeast.id);
  const hand = move(f.state, budoka.id, "hand", "constructed off-battlefield recipient check");
  expect(characteristics(f.state, f.registry, hand.id)).toEqual({
    power: 2,
    toughness: 2,
    keywords: ["shroud"],
  });
});
test("Repulse on actual Benalish Marshal changes the blocker toughness used by trample assignment", async () => {
  const f = await staticSourceFixture(
    "Jasmine Boreal",
    ["Veteran Armorer", "Force of Savagery"],
    "Tobias Andrion",
    ["Benalish Marshal", "Silvercoat Lion", "Repulse"],
  );
  staticSourceCast(f, "A", "Veteran Armorer");
  staticSourceResolve(f);
  staticSourceCast(f, "A", "Force of Savagery");
  staticSourceResolve(f);
  const attacker = staticSourceObject(f, "A", "Force of Savagery");
  // Explicit opponent battlefield/combat preconditions; the subsequent Repulse and
  // every damage assignment are normal transition commands, not a complete game.
  const marshal = move(
    f.state,
    staticSourceObject(f, "B", "Benalish Marshal").id,
    "battlefield",
    "constructed opposing provider",
  );
  const lion = move(
    f.state,
    staticSourceObject(f, "B", "Silvercoat Lion").id,
    "battlefield",
    "constructed opposing blocker",
  );
  f.state.combat.attacks = [{ attacker: attacker.id, defender: "B" }];
  f.state.combat.blocks = [{ attacker: attacker.id, blocker: lion.id }];
  f.state.combat.blocked = [attacker.id];
  f.state.step = "blockers";
  givePriority(f.state, f.registry, "A");
  expect(characteristics(f.state, f.registry, lion.id).toughness).toBe(3);
  staticSourceCast(f, "B", "Repulse", marshal.id);
  staticSourceResolve(f);
  expect(characteristics(f.state, f.registry, lion.id).toughness).toBe(2);
  for (let i = 0; i < 2; i++) staticSourceAnswer(f, { kind: "pass" });
  expect(
    f.state.decision?.damageDomain[0]?.targets.find((target) => target.id === lion.id)?.lethal,
  ).toBe(2);
  const original = canonicalJson(f.state);
  expect(
    transition(
      f.state,
      staticSourceCommand(f, {
        kind: "damage",
        allocations: [
          { source: attacker.id, target: lion.id, amount: 1 },
          { source: attacker.id, target: "B", amount: 7 },
        ],
      }),
      f.registry,
    ).status,
  ).toBe("rejected");
  expect(canonicalJson(f.state)).toBe(original);
  for (const creatureDamage of [2, 3]) {
    const branch = { ...f, state: RulesState.parse(JSON.parse(original)) };
    staticSourceAnswer(branch, {
      kind: "damage",
      allocations: [
        { source: attacker.id, target: lion.id, amount: creatureDamage },
        { source: attacker.id, target: "B", amount: 8 - creatureDamage },
      ],
    });
    staticSourceAnswer(branch, {
      kind: "damage",
      allocations: [{ source: lion.id, target: attacker.id, amount: 2 }],
    });
    expect(player(branch.state, "B").life).toBe(40 - (8 - creatureDamage));
  }
});
for (const name of ["Dictate of Heliod", "Turtle Power!"]) {
  test(`${name}: its authenticated intrinsic flash enables a real cast during the opponent's upkeep`, async () => {
    const scenario = cases.find((row) => row.name === name);
    if (!scenario?.commander) throw new Error("Missing flash source fixture");
    const f = await staticSourceFixture(scenario.commander, [name]);
    for (let i = 0; i < 180 && f.state.activePlayer !== "B"; i++) {
      const decision = f.state.decision;
      if (!decision) throw new Error("No advance decision");
      if (decision.kind === "priority") staticSourceAnswer(f, { kind: "pass" });
      else if (decision.kind === "attack") staticSourceAnswer(f, { kind: "attack", attacks: [] });
      else if (decision.kind === "discard")
        staticSourceAnswer(f, { kind: "discard", cards: decision.cards.slice(0, decision.count) });
      else throw new Error(`Unexpected advance choice ${decision.kind}`);
    }
    expect(f.state.activePlayer).toBe("B");
    expect(f.state.step).toBe("upkeep");
    staticSourceCast(f, "A", name);
    staticSourceResolve(f);
    expect(staticSourceObject(f, "A", name).zone).toBe("battlefield");
    expect(f.state.activePlayer).toBe("B");
    expect(f.state.step).toBe("upkeep");
  });
}
