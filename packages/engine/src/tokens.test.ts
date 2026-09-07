import { expect, spyOn, test } from "bun:test";
import { canonicalJson, type Keyword, RulesState } from "@iwsdk-apps/contracts";
import { answer, cast, command, locate, resolveOne } from "../test-fixtures/counterspells";
import {
  attackDecision,
  createBatch,
  nextOwnMain,
  passPriorityWindow,
  tokenFixture,
} from "../test-fixtures/tokens";
import { checkpoint } from "./checkpoints";
import { move, player, tryMove } from "./common";
import { assertInvariants, observe, transition } from "./index";
import * as entryProcessing from "./triggers";
import { enterBattlefield } from "./triggers";
import { givePriority } from "./turns";

for (const count of [1, 2, 3, 4] as const)
  test(`fixed count${count} creates a simultaneous noncard batch without extra casts, cost or original-card changes`, async () => {
    const f = await tokenFixture({ count });
    const source = cast(f, "A", "draw-spell");
    const paid = structuredClone(player(f.state, "A").mana);
    resolveOne(f);
    const tokens = Object.values(f.state.objects).filter((entry) => entry.token);
    expect(tokens).toHaveLength(count);
    expect(new Set(tokens.map((entry) => entry.id)).size).toBe(count);
    for (const [ordinal, token] of tokens.entries()) {
      expect(token).toMatchObject({
        owner: "A",
        controller: "A",
        generation: 0,
        zone: "battlefield",
        tapped: false,
        controlledSinceTurn: f.state.turn,
        commander: false,
      });
      expect(token.token).toMatchObject({
        creator: "A",
        ordinal,
        source: { id: source, controller: "A" },
        programIndex: 0,
      });
      const visible = observe(f.state, f.registry, "B").objects.find(
        (entry) => entry.id === token.id,
      );
      expect(visible?.card).toBeNull();
      expect(visible?.tokenTemplate).toEqual(f.template);
      expect(visible?.characteristics).toEqual({ power: 2, toughness: 2, keywords: [] });
    }
    const creation = f.state.events.find((event) => event.type === "TokensCreated");
    const entry = f.state.events.find((event) => event.type === "BattlefieldEntryBatch");
    expect(creation?.data.count).toBe(count);
    expect(entry?.data.objects).toEqual(tokens.map((token) => token.id));
    expect(creation?.index).toBeLessThan(entry?.index ?? -1);
    expect(
      f.state.events.some((event) =>
        ["SpellCast", "SpellAnnounced", "TriggerCaptured"].includes(event.type),
      ),
    ).toBe(false);
    expect(player(f.state, "A").mana).toEqual(paid);
    expect(
      Object.values(f.state.objects).filter((entry) => entry.owner === "A" && !entry.token),
    ).toHaveLength(100);
    expect(f.state.stack).toEqual([]);
    assertInvariants(f.state, f.registry);
  });

test("two producers sharing a template have distinct occurrence IDs and canonical continuation agrees", async () => {
  const f = await tokenFixture();
  const first = createBatch(f).tokens;
  const restored = { ...f, state: RulesState.parse(JSON.parse(canonicalJson(f.state))) };
  const second = createBatch(f, "B").tokens;
  createBatch(restored, "B");
  expect(restored.state).toEqual(f.state);
  expect(new Set([...first, ...second].map((entry) => entry.lineage)).size).toBe(4);
  expect(first[0]?.definition).toBe(second[0]?.definition);
  expect(first[0]?.token?.creationEvent).not.toBe(second[0]?.token?.creationEvent);
});

