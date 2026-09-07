import { expect, test } from "bun:test";
import { canonicalJson, emptyMana, type MatchManifest, type Response } from "@iwsdk-apps/contracts";
import {
  type ActivationSourceFixture,
  activationSourceActivate as activate,
  activationSourceAnswer as answer,
  activationSourceCard as card,
  activationSourceCast as cast,
  activationSourceCommand as command,
  activationSourceFixture as fixture,
  activationSourceInventory as inventory,
  activationSourceMain as main,
  activationSourceNextTurn as nextTurn,
  activationSourceObject as owned,
  activationSourcePermanent as permanent,
  activationSourceResolve as resolve,
} from "../test-fixtures/activation-source";
import { characteristics } from "./characteristics";
import { move, player } from "./common";
import { assertInvariants, observe, transition } from "./index";
import { givePriority } from "./turns";

const modes: MatchManifest["resolver"][] = ["full-scan", "prepared-scan", "prepared-indexed"];
function rejected(f: ActivationSourceFixture, response: Response) {
  const before = canonicalJson(f.state);
  const result = transition(f.state, command(f, response), f.registry);
  expect(result.status).toBe("rejected");
  expect(canonicalJson(f.state)).toBe(before);
  return result;
}
function announced(f: ActivationSourceFixture, id: string) {
  answer(f, { kind: "activate", source: id, programIndex: 0 });
  const top = f.state.stack.at(-1);
  if (top?.kind !== "activated-ability") throw new Error("Missing proposed noncard ability");
  return top.abilityId;
}
function expectResolved(f: ActivationSourceFixture, id: string) {
  expect(f.state.activatedAbilities?.[id]).toBeUndefined();
  expect(
    f.state.events.find((event) => event.type === "ActivatedAbilityResolved")?.data.ability,
  ).toBe(id);
}

