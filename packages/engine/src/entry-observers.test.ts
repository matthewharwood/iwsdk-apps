import { expect, test } from "bun:test";
import { canonicalJson, type EntryObserverAbility, RulesState } from "@iwsdk-apps/contracts";
import { answer, cast, command, locate, resolveOne } from "../test-fixtures/counterspells";
import {
  board,
  enterBatch,
  finishObservers,
  installObserver,
  observerFixture,
  observerProgram,
  priority,
} from "../test-fixtures/entry-observers";
import { createBatch, tokenFixture } from "../test-fixtures/tokens";
import { definition, move, object, player } from "./common";
import { matchesCapturedEntry } from "./entry-observer-context";
import { admitDeck, assertInvariants, observe, transition } from "./index";
import { enterBattlefield, recordBattlefieldEntryBatch } from "./triggers";

const life = { kind: "gain-life", recipient: "trigger-controller", amount: 1 } as const;
const draw = { kind: "draw", recipient: "trigger-controller", amount: 1 } as const;
const landfall = () =>
  observerProgram(
    { types: ["Land"], controller: "source-controller", excludeSource: false, token: "any" },
    [life, draw],
  );
const ownCreature = (amount: 1 | 2 = 1) =>
  observerProgram(
    { types: ["Creature"], controller: "source-controller", excludeSource: true, token: "any" },
    [{ ...life, amount }],
  );
function abilities(f: ReturnType<typeof observerFixture>): EntryObserverAbility[] {
  return Object.values(f.state.abilities).filter(
    (ability): ability is EntryObserverAbility => "entry" in ability,
  );
}
function firstAbility(f: ReturnType<typeof observerFixture>) {
  const first = abilities(f)[0];
  if (!first) throw new Error("Missing constructed observer capture");
  return first;
}
function handLand(f: ReturnType<typeof observerFixture>, actor = "A") {
  const land = locate(f, actor, "land");
  return land.zone === "hand"
    ? land.id
    : move(f.state, land.id, "hand", "constructed land hand").id;
}

for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`OBS01/03 ${mode}: legal land play uses entry capture, gain then draw and preserves special-action timing`, () => {
    const f = observerFixture(mode);
    installObserver(f, "commander", landfall());
    board(f, "commander");
    const land = handLand(f);
    priority(f);
    const hand = player(f.state, "A").hand.length;
    answer(f, { kind: "land", card: land });
    expect(player(f.state, "A").landsPlayed).toBe(1);
    expect(f.state.decision?.actor).toBe("A");
    expect(f.state.decision?.kind).toBe("priority");
    expect(f.state.stack).toHaveLength(1);
    expect(f.state.events.some((event) => event.type === "SpellAnnounced")).toBe(false);
    const captured = firstAbility(f);
    expect(f.state.objects[captured.entry.subject.id]?.zone).toBe("battlefield");
    expect(captured.entry.subject.lineage).toBe(land.slice(0, land.lastIndexOf("@")));
    expect(captured.entry.subject.id).not.toBe(land);
    expect(captured.entry.facts.types).toEqual(["Land"]);
    expect(player(f.state, "A").life).toBe(40);
    resolveOne(f);
    expect(player(f.state, "A").life).toBe(41);
    expect(player(f.state, "A").hand).toHaveLength(hand);
    const types = f.state.events.map((event) => event.type);
    expect(types.indexOf("LifeGained")).toBeLessThan(types.indexOf("CardDrawn"));
    expect(types.indexOf("CardDrawn")).toBeLessThan(types.indexOf("TriggeredAbilityResolved"));
    expect(f.state.stack).toEqual([]);
  });
  test(`OBS06/29 ${mode}: two sources by two lands have four stable captures and exact owned order after canonical restore`, () => {
    const f = observerFixture(mode);
    installObserver(f, "commander", landfall());
    installObserver(
      f,
      "creature",
      observerProgram({
        types: ["Land"],
        controller: "source-controller",
        excludeSource: false,
        token: "any",
      }),
    );
    board(f, "commander");
    board(f, "creature");
    const lands = Object.values(f.state.objects)
      .filter((entry) => entry.owner === "A" && entry.definition === "land")
      .slice(0, 2);
    const restored = { ...f, state: RulesState.parse(JSON.parse(canonicalJson(f.state))) };
    f.state.objects = Object.fromEntries(Object.entries(f.state.objects).reverse());
    for (const branch of [f, restored]) {
      enterBattlefield(
        branch.state,
        branch.registry,
        lands.map((entry) => ({ objectId: entry.id, controller: "A" })),
        "constructed simultaneous lands",
      );
      priority(branch);
    }
    expect(abilities(f)).toHaveLength(4);
    expect(new Set(abilities(f).map((ability) => ability.id)).size).toBe(4);
    expect(abilities(f)).toEqual(abilities(restored));
    expect(f.state.decision).toEqual(restored.state.decision);
    expect(f.state.decision?.kind).toBe("trigger-order");
    expect(player(f.state, "A").landsPlayed).toBe(0);
    const choice = f.state.decision;
    if (!choice) throw new Error("Missing choice");
    const before = canonicalJson(f.state);
    expect(
      transition(
        f.state,
        command(f, { kind: "trigger-order", triggers: choice.triggers.slice(1) }),
        f.registry,
      ).status,
    ).toBe("rejected");
    expect(
      transition(
        f.state,
        { ...command(f, { kind: "trigger-order", triggers: choice.triggers }), actor: "B" },
        f.registry,
      ).status,
    ).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(before);
    finishObservers(f);
    finishObservers(restored);
    expect(f.state).toEqual(restored.state);
    expect(player(f.state, "A").life).toBe(44);
  });
}

