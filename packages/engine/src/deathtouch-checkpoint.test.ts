import { expect, test } from "bun:test";
import { cast, locate, resolveOne } from "../test-fixtures/counterspells";
import { enter, replaceDefinition } from "../test-fixtures/static-bonus";
import { keywordFixture } from "../test-fixtures/static-keywords";
import { checkpoint } from "./checkpoints";
import { definition, move, object } from "./common";

// CR704.5h: the deathtouch condition is damage since the last SBA check, unlike
// marked damage, which normally remains through cleanup. Synthetic complete
// programs/board preconditions, not authenticated source-card executions.
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`${mode}: protected nonlethal deathtouch expires at its actual check before a later grant departure`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "creature", { power: 3, toughness: 3 });
    replaceDefinition(f, "draw-spell", {
      keywords: ["deathtouch"],
      spellProgram: {
        schema: "commander-spell/1",
        target: "creature",
        effects: [{ kind: "damage", amount: 1 }],
      },
    });
    const source = enter(f, "protected-creature"),
      target = enter(f, "creature");
    cast(f, "B", "draw-spell", target);
    resolveOne(f);
    expect(f.state.objects[target]?.damage).toBe(1);
    expect(f.state.objects[target]?.deathtouchDamage).toBe(false);
    move(f.state, source, "exile", "constructed later grant departure");
    checkpoint(f.state, f.registry);
    expect(f.state.objects[target]?.zone).toBe("battlefield");
    expect(f.state.objects[target]?.damage).toBe(1);
  });
  test(`${mode}: grant loss before the first deathtouch check still destroys a nonlethally damaged creature`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "creature", { power: 3, toughness: 3 });
    const source = enter(f, "protected-creature"),
      target = enter(f, "creature");
    object(f.state, target).damage = 1;
    object(f.state, target).deathtouchDamage = true;
    move(f.state, source, "exile", "constructed departure before the first check");
    checkpoint(f.state, f.registry);
    expect(locate(f, "A", "creature").zone).toBe("graveyard");
    expect(f.state.coverage["rule:704.5h"]).toBe(1);
  });
  test(`${mode}: source zero-toughness death at a protected check cannot reactivate expired nonlethal deathtouch on the next SBA pass`, () => {
    const f = keywordFixture(mode);
    replaceDefinition(f, "creature", { power: 3, toughness: 3 });
    const source = enter(f, "protected-creature"),
      target = enter(f, "creature");
    object(f.state, source).counters["-1/-1"] = 5;
    object(f.state, target).damage = 1;
    object(f.state, target).deathtouchDamage = true;
    checkpoint(f.state, f.registry);
    expect(locate(f, "A", "protected-creature").zone).toBe("graveyard");
    expect(f.state.objects[target]?.zone).toBe("battlefield");
    expect(f.state.objects[target]?.deathtouchDamage).toBe(false);
    expect(definition(f.registry, "creature").toughness).toBe(3);
  });
}