test("creator ownership uses captured source controller and survives removal/departure of its different source owner", async () => {
  const f = await tokenFixture({ seats: 4 });
  const source = cast(f, "A", "draw-spell");
  const sourceObject = f.state.objects[source];
  if (!sourceObject) throw new Error("Missing source");
  sourceObject.controller = "B"; // Explicit control precondition, no control-changing card admitted.
  resolveOne(f);
  const tokens = Object.values(f.state.objects).filter((entry) => entry.token);
  expect(tokens.every((entry) => entry.owner === "B" && entry.controller === "B")).toBe(true);
  expect(locate(f, "A", "draw-spell").zone).toBe("graveyard");
  move(f.state, locate(f, "A", "draw-spell").id, "exile", "constructed source removal");
  player(f.state, "A").life = 0;
  givePriority(f.state, f.registry, "B");
  expect(tokens.every((entry) => f.state.objects[entry.id])).toBe(true);
  expect(player(f.state, "A").lost).toBe(true);
  assertInvariants(f.state, f.registry);
});

test("creator departure removes its tokens under another controller without a death or commander choice", async () => {
  const f = await tokenFixture({ seats: 4 });
  const tokens = createBatch(f, "B").tokens;
  for (const token of tokens) token.controller = "C"; // Constructed control precondition.
  player(f.state, "B").life = 0;
  f.state.events = [];
  givePriority(f.state, f.registry, "A");
  expect(tokens.every((entry) => !f.state.objects[entry.id])).toBe(true);
  expect(
    f.state.events.some((event) => ["CreaturesDiedBatch", "TokensCeased"].includes(event.type)),
  ).toBe(false);
  expect(f.state.decision?.kind).toBe("priority");
  assertInvariants(f.state, f.registry);
});

test("countering a paid producer creates no batch and restores no mana", async () => {
  const f = await tokenFixture();
  const source = cast(f, "A", "draw-spell");
  const mana = structuredClone(player(f.state, "A").mana);
  cast(f, "B", "counter", source);
  resolveOne(f);
  expect(Object.values(f.state.objects).some((entry) => entry.token)).toBe(false);
  expect(f.state.events.some((event) => event.type === "TokensCreated")).toBe(false);
  expect(player(f.state, "A").mana).toEqual(mana);
  expect(locate(f, "A", "draw-spell").zone).toBe("graveyard");
});

test("a fresh nonhaste token cannot attack, but becomes eligible after its controller's next turn", async () => {
  const f = await tokenFixture();
  const tokens = createBatch(f).tokens;
  attackDecision(f);
  expect(tokens.every((token) => !f.state.decision?.cards.includes(token.id))).toBe(true);
  nextOwnMain(f);
  attackDecision(f);
  expect(tokens.every((token) => f.state.decision?.cards.includes(token.id))).toBe(true);
});

test("intrinsic token haste permits immediate attack and survives cleanup independently of source", async () => {
  const f = await tokenFixture({ keywords: ["haste"] });
  const tokens = createBatch(f).tokens;
  attackDecision(f);
  expect(tokens.every((token) => f.state.decision?.cards.includes(token.id))).toBe(true);
  nextOwnMain(f);
  const shown = observe(f.state, f.registry, "A");
  expect(
    tokens.every((token) =>
      shown.objects
        .find((entry) => entry.id === token.id)
        ?.characteristics.keywords.includes("haste"),
    ),
  ).toBe(true);
  expect(f.state.continuousEffects).toEqual([]);
});

test("newly created nonhaste blockers are legal immediately on an opponent's turn", async () => {
  const f = await tokenFixture({ count: 1 });
  const attacker = move(
    f.state,
    locate(f, "A", "creature").id,
    "battlefield",
    "constructed prior attacker",
  );
  attacker.controlledSinceTurn = 0; // The constructed physical attacker predates this turn.
  const blocker = createBatch(f, "B").tokens[0];
  if (!blocker) throw new Error("Missing fresh blocker");
  expect(blocker.controlledSinceTurn).toBe(f.state.turn);
  attackDecision(f);
  answer(f, { kind: "attack", attacks: [{ attacker: attacker.id, defender: "B" }] });
  passPriorityWindow(f);
  expect(f.state.decision?.kind).toBe("block");
  expect(f.state.decision?.cards).toContain(blocker.id);
  answer(f, { kind: "block", blocks: [{ attacker: attacker.id, blocker: blocker.id }] });
  expect(f.state.combat.blocks).toContainEqual({ attacker: attacker.id, blocker: blocker.id });
});