test("OBS02/05: opponent-controlled land and entries before the observer exist do not trigger retroactively", () => {
  const f = observerFixture();
  installObserver(f, "commander", landfall());
  enterBatch(f, [{ slot: "land" }]);
  board(f, "commander");
  expect(abilities(f)).toEqual([]);
  enterBatch(f, [{ slot: "land", owner: "B" }]);
  expect(abilities(f)).toEqual([]);
  const other = Object.values(f.state.objects).find(
    (entry) => entry.owner === "A" && entry.definition === "land" && entry.zone !== "battlefield",
  );
  if (!other) throw new Error("Missing second land");
  enterBattlefield(
    f.state,
    f.registry,
    [{ objectId: other.id, controller: "B" }],
    "constructed changed entry controller",
  );
  expect(abilities(f)).toEqual([]);
});
test("OBS07: a newly entering land observer sees the other entrant after the whole batch exists", () => {
  const f = observerFixture();
  installObserver(f, "commander", landfall());
  const entered = enterBatch(f, [{ slot: "land" }, { slot: "commander" }]);
  expect(abilities(f)).toHaveLength(1);
  expect(firstAbility(f).source.id).toBe(locate(f, "A", "commander").id);
  const firstEntered = entered[0];
  if (!firstEntered) throw new Error("Missing first entry");
  expect(firstAbility(f).entry.subject.id).toBe(firstEntered);
});
test("OBS08/09/10: newcomers observe one another; explicit self alternative matches exactly once", () => {
  for (const self of [false, true]) {
    const f = observerFixture();
    installObserver(f, "creature");
    installObserver(
      f,
      "protected-creature",
      observerProgram(
        { types: ["Creature"], controller: "source-controller", excludeSource: true, token: "any" },
        [life],
        self,
      ),
    );
    enterBatch(f, [{ slot: "creature" }, { slot: "protected-creature" }]);
    expect(abilities(f)).toHaveLength(self ? 3 : 2);
    priority(f);
    finishObservers(f);
    expect(player(f.state, "A").life).toBe(self ? 43 : 42);
  }
});
test("OBS11: explicit self uses incarnation identity even with a nonmatching descriptive type in a constructed predicate view", () => {
  const f = observerFixture();
  const source = object(f.state, board(f, "creature"));
  const program = observerProgram(
    { types: ["Enchantment"], controller: "source-controller", excludeSource: true, token: "any" },
    [draw],
    true,
  );
  expect(matchesCapturedEntry(program, source, source, { types: ["Creature"], subtypes: [] })).toBe(
    true,
  );
  const other = object(f.state, board(f, "protected-creature"));
  expect(matchesCapturedEntry(program, source, other, { types: ["Creature"], subtypes: [] })).toBe(
    false,
  );
});
test("OBS12: existing and newly entering same-definition Eidolon-style providers capture four separate occurrences", () => {
  const f = observerFixture();
  const program = observerProgram(
    { types: ["Enchantment"], controller: "source-controller", excludeSource: true, token: "any" },
    [draw],
    true,
  );
  installObserver(f, "enchantment-creature", program);
  enterBatch(f, [{ slot: "enchantment-creature" }]);
  expect(abilities(f)).toHaveLength(1);
  priority(f);
  finishObservers(f);
  installObserver(
    f,
    "protected-creature",
    observerProgram(
      { types: ["Artifact"], controller: "source-controller", excludeSource: false, token: "any" },
      [draw],
    ),
    { types: ["Enchantment"], power: null, toughness: null },
  );
  enterBatch(f, [
    { slot: "enchantment-creature", owner: "B", controller: "A" },
    { slot: "protected-creature" },
  ]);
  expect(abilities(f)).toHaveLength(4);
  expect(new Set(abilities(f).map((ability) => ability.id)).size).toBe(4);
});
test("OBS13/14/15: typed Artifact/Enchantment membership, own control and global other-creature scopes stay distinct", () => {
  const f = observerFixture();
  installObserver(
    f,
    "creature",
    observerProgram(
      {
        types: ["Enchantment"],
        controller: "source-controller",
        excludeSource: false,
        token: "any",
      },
      [{ ...life, amount: 2 }],
    ),
  );
  installObserver(
    f,
    "protected-creature",
    observerProgram(
      { types: ["Artifact"], controller: "source-controller", excludeSource: false, token: "any" },
      [draw],
    ),
    { types: ["Enchantment"], power: null, toughness: null },
  );
  board(f, "creature");
  board(f, "protected-creature");
  enterBatch(f, [{ slot: "enchantment-creature" }]);
  expect(abilities(f)).toHaveLength(1);
  expect(firstAbility(f).program.effects).toEqual([{ ...life, amount: 2 }]);
  priority(f);
  finishObservers(f);
  enterBatch(f, [{ slot: "artifact-creature" }]);
  expect(abilities(f)).toHaveLength(1);
  expect(firstAbility(f).program.effects).toEqual([draw]);
});
test("OBS14/15: a noncreature Welcome-style provider never triggers on itself or an opponent creature", () => {
  const f = observerFixture();
  installObserver(
    f,
    "enchantment-creature",
    observerProgram({
      types: ["Creature"],
      controller: "source-controller",
      excludeSource: false,
      token: "any",
    }),
    { types: ["Enchantment"], power: null, toughness: null },
  );
  enterBatch(f, [{ slot: "enchantment-creature" }]);
  expect(abilities(f)).toHaveLength(0);
  installObserver(f, "creature");
  board(f, "creature");
  enterBatch(f, [{ slot: "protected-creature", owner: "B" }]);
  expect(abilities(f)).toHaveLength(1);
  expect(firstAbility(f).source.definition).toBe("creature");
  priority(f);
  finishObservers(f);
  enterBatch(f, [{ slot: "artifact-creature" }]);
  expect(abilities(f)).toHaveLength(2);
});
test("OBS16/25: a resolved two-token producer captures six abilities, no life during allocation and gains eight afterward", async () => {
  const f = await tokenFixture({ power: 1, toughness: 1 });
  installObserver(f, "creature");
  installObserver(f, "protected-creature", ownCreature());
  installObserver(f, "artifact-creature", ownCreature(2), { types: ["Creature"] });
  for (const slot of ["creature", "protected-creature", "artifact-creature"]) board(f, slot);
  createBatch(f);
  expect(abilities(f)).toHaveLength(6);
  expect(player(f.state, "A").life).toBe(40);
  expect(
    abilities(f).every(
      (ability) => ability.entry.subject.token && ability.entry.facts.types.includes("Creature"),
    ),
  ).toBe(true);
  expect(f.state.events.map((event) => event.type).lastIndexOf("SpellResolved")).toBeGreaterThan(
    f.state.events.map((event) => event.type).indexOf("TriggerCaptured"),
  );
  finishObservers(f);
  expect(player(f.state, "A").life).toBe(48);
});
test("OBS17: countering the producer pays costs but creates neither tokens nor observer captures", async () => {
  const f = await tokenFixture();
  installObserver(f, "creature");
  board(f, "creature");
  const paid = player(f.state, "A").mana.C;
  const producer = cast(f, "A", "draw-spell");
  cast(f, "B", "counter", producer);
  resolveOne(f);
  expect(player(f.state, "A").mana.C).toBeLessThan(paid);
  expect(Object.values(f.state.objects).some((entry) => entry.token)).toBe(false);
  expect(abilities(f)).toHaveLength(0);
  expect(f.state.events.some((event) => event.type === "BattlefieldEntryBatch")).toBe(false);
});
test("OBS18/36: Beast is a subtype-only predicate and includes a constructed noncreature Kindred permanent", () => {
  const f = observerFixture();
  installObserver(
    f,
    "creature",
    observerProgram(
      {
        types: [],
        subtype: "Beast",
        controller: "source-controller",
        excludeSource: false,
        token: "any",
      },
      [draw],
    ),
  );
  board(f, "creature");
  const subject = definition(f.registry, "artifact-creature");
  subject.types = ["Kindred", "Enchantment"];
  subject.subtypes = ["Beast"];
  subject.power = null;
  subject.toughness = null;
  // Subject-only typed-event boundary. Kindred source admission is still explicitly unsupported.
  expect(() =>
    admitDeck(
      f.state.manifest.seats[0]?.deck ?? {
        id: "missing",
        hash: "0".repeat(64),
        commander: "missing",
        entries: [],
      },
      f.registry,
    ),
  ).toThrow();
  enterBatch(f, [{ slot: "artifact-creature" }]);
  expect(abilities(f)).toHaveLength(1);
  expect(firstAbility(f).entry.facts.types).toEqual(["Kindred", "Enchantment"]);
  expect(firstAbility(f).entry.facts.subtypes).toEqual(["Beast"]);
});
test("OBS19/20/28: source and subject removal, fresh reentry and captured controller do not retarget old abilities", () => {
  const f = observerFixture();
  installObserver(f, "commander", landfall());
  board(f, "commander");
  enterBatch(f, [{ slot: "land" }]);
  priority(f);
  const before = structuredClone(firstAbility(f));
  const oldSource = before.source.id;
  const oldSubject = before.entry.subject.id;
  const movedSource = move(f.state, oldSource, "hand", "constructed observer departure");
  move(f.state, oldSubject, "graveyard", "constructed subject departure");
  enterBattlefield(
    f.state,
    f.registry,
    [{ objectId: movedSource.id, controller: "A" }],
    "constructed source reentry",
  );
  expect(firstAbility(f)).toEqual(before);
  expect(locate(f, "A", "commander").id).not.toBe(oldSource);
  resolveOne(f);
  expect(player(f.state, "A").life).toBe(41);
  const nextLand = Object.values(f.state.objects).find(
    (entry) => entry.owner === "A" && entry.definition === "land" && entry.zone !== "battlefield",
  );
  if (!nextLand) throw new Error("Missing second land");
  enterBattlefield(
    f.state,
    f.registry,
    [{ objectId: nextLand.id, controller: "A" }],
    "constructed second land",
  );
  expect(firstAbility(f).id).not.toBe(before.id);
  expect(firstAbility(f).source.id).not.toBe(before.source.id);
});
test("OBS21/22: later controller changes preserve old controller while new entries use the post-event controller", () => {
  const f = observerFixture();
  installObserver(f, "commander", landfall());
  const source = board(f, "commander");
  enterBatch(f, [{ slot: "land" }]);
  priority(f);
  object(f.state, source).controller = "B";
  resolveOne(f);
  expect(player(f.state, "A").life).toBe(41);
  expect(player(f.state, "B").life).toBe(40);
  enterBatch(f, [{ slot: "land", owner: "B" }]);
  expect(firstAbility(f).controller).toBe("B");
  priority(f);
  finishObservers(f);
  expect(player(f.state, "B").life).toBe(41);
});
for (const seats of [2, 4] as const) {
  test(`OBS23/24 ${seats} seats: APNAP ordering belongs to captured controllers, not source dictionary order`, () => {
    const f = observerFixture("prepared-indexed", seats);
    installObserver(f, "creature");
    for (const seat of f.state.players) board(f, "creature", seat.id);
    f.state.activePlayer = seats === 4 ? "C" : "A";
    enterBatch(f, [{ slot: "protected-creature" }]);
    priority(f);
    expect(
      f.state.stack.flatMap((entry) =>
        entry.kind === "triggered-ability" ? [f.state.abilities[entry.triggerId]?.controller] : [],
      ),
    ).toEqual(seats === 4 ? ["C", "D", "A", "B"] : ["A", "B"]);
    resolveOne(f);
    expect(player(f.state, "B").life).toBe(41);
  });
}
test("four same-definition observer sources by two token subjects create eight unique independently owned occurrences", async () => {
  const f = await tokenFixture({ seats: 4 });
  installObserver(f, "creature");
  for (const seat of f.state.players) board(f, "creature", seat.id);
  createBatch(f);
  expect(abilities(f)).toHaveLength(8);
  expect(new Set(abilities(f).map((ability) => ability.id)).size).toBe(8);
  for (const actor of ["A", "B", "C", "D"]) {
    const choice = f.state.decision;
    expect(choice?.kind).toBe("trigger-order");
    expect(choice?.actor).toBe(actor);
    if (!choice) throw new Error("Missing APNAP choice");
    expect(choice.triggers).toHaveLength(2);
    answer(f, { kind: "trigger-order", triggers: [...choice.triggers].reverse() });
  }
  finishObservers(f);
  expect(f.state.players.map((seat) => seat.life)).toEqual([42, 42, 42, 42]);
});
test("OBS26: mandatory gain then failed draw completes before state-based loss", () => {
  const f = observerFixture("full-scan", 4);
  installObserver(f, "commander", landfall());
  board(f, "commander");
  for (const id of [...player(f.state, "A").library])
    move(f.state, id, "graveyard", "constructed empty library");
  enterBatch(f, [{ slot: "land" }]);
  priority(f);
  resolveOne(f);
  const events = f.state.events.map((event) => event.type);
  expect(player(f.state, "A").life).toBe(41);
  expect(player(f.state, "A").lost).toBe(true);
  expect(events.indexOf("LifeGained")).toBeLessThan(events.indexOf("TriggeredAbilityResolved"));
  expect(events.indexOf("TriggeredAbilityResolved")).toBeLessThan(
    events.indexOf("PlayersLostBatch"),
  );
});
test("source and subject can both die at the first SBA while their already captured occurrence survives placement", () => {
  const f = observerFixture();
  installObserver(f, "creature", observerProgram(), { toughness: 0 });
  definition(f.registry, "protected-creature").toughness = 0;
  enterBatch(f, [{ slot: "creature" }, { slot: "protected-creature" }]);
  expect(abilities(f)).toHaveLength(1);
  priority(f);
  expect(locate(f, "A", "creature").zone).toBe("graveyard");
  expect(locate(f, "A", "protected-creature").zone).toBe("graveyard");
  expect(abilities(f)).toHaveLength(1);
  finishObservers(f);
  expect(player(f.state, "A").life).toBe(41);
});
test("an observer absent from the post-event battlefield cannot use leaves-style LKI to observe a batch", () => {
  const f = observerFixture();
  installObserver(f, "creature");
  const source = board(f, "creature");
  const subject = move(
    f.state,
    locate(f, "A", "protected-creature").id,
    "battlefield",
    "constructed atomic event",
  );
  move(f.state, source, "graveyard", "constructed same atomic event source absence");
  recordBattlefieldEntryBatch(f.state, f.registry, [subject.id], "constructed post-event match");
  expect(abilities(f)).toHaveLength(0);
});
test("legacy self-entry draw captures exactly once alongside an external observer", () => {
  const f = observerFixture();
  installObserver(f, "creature");
  board(f, "creature");
  cast(f, "A", "trigger-creature");
  resolveOne(f);
  expect(Object.values(f.state.abilities)).toHaveLength(2);
  expect(abilities(f)).toHaveLength(1);
  expect(
    Object.values(f.state.abilities).filter(
      (ability) => ability.program.schema === "commander-trigger/1",
    ),
  ).toHaveLength(1);
  priority(f);
  const hand = player(f.state, "A").hand.length;
  finishObservers(f);
  expect(player(f.state, "A").hand).toHaveLength(hand + 1);
  expect(player(f.state, "A").life).toBe(41);
});

