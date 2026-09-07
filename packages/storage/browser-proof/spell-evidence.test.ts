import { expect, test } from "bun:test";
import { type ContinuousEffect, canonicalJson } from "../../contracts/src/index";
import { definition, move } from "../../engine/src/common";
import { expireTurnEffects } from "../../engine/src/continuous";
import { observe } from "../../engine/src/index";
import { enterBattlefield } from "../../engine/src/triggers";
import { cast, resolveOne } from "../../engine/test-fixtures/counterspells";
import { enter, staticFixture } from "../../engine/test-fixtures/static-bonus";
import {
  staticSourceCast,
  staticSourceFixture,
  staticSourceResolve,
} from "../../engine/test-fixtures/static-bonus-source";

import { atProofStage } from "./spell-evidence";

function temporary(withStatic = false) {
  // Explicit constructed board/hand/mana preconditions. The effect is then created
  // through ordinary announce, target, payment and resolution commands.
  const f = staticFixture();
  if (withStatic) enter(f, "enchantment-creature");
  const target = enter(f, "creature");
  definition(f.registry, "draw-spell").spellProgram = {
    schema: "commander-spell/1",
    target: "creature",
    effects: [
      {
        kind: "modify-creature",
        powerDelta: 3,
        toughnessDelta: 3,
        keywords: [],
        duration: "until-end-of-turn",
      },
    ],
  };
  cast(f, "A", "draw-spell", target);
  resolveOne(f);
  expect(f.state.continuousEffects).toHaveLength(1);
  return { ...f, target };
}
function qualifies(
  f: ReturnType<typeof temporary>,
  effects: readonly ContinuousEffect[] = f.state.continuousEffects,
) {
  return atProofStage(
    observe(f.state, f.registry, "A"),
    "active-modifier",
    f.state.events,
    undefined,
    effects,
  );
}

test("actual Gaea's Anthem source bonus alone does not qualify as a temporary modifier", async () => {
  const f = await staticSourceFixture("Jasmine Boreal", ["Gaea's Anthem", "Humble Budoka"]);
  for (const name of ["Humble Budoka", "Gaea's Anthem"]) {
    staticSourceCast(f, "A", name);
    staticSourceResolve(f);
  }
  const view = observe(f.state, f.registry, "A");
  expect(f.state.continuousEffects).toHaveLength(0);
  expect(atProofStage(view, "active-static", f.state.events, f.release)).toBe(true);
  expect(
    atProofStage(view, "active-modifier", f.state.events, f.release, f.state.continuousEffects),
  ).toBe(false);
});
for (const withStatic of [false, true]) {
  test(`ordinary resolved temporary modifier qualifies with static provider=${withStatic}`, () => {
    const f = temporary(withStatic);
    const before = canonicalJson(f.state);
    const view = observe(f.state, f.registry, "A");
    expect(view.objects.find((object) => object.id === f.target)?.characteristics.power).toBe(
      withStatic ? 5 : 4,
    );
    expect(qualifies(f)).toBe(true);
    // Omitting privileged evidence must fail closed even with a derived P/T difference.
    expect(atProofStage(view, "active-modifier", f.state.events)).toBe(false);
    expect(canonicalJson(f.state)).toBe(before);
    expect("continuousEffects" in view).toBe(false);
  });
}

test("a source in its graveyard does not invalidate its still-active fixed target effect", () => {
  const f = temporary();
  const effect = f.state.continuousEffects[0];
  if (!effect) throw new Error("Expected an ordinarily resolved modifier");
  expect(f.state.objects[effect.source.id]).toBeUndefined();
  expect(qualifies(f)).toBe(true);
});

test("an expired earlier-turn checkpoint effect cannot qualify", () => {
  const f = temporary();
  f.state.turn += 1; // Deliberately malformed stale checkpoint input to the host predicate.
  expect(qualifies(f)).toBe(false);
});

test("cleanup removal prevents qualification even while a static provider still changes power", () => {
  const f = temporary(true);
  expireTurnEffects(f.state);
  expect(f.state.continuousEffects).toHaveLength(0);
  expect(
    observe(f.state, f.registry, "A").objects.find((object) => object.id === f.target)
      ?.characteristics.power,
  ).toBe(2);
  expect(qualifies(f)).toBe(false);
});

for (const zone of ["hand", "graveyard", "exile", "library", "command", "stack"] as const) {
  test(`a departed affected object cannot qualify from ${zone}`, () => {
    const f = temporary();
    const departed = move(f.state, f.target, zone, "constructed host predicate departure");
    expect(f.state.continuousEffects[0]?.affectedObject).not.toBe(departed.id);
    expect(qualifies(f)).toBe(false);
    // Even fabricated matching zone IDs must not turn off-battlefield objects into evidence.
    const forged = structuredClone(f.state.continuousEffects);
    const effect = forged[0];
    if (!effect) throw new Error("Expected an ordinarily resolved modifier");
    effect.affectedObject = departed.id;
    expect(qualifies(f, forged)).toBe(false);
  });
}

test("same physical lineage returning with a fresh generation cannot inherit a prior modifier witness", () => {
  const f = temporary(true);
  const hand = move(f.state, f.target, "hand", "constructed host predicate reentry");
  const [fresh] = enterBattlefield(
    f.state,
    f.registry,
    [{ objectId: hand.id, controller: "A" }],
    "constructed reentry",
  );
  expect(fresh).not.toBe(f.target);
  expect(f.state.continuousEffects[0]?.affectedObject).toBe(f.target);
  expect(qualifies(f)).toBe(false);
});

test("the host requires a priority boundary and a visible exact affected creature", () => {
  const f = temporary();
  const view = observe(f.state, f.registry, "A");
  expect(
    atProofStage(
      { ...view, decision: null },
      "active-modifier",
      [],
      undefined,
      f.state.continuousEffects,
    ),
  ).toBe(false);
  expect(
    atProofStage(
      { ...view, objects: [] },
      "active-modifier",
      [],
      undefined,
      f.state.continuousEffects,
    ),
  ).toBe(false);
});
