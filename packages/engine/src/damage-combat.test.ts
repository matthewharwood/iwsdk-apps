import { expect, test } from "bun:test";
import { canonicalJson } from "@iwsdk-apps/contracts";
import {
  damageSourceAnswer as answer,
  damageSourceCard as card,
  damageSourceCommand as command,
  damageSourceFixture as fixture,
  damageSourceObject as object,
} from "../test-fixtures/damage-source";
import { move, player } from "./common";
import { assertInvariants, transition } from "./index";
import { givePriority } from "./turns";

type F = Awaited<ReturnType<typeof fixture>>;
/** Constructed current battlefield only; objects remain source-authenticated members of legal decks. */
function place(f: F, actor: string, name: string) {
  const before = object(f, actor, name);
  const after = move(f.state, before.id, "battlefield", "constructed damage combat precondition");
  after.controlledSinceTurn = 0;
  return after.id;
}
function rewrite(f: F, provider?: string, recipient?: string) {
  const d = f.state.decision?.damageReplacement;
  const o = d?.occurrences.find(
    (o) =>
      (!recipient || o.recipient.id === recipient) &&
      (!provider || o.effects.some((e) => e.definition === card(provider).id)),
  );
  const e = o?.effects.find((e) => !provider || e.definition === card(provider).id);
  if (!d || !o || !e) throw Error("No matching owned effect");
  answer(f, {
    kind: "damage-replacement",
    eventId: d.eventId,
    eventVersion: d.version,
    occurrenceId: o.id,
    effectId: e.id,
  });
}
function until(f: F, kind: "attack" | "damage" | "damage-replacement") {
  for (let n = 0; n < 50 && f.state.decision?.kind !== kind; n++) {
    const d = f.state.decision;
    if (!d) throw Error("Missing combat decision");
    if (d.kind === "priority") answer(f, { kind: "pass" });
    else throw Error(`Expected ${kind}, encountered ${d.kind}`);
  }
  if (f.state.decision?.kind !== kind) throw Error("Combat phase bound");
}
function finish(f: F) {
  for (let n = 0; n < 100 && f.state.decision?.kind === "damage-replacement"; n++) rewrite(f);
}
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`DR10 ${mode}: normal trample allocation validates2+4 before doubling to4+8; assignment1+5 rejects`, async () => {
    const f = await fixture(
      "Jasmine Boreal",
      ["Colossal Dreadmaw", "Runeclaw Bear"],
      "Lady Orca",
      ["Furnace of Rath"],
      mode,
      4,
    );
    const attacker = place(f, "A", "Colossal Dreadmaw");
    const blocker = place(f, "C", "Runeclaw Bear");
    place(f, "B", "Furnace of Rath");
    givePriority(f.state, f.registry, "A");
    assertInvariants(f.state, f.registry);
    until(f, "attack");
    answer(f, { kind: "attack", attacks: [{ attacker, defender: "C" }] });
    while (f.state.decision?.kind === "priority") answer(f, { kind: "pass" });
    answer(f, { kind: "block", blocks: [{ attacker, blocker }] });
    until(f, "damage");
    const before = canonicalJson(f.state);
    const invalid = {
      kind: "damage" as const,
      allocations: [
        { source: attacker, target: blocker, amount: 1 },
        { source: attacker, target: "C", amount: 5 },
      ],
    };
    expect(transition(f.state, command(f, invalid), f.registry).status).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(before);
    answer(f, {
      kind: "damage",
      allocations: [
        { source: attacker, target: blocker, amount: 2 },
        { source: attacker, target: "C", amount: 4 },
      ],
    });
    answer(f, { kind: "damage", allocations: [{ source: blocker, target: attacker, amount: 2 }] });
    expect(f.state.decision?.actor).toBe("A");
    rewrite(f);
    expect(f.state.objects[attacker]?.damage).toBe(0);
    expect(f.state.decision?.actor).toBe("C");
    rewrite(f, undefined, "C");
    expect(player(f.state, "C").life).toBe(40);
    finish(f);
    expect(player(f.state, "C").life).toBe(32);
    expect(f.state.objects[attacker]?.damage).toBe(4);
    expect(object(f, "C", "Runeclaw Bear").zone).toBe("graveyard");
  });
  test(`DR06/11/13 ${mode}: four seats choose their own damage occurrences in APNAP order; Arvad's own3 doubles after Armor to4`, async () => {
    const f = await fixture(
      "Arvad the Cursed",
      ["Isamaru, Hound of Konda"],
      "Lady Orca",
      ["Furnace of Rath", "Urza's Armor"],
      mode,
      4,
    );
    const arvad = place(f, "A", "Arvad the Cursed");
    const isamaru = place(f, "A", "Isamaru, Hound of Konda");
    place(f, "B", "Urza's Armor");
    place(f, "D", "Urza's Armor");
    place(f, "B", "Furnace of Rath");
    givePriority(f.state, f.registry, "A");
    assertInvariants(f.state, f.registry);
    until(f, "attack");
    answer(f, {
      kind: "attack",
      attacks: [
        { attacker: arvad, defender: "B" },
        { attacker: isamaru, defender: "D" },
      ],
    });
    while (f.state.decision?.kind === "priority") answer(f, { kind: "pass" });
    answer(f, { kind: "block", blocks: [] });
    answer(f, { kind: "block", blocks: [] });
    until(f, "damage");
    // Arvad does not affect itself; its actual static program makes the other legendary creature4/4.
    expect(f.state.decision?.damageDomain.map((d) => d.power)).toEqual([3, 4]);
    answer(f, {
      kind: "damage",
      allocations: [
        { source: arvad, target: "B", amount: 3 },
        { source: isamaru, target: "D", amount: 4 },
      ],
    });
    expect(f.state.decision?.actor).toBe("B");
    const saved = structuredClone(f.state);
    rewrite(f, "Urza's Armor");
    expect(f.state.decision?.actor).toBe("B");
    rewrite(f, "Furnace of Rath");
    expect(f.state.decision?.actor).toBe("D");
    expect(f.state.players.map((p) => p.life)).toEqual([40, 40, 40, 40]);
    rewrite(f, "Furnace of Rath");
    rewrite(f, "Urza's Armor");
    expect(f.state.players.map((p) => p.life)).toEqual([44, 36, 40, 33]);
    expect(player(f.state, "B").commanderDamage[object(f, "A", "Arvad the Cursed").lineage]).toBe(
      4,
    );
    f.state = saved;
    rewrite(f, "Furnace of Rath");
    rewrite(f, "Urza's Armor");
    finish(f);
    expect(player(f.state, "B").life).toBe(35);
    expect(player(f.state, "A").life).toBe(45);
  });
  test(`DR04 ${mode}: first and normal double-strike damage are distinct proposals with fresh per-instance histories`, async () => {
    const f = await fixture("Zetalpa, Primal Dawn", [], "Lady Orca", ["Furnace of Rath"], mode);
    const attacker = place(f, "A", "Zetalpa, Primal Dawn");
    place(f, "B", "Furnace of Rath");
    givePriority(f.state, f.registry, "A");
    until(f, "attack");
    answer(f, { kind: "attack", attacks: [{ attacker, defender: "B" }] });
    while (f.state.decision?.kind === "priority") answer(f, { kind: "pass" });
    answer(f, { kind: "block", blocks: [] });
    until(f, "damage");
    answer(f, { kind: "damage", allocations: [{ source: attacker, target: "B", amount: 4 }] });
    expect(f.state.step).toBe("first-strike-damage");
    const first = f.state.decision?.damageReplacement?.eventId;
    rewrite(f);
    expect(player(f.state, "B").life).toBe(32);
    expect(
      player(f.state, "B").commanderDamage[object(f, "A", "Zetalpa, Primal Dawn").lineage],
    ).toBe(8);
    until(f, "damage");
    answer(f, { kind: "damage", allocations: [{ source: attacker, target: "B", amount: 4 }] });
    expect(f.state.step).toBe("combat-damage");
    expect(f.state.decision?.damageReplacement?.eventId).not.toBe(first);
    expect(f.state.frames[0]?.kind).toBe("pending-damage");
    rewrite(f);
    expect(player(f.state, "B").life).toBe(24);
    expect(
      player(f.state, "B").commanderDamage[object(f, "A", "Zetalpa, Primal Dawn").lineage],
    ).toBe(16);
  });
}