test("OBS30/31: detached public context and canonical ordering reject forged snapshots before a resolving pass can erase them", () => {
  const f = observerFixture();
  installObserver(f, "commander", landfall());
  board(f, "commander");
  enterBatch(f, [{ slot: "land" }]);
  priority(f);
  const original = canonicalJson(f.state);
  const view = observe(f.state, f.registry, "B");
  const visible = view.abilities[0];
  if (!visible || !("entry" in visible)) throw new Error("Missing public capture");
  visible.entry.subject.controller = "B";
  visible.source.controller = "B";
  expect(canonicalJson(f.state)).toBe(original);
  const mutations: ((ability: EntryObserverAbility) => void)[] = [
    (ability) => {
      ability.entry.subject.id = "forged@0";
    },
    (ability) => {
      ability.entry.subject.generation++;
    },
    (ability) => {
      ability.entry.subject.controller = "B";
    },
    (ability) => {
      ability.entry.facts.types = ["Creature"];
    },
    (ability) => {
      ability.sourceVersion = "0".repeat(64);
    },
    (ability) => {
      ability.entry.subjectVersion = "0".repeat(64);
    },
    (ability) => {
      ability.program.effects.reverse();
    },
    (ability) => {
      ability.eventIndex++;
    },
    (ability) => {
      ability.occurrenceOrdinal++;
    },
    (ability) => {
      ability.entry.batchId = "entry:forged";
    },
  ];
  for (const mutation of mutations) {
    const changed = { ...f, state: RulesState.parse(JSON.parse(original)) };
    mutation(firstAbility(changed));
    expect(() => assertInvariants(changed.state, changed.registry)).toThrow();
    expect(
      transition(changed.state, command(changed, { kind: "pass" }), changed.registry),
    ).toMatchObject({ status: "fault", code: "Invariant" });
  }
  expect(canonicalJson(f.state)).toBe(original);
});