test("a constructed entry observer sees every sibling before matching; no broader trigger recipe is admitted", async () => {
  const f = await tokenFixture({ count: 2 });
  const original = entryProcessing.recordBattlefieldEntryBatch;
  let observed = false;
  const observer = spyOn(entryProcessing, "recordBattlefieldEntryBatch").mockImplementation(
    (state, registry, ids, cause) => {
      observed = true;
      expect(ids).toHaveLength(2);
      expect(
        ids.every((id) => state.objects[id]?.zone === "battlefield" && state.objects[id]?.token),
      ).toBe(true);
      expect(state.stack.at(-1)?.kind).toBe("spell");
      original(state, registry, ids, cause);
    },
  );
  try {
    createBatch(f);
  } finally {
    observer.mockRestore();
  }
  expect(observed).toBe(true);
  expect(f.state.abilities).toEqual({});
});

test("constructed zero-toughness tokens finish the entire source resolution before death and later cessation", async () => {
  const f = await tokenFixture({ count: 2, power: 0, toughness: 0 });
  createBatch(f);
  const finished = f.state.events.find((event) => event.type === "SpellResolved");
  const deaths = f.state.events.find((event) => event.type === "CreaturesDiedBatch");
  const ceased = f.state.events.find((event) => event.type === "TokensCeased");
  expect(finished?.index).toBeLessThan(deaths?.index ?? -1);
  expect(deaths?.index).toBeLessThan(ceased?.index ?? -1);
  expect(deaths?.data.objects).toHaveLength(2);
  expect(ceased?.data.objects).toHaveLength(2);
  expect(Object.values(f.state.objects).filter((entry) => entry.token)).toEqual([]);
});

for (const cause of ["lethal damage", "zero toughness"])
  test(`token ${cause} moves to graveyard before a later SBA pass ceases it`, async () => {
    const f = await tokenFixture({ count: 1 });
    const token = createBatch(f).tokens[0];
    if (!token) throw new Error("No token");
    if (cause === "lethal damage") token.damage = 2;
    else token.counters["-1/-1"] = 2;
    f.state.events = [];
    checkpoint(f.state, f.registry);
    const movement = f.state.events.find((event) => event.type === "ObjectMoved");
    const death = f.state.events.find((event) => event.type === "CreaturesDiedBatch");
    const ceased = f.state.events.find((event) => event.type === "TokensCeased");
    expect(movement?.data).toMatchObject({
      before: { id: token.id },
      after: { zone: "graveyard", generation: 1, token: token.token },
    });
    expect(movement?.index).toBeLessThan(death?.index ?? -1);
    expect(death?.index).toBeLessThan(ceased?.index ?? -1);
    expect(Object.values(f.state.objects).some((entry) => entry.lineage === token.lineage)).toBe(
      false,
    );
    expect(player(f.state, "A").graveyard.every((id) => !id.startsWith("token:"))).toBe(true);
    assertInvariants(f.state, f.registry);
  });

for (const effect of ["destroy", "exile", "return-to-hand"] as const)
  test(`token ${effect} resolves through ordinary commands; source completion precedes cessation`, async () => {
    const f = await tokenFixture({ count: 1 });
    const removal = f.registry.definitions["destroy-spell"];
    if (!removal) throw new Error("Missing removal slot");
    removal.spellProgram = {
      schema: "commander-spell/1",
      target: "creature",
      effects: [
        { kind: effect },
        ...(effect === "return-to-hand"
          ? [{ kind: "draw" as const, recipient: "controller" as const, amount: 1 }]
          : []),
      ],
    };
    const token = createBatch(f).tokens[0];
    if (!token) throw new Error("Missing token");
    const library = player(f.state, "B").library.length;
    const source = cast(f, "B", "destroy-spell", token.id);
    resolveOne(f);
    const moved = f.state.events.find(
      (event) =>
        event.type === "ObjectMoved" && (event.data.before as { id?: string })?.id === token.id,
    );
    const finished = f.state.events.find((event) => event.type === "SpellResolved");
    const ceased = f.state.events.find((event) => event.type === "TokensCeased");
    expect(moved?.index).toBeLessThan(finished?.index ?? -1);
    expect(finished?.index).toBeLessThan(ceased?.index ?? -1);
    expect(finished?.data.source).toBe(source);
    expect(Object.values(f.state.objects).some((entry) => entry.lineage === token.lineage)).toBe(
      false,
    );
    expect(f.state.decision?.kind).toBe("priority");
    expect(player(f.state, "B").library).toHaveLength(
      library - Number(effect === "return-to-hand"),
    );
    if (effect === "return-to-hand") {
      const draw = f.state.events.find((event) => event.type === "CardDrawn");
      expect(moved?.index).toBeLessThan(draw?.index ?? -1);
      expect(draw?.index).toBeLessThan(finished?.index ?? -1);
    }
    expect(f.state.frames).toEqual([]);
  });

