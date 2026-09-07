import { expect, test } from "bun:test";
import type { MatchManifest } from "@iwsdk-apps/contracts";
import {
  type ActivationSourceFixture,
  activationSourceActivate as activate,
  activationSourceAnswer as answer,
  activationSourceFixture as fixture,
  activationSourceMain as main,
  activationSourcePermanent as permanent,
  activationSourceResolve as resolve,
} from "../test-fixtures/activation-source";

// Whole authenticated sources, legal100-card decks, explicitly selected hands/basic
// lands. Later casts, turns, combat and activations all use ordinary transition().
// These are bounded interaction scenarios, not ordinary shuffled full games.
const modes: MatchManifest["resolver"][] = ["full-scan", "prepared-scan", "prepared-indexed"];
function passes(f: ActivationSourceFixture, count = 2) {
  for (let n = 0; n < count; n++) {
    expect(f.state.decision?.kind).toBe("priority");
    answer(f, { kind: "pass" });
  }
}
function attacks(f: ActivationSourceFixture, ids: string[]) {
  passes(f, 4);
  expect(f.state.decision?.kind).toBe("attack");
  answer(f, { kind: "attack", attacks: ids.map((attacker) => ({ attacker, defender: "B" })) });
  passes(f);
  expect(f.state.decision?.kind).toBe("block");
}
for (const mode of modes) {
  test(`ACT-SRC17/18 ${mode}: late first/double-strike grants and signed power retain actual first-step participation`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Char-Rumbler", "Kessig Wolf", "Fallaji Chaindancer"],
      "Tobias Andrion",
      [],
      mode,
    );
    const char = permanent(f, "A", "Char-Rumbler"),
      wolf = permanent(f, "A", "Kessig Wolf"),
      dancer = permanent(f, "A", "Fallaji Chaindancer");
    await main(f, "B");
    await main(f, "A");
    attacks(f, [char, wolf, dancer]);
    answer(f, { kind: "block", blocks: [] });
    passes(f);
    expect(f.state.step).toBe("first-strike-damage");
    expect(f.state.decision?.kind).toBe("priority");
    expect(f.state.combat.firstStrikeParticipants).toEqual([char]);
    expect(f.state.players.find((p) => p.id === "B")?.life).toBe(40);
    activate(f, "A", "Kessig Wolf", "{1}{R}");
    resolve(f);
    activate(f, "A", "Fallaji Chaindancer", "{2}");
    resolve(f);
    activate(f, "A", "Char-Rumbler", "{R}");
    resolve(f);
    activate(f, "A", "Char-Rumbler", "{R}");
    resolve(f);
    passes(f);
    expect(f.state.step).toBe("combat-damage");
    expect(f.state.decision?.kind).toBe("damage");
    answer(f, {
      kind: "damage",
      allocations: [
        { source: char, target: "B", amount: 1 },
        { source: wolf, target: "B", amount: 3 },
        { source: dancer, target: "B", amount: 2 },
      ],
    });
    expect(f.state.players.find((p) => p.id === "B")?.life).toBe(34);
    passes(f);
    expect(f.state.step).toBe("end-combat");
  });
  test(`ACT-SRC20 ${mode}: tapping an already declared blocker does not erase its combat damage`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Kessig Wolf"],
      "Tobias Andrion",
      ["Blinding Mage"],
      mode,
    );
    const wolf = permanent(f, "A", "Kessig Wolf");
    main(f, "B");
    const mage = permanent(f, "B", "Blinding Mage");
    main(f, "A");
    main(f, "B");
    main(f, "A");
    attacks(f, [wolf]);
    answer(f, { kind: "block", blocks: [{ blocker: mage, attacker: wolf }] });
    activate(f, "B", "Blinding Mage", "{W}", mage);
    resolve(f);
    expect(f.state.objects[mage]?.tapped).toBe(true);
    expect(f.state.combat.blocks).toEqual([{ blocker: mage, attacker: wolf }]);
    passes(f);
    answer(f, { kind: "damage", allocations: [{ source: wolf, target: mage, amount: 3 }] });
    answer(f, { kind: "damage", allocations: [{ source: mage, target: wolf, amount: 1 }] });
    expect(f.state.objects[wolf]).toBeUndefined();
    expect(f.state.objects[mage]).toBeUndefined();
    expect(f.state.events.some((event) => event.type === "CreaturesDiedBatch")).toBe(true);
  });
  for (const [card, power, toughness] of [
    ["Goblin Balloon Brigade", 1, 1],
    ["Weldfast Monitor", 3, 2],
  ] as const) {
    test(`ACT-SRC21 ${mode}: ${card}'s post-block evasion does not invalidate the declared block`, async () => {
      const f = await fixture("Lady Orca", [card], "Tobias Andrion", ["Memnite"], mode);
      const attacker = permanent(f, "A", card);
      main(f, "B");
      const blocker = permanent(f, "B", "Memnite");
      main(f, "A");
      attacks(f, [attacker]);
      answer(f, { kind: "block", blocks: [{ blocker, attacker }] });
      activate(f, "A", card, "{R}");
      resolve(f);
      expect(f.state.combat.blocked).toContain(attacker);
      expect(f.state.combat.blocks).toEqual([{ blocker, attacker }]);
      passes(f);
      answer(f, {
        kind: "damage",
        allocations: [{ source: attacker, target: blocker, amount: power }],
      });
      answer(f, {
        kind: "damage",
        allocations: [{ source: blocker, target: attacker, amount: 1 }],
      });
      expect(f.state.objects[blocker]).toBeUndefined();
      expect(f.state.players.find((p) => p.id === "B")?.life).toBe(40);
      if (toughness === 1) expect(f.state.objects[attacker]).toBeUndefined();
      else expect(f.state.objects[attacker]?.damage).toBe(1);
    });
  }
  for (const before of [false, true]) {
    test(`ACT-SRC22 ${mode}: vigilance granted ${before ? "before" : "after"} attack declaration changes only future tapping`, async () => {
      const f = await fixture("Tobias Andrion", ["Bladed Sentinel"], "Tobias Andrion", [], mode);
      const source = permanent(f, "A", "Bladed Sentinel");
      main(f, "B");
      main(f, "A");
      if (before) {
        activate(f, "A", "Bladed Sentinel", "{W}");
        resolve(f);
      }
      attacks(f, [source]);
      expect(f.state.objects[source]?.tapped).toBe(!before);
      answer(f, { kind: "block", blocks: [] });
      if (!before) {
        activate(f, "A", "Bladed Sentinel", "{W}");
        resolve(f);
      }
      expect(f.state.objects[source]?.tapped).toBe(!before);
      passes(f);
      answer(f, { kind: "damage", allocations: [{ source, target: "B", amount: 2 }] });
      expect(f.state.players.find((p) => p.id === "B")?.life).toBe(38);
    });
  }
  test(`ACT-SRC23 ${mode}: duplicate source lifelink abilities gain only actual creature damage`, async () => {
    const f = await fixture("Lady Orca", ["Prakhata Pillar-Bug"], "Tobias Andrion", [], mode);
    const source = permanent(f, "A", "Prakhata Pillar-Bug");
    main(f, "B");
    main(f, "A");
    activate(f, "A", "Prakhata Pillar-Bug", "{B}");
    resolve(f);
    activate(f, "A", "Prakhata Pillar-Bug", "{B}");
    resolve(f);
    expect(f.state.continuousEffects).toHaveLength(2);
    attacks(f, [source]);
    answer(f, { kind: "block", blocks: [] });
    passes(f);
    answer(f, { kind: "damage", allocations: [{ source, target: "B", amount: 2 }] });
    expect(f.state.players.find((p) => p.id === "A")?.life).toBe(42);
    expect(f.state.players.find((p) => p.id === "B")?.life).toBe(38);
    expect(f.state.events.filter((e) => e.type === "CombatDamageDealt")).toHaveLength(1);
  });
  test(`ACT-SRC24 ${mode}: actual indestructible grant cannot stop activated zero-toughness movement`, async () => {
    const f = await fixture(
      "Jasmine Boreal",
      ["Wily Bandar"],
      "Lady Orca",
      ["Hagra Sharpshooter"],
      mode,
    );
    const target = permanent(f, "A", "Wily Bandar");
    main(f, "B");
    permanent(f, "B", "Hagra Sharpshooter");
    main(f, "A");
    activate(f, "A", "Wily Bandar", "{2}{G}");
    resolve(f);
    activate(f, "B", "Hagra Sharpshooter", "{4}{B}", target);
    resolve(f);
    expect(f.state.objects[target]).toBeUndefined();
    expect(f.state.events.findIndex((e) => e.type === "ActivatedAbilityResolved")).toBeLessThan(
      f.state.events.findIndex((e) => e.type === "CreaturesDiedBatch"),
    );
    expect(f.state.events.some((e) => e.type === "CreaturesDiedBatch")).toBe(true);
    expect(
      f.state.events.some((e) => e.type === "CountersAdded" || e.type === "NoncombatDamageDealt"),
    ).toBe(false);
    expect(f.state.coverage["rule:704.5f"]).toBeGreaterThan(0);
  });
}