test("observer enchantment and enchantment-creature declarations preserve permanent timing and typed counter domains", () => {
  const f = observerFixture();
  installObserver(
    f,
    "enchantment-creature",
    observerProgram(
      {
        types: ["Enchantment"],
        controller: "source-controller",
        excludeSource: true,
        token: "any",
      },
      [draw],
      true,
    ),
  );
  const spell = cast(f, "A", "enchantment-creature");
  cast(f, "B", "creature-counter", spell);
  resolveOne(f);
  expect(abilities(f)).toHaveLength(0);
  installObserver(
    f,
    "protected-creature",
    observerProgram(
      { types: ["Artifact"], controller: "source-controller", excludeSource: false, token: "any" },
      [draw],
    ),
    { types: ["Enchantment"], power: null, toughness: null },
  );
  cast(f, "A", "protected-creature");
  resolveOne(f);
  expect(locate(f, "A", "protected-creature").zone).toBe("battlefield");
});

test("OBS27: a departed controller loses its waiting abilities while another controller retains the departed subject snapshot", () => {
  const f = observerFixture("full-scan", 4);
  installObserver(f, "creature");
  board(f, "creature", "A");
  board(f, "creature", "B");
  enterBatch(f, [{ slot: "protected-creature" }]);
  expect(abilities(f)).toHaveLength(2);
  player(f.state, "A").life = 0;
  priority(f);
  expect(player(f.state, "A").lost).toBe(true);
  expect(f.state.activePlayer).toBe("A");
  expect(abilities(f)).toHaveLength(1);
  expect(firstAbility(f).controller).toBe("B");
  expect(firstAbility(f).entry.subject.owner).toBe("A");
  expect(f.state.objects[firstAbility(f).entry.subject.id]).toBeUndefined();
  finishObservers(f);
  expect(player(f.state, "B").life).toBe(41);
});
test("zero-toughness token subjects cease at SBA while independent captured observer abilities still resolve", async () => {
  const f = await tokenFixture({ toughness: 0 });
  installObserver(f, "creature");
  board(f, "creature");
  createBatch(f);
  expect(Object.values(f.state.objects).some((entry) => entry.token)).toBe(false);
  expect(abilities(f)).toHaveLength(2);
  expect(abilities(f).every((ability) => ability.entry.subject.token)).toBe(true);
  finishObservers(f);
  expect(player(f.state, "A").life).toBe(42);
});