test("departed token cannot move or reenter before the next checkpoint; no new incarnation is manufactured", async () => {
  const f = await tokenFixture({ count: 1 });
  const token = createBatch(f).tokens[0];
  if (!token) throw new Error("No token");
  // Explicit between-instruction boundary; no blink/reanimation source is admitted.
  const departed = tryMove(f.state, token.id, "hand", "constructed first departure");
  if (departed.kind !== "moved") throw new Error("First departure prevented");
  const first = departed.after;
  expect(tryMove(f.state, first.id, "exile", "attempt next zone")).toMatchObject({
    kind: "prevented",
    reason: "departed-token",
    object: { id: first.id },
  });
  expect(
    enterBattlefield(
      f.state,
      f.registry,
      [{ objectId: first.id, controller: "A" }],
      "attempt reentry",
    ),
  ).toEqual([]);
  expect(f.state.objects[first.id]?.zone).toBe("hand");
  expect(f.state.objects[first.id]?.generation).toBe(1);
  checkpoint(f.state, f.registry);
  expect(f.state.objects[first.id]).toBeUndefined();
  expect(player(f.state, "A").hand).not.toContain(first.id);
});

test("fixed modifier remains attached only to its extinct token, not siblings or a later matching template", async () => {
  const f = await tokenFixture();
  const modifier = f.registry.definitions["destroy-spell"];
  if (!modifier) throw new Error("No modifier slot");
  modifier.spellProgram = {
    schema: "commander-spell/1",
    target: "creature",
    effects: [
      {
        kind: "modify-creature",
        powerDelta: 3,
        toughnessDelta: 3,
        keywords: ["flying"],
        duration: "until-end-of-turn",
      },
    ],
  };
  const [first, sibling] = createBatch(f).tokens;
  if (!first || !sibling) throw new Error("No token siblings");
  cast(f, "A", "destroy-spell", first.id);
  resolveOne(f);
  expect(
    observe(f.state, f.registry, "A").objects.find((entry) => entry.id === first.id)
      ?.characteristics.power,
  ).toBe(5);
  move(f.state, first.id, "exile", "constructed target departure");
  checkpoint(f.state, f.registry);
  const later = createBatch(f, "B").tokens;
  for (const token of [sibling, ...later])
    expect(
      observe(f.state, f.registry, "A").objects.find((entry) => entry.id === token.id)
        ?.characteristics,
    ).toEqual({ power: 2, toughness: 2, keywords: [] });
  expect(f.state.continuousEffects[0]?.affectedObject).toBe(first.id);
});

