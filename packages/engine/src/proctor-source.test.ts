import { expect, test } from "bun:test";
import {
  canonicalJson,
  type EntryCausedTriggerAbility,
  emptyMana,
  type MatchManifest,
  RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  proctorSourceAnswer as answer,
  proctorSourceCard as card,
  proctorSourceCast as cast,
  proctorSourceCommand as command,
  proctorSourceDrain as drain,
  proctorSourceFixture as fixture,
  proctorSourceMain as main,
  proctorSourceObject as object,
  proctorSourceResolve as resolve,
  proctorSourceSnapshot as snapshot,
} from "../test-fixtures/proctor-source";
import { player } from "./common";
import { assertInvariants, observe, transition } from "./index";

function metas(f: Awaited<ReturnType<typeof fixture>>): EntryCausedTriggerAbility[] {
  return Object.values(f.state.abilities).filter(
    (a): a is EntryCausedTriggerAbility => "referencedTrigger" in a,
  );
}
async function established(mode: MatchManifest["resolver"], both = false) {
  const f = await fixture(
    "Tobias Andrion",
    ["Strict Proctor", "Queen's Commission", ...(both ? ["Soul Warden"] : [])],
    "Tobias Andrion",
    ["Soul Warden", "Repulse", ...(both ? ["Strict Proctor"] : [])],
    mode,
  );
  if (both) {
    cast(f, "A", "Soul Warden");
    resolve(f);
  }
  const paid = cast(f, "A", "Strict Proctor");
  expect(paid.event?.data.paid).toEqual({ ...emptyMana(), W: 2 });
  resolve(f);
  drain(f);
  await main(f, "B");
  cast(f, "B", "Soul Warden");
  resolve(f);
  drain(f);
  if (both) {
    cast(f, "B", "Strict Proctor");
    resolve(f);
    drain(f);
  }
  main(f, "A");
  return f;
}
test("Strict Proctor whole raw source, flying, finite effect and all source fixture hashes are authenticated", async () => {
  const { hash, ...body } = snapshot;
  expect(await semanticHash(body)).toBe(hash);
  for (const row of snapshot.cards) {
    expect(await semanticHash(row.definition)).toBe(row.definitionHash);
    const proof = snapshot.sourceRecords.find((r) => r.identity === row.definition.oracleId);
    expect(proof?.sourceVersion).toBe(row.definition.sourceVersion);
    expect(proof?.proof.payload.oracle_text).toBe(row.definition.oracleText);
  }
  expect(card("Strict Proctor").oracleText).toBe(
    "Flying\nWhenever a permanent entering causes a triggered ability to trigger, counter that ability unless its controller pays {2}.",
  );
  expect(card("Strict Proctor").keywords).toEqual(["flying"]);
  expect(card("Strict Proctor").power).toBe(1);
  expect(card("Strict Proctor").toughness).toBe(3);
  expect(card("Strict Proctor").triggerPrograms?.[0]?.schema).toBe(
    "commander-entry-caused-trigger/1",
  );
});
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`META01/11 ${mode}: two actual Wardens, two actual Proctors, two Vampire tokens produce four ordinary then eight distinct meta occurrences`, async () => {
    const f = await established(mode, true);
    const lives = f.state.players.map((p) => p.life);
    cast(f, "A", "Queen's Commission");
    resolve(f);
    expect(Object.values(f.state.objects).filter((o) => o.token)).toHaveLength(2);
    expect(Object.keys(f.state.abilities)).toHaveLength(12);
    expect(metas(f)).toHaveLength(8);
    expect(new Set(metas(f).map((a) => a.id)).size).toBe(8);
    const ordinary = Object.values(f.state.abilities).filter((a) => !("referencedTrigger" in a));
    for (const a of ordinary)
      expect(metas(f).filter((m) => m.referencedTrigger.captured.id === a.id)).toHaveLength(2);
    expect(f.state.players.map((p) => p.life)).toEqual(lives);
    for (const [phase, actor, count] of [
      ["ordinary", "A", 2],
      ["ordinary", "B", 2],
      ["triggered-by-trigger", "A", 4],
      ["triggered-by-trigger", "B", 4],
    ] as const) {
      expect(f.state.triggerPlacement?.phase).toBe(phase);
      expect(f.state.decision?.actor).toBe(actor);
      expect(f.state.decision?.triggers).toHaveLength(count);
      f.state = RulesState.parse(JSON.parse(canonicalJson(f.state)));
      assertInvariants(f.state, f.registry);
      const d = f.state.decision;
      if (!d) throw Error("missing order");
      expect(transition(f.state, command(f, { kind: "pass" }), f.registry).status).toBe("rejected");
      answer(f, { kind: "trigger-order", triggers: [...d.triggers].reverse() });
    }
    expect(f.state.stack).toHaveLength(12);
    expect(
      f.state.stack
        .slice(0, 4)
        .every(
          (e) =>
            e.kind === "triggered-ability" &&
            !("referencedTrigger" in (f.state.abilities[e.triggerId] ?? {})),
        ),
    ).toBe(true);
    expect(
      f.state.stack
        .slice(4)
        .every(
          (e) =>
            e.kind === "triggered-ability" &&
            "referencedTrigger" in (f.state.abilities[e.triggerId] ?? {}),
        ),
    ).toBe(true);
    drain(f);
    expect(f.state.stack).toEqual([]);
    expect(f.state.players.map((p) => p.life)).toEqual(lives);
    const counters = f.history
      .flatMap((h) => h.events)
      .filter(
        (e) =>
          e.type === "TriggeredAbilityCountered" && ordinary.some((a) => a.id === e.data.trigger),
      );
    expect(counters).toHaveLength(4);
  });
  test(`META02/03/04/06 ${mode}: payer owns resolution, may activate real Plains then decline without refund or priority`, async () => {
    const f = await established(mode);
    cast(f, "A", "Queen's Commission");
    resolve(f);
    while (f.state.decision?.kind === "trigger-order")
      answer(f, { kind: "trigger-order", triggers: f.state.decision.triggers });
    resolve(f);
    expect(f.state.decision?.kind).toBe("trigger-payment");
    expect(f.state.decision?.actor).toBe("B");
    expect(f.state.priorityPlayer).toBeNull();
    const frame = f.state.frames[0];
    if (frame?.kind !== "resolving-trigger-payment") throw Error("missing payment");
    const lower = frame.resolvingTrigger.referencedTrigger.captured;
    const life = player(f.state, "B").life;
    const visible = observe(f.state, f.registry, "B");
    expect(visible.decision?.kind).toBe("trigger-payment");
    expect(observe(f.state, f.registry, "A").decision).toBeNull();
    for (const response of [
      { kind: "pass" },
      { kind: "cancel-cast" },
      { kind: "cast", card: object(f, "B", "Repulse").id },
    ] as const)
      expect(transition(f.state, command(f, response), f.registry).status).toBe("rejected");
    const source = f.state.decision?.manaSources.find((s) => s.colors.includes("W"));
    if (!source) throw Error("missing Plains");
    const before = canonicalJson(f.state);
    const wrong = {
      ...command(f, { kind: "mana", source: { object: source.object, color: "W" } }),
      actor: "A",
    };
    expect(transition(f.state, wrong, f.registry).status).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(before);
    answer(f, { kind: "mana", source: { object: source.object, color: "W" } });
    expect(player(f.state, "B").mana.W).toBe(1);
    expect(f.state.objects[source.object]?.tapped).toBe(true);
    expect(f.state.decision?.kind).toBe("trigger-payment");
    const one = { ...emptyMana(), W: 1 };
    const committed = canonicalJson(f.state);
    expect(
      transition(
        f.state,
        command(f, { kind: "trigger-payment", pay: true, sources: [], spend: one }),
        f.registry,
      ).status,
    ).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(committed);
    f.state = RulesState.parse(JSON.parse(canonicalJson(f.state)));
    answer(f, { kind: "trigger-payment", pay: false });
    expect(player(f.state, "B").mana.W).toBe(1);
    expect(f.state.objects[source.object]?.tapped).toBe(true);
    expect(f.state.abilities[lower.id]).toBeUndefined();
    expect(object(f, "B", "Soul Warden").zone).toBe("battlefield");
    expect(player(f.state, "B").life).toBe(life);
    expect(f.state.events.find((e) => e.type === "TriggeredAbilityCountered")?.data.trigger).toBe(
      lower.id,
    );
  });
  test(`META03/05 ${mode}: two legal Plains pay generic two atomically, preserve lower ability and later life gain`, async () => {
    const f = await established(mode);
    cast(f, "A", "Queen's Commission");
    resolve(f);
    while (f.state.decision?.kind === "trigger-order")
      answer(f, { kind: "trigger-order", triggers: f.state.decision.triggers });
    resolve(f);
    const frame = f.state.frames[0];
    if (frame?.kind !== "resolving-trigger-payment") throw Error("missing payment");
    const sources =
      f.state.decision?.manaSources.filter((s) => s.colors.includes("W")).slice(0, 2) ?? [];
    expect(sources).toHaveLength(2);
    const payment = {
      kind: "trigger-payment",
      pay: true,
      sources: sources.map((s) => ({ object: s.object, color: "W" as const })),
      spend: { ...emptyMana(), W: 2 },
    } as const;
    const before = canonicalJson(f.state);
    expect(
      transition(
        f.state,
        command(f, {
          ...payment,
          sources: payment.sources.slice(0, 1).concat(payment.sources.slice(0, 1)),
        }),
        f.registry,
      ).status,
    ).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(before);
    answer(f, payment);
    expect(f.state.abilities[frame.resolvingTrigger.referencedTrigger.captured.id]).toBeDefined();
    expect(player(f.state, "B").mana).toEqual(emptyMana());
    for (const s of sources) expect(f.state.objects[s.object]?.tapped).toBe(true);
    const life = player(f.state, "B").life;
    drain(f);
    expect(player(f.state, "B").life).toBe(life + 1);
  });
}
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`META07 ${mode}: actual Repulse removes Proctor before its captured non-target effect resolves`, async () => {
    const f = await established(mode);
    cast(f, "A", "Queen's Commission");
    resolve(f);
    while (f.state.decision?.kind === "trigger-order")
      answer(f, { kind: "trigger-order", triggers: f.state.decision.triggers });
    const saved = metas(f).map((a) => structuredClone(a));
    const source = object(f, "A", "Strict Proctor").id;
    cast(f, "B", "Repulse", source);
    resolve(f);
    expect(object(f, "A", "Strict Proctor").zone).toBe("hand");
    expect(object(f, "A", "Strict Proctor").id).not.toBe(source);
    expect(metas(f)).toEqual(saved);
    resolve(f);
    expect(f.state.decision?.actor).toBe("B");
    answer(f, { kind: "trigger-payment", pay: false });
    expect(f.state.events.some((e) => e.type === "TriggeredAbilityCountered")).toBe(true);
    expect(
      saved.some(
        (a) =>
          a.id === f.state.events.find((e) => e.type === "TriggeredAbilityResolved")?.data.trigger,
      ),
    ).toBe(true);
  });
  test(`META08/09 ${mode}: absent lower ability still permits a separate payment with last-known controller and cannot be resurrected`, async () => {
    const f = await fixture(
      "Jasmine Boreal",
      ["Strict Proctor", "Elvish Visionary"],
      "Tobias Andrion",
      ["Strict Proctor"],
      mode,
    );
    cast(f, "A", "Strict Proctor");
    resolve(f);
    main(f, "B");
    cast(f, "B", "Strict Proctor");
    resolve(f);
    main(f, "A");
    cast(f, "A", "Elvish Visionary");
    resolve(f);
    expect(f.state.stack).toHaveLength(3);
    expect(metas(f)).toHaveLength(2);
    const reference = metas(f)[0]?.referencedTrigger.captured.id;
    if (!reference) throw Error("missing reference");
    const hand = player(f.state, "A").hand.length;
    resolve(f);
    answer(f, { kind: "trigger-payment", pay: false });
    expect(f.state.abilities[reference]).toBeUndefined();
    resolve(f);
    const frame = f.state.frames[0];
    if (frame?.kind !== "resolving-trigger-payment")
      throw Error("absent reference lost optional choice");
    expect(frame.payer).toBe("A");
    expect(frame.payerBasis).toBe("last-known-referenced-ability");
    f.state = RulesState.parse(JSON.parse(canonicalJson(f.state)));
    const sources =
      f.state.decision?.manaSources.filter((s) => s.colors.includes("W")).slice(0, 2) ?? [];
    answer(f, {
      kind: "trigger-payment",
      pay: true,
      sources: sources.map((s) => ({ object: s.object, color: "W" })),
      spend: { ...emptyMana(), W: 2 },
    });
    expect(f.state.stack).toEqual([]);
    expect(player(f.state, "A").hand).toHaveLength(hand);
    expect(f.state.abilities[reference]).toBeUndefined();
    expect(f.state.events.find((e) => e.type === "TriggerPaymentCompleted")?.data).toMatchObject({
      paid: true,
      referencedPresent: false,
      payer: "A",
    });
    expect(f.state.events.some((e) => e.type === "TriggeredAbilityCountered")).toBe(false);
  });
  test(`META09 ${mode}: newly resolved Proctor sees the Warden ability caused by that same entry and never its own ancestry`, async () => {
    const f = await fixture(
      "Tobias Andrion",
      ["Soul Warden", "Strict Proctor"],
      "Tobias Andrion",
      [],
      mode,
    );
    cast(f, "A", "Soul Warden");
    resolve(f);
    cast(f, "A", "Strict Proctor");
    resolve(f);
    expect(f.state.stack).toHaveLength(2);
    expect(metas(f)).toHaveLength(1);
    const meta = metas(f)[0];
    expect(meta?.referencedTrigger.captured.source.id).toBe(object(f, "A", "Soul Warden").id);
    expect(meta?.referencedTrigger.immediateCause.enteredObjectIds).toEqual([
      object(f, "A", "Strict Proctor").id,
    ]);
    const life = player(f.state, "A").life;
    drain(f);
    expect(player(f.state, "A").life).toBe(life);
  });
  test(`META conditional contrast ${mode}: false capture creates neither ability; paid tax does not bypass a later false condition`, async () => {
    const f = await fixture(
      "Tobias Andrion",
      ["Strict Proctor", "Scholar of Stars", "Memnite"],
      "Tobias Andrion",
      ["Repulse"],
      mode,
    );
    cast(f, "A", "Strict Proctor");
    resolve(f);
    cast(f, "A", "Scholar of Stars");
    resolve(f);
    expect(f.state.stack).toEqual([]);
    expect(metas(f)).toEqual([]);
    // A second actual Scholar incarnation follows Repulse; no synthetic definition is admitted.
    cast(f, "B", "Repulse", object(f, "A", "Scholar of Stars").id);
    resolve(f);
    cast(f, "A", "Memnite");
    resolve(f);
    cast(f, "A", "Scholar of Stars");
    resolve(f);
    expect(f.state.stack).toHaveLength(2);
    const lower = metas(f)[0]?.referencedTrigger.captured.id;
    if (!lower) throw Error("missing conditional");
    // Repulse has been spent. Current artifact removal is explicitly a constructed post-capture boundary here.
    const { move } = await import("./common");
    move(f.state, object(f, "A", "Memnite").id, "hand", "constructed current witness removal");
    resolve(f);
    const sources =
      f.state.decision?.manaSources.filter((s) => s.colors.includes("W")).slice(0, 2) ?? [];
    answer(f, {
      kind: "trigger-payment",
      pay: true,
      sources: sources.map((s) => ({ object: s.object, color: "W" })),
      spend: { ...emptyMana(), W: 2 },
    });
    expect(f.state.abilities[lower]).toBeDefined();
    const hand = player(f.state, "A").hand.length;
    resolve(f);
    expect(player(f.state, "A").hand).toHaveLength(hand);
    expect(f.state.events.find((e) => e.type === "TriggeredAbilityRemoved")?.data).toMatchObject({
      trigger: lower,
      reason: "intervening-if-false",
    });
  });
  test(`META10 ${mode}: ordinary Forest special action causes actual Tatyova landfall and opposing Proctor without casting the land`, async () => {
    const f = await fixture(
      "Tatyova, Benthic Druid",
      [],
      "Tobias Andrion",
      ["Strict Proctor"],
      mode,
    );
    cast(f, "A", "Tatyova, Benthic Druid");
    resolve(f);
    main(f, "B");
    cast(f, "B", "Strict Proctor");
    resolve(f);
    main(f, "A");
    const forest = Object.values(f.state.objects).find(
      (o) => o.owner === "A" && o.definition === card("Forest").id && o.zone === "library",
    );
    if (!forest) throw Error("missing selected Forest");
    const { move } = await import("./common");
    const selected = move(f.state, forest.id, "hand", "constructed selected source land");
    const { givePriority } = await import("./turns");
    givePriority(f.state, f.registry, "A");
    answer(f, { kind: "land", card: selected.id });
    expect(f.state.events.filter((e) => e.type === "LandPlayed")).toHaveLength(1);
    expect(f.state.events.some((e) => e.type === "SpellCast")).toBe(false);
    expect(f.state.stack).toHaveLength(2);
    expect(metas(f)[0]?.referencedTrigger.captured.source.id).toBe(
      object(f, "A", "Tatyova, Benthic Druid").id,
    );
    resolve(f);
    expect(f.state.decision?.actor).toBe("A");
    answer(f, { kind: "trigger-payment", pay: false });
    expect(f.state.stack).toEqual([]);
  });
}