for (const mode of modes) {
  test(`ACT-SRC01/10/11/25 ${mode}: source stays on battlefield, independent stack object pays then modifies until cleanup`, async () => {
    const f = await fixture("Lady Orca", ["Shivan Dragon"], "Tobias Andrion", [], mode);
    const source = permanent(f, "A", "Shivan Dragon");
    const physical = inventory(f, "A"),
      before = characteristics(f.state, f.registry, source);
    const ability = activate(f, "A", "Shivan Dragon", "{R}");
    expect(f.state.priorityPlayer).toBe("A");
    expect(f.state.objects[source]?.zone).toBe("battlefield");
    expect(characteristics(f.state, f.registry, source)).toEqual(before);
    expect(ability.payment?.spend.R).toBe(1);
    expect(ability.source.id).toBe(source);
    expect(inventory(f, "A")).toEqual(physical);
    resolve(f);
    expectResolved(f, ability.id);
    expect(characteristics(f.state, f.registry, source).power).toBe(6);
    expect(f.state.continuousEffects[0]?.activation?.id).toBe(ability.id);
    main(f, "B");
    expect(characteristics(f.state, f.registry, source).power).toBe(5);
    expect(f.state.continuousEffects).toHaveLength(0);
  });

  test(`ACT-SRC10/15 ${mode}: freshly cast artifact can pay pure tap immediately without a mana window`, async () => {
    const f = await fixture("Tobias Andrion", ["Marble Chalice"], "Jasmine Boreal", [], mode);
    const source = permanent(f, "A", "Marble Chalice"),
      life = player(f.state, "A").life;
    announced(f, source);
    expect(f.state.decision?.kind).toBe("activation-payment");
    expect(f.state.decision?.cost).toBeNull();
    expect(f.state.decision?.manaSources).toEqual([]);
    const land = f.lands.A?.W?.find((id) => !f.state.objects[id]?.tapped);
    if (!land) throw new Error("Missing explicit basic land");
    rejected(f, { kind: "mana", source: { object: land, color: "W" } });
    answer(f, { kind: "activation-payment", sources: [], spend: emptyMana() });
    expect(f.state.objects[source]?.tapped).toBe(true);
    expect(player(f.state, "A").life).toBe(life);
    resolve(f);
    expect(player(f.state, "A").life).toBe(life + 1);
    expect(card("Marble Chalice").colors).toEqual(["W"]);
  });

  test(`ACT-SRC06/09/12/13 ${mode}: source tap needs maturity, targets precede atomic payment and self/already-tapped targets are legal`, async () => {
    const f = await fixture("Tobias Andrion", ["Blinding Mage"], "Jasmine Boreal", [], mode);
    const source = permanent(f, "A", "Blinding Mage");
    rejected(f, { kind: "activate", source, programIndex: 0 });
    await nextTurn(f, "A");
    announced(f, source);
    expect(f.state.decision?.kind).toBe("activation-target");
    expect(f.state.decision?.cards).toContain(source);
    rejected(f, { kind: "activation-payment", sources: [], spend: emptyMana() });
    rejected(f, { kind: "pass" });
    const wrong = { ...command(f, { kind: "activation-target", target: source }), actor: "B" };
    expect(transition(f.state, wrong, f.registry).status).toBe("rejected");
    answer(f, { kind: "activation-target", target: source });
    rejected(f, { kind: "activation-payment", sources: [], spend: emptyMana() });
    expect(f.state.objects[source]?.tapped).toBe(false);
    const land = f.lands.A?.W?.find((id) => !f.state.objects[id]?.tapped);
    if (!land) throw new Error("Missing explicit Plains");
    const spend = { ...emptyMana(), W: 1 };
    answer(f, { kind: "activation-payment", sources: [{ object: land, color: "W" }], spend });
    expect(f.state.objects[source]?.tapped).toBe(true);
    expect(f.state.objects[land]?.tapped).toBe(true);
    resolve(f);
    expect(f.state.events.some((event) => event.type === "PermanentTappedByAbility")).toBe(false);
    rejected(f, { kind: "activate", source, programIndex: 0 });
  });

  test(`ACT-SRC14/15 ${mode}: accepted mana survives underpayment and cancellation; explicit zero has a mana opportunity`, async () => {
    const f = await fixture("Lady Orca", ["Flowstone Hellion"], "Tobias Andrion", [], mode);
    const source = permanent(f, "A", "Flowstone Hellion");
    const id = announced(f, source);
    expect(f.state.decision?.cost).toEqual({ ...emptyMana(), generic: 0 });
    const land = f.lands.A?.R?.find((id) => !f.state.objects[id]?.tapped);
    if (!land) throw new Error("Missing explicit Mountain");
    answer(f, { kind: "mana", source: { object: land, color: "R" } });
    rejected(f, { kind: "activation-payment", sources: [], spend: { ...emptyMana(), R: 1 } });
    expect(player(f.state, "A").mana.R).toBe(1);
    answer(f, { kind: "cancel-activation" });
    expect(f.state.activatedAbilities?.[id]).toBeUndefined();
    expect(f.state.objects[land]?.tapped).toBe(true);
    expect(player(f.state, "A").mana.R).toBe(1);
    expect(f.state.priorityPlayer).toBe("A");
    expect(f.state.continuousEffects).toHaveLength(0);
  });

  test(`ACT-SRC16/26 ${mode}: four legal zero-cost activations resolve separately; zero toughness kills before fourth source effect`, async () => {
    const f = await fixture("Lady Orca", ["Flowstone Hellion"], "Tobias Andrion", [], mode);
    const source = permanent(f, "A", "Flowstone Hellion");
    const ids = Array.from({ length: 4 }, () => activate(f, "A", "Flowstone Hellion", "{0}").id);
    expect(new Set(ids).size).toBe(4);
    expect(f.state.stack).toHaveLength(4);
    resolve(f);
    expect(characteristics(f.state, f.registry, source)).toMatchObject({ power: 4, toughness: 2 });
    resolve(f);
    expect(characteristics(f.state, f.registry, source)).toMatchObject({ power: 5, toughness: 1 });
    resolve(f);
    expect(f.state.objects[source]).toBeUndefined();
    expect(owned(f, "A", "Flowstone Hellion").zone).toBe("graveyard");
    const count = f.state.continuousEffects.length;
    resolve(f);
    expect(f.state.continuousEffects).toHaveLength(count);
    expect(f.state.stack).toHaveLength(0);
    expect(f.state.outcome.kind).toBe("ongoing");
  });

  test(`ACT-SRC17 ${mode}: signed printed power is -1 then0 then1 and double strike is preserved`, async () => {
    const f = await fixture("Lady Orca", ["Char-Rumbler"], "Tobias Andrion", [], mode);
    const source = permanent(f, "A", "Char-Rumbler");
    expect(characteristics(f.state, f.registry, source).power).toBe(-1);
    activate(f, "A", "Char-Rumbler", "{R}");
    resolve(f);
    expect(characteristics(f.state, f.registry, source).power).toBe(0);
    activate(f, "A", "Char-Rumbler", "{R}");
    resolve(f);
    expect(characteristics(f.state, f.registry, source).power).toBe(1);
    expect(characteristics(f.state, f.registry, source).keywords).toContain("double-strike");
  });

  test(`ACT-SRC02 ${mode}: actual source removal does not stop the captured activator draw`, async () => {
    const f = await fixture(
      "Tobias Andrion",
      ["Spectral Sailor"],
      "Tobias Andrion",
      ["Repulse"],
      mode,
    );
    const source = permanent(f, "A", "Spectral Sailor"),
      hand = player(f.state, "A").hand.length;
    const ability = activate(f, "A", "Spectral Sailor", "{3}{U}");
    cast(f, "B", "Repulse", source);
    resolve(f);
    expect(f.state.objects[source]).toBeUndefined();
    const afterBounce = player(f.state, "A").hand.length;
    expect(afterBounce).toBe(hand + 1);
    resolve(f);
    expectResolved(f, ability.id);
    expect(player(f.state, "A").hand.length).toBe(afterBounce + 1);
    expect(owned(f, "A", "Spectral Sailor").zone).toBe("hand");
  });

  test(`ACT-SRC03 ${mode}: actual flash bounce/recast creates new source incarnation; old self effect cannot reattach`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Masked Blackguard"],
      "Tobias Andrion",
      ["Repulse"],
      mode,
    );
    const original = permanent(f, "A", "Masked Blackguard");
    const ability = activate(f, "A", "Masked Blackguard", "{2}{B}");
    cast(f, "B", "Repulse", original);
    resolve(f);
    const replacement = permanent(f, "A", "Masked Blackguard");
    expect(replacement).not.toBe(original);
    resolve(f);
    expectResolved(f, ability.id);
    expect(f.state.continuousEffects).toHaveLength(0);
    expect(characteristics(f.state, f.registry, replacement)).toMatchObject({
      power: 2,
      toughness: 1,
    });
  });
  test(`ACT-SRC05 ${mode}: target effect survives source departure but cannot follow a bounced/recast flash target`, async () => {
    for (const removed of ["Wyluli Wolf", "Darksteel Sentinel"]) {
      const f = await fixture(
        "Jasmine Boreal",
        ["Wyluli Wolf", "Darksteel Sentinel"],
        "Tobias Andrion",
        ["Repulse"],
        mode,
      );
      const wolf = permanent(f, "A", "Wyluli Wolf"),
        sentinel = permanent(f, "A", "Darksteel Sentinel");
      nextTurn(f, "A");
      const ability = activate(f, "A", "Wyluli Wolf", "", sentinel);
      cast(f, "B", "Repulse", removed === "Wyluli Wolf" ? wolf : sentinel);
      resolve(f);
      if (removed === "Darksteel Sentinel") {
        const replacement = permanent(f, "A", "Darksteel Sentinel");
        expect(replacement).not.toBe(sentinel);
        resolve(f);
        expect(
          f.state.events.find((event) => event.type === "ActivatedAbilityDidNotResolve")?.data
            .ability,
        ).toBe(ability.id);
        expect(characteristics(f.state, f.registry, replacement).power).toBe(3);
        expect(f.state.objects[wolf]?.tapped).toBe(true);
      } else {
        resolve(f);
        expectResolved(f, ability.id);
        expect(characteristics(f.state, f.registry, sentinel)).toMatchObject({
          power: 4,
          toughness: 4,
        });
      }
    }
  });

  test(`ACT-SRC07/29 ${mode}: self-shroud resolves untargeted and makes an already-paid opposing ability illegal`, async () => {
    const f = await fixture(
      "Tobias Andrion",
      ["Glimmering Angel"],
      "Tobias Andrion",
      ["Trip Noose", "Counterspell"],
      mode,
    );
    const angel = permanent(f, "A", "Glimmering Angel");
    main(f, "B");
    permanent(f, "B", "Trip Noose");
    const lower = activate(f, "B", "Trip Noose", "{2}", angel);
    const upper = activate(f, "A", "Glimmering Angel", "{U}");
    expect(upper.target).toBeNull();
    resolve(f);
    expectResolved(f, upper.id);
    expect(characteristics(f.state, f.registry, angel).keywords).toContain("shroud");
    resolve(f);
    expect(
      f.state.events.find((event) => event.type === "ActivatedAbilityDidNotResolve")?.data.ability,
    ).toBe(lower.id);
    expect(f.state.objects[angel]?.tapped).toBe(false);
    const repeat = activate(f, "A", "Glimmering Angel", "{U}");
    expect(repeat.id).not.toBe(upper.id);
    answer(f, { kind: "pass" });
    expect(observe(f.state, f.registry, "B").decision?.kind).toBe("priority");
    expect(observe(f.state, f.registry, "B").decision?.cards).not.toContain(
      owned(f, "B", "Counterspell").id,
    );
    resolve(f);
  });

  test(`ACT-SRC08 ${mode}: hexproof rejects an opponent's pending target but permits its controller's ordinary ability`, async () => {
    const f = await fixture(
      "Sivitri Scarzam",
      ["Horror of the Dim", "Rathi Trapper"],
      "Tobias Andrion",
      ["Trip Noose"],
      mode,
    );
    const horror = permanent(f, "A", "Horror of the Dim");
    permanent(f, "A", "Rathi Trapper");
    main(f, "B");
    permanent(f, "B", "Trip Noose");
    const lower = activate(f, "B", "Trip Noose", "{2}", horror);
    activate(f, "A", "Horror of the Dim", "{U}");
    resolve(f);
    resolve(f);
    expect(
      f.state.events.find((event) => event.type === "ActivatedAbilityDidNotResolve")?.data.ability,
    ).toBe(lower.id);
    // The creature-tap source has been under A's control since the previous turn began.
    main(f, "A");
    activate(f, "A", "Horror of the Dim", "{U}");
    resolve(f);
    activate(f, "A", "Rathi Trapper", "{B}", horror);
    resolve(f);
    expect(f.state.objects[horror]?.tapped).toBe(true);
  });

  test(`ACT-SRC27 ${mode}: draw2 attempts individual draws and loses only after the ability finishes`, async () => {
    const f = await fixture("Tobias Andrion", ["Mystic Archaeologist"], "Jasmine Boreal", [], mode);
    permanent(f, "A", "Mystic Archaeologist");
    // Explicit edge precondition: one card left, using real inventory zone moves; not an ordinary full game.
    const library = [...player(f.state, "A").library];
    for (const id of library.slice(1)) move(f.state, id, "exile", "constructed one-card library");
    givePriority(f.state, f.registry, "A");
    assertInvariants(f.state, f.registry);
    const ability = activate(f, "A", "Mystic Archaeologist", "{3}{U}{U}");
    resolve(f);
    const completion = f.state.events.findIndex(
      (event) => event.type === "ActivatedAbilityResolved" && event.data.ability === ability.id,
    );
    const loss = f.state.events.findIndex((event) => event.type === "PlayersLostBatch");
    expect(completion).toBeGreaterThanOrEqual(0);
    expect(player(f.state, "A").lost).toBe(true);
    expect(loss).toBeGreaterThan(completion);
    expect(f.state.events.filter((event) => event.type === "CardDrawn")).toHaveLength(1);
    expect(f.state.activatedAbilities?.[ability.id]).toBeUndefined();
  });

  test(`ACT-SRC31 ${mode}: pending source, target, cost and payment domains reject tampering before dispatch`, async () => {
    const f = await fixture("Tobias Andrion", ["Blinding Mage"], "Jasmine Boreal", [], mode);
    const source = permanent(f, "A", "Blinding Mage");
    nextTurn(f, "A");
    const id = announced(f, source);
    for (const mutate of [
      (g: ActivationSourceFixture) => {
        const a = g.state.activatedAbilities?.[id];
        if (a) a.program.cost.tapSource = false;
      },
      (g: ActivationSourceFixture) => {
        const a = g.state.activatedAbilities?.[id];
        if (a) a.source.generation++;
      },
      (g: ActivationSourceFixture) => {
        const a = g.state.activatedAbilities?.[id];
        if (a) a.controller = "B";
      },
      (g: ActivationSourceFixture) => {
        if (g.state.decision) g.state.decision.cards = [];
      },
    ]) {
      const g = { ...f, state: structuredClone(f.state) };
      mutate(g);
      const result = transition(g.state, command(g, { kind: "cancel-activation" }), g.registry);
      expect(result.status).toBe("fault");
    }
    const before = canonicalJson(f.state),
      wrong = { ...command(f, { kind: "cancel-activation" }), revision: f.state.revision - 1 };
    expect(transition(f.state, wrong, f.registry).status).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(before);
  });
}