test("token origin, owner, template and original-card membership tampering fails invariants", async () => {
  const f = await tokenFixture({ count: 1 });
  const token = createBatch(f).tokens[0];
  if (!token) throw new Error("No token");
  const mutations: ((state: RulesState) => void)[] = [
    (state) => {
      const row = state.objects[token.id];
      if (row?.token) row.token.source.owner = "B";
    },
    (state) => {
      const row = state.objects[token.id];
      if (row?.token) row.token.creator = "B";
    },
    (state) => {
      const row = state.objects[token.id];
      if (row?.token) row.token.ordinal = 1;
    },
    (state) => {
      const row = state.objects[token.id];
      if (row?.token) row.token.sourceVersion = "b".repeat(64);
    },
    (state) => {
      const row = state.objects[token.id];
      if (row) row.commander = true;
    },
    (state) => {
      const row = state.objects[token.id];
      if (row) delete row.token;
    },
    (state) => {
      const row = state.objects[token.id];
      if (row) row.definition = "creature";
    },
    (state) => {
      const physical = Object.values(state.objects).find(
        (entry) => entry.owner === "A" && !entry.token && entry.zone === "battlefield",
      );
      if (physical) physical.definition = "artifact-creature";
      else throw new Error("Missing physical fixture");
    },
  ];
  // A real physical creature slot exists on the battlefield for the membership mutant.
  move(f.state, locate(f, "A", "creature").id, "battlefield", "constructed original-card location");
  for (const mutate of mutations) {
    const changed = structuredClone(f.state);
    mutate(changed);
    expect(() => assertInvariants(changed, f.registry)).toThrow();
  }
});

test("tokens cannot be submitted as casts", async () => {
  const f = await tokenFixture({ count: 1 });
  const token = createBatch(f).tokens[0];
  if (!token) throw new Error("No token");
  const before = canonicalJson(f.state);
  expect(transition(f.state, command(f, { kind: "cast", card: token.id }), f.registry).status).toBe(
    "rejected",
  );
  expect(canonicalJson(f.state)).toBe(before);
});

// Combat uses ordinary attack/block/damage transitions. The physical blocker is an explicit board precondition.
for (const keyword of ["flying", "vigilance", "lifelink", "trample"] as Keyword[])
  test(`created ${keyword} token participates in ordinary combat`, async () => {
    const f = await tokenFixture({ count: 1, keywords: [keyword], power: 5, toughness: 5 });
    const token = createBatch(f).tokens[0];
    if (!token) throw new Error("No token");
    const blocker = move(
      f.state,
      locate(f, "B", "creature").id,
      "battlefield",
      "constructed combat blocker",
    );
    nextOwnMain(f);
    attackDecision(f);
    answer(f, { kind: "attack", attacks: [{ attacker: token.id, defender: "B" }] });
    expect(f.state.objects[token.id]?.tapped).toBe(keyword !== "vigilance");
    passPriorityWindow(f);
    expect(f.state.decision?.kind).toBe("block");
    if (keyword === "flying") {
      const invalid = transition(
        f.state,
        command(f, { kind: "block", blocks: [{ blocker: blocker.id, attacker: token.id }] }),
        f.registry,
      );
      expect(invalid.status).toBe("rejected");
      answer(f, { kind: "block", blocks: [] });
    } else answer(f, { kind: "block", blocks: [{ blocker: blocker.id, attacker: token.id }] });
    passPriorityWindow(f);
    expect(f.state.decision?.kind).toBe("damage");
    const aLife = player(f.state, "A").life,
      bLife = player(f.state, "B").life;
    while (f.state.decision?.kind === "damage") {
      const decision = f.state.decision;
      answer(f, {
        kind: "damage",
        allocations: decision.damageDomain.flatMap((domain) => {
          if (domain.source === token.id && keyword === "trample")
            return [
              { source: token.id, target: blocker.id, amount: 2 },
              { source: token.id, target: "B", amount: 3 },
            ];
          const target = domain.targets[0];
          if (!target) throw new Error("Missing combat domain target");
          return [{ source: domain.source, target: target.id, amount: domain.power }];
        }),
      });
    }
    if (keyword === "lifelink") expect(player(f.state, "A").life).toBe(aLife + 5);
    if (keyword === "trample") expect(player(f.state, "B").life).toBe(bLife - 3);
    if (keyword === "flying") expect(player(f.state, "B").life).toBe(bLife - 5);
    expect(player(f.state, "B").commanderDamage).toEqual({});
  });
