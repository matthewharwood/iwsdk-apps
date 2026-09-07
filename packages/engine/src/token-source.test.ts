import { beforeAll, expect, test } from "bun:test";
import {
  canonicalJson,
  emptyMana,
  GameObject,
  RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { createFullExecutionRegistry } from "../../compiler/src/prepared";
import {
  resolveTokenSource,
  tokenSourceAnswer,
  tokenSourceAttackChoice,
  tokenSourceAutomatic,
  tokenSourceCard,
  tokenSourceCards,
  tokenSourceCases,
  tokenSourceCast,
  tokenSourceCommand,
  tokenSourceDeck,
  tokenSourceFixture,
  tokenSourceInventory,
  tokenSourceMana,
  tokenSourceNextMain,
  tokenSourceObject,
  tokenSourcePassWindow,
  tokenSourcePayment,
  tokenSourceRelease,
  tokenSourceSnapshot,
} from "../test-fixtures/token-source";
import { move, player } from "./common";
import { admitDeck, assertInvariants, observe, transition } from "./index";
import { givePriority } from "./turns";

// The fixture's expected counts/traits were transcribed from all 31 complete Oracle
// bodies before these casts; neither the runtime nor compiler constructs expectations.
const legalCases = tokenSourceCases.filter((row) => row.name !== "Call to the Feast");
const costOf = (name: string) => {
  const source = tokenSourceCases.find((row) => row.name === name);
  if (!source) throw new Error(`Missing printed source cost: ${name}`);
  return source.oracle.mana_cost;
};

beforeAll(async () => {
  const { hash, ...body } = tokenSourceSnapshot;
  expect(hash).toBe("ba341b91cd1a235ddf9f65baf098a1a88ca173dc1a377b349938f47ca79e4fcc");
  expect(await semanticHash(body)).toBe(hash);
  expect(tokenSourceSnapshot.originReleaseHash).toBe(
    "fd5d52dc3d11284940cae72faace2ca0ead11deaa11508c12ea6b179967912a4",
  );
  expect(tokenSourceSnapshot.sourceRecords).toHaveLength(31);
  expect(tokenSourceCases).toHaveLength(27);
  expect(legalCases).toHaveLength(26);
  expect(tokenSourceSnapshot.rulings).toHaveLength(3);
  expect(tokenSourceSnapshot.tokenTemplates).toHaveLength(20);
  for (const row of tokenSourceCards) expect(await semanticHash(row.definition)).toBe(row.hash);
  for (const row of tokenSourceCases) {
    const card = tokenSourceCard(row.name);
    expect(card.oracleId).toBe(row.identity);
    expect(card.sourceVersion).toBe(row.sourceVersion);
    expect(card.oracleText).toBe(row.oracle.oracle_text);
    expect(card.types).toEqual([row.oracle.type_line]);
    expect(row.oracle.color_identity).toEqual(card.colorIdentity);
  }
  const release = await tokenSourceRelease();
  expect((await createFullExecutionRegistry(release)).sourceReleaseHash).toBe(release.hash);
  expect(release.hash).not.toBe(tokenSourceSnapshot.originReleaseHash);
});

for (const scenario of legalCases) {
  test(`${scenario.name}: authenticated ordinary cast/payment creates its exact source-defined token batch`, async () => {
    const f = await tokenSourceFixture(scenario.name);
    const physical = [tokenSourceInventory(f, "A"), tokenSourceInventory(f, "B")] as const;
    expect(physical.map((entries) => entries.length)).toEqual([100, 100]);
    const libraryLengths = f.state.players.map((seat) => seat.library.length);
    expect(Object.isFrozen(f.registry.definitions[tokenSourceCard(scenario.name).id])).toBe(true);
    const announce = tokenSourceAnswer(f, { kind: "cast", card: f.source });
    expect(f.state.decision?.kind).toBe("payment");
    const top = f.state.stack.at(-1);
    if (top?.kind !== "spell") throw new Error("Actual producer absent from stack");
    const source = top.objectId;
    expect(Object.values(f.state.objects).filter((object) => !!object.token)).toEqual([]);
    const payment = tokenSourcePayment(f, "A", scenario.oracle.mana_cost);
    const beforePayment = canonicalJson(f.state);
    expect(
      transition(
        f.state,
        tokenSourceCommand(f, { kind: "payment", sources: [], spend: emptyMana() }),
        f.registry,
      ),
    ).toMatchObject({ status: "rejected", code: "IllegalCommand" });
    expect(canonicalJson(f.state)).toBe(beforePayment);
    const paid = tokenSourceAnswer(f, payment);
    expect(paid.state.events.find((event) => event.type === "SpellCast")?.data.paid).toEqual(
      payment.spend,
    );
    const tokens = resolveTokenSource(f);
    const { count, ...expectedTraits } = scenario.expected;
    expect(tokens).toHaveLength(count);
    expect(new Set(tokens.map((token) => token.id)).size).toBe(count);
    expect(new Set(tokens.map((token) => token.definition)).size).toBe(1);
    for (const [ordinal, token] of tokens.entries()) {
      expect(token).toMatchObject({
        owner: "A",
        controller: "A",
        zone: "battlefield",
        generation: 0,
        tapped: false,
        commander: false,
        controlledSinceTurn: f.state.turn,
        damage: 0,
        counters: {},
      });
      expect(token.token).toMatchObject({
        creator: "A",
        ordinal,
        programIndex: 0,
        sourceVersion: scenario.sourceVersion,
        source: {
          id: source,
          owner: "A",
          controller: "A",
          definition: tokenSourceCard(scenario.name).id,
          zone: "stack",
        },
      });
      expect(token.id).toBe(`token:${token.token?.creationEvent}:${ordinal}@0`);
      const visible = observe(f.state, f.registry, "B").objects.find(
        (object) => object.id === token.id,
      );
      expect(visible?.card).toBeNull();
      const traits = visible?.tokenTemplate?.characteristics;
      expect(traits && { ...traits, colors: [...traits.colors].sort() }).toEqual({
        ...expectedTraits,
        colors: [...expectedTraits.colors].sort(),
      });
      expect(visible?.characteristics).toEqual({
        power: expectedTraits.power,
        toughness: expectedTraits.toughness,
        keywords: expectedTraits.keywords,
      });
    }
    const created = f.state.events.filter((event) => event.type === "TokensCreated");
    const entered = f.state.events.filter((event) => event.type === "BattlefieldEntryBatch");
    const completed = f.state.events.find((event) => event.type === "SpellResolved");
    expect(created).toHaveLength(1);
    expect(entered).toHaveLength(1);
    expect(created[0]?.data).toMatchObject({
      source,
      sourceDefinition: tokenSourceCard(scenario.name).id,
      sourceVersion: scenario.sourceVersion,
      creator: "A",
      count,
      objects: tokens,
    });
    expect(entered[0]?.data.objects).toEqual(tokens.map((token) => token.id));
    expect(created[0]?.index).toBeLessThan(entered[0]?.index ?? -1);
    expect(entered[0]?.index).toBeLessThan(completed?.index ?? -1);
    const allEvents = [...announce.state.events, ...paid.state.events, ...f.state.events];
    expect(allEvents.filter((event) => event.type === "SpellAnnounced")).toHaveLength(1);
    expect(allEvents.filter((event) => event.type === "SpellCast")).toHaveLength(1);
    expect(
      f.state.events.some((event) =>
        ["SpellCast", "SpellAnnounced", "TriggerCaptured"].includes(event.type),
      ),
    ).toBe(false);
    expect(tokenSourceInventory(f, "A")).toEqual(physical[0]);
    expect(tokenSourceInventory(f, "B")).toEqual(physical[1]);
    expect(f.state.players.map((seat) => seat.library.length)).toEqual(libraryLengths);
    expect(tokenSourceObject(f, "A", scenario.name).zone).toBe("graveyard");
    expect(payment.sources.every((source) => f.state.objects[source.object]?.tapped)).toBe(true);
    expect(tokenSourceMana(f, "A")).toEqual(emptyMana());
    expect(f.state.stack).toEqual([]);
    assertInvariants(f.state, f.registry);
  });

  test(`${scenario.name}: countering its paid source creates no tokens and refunds no cost`, async () => {
    const f = await tokenSourceFixture(scenario.name);
    const producer = tokenSourceCast(f, "A", scenario.name, scenario.oracle.mana_cost);
    tokenSourceAnswer(f, { kind: "pass" });
    const counter = tokenSourceCast(f, "B", "Counterspell", "{U}{U}", producer.source);
    tokenSourceAnswer(f, { kind: "pass" });
    tokenSourceAnswer(f, { kind: "pass" });
    expect(f.state.stack).toEqual([]);
    expect(Object.values(f.state.objects).filter((row) => !!row.token)).toEqual([]);
    expect(
      f.state.events.some((event) =>
        ["TokensCreated", "BattlefieldEntryBatch"].includes(event.type),
      ),
    ).toBe(false);
    expect(tokenSourceObject(f, "A", scenario.name).zone).toBe("graveyard");
    expect(tokenSourceObject(f, "B", "Counterspell").zone).toBe("graveyard");
    for (const payment of [producer.payment, counter.payment])
      expect(payment.sources.every((source) => f.state.objects[source.object]?.tapped)).toBe(true);
    expect(tokenSourceMana(f, "A")).toEqual(emptyMana());
    expect(tokenSourceMana(f, "B")).toEqual(emptyMana());
    expect(tokenSourceInventory(f, "A")).toHaveLength(100);
    expect(tokenSourceInventory(f, "B")).toHaveLength(100);
  });

  test(`${scenario.name}: printed ${scenario.oracle.type_line} timing governs an opponent-turn priority window`, async () => {
    const f = await tokenSourceFixture(scenario.name);
    for (let n = 0; n < 100 && !(f.state.activePlayer === "B" && f.state.step === "main1"); n++)
      tokenSourceAutomatic(f);
    expect(f.state.activePlayer).toBe("B");
    expect(f.state.step).toBe("main1");
    tokenSourceAnswer(f, { kind: "pass" });
    expect(f.state.decision?.actor).toBe("A");
    const handId = tokenSourceObject(f, "A", scenario.name).id;
    if (scenario.oracle.type_line === "Sorcery") {
      expect(f.state.decision?.cards).not.toContain(handId);
      const before = canonicalJson(f.state);
      expect(
        transition(f.state, tokenSourceCommand(f, { kind: "cast", card: handId }), f.registry),
      ).toMatchObject({ status: "rejected", code: "IllegalCommand" });
      expect(canonicalJson(f.state)).toBe(before);
    } else {
      expect(f.state.decision?.cards).toContain(handId);
      tokenSourceCast(f, "A", scenario.name, scenario.oracle.mana_cost);
      expect(resolveTokenSource(f)).toHaveLength(scenario.expected.count);
    }
  });
}

test("Call to the Feast retains an explicit execution gap: all 37 authenticated commanders reject its WB deck identity", async () => {
  const registry = await createFullExecutionRegistry(await tokenSourceRelease());
  const scan = tokenSourceSnapshot.commanderInventory;
  expect(scan.sourceDefinitionCount).toBe(1129);
  expect(scan.completeEligibleCommanderCount).toBe(37);
  expect(scan.matchingWhiteBlackCount).toBe(0);
  expect(scan.records).toHaveLength(37);
  expect(tokenSourceCard("Call to the Feast").colorIdentity).toEqual(["B", "W"]);
  for (const row of scan.records) {
    const card = tokenSourceCard(row.name);
    expect(card.commanderEligible).toBe(true);
    expect(await semanticHash(card)).toBe(row.definitionHash);
    expect(card.colorIdentity.includes("W") && card.colorIdentity.includes("B")).toBe(false);
    const deck = await tokenSourceDeck(row.name, ["Call to the Feast"]);
    expect(() => admitDeck(deck, registry)).toThrow(
      "Card outside commander color identity: Call to the Feast",
    );
  }
});

test("the 26 executable producers cover 20 independently specified token shapes without counting the WB producer as executed", () => {
  const expectedShapes = legalCases.map(({ expected: { count: _count, ...shape } }) =>
    canonicalJson(shape),
  );
  expect(new Set(expectedShapes).size).toBe(20);
  const shapesWithGap = tokenSourceCases.map(({ expected: { count: _count, ...shape } }) =>
    canonicalJson(shape),
  );
  expect(new Set(shapesWithGap).size).toBe(20);
  expect(tokenSourceCases.find((row) => row.name === "Call to the Feast")?.expected).toMatchObject({
    count: 3,
    keywords: ["lifelink"],
  });
});

test("Ral's red-only legal deck creates blue/red Elementals without changing original card identity", async () => {
  const f = await tokenSourceFixture("Ral's Reinforcements");
  const commander = f.registry.definitions[f.state.manifest.seats[0]?.deck.commander ?? ""];
  expect(commander?.name).toBe("Rorix Bladewing");
  expect(commander?.colorIdentity).toEqual(["R"]);
  expect(tokenSourceCard("Ral's Reinforcements").colorIdentity).toEqual(["R"]);
  tokenSourceCast(f, "A", "Ral's Reinforcements", "{1}{R}");
  const tokens = resolveTokenSource(f);
  for (const token of tokens)
    expect(f.registry.tokenTemplates[token.definition]?.characteristics.colors.toSorted()).toEqual([
      "R",
      "U",
    ]);
  expect(tokenSourceInventory(f, "A")).toHaveLength(100);
  expect(
    f.state.manifest.seats[0]?.deck.entries.every(
      (entry) => !entry.definition.startsWith("token-template:"),
    ),
  ).toBe(true);
});

for (const name of ["Flurry of Horns", "Revel of the Fallen God"])
  test(`${name}: source-provided haste permits immediate attacks and persists beyond cleanup`, async () => {
    const f = await tokenSourceFixture(name);
    tokenSourceCast(f, "A", name, costOf(name));
    const tokens = resolveTokenSource(f);
    tokenSourceAttackChoice(f);
    expect(tokens.every((token) => f.state.decision?.cards.includes(token.id))).toBe(true);
    tokenSourceNextMain(f);
    move(
      f.state,
      tokenSourceObject(f, "A", name).id,
      "exile",
      "constructed removal of resolved producer",
    );
    for (const token of tokens)
      expect(
        observe(f.state, f.registry, "B").objects.find((entry) => entry.id === token.id)
          ?.characteristics.keywords,
      ).toContain("haste");
    expect(f.state.continuousEffects).toEqual([]);
    if (name === "Flurry of Horns")
      expect(
        tokenSourceCases.find((row) => row.name === name)?.relatedTokenEvidence.printedKeywords,
      ).toEqual([]);
  });

test("Raise the Alarm's fresh Soldiers cannot attack, then become legal after the controller's next turn", async () => {
  const f = await tokenSourceFixture("Raise the Alarm");
  tokenSourceCast(f, "A", "Raise the Alarm", "{1}{W}");
  const tokens = resolveTokenSource(f);
  tokenSourceAttackChoice(f);
  expect(tokens.every((token) => !f.state.decision?.cards.includes(token.id))).toBe(true);
  tokenSourceNextMain(f);
  tokenSourceAttackChoice(f);
  expect(tokens.every((token) => f.state.decision?.cards.includes(token.id))).toBe(true);
});

test("Sprout creates under the resolving controller, distinct from its source owner, and persists after source-owner departure", async () => {
  const f = await tokenSourceFixture("Sprout", { seats: 4 });
  const cast = tokenSourceCast(f, "A", "Sprout", "{G}");
  const source = f.state.objects[cast.source];
  if (!source) throw new Error("Missing actual Sprout");
  source.controller = "B"; // Explicit control precondition; no control-changing source is claimed.
  const tokens = resolveTokenSource(f);
  expect(tokens).toHaveLength(1);
  expect(tokens[0]).toMatchObject({
    owner: "B",
    controller: "B",
    token: { creator: "B", source: { owner: "A", controller: "B" } },
  });
  expect(tokenSourceObject(f, "A", "Sprout").zone).toBe("graveyard");
  move(f.state, tokenSourceObject(f, "A", "Sprout").id, "exile", "constructed source departure");
  player(f.state, "A").life = 0; // Explicit player-departure precondition.
  givePriority(f.state, f.registry, "B");
  expect(player(f.state, "A").lost).toBe(true);
  expect(tokens.every((token) => f.state.objects[token.id])).toBe(true);
  assertInvariants(f.state, f.registry);
});

for (const [name, cost, destination] of [
  ["Repulse", "{2}{U}", "hand"],
  ["Murder", "{1}{B}{B}", "graveyard"],
  ["Final Reward", "{4}{B}", "exile"],
] as const)
  test(`authenticated ${name} moves a real Sprout token, completes, then ceases it at the checkpoint`, async () => {
    const f = await tokenSourceFixture("Sprout", {
      opponent: name === "Repulse" ? "blue" : "black",
    });
    tokenSourceCast(f, "A", "Sprout", "{G}");
    const token = resolveTokenSource(f)[0];
    if (!token) throw new Error("Actual Saproling absent");
    const libraries = f.state.players.map((seat) => seat.library.length);
    const physical = [tokenSourceInventory(f, "A"), tokenSourceInventory(f, "B")] as const;
    tokenSourceCast(f, "B", name, cost, token.id);
    resolveTokenSource(f);
    const movement = f.state.events.find(
      (event) =>
        event.type === "ObjectMoved" && GameObject.parse(event.data.before).id === token.id,
    );
    expect(movement?.data).toMatchObject({
      before: { id: token.id, zone: "battlefield" },
      after: { zone: destination, generation: 1, token: token.token },
    });
    const finished = f.state.events.find((event) => event.type === "SpellResolved");
    const ceased = f.state.events.find((event) => event.type === "TokensCeased");
    expect(movement?.index).toBeLessThan(finished?.index ?? -1);
    expect(finished?.index).toBeLessThan(ceased?.index ?? -1);
    if (name === "Repulse") {
      const draw = f.state.events.find((event) => event.type === "CardDrawn");
      expect(movement?.index).toBeLessThan(draw?.index ?? -1);
      expect(draw?.index).toBeLessThan(finished?.index ?? -1);
      expect(player(f.state, "B").library.length).toBe((libraries[1] ?? 0) - 1);
    } else expect(f.state.players.map((seat) => seat.library.length)).toEqual(libraries);
    expect(Object.values(f.state.objects).some((object) => object.lineage === token.lineage)).toBe(
      false,
    );
    expect(f.state.events.some((event) => event.type.startsWith("Commander"))).toBe(false);
    expect(f.state.frames).toEqual([]);
    expect(f.state.decision?.kind).toBe("priority");
    expect(tokenSourceInventory(f, "A")).toEqual(physical[0]);
    expect(tokenSourceInventory(f, "B")).toEqual(physical[1]);
  });

for (const [name, keyword, power] of [
  ["Midnight Haunting", "flying", 1],
  ["Knight Watch", "vigilance", 2],
  ["Queen's Commission", "lifelink", 1],
  ["Advent of the Wurm", "trample", 5],
] as const)
  test(`${name}: source-defined ${keyword} executes in ordinary token combat`, async () => {
    const f = await tokenSourceFixture(name);
    tokenSourceCast(f, "A", name, costOf(name));
    const token = resolveTokenSource(f)[0];
    if (!token) throw new Error("Actual keyword token missing");
    const blocker = move(
      f.state,
      tokenSourceObject(f, "B", "Silvercoat Lion").id,
      "battlefield",
      "constructed authentic 2/2 blocker",
    );
    tokenSourceNextMain(f);
    tokenSourceAttackChoice(f);
    tokenSourceAnswer(f, { kind: "attack", attacks: [{ attacker: token.id, defender: "B" }] });
    expect(f.state.objects[token.id]?.tapped).toBe(keyword !== "vigilance");
    tokenSourcePassWindow(f);
    expect(f.state.decision?.kind).toBe("block");
    if (keyword === "flying") {
      const before = canonicalJson(f.state);
      expect(
        transition(
          f.state,
          tokenSourceCommand(f, {
            kind: "block",
            blocks: [{ attacker: token.id, blocker: blocker.id }],
          }),
          f.registry,
        ).status,
      ).toBe("rejected");
      expect(canonicalJson(f.state)).toBe(before);
    }
    tokenSourceAnswer(f, {
      kind: "block",
      blocks: keyword === "trample" ? [{ attacker: token.id, blocker: blocker.id }] : [],
    });
    tokenSourcePassWindow(f);
    const aLife = player(f.state, "A").life;
    const bLife = player(f.state, "B").life;
    while (f.state.decision?.kind === "damage") {
      tokenSourceAnswer(f, {
        kind: "damage",
        allocations: f.state.decision.damageDomain.flatMap((domain) => {
          if (domain.source === token.id && keyword === "trample")
            return [
              { source: token.id, target: blocker.id, amount: 2 },
              { source: token.id, target: "B", amount: 3 },
            ];
          const target = domain.targets[0];
          if (!target) throw new Error("Missing source combat target");
          return [{ source: domain.source, target: target.id, amount: domain.power }];
        }),
      });
    }
    expect(player(f.state, "B").life).toBe(bLife - (keyword === "trample" ? 3 : power));
    expect(player(f.state, "A").life).toBe(aLife + (keyword === "lifelink" ? 1 : 0));
    expect(player(f.state, "B").commanderDamage).toEqual({});
  });

test("Dragon Fodder and Krenko's Command create distinct occurrences after canonical state restoration", async () => {
  const f = await tokenSourceFixture("Dragon Fodder", { extra: ["Krenko's Command"] });
  tokenSourceCast(f, "A", "Dragon Fodder", "{1}{R}");
  const first = resolveTokenSource(f);
  const restored = { ...f, state: RulesState.parse(JSON.parse(canonicalJson(f.state))) };
  tokenSourceCast(f, "A", "Krenko's Command", "{1}{R}");
  const second = resolveTokenSource(f);
  tokenSourceCast(restored, "A", "Krenko's Command", "{1}{R}");
  resolveTokenSource(restored);
  expect(restored.state).toEqual(f.state);
  expect(first).toHaveLength(2);
  expect(second).toHaveLength(4);
  expect(new Set(second.map((token) => token.lineage)).size).toBe(4);
  expect(new Set(second.map((token) => token.definition)).size).toBe(1);
});
