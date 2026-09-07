import { expect, test } from "bun:test";
import {
  canonicalJson,
  type EntryCausedTriggerAbility,
  emptyMana,
  RulesState,
  TriggeredAbility,
} from "@iwsdk-apps/contracts";
import { answer, command, locate } from "../test-fixtures/counterspells";
import {
  board,
  enterBatch,
  installObserver,
  observerFixture,
  priority,
} from "../test-fixtures/entry-observers";
import { proctorSourceCard } from "../test-fixtures/proctor-source";
import { definition, move, object, player } from "./common";
import { assertInvariants, transition } from "./index";
import { enterBattlefield } from "./triggers";

// Constructed operator boundaries use legal100-card inventory but synthetic definitions.
// Production authenticated source execution is retained separately in proctor-source.test.ts.
function paymentFrame(state: RulesState) {
  const frame = state.frames[0];
  if (frame?.kind !== "resolving-trigger-payment") throw Error("missing payment frame");
  return frame;
}
function fixture(mode: "full-scan" | "prepared-scan" | "prepared-indexed", seats: 2 | 4 = 4) {
  const f = observerFixture(mode, seats);
  const proctor = definition(f.registry, "creature");
  proctor.triggerPrograms = structuredClone(proctorSourceCard("Strict Proctor").triggerPrograms);
  proctor.power = 1;
  proctor.toughness = 3;
  proctor.keywords = ["flying"];
  installObserver(f, "protected-creature");
  return f;
}
function meta(f: ReturnType<typeof fixture>): EntryCausedTriggerAbility[] {
  return Object.values(f.state.abilities).filter(
    (a): a is EntryCausedTriggerAbility => "referencedTrigger" in a,
  );
}
function order(f: ReturnType<typeof fixture>) {
  while (f.state.decision?.kind === "trigger-order")
    answer(f, { kind: "trigger-order", triggers: f.state.decision.triggers });
}
function resolve(f: ReturnType<typeof fixture>) {
  const top = canonicalJson(f.state.stack.at(-1) ?? null);
  for (
    let n = 0;
    n < f.state.players.length &&
    f.state.decision?.kind === "priority" &&
    canonicalJson(f.state.stack.at(-1) ?? null) === top;
    n++
  )
    answer(f, { kind: "pass" });
}
function one(mode: "full-scan" | "prepared-scan" | "prepared-indexed") {
  const f = fixture(mode);
  board(f, "creature", "A");
  board(f, "protected-creature", "B");
  enterBatch(f, [{ slot: "artifact-creature", owner: "C" }]);
  priority(f);
  return f;
}
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`META supplemental ${mode}: four real APNAP controller passes per part, including no active ordinary cohort`, () => {
    const f = fixture(mode);
    for (const p of f.state.players) {
      board(f, "creature", p.id);
      board(f, "protected-creature", p.id);
    }
    enterBatch(f, [
      { slot: "artifact-creature", owner: "A" },
      { slot: "artifact-creature", owner: "C" },
    ]);
    expect(Object.keys(f.state.abilities)).toHaveLength(40);
    expect(meta(f)).toHaveLength(32);
    priority(f);
    for (const phase of ["ordinary", "triggered-by-trigger"] as const)
      for (const actor of ["A", "B", "C", "D"]) {
        expect(f.state.triggerPlacement?.phase).toBe(phase);
        expect(f.state.decision?.actor).toBe(actor);
        expect(f.state.decision?.triggers).toHaveLength(phase === "ordinary" ? 2 : 8);
        f.state = RulesState.parse(JSON.parse(canonicalJson(f.state)));
        const ids = f.state.decision?.triggers ?? [];
        answer(f, { kind: "trigger-order", triggers: [...ids].reverse() });
      }
    expect(f.state.stack).toHaveLength(40);
    expect(f.state.decision?.kind).toBe("priority");
    const g = fixture(mode);
    board(g, "creature", "A");
    board(g, "protected-creature", "B");
    enterBatch(g, [
      { slot: "artifact-creature", owner: "C" },
      { slot: "artifact-creature", owner: "D" },
    ]);
    priority(g);
    expect(g.state.triggerPlacement?.phase).toBe("ordinary");
    expect(g.state.decision?.actor).toBe("B");
    answer(g, { kind: "trigger-order", triggers: g.state.decision?.triggers ?? [] });
    expect(g.state.triggerPlacement?.phase).toBe("triggered-by-trigger");
    expect(g.state.decision?.actor).toBe("A");
  });
  test(`PROCTOR-REVIEW-01 ${mode}: departed payer is automatically unpaid, surviving Proctor never chooses on their behalf`, () => {
    const f = one(mode);
    const m = meta(f)[0];
    if (!m) throw Error("missing meta");
    player(f.state, "B").life = 0;
    priority(f);
    expect(player(f.state, "B").lost).toBe(true);
    expect(f.state.abilities[m.referencedTrigger.captured.id]).toBeUndefined();
    expect(f.state.abilities[m.id]).toBeDefined();
    resolve(f);
    expect(f.state.events.find((e) => e.type === "TriggerPaymentCompleted")?.data).toMatchObject({
      trigger: m.id,
      payer: "B",
      paid: false,
      payerDeparted: true,
      referencedPresent: false,
    });
    expect(f.state.events.some((e) => e.type === "TriggerPaymentRequested")).toBe(false);
    expect(f.state.frames).toEqual([]);
    expect(f.state.decision?.kind).toBe("priority");
  });
  test(`PROCTOR-REVIEW-02 ${mode}: departing Proctor controller removes its waiting or stacked abilities without countering another controller`, () => {
    for (const queued of [true, false]) {
      const f = fixture(mode);
      board(f, "creature", "A");
      board(f, "protected-creature", "B");
      enterBatch(f, [{ slot: "artifact-creature", owner: "C" }]);
      if (!queued) priority(f);
      const m = meta(f)[0];
      if (!m) throw Error("missing meta");
      player(f.state, "A").life = 0;
      priority(f);
      expect(f.state.abilities[m.id]).toBeUndefined();
      expect(f.state.abilities[m.referencedTrigger.captured.id]).toBeDefined();
      expect(f.state.events.some((e) => e.type === "TriggeredAbilityCountered")).toBe(false);
      const life = player(f.state, "B").life;
      resolve(f);
      expect(player(f.state, "B").life).toBe(life + 1);
    }
  });
  test(`PROCTOR-REVIEW-06 ${mode}: first-SBA deaths of both sources do not erase either captured occurrence`, () => {
    const f = fixture(mode);
    const p = board(f, "creature", "A"),
      w = board(f, "protected-creature", "B");
    definition(f.registry, "creature").toughness = 0;
    definition(f.registry, "protected-creature").toughness = 0;
    enterBatch(f, [{ slot: "artifact-creature", owner: "C" }]);
    expect(Object.keys(f.state.abilities)).toHaveLength(2);
    priority(f);
    expect(f.state.objects[p]).toBeUndefined();
    expect(f.state.objects[w]).toBeUndefined();
    expect(Object.keys(f.state.abilities)).toHaveLength(2);
    resolve(f);
    expect(f.state.decision?.actor).toBe("B");
    answer(f, { kind: "trigger-payment", pay: false });
    expect(f.state.stack).toEqual([]);
  });
  test(`PROCTOR-REVIEW-07 ${mode}: active-player loss during ordinary placement preserves remaining ordinary and meta APNAP suffixes`, () => {
    const f = fixture(mode);
    for (const p of f.state.players) {
      board(f, "creature", p.id);
      board(f, "protected-creature", p.id);
    }
    enterBatch(f, [
      { slot: "artifact-creature", owner: "C" },
      { slot: "artifact-creature", owner: "D" },
    ]);
    priority(f);
    expect(f.state.decision?.actor).toBe("A");
    player(f.state, "A").life = 0;
    priority(f, "B");
    expect(f.state.activePlayer).toBe("A");
    expect(f.state.decision?.actor).toBe("B");
    for (const phase of ["ordinary", "triggered-by-trigger"] as const)
      for (const actor of ["B", "C", "D"]) {
        expect(f.state.triggerPlacement?.phase).toBe(phase);
        expect(f.state.decision?.actor).toBe(actor);
        answer(f, { kind: "trigger-order", triggers: f.state.decision?.triggers ?? [] });
      }
    expect(f.state.decision?.actor).toBe("B");
    expect(Object.values(f.state.abilities).some((a) => a.controller === "A")).toBe(false);
  });
  test(`Captured source ownership/control ${mode}: source owner's departure and later control change do not redirect the surviving ability/payer`, () => {
    const f = fixture(mode);
    const p = move(
      f.state,
      locate(f, "D", "creature").id,
      "battlefield",
      "constructed foreign source",
      "A",
    );
    const w = move(
      f.state,
      locate(f, "C", "protected-creature").id,
      "battlefield",
      "constructed foreign observer",
      "B",
    );
    enterBatch(f, [{ slot: "artifact-creature", owner: "A" }]);
    priority(f);
    const m = meta(f)[0];
    if (!m) throw Error("missing meta");
    object(f.state, w.id).controller = "A";
    player(f.state, "D").life = 0;
    priority(f);
    expect(f.state.objects[p.id]).toBeUndefined();
    expect(f.state.abilities[m.id]?.controller).toBe("A");
    resolve(f);
    expect(f.state.decision?.actor).toBe("B");
    answer(f, { kind: "trigger-payment", pay: false });
    expect(
      f.state.events.find((e) => e.type === "TriggeredAbilityCountered")?.data.controller,
    ).toBe("B");
  });
  test(`META08 extra ${mode}: separate costs do not share a payment; absent referent allows standalone mana then decline with no resurrection`, () => {
    const f = fixture(mode);
    board(f, "creature", "A");
    board(f, "creature", "C");
    board(f, "protected-creature", "B");
    enterBatch(f, [{ slot: "artifact-creature", owner: "D" }]);
    priority(f);
    resolve(f);
    const m = meta(f).find((a) => a.id === f.state.decision?.triggers[0]);
    if (!m) throw Error("missing meta");
    const pool = player(f.state, "B").mana.C;
    answer(f, { kind: "trigger-payment", pay: true, sources: [], spend: { ...emptyMana(), C: 2 } });
    expect(player(f.state, "B").mana.C).toBe(pool - 2);
    expect(f.state.abilities[m.referencedTrigger.captured.id]).toBeDefined();
    resolve(f);
    expect(f.state.decision?.kind).toBe("trigger-payment");
    answer(f, { kind: "trigger-payment", pay: false });
    expect(f.state.abilities[m.referencedTrigger.captured.id]).toBeUndefined();
    const g = fixture(mode);
    board(g, "land", "B");
    board(g, "creature", "A");
    board(g, "creature", "C");
    board(g, "protected-creature", "B");
    enterBatch(g, [{ slot: "artifact-creature", owner: "D" }]);
    priority(g);
    resolve(g);
    answer(g, { kind: "trigger-payment", pay: false });
    resolve(g);
    const d = g.state.decision;
    const source = d?.manaSources[0];
    if (!source?.colors[0]) throw Error("no legal mana source");
    const color = source.colors[0];
    const before = player(g.state, "B").mana[color];
    answer(g, { kind: "mana", source: { object: source.object, color } });
    answer(g, { kind: "trigger-payment", pay: false });
    expect(player(g.state, "B").mana[color]).toBe(before + 1);
    expect(g.state.objects[source.object]?.tapped).toBe(true);
    expect(g.state.stack).toEqual([]);
  });
  test(`META11/PROCTOR-REVIEW-08 ${mode}: corrupted causal/reference/frame/phase contexts reject before destructive dispatch`, () => {
    const f = one(mode);
    const m = meta(f)[0];
    if (!m) throw Error("missing meta");
    const corruptions = [
      (a: EntryCausedTriggerAbility) => (a.immediateCause.triggeringAbilityId = "wrong"),
      (a: EntryCausedTriggerAbility) =>
        (a.referencedTrigger.captured.sourceVersion = "f".repeat(64)),
      (a: EntryCausedTriggerAbility) => (a.referencedTrigger.captured.controller = "C"),
      (a: EntryCausedTriggerAbility) => (a.referencedTrigger.captured.source.controller = "C"),
      (a: EntryCausedTriggerAbility) =>
        (a.referencedTrigger.immediateCause.enteredObjectIds = ["wrong"]),
      (a: EntryCausedTriggerAbility) =>
        Object.assign(a.referencedTrigger.immediateCause, { kind: "ability-triggered" }),
      (a: EntryCausedTriggerAbility) => Object.assign(a.program.effect.cost, { generic: 1 }),
    ];
    for (const mutate of corruptions) {
      const bad = JSON.parse(canonicalJson(f.state));
      mutate(bad.abilities[m.id]);
      const before = canonicalJson(bad);
      expect(transition(bad, command(f, { kind: "pass" }), f.registry).status).toBe("fault");
      expect(canonicalJson(bad)).toBe(before);
    }
    resolve(f);
    const valid = canonicalJson(f.state);
    const badFrames = [
      (b: RulesState) => Object.assign(paymentFrame(b), { payer: "C" }),
      (b: RulesState) =>
        Object.assign(paymentFrame(b), { payerBasis: "last-known-referenced-ability" }),
      (b: RulesState) => Object.assign(paymentFrame(b).cost, { generic: 1 }),
      (b: RulesState) => (paymentFrame(b).resolvingTrigger.referencedTrigger.captured.id = "wrong"),
      (b: RulesState) => (b.priorityPlayer = "B"),
    ];
    for (const mutate of badFrames) {
      const bad = JSON.parse(valid);
      mutate(bad);
      const before = canonicalJson(bad);
      expect(
        transition(bad, command(f, { kind: "trigger-payment", pay: false }), f.registry).status,
      ).toBe("fault");
      expect(canonicalJson(bad)).toBe(before);
    }
    expect(
      TriggeredAbility.safeParse({
        ...m,
        referencedTrigger: { ...m.referencedTrigger, captured: m },
      }).success,
    ).toBe(false);
    const g = fixture(mode);
    board(g, "creature", "A");
    board(g, "protected-creature", "B");
    enterBatch(g, [
      { slot: "artifact-creature", owner: "C" },
      { slot: "artifact-creature", owner: "D" },
    ]);
    priority(g);
    const altered = structuredClone(g.state);
    if (!altered.triggerPlacement) throw Error("missing placement");
    altered.triggerPlacement.phase = "triggered-by-trigger";
    expect(() => assertInvariants(altered, g.registry)).toThrow();
  });
  test(`Immediate post-event source ${mode}: absent Proctor does not observe, and simultaneous newcomer observes each actual ordinary occurrence once`, () => {
    const f = fixture(mode);
    board(f, "protected-creature", "B");
    const p = board(f, "creature", "A");
    move(f.state, p, "hand", "constructed absent observer");
    enterBatch(f, [{ slot: "artifact-creature", owner: "C" }]);
    expect(meta(f)).toEqual([]);
    order(f);
    priority(f);
    resolve(f);
    enterBattlefield(
      f.state,
      f.registry,
      [
        { objectId: locate(f, "A", "creature").id, controller: "A" },
        { objectId: locate(f, "D", "artifact-creature").id, controller: "D" },
      ],
      "constructed simultaneous source and subject",
    );
    expect(meta(f)).toHaveLength(2);
    expect(new Set(meta(f).map((a) => a.id)).size).toBe(2);
    expect(
      meta(f).every(
        (a) =>
          a.immediateCause.kind === "ability-triggered" &&
          a.referencedTrigger.immediateCause.kind === "battlefield-entry",
      ),
    ).toBe(true);
  });
}
