import { expect, test } from "bun:test";
import { canonicalJson } from "@iwsdk-apps/contracts";
import {
  damageSourceAnswer as answer,
  damageSourceCast as cast,
  damageSourceFixture as fixture,
  damageSourceMain as main,
  damageSourceObject as object,
  damageSourceResolve as resolve,
} from "../test-fixtures/damage-source";
import { checkpoint } from "./checkpoints";
import { player } from "./common";
import { assertInvariants } from "./index";
import { givePriority } from "./turns";

type F = Awaited<ReturnType<typeof fixture>>;
function choose(f: F, index = 0) {
  const d = f.state.decision?.damageReplacement;
  const o = d?.occurrences[0];
  const e = o?.effects[index];
  if (!d || !o || !e) throw Error("No damage choice");
  answer(f, {
    kind: "damage-replacement",
    eventId: d.eventId,
    eventVersion: d.version,
    occurrenceId: o.id,
    effectId: e.id,
  });
}
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`REP-NEXT-01/04 ${mode}: two separate actual Furnaces apply in both orders and reuse their instance IDs only for a fresh event`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Furnace of Rath", "Sorin's Thirst"],
      "Jasmine Boreal",
      ["Ancient Brontodon"],
      mode,
      4,
    );
    cast(f, "A", "Furnace of Rath");
    resolve(f);
    main(f, "B");
    cast(f, "B", "Ancient Brontodon");
    resolve(f);
    main(f, "C");
    cast(f, "C", "Furnace of Rath");
    resolve(f);
    cast(f, "A", "Sorin's Thirst", object(f, "B", "Ancient Brontodon").id);
    resolve(f);
    const saved = structuredClone(f.state);
    const original = f.state.decision?.damageReplacement?.eventId;
    const effects = f.state.decision?.damageReplacement?.occurrences[0]?.effects;
    expect(new Set(effects?.map((e) => e.definition)).size).toBe(1);
    expect(new Set(effects?.map((e) => e.id)).size).toBe(2);
    for (const first of [0, 1]) {
      f.state = structuredClone(saved);
      choose(f, first);
      expect(f.state.decision?.damageReplacement?.occurrences[0]?.amount).toBe(4);
      choose(f);
      expect(object(f, "B", "Ancient Brontodon").damage).toBe(8);
    }
    cast(f, "C", "Sorin's Thirst", object(f, "B", "Ancient Brontodon").id);
    resolve(f);
    expect(f.state.decision?.damageReplacement?.eventId).not.toBe(original);
    expect(f.state.decision?.damageReplacement?.occurrences[0]?.effects.map((e) => e.id)).toEqual(
      effects?.map((e) => e.id),
    );
    choose(f);
    choose(f);
    expect(object(f, "B", "Ancient Brontodon").zone).toBe("graveyard");
  });
  test(`REP-NEXT-05 ${mode}: a Unicorn receiving lethal spell damage remains a live provider throughout its own pending event`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Furnace of Rath", "Sorin's Thirst"],
      "Tobias Andrion",
      ["Benevolent Unicorn"],
      mode,
    );
    cast(f, "A", "Furnace of Rath");
    resolve(f);
    main(f, "B");
    cast(f, "B", "Benevolent Unicorn");
    resolve(f);
    cast(f, "A", "Sorin's Thirst", object(f, "B", "Benevolent Unicorn").id);
    resolve(f);
    const d = f.state.decision?.damageReplacement;
    const o = d?.occurrences[0];
    const index = o?.effects.findIndex((e) => e.provider === object(f, "A", "Furnace of Rath").id);
    if (index === undefined || index < 0) throw Error("No Furnace");
    choose(f, index);
    expect(object(f, "B", "Benevolent Unicorn").damage).toBe(0);
    expect(object(f, "B", "Benevolent Unicorn").zone).toBe("battlefield");
    choose(f);
    expect(object(f, "B", "Benevolent Unicorn").zone).toBe("graveyard");
    expect(f.state.events.find((e) => e.type === "NoncombatDamageDealt")?.data.amount).toBe(3);
  });
  test(`REP-NEXT-14 ${mode}: a valid departed active-seat checkpoint keeps A as turn anchor while C's later Thirst is owned by affected B`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Furnace of Rath", "Sorin's Thirst"],
      "Jasmine Boreal",
      ["Ancient Brontodon"],
      mode,
      4,
    );
    main(f, "B");
    cast(f, "B", "Ancient Brontodon");
    resolve(f);
    main(f, "C");
    cast(f, "C", "Furnace of Rath");
    resolve(f);
    main(f, "A");
    // Constructed zero-life boundary; normal SBA departure runs before the later damage event.
    player(f.state, "A").life = 0;
    checkpoint(f.state, f.registry);
    givePriority(f.state, f.registry, "C");
    assertInvariants(f.state, f.registry);
    expect(f.state.activePlayer).toBe("A");
    expect(player(f.state, "A").lost).toBe(true);
    cast(f, "C", "Sorin's Thirst", object(f, "B", "Ancient Brontodon").id);
    resolve(f);
    expect(f.state.decision?.actor).toBe("B");
    expect(f.state.activePlayer).toBe("A");
    const frame = f.state.frames[0];
    expect(frame?.kind).toBe("pending-damage");
    const before = canonicalJson(f.state.players.map((p) => p.life));
    choose(f);
    expect(canonicalJson(f.state.players.map((p) => p.life))).not.toBe(before);
    expect(f.state.activePlayer).toBe("A");
    expect(f.state.priorityPlayer).toBe("B");
    expect(f.state.decision?.actor).toBe("B");
  });
}
