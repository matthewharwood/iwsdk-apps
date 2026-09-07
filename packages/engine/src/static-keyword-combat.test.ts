import { expect, test } from "bun:test";
import { emptyMana, type Keyword } from "@iwsdk-apps/contracts";
import { announce, answer, command, locate, resolveOne } from "../test-fixtures/counterspells";
import { enter, replaceDefinition } from "../test-fixtures/static-bonus";
import { grant, keywordFixture } from "../test-fixtures/static-keywords";
import { characteristics } from "./characteristics";
import { definition, move, object, player } from "./common";
import { transition } from "./index";

// Constructed100-card inventories with declared battlefield/hand/basic-land
// preconditions. All later casts, payments, combat, priority and cleanup use
// ordinary commands. These are not authenticated card executions/full games.
type F = ReturnType<typeof keywordFixture>;
function fixture(mode: F["state"]["manifest"]["resolver"]) {
  const f = keywordFixture(mode);
  for (const actor of ["A", "B"])
    for (const land of Object.values(f.state.objects)
      .filter((o) => o.owner === actor && o.definition === "land")
      .slice(0, 10))
      move(f.state, land.id, "battlefield", "constructed combat basic land");
  return f;
}
function ready(f: F, id: string, actor = "A") {
  const objectId = enter(f, id, actor);
  object(f.state, objectId).controlledSinceTurn = 0;
  return objectId;
}
function passes(f: F, count = 2) {
  for (let i = 0; i < count; i++) answer(f, { kind: "pass" });
}
function cast(f: F, actor: string, id: string, target?: string) {
  const source = announce(f, actor, id);
  if (target !== undefined) answer(f, { kind: "target", target });
  const decision = f.state.decision;
  if (decision?.kind !== "payment" || decision.cost?.generic !== 1)
    throw new Error("Expected constructed generic1 source");
  const land = decision.manaSources.find((s) => s.colors.includes("U"));
  if (!land) throw new Error("No ordinary untapped payment land");
  answer(f, {
    kind: "payment",
    sources: [{ object: land.object, color: "U" }],
    spend: { ...emptyMana(), U: 1 },
  });
  return source;
}
function bounce(f: F, actor: string, source: string) {
  definition(f.registry, "draw-spell").spellProgram = {
    schema: "commander-spell/1",
    target: "creature",
    effects: [{ kind: "return-to-hand" }],
  };
  cast(f, actor, "draw-spell", source);
  resolveOne(f);
}
function blocks(
  f: F,
  attackers: string[],
  assignment: { attacker: string; blocker: string }[] = [],
) {
  passes(f, 4);
  expect(f.state.decision?.kind).toBe("attack");
  answer(f, {
    kind: "attack",
    attacks: attackers.map((attacker) => ({ attacker, defender: "B" })),
  });
  passes(f);
  answer(f, { kind: "block", blocks: assignment });
}

for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  for (const granted of ["first-strike", "double-strike"] as const) {
    test(`${mode}: losing static ${granted} after first-step damage respects participation history`, () => {
      const f = fixture(mode);
      replaceDefinition(f, "protected-creature", { staticKeywordPrograms: [grant({}, [granted])] });
      const provider = ready(f, "protected-creature"),
        attacker = ready(f, "creature");
      blocks(f, [attacker]);
      passes(f);
      expect(f.state.step).toBe("first-strike-damage");
      answer(f, { kind: "damage", allocations: [{ source: attacker, target: "B", amount: 2 }] });
      expect(f.state.combat.firstStrikeParticipants).toContain(attacker);
      expect(player(f.state, "B").life).toBe(38);
      bounce(f, "B", provider);
      passes(f);
      expect(f.state.step).toBe("combat-damage");
      expect(f.state.decision?.kind).toBe("priority");
      expect(player(f.state, "B").life).toBe(38);
    });
  }
  test(`${mode}: intrinsic double strike remains after a separate first-strike provider departs`, () => {
    const f = fixture(mode);
    replaceDefinition(f, "protected-creature", {
      staticKeywordPrograms: [grant({}, ["first-strike"])],
    });
    replaceDefinition(f, "creature", { keywords: ["double-strike"] });
    const provider = ready(f, "protected-creature"),
      attacker = ready(f, "creature");
    blocks(f, [attacker]);
    passes(f);
    answer(f, { kind: "damage", allocations: [{ source: attacker, target: "B", amount: 2 }] });
    bounce(f, "B", provider);
    passes(f);
    expect(f.state.step).toBe("combat-damage");
    answer(f, { kind: "damage", allocations: [{ source: attacker, target: "B", amount: 2 }] });
    expect(player(f.state, "B").life).toBe(36);
  });
  test(`${mode}: a late static first-strike grant does not deprive an original ordinary attacker of its damage`, () => {
    const f = fixture(mode);
    replaceDefinition(f, "protected-creature", {
      keywords: ["flash"],
      staticKeywordPrograms: [grant({}, ["first-strike"])],
    });
    replaceDefinition(f, "artifact-creature", { keywords: ["first-strike"] });
    const ordinary = ready(f, "creature"),
      early = ready(f, "artifact-creature");
    blocks(f, [ordinary, early]);
    passes(f);
    answer(f, { kind: "damage", allocations: [{ source: early, target: "B", amount: 2 }] });
    cast(f, "A", "protected-creature");
    resolveOne(f);
    passes(f);
    expect(f.state.step).toBe("combat-damage");
    answer(f, { kind: "damage", allocations: [{ source: ordinary, target: "B", amount: 2 }] });
    expect(player(f.state, "B").life).toBe(36);
  });
  for (const removal of ["none", "deathtouch", "lifelink"] as const) {
    test(`${mode}: current static trample/deathtouch/lifelink at damage, remove=${removal}`, () => {
      const f = fixture(mode);
      replaceDefinition(f, "protected-creature", {
        staticKeywordPrograms: [grant({}, ["deathtouch"])],
      });
      replaceDefinition(f, "enchantment-creature", {
        staticKeywordPrograms: [grant({ subtype: null }, ["trample"])],
      });
      delete definition(f.registry, "trigger-creature").triggerPrograms;
      replaceDefinition(f, "trigger-creature", {
        staticKeywordPrograms: [grant({ subtype: null }, ["lifelink"])],
      });
      replaceDefinition(f, "creature", { power: 5, toughness: 5 });
      replaceDefinition(f, "artifact-creature", { power: 4, toughness: 4 });
      const dt = ready(f, "protected-creature"),
        life = ready(f, "trigger-creature"),
        attacker = ready(f, "creature"),
        blocker = ready(f, "artifact-creature", "B");
      ready(f, "enchantment-creature");
      blocks(f, [attacker], [{ attacker, blocker }]);
      if (removal !== "none") bounce(f, "B", removal === "deathtouch" ? dt : life);
      passes(f);
      const split = {
        kind: "damage" as const,
        allocations: [
          { source: attacker, target: blocker, amount: 1 },
          { source: attacker, target: "B", amount: 4 },
        ],
      };
      if (removal === "deathtouch") {
        expect(transition(f.state, command(f, split), f.registry).status).toBe("rejected");
        answer(f, {
          kind: "damage",
          allocations: [
            { source: attacker, target: blocker, amount: 4 },
            { source: attacker, target: "B", amount: 1 },
          ],
        });
      } else answer(f, split);
      answer(f, {
        kind: "damage",
        allocations: [{ source: blocker, target: attacker, amount: 4 }],
      });
      expect(player(f.state, "A").life).toBe(removal === "lifelink" ? 40 : 45);
      expect(player(f.state, "B").life).toBe(removal === "deathtouch" ? 39 : 36);
      expect(f.state.objects[blocker]).toBeUndefined();
      expect(f.state.objects[attacker]?.damage).toBe(4);
    });
  }
  test(`${mode}: simultaneous granted lifelink saves a defender at2 even when its provider dies in that batch`, () => {
    const f = fixture(mode);
    replaceDefinition(f, "protected-creature", {
      staticKeywordPrograms: [grant({ excludeSource: true }, ["lifelink"])],
    });
    replaceDefinition(f, "enchantment-creature", { power: 5, toughness: 5 });
    const unblocked = ready(f, "creature"),
      small = ready(f, "artifact-creature"),
      large = ready(f, "enchantment-creature");
    const lifelinker = ready(f, "creature", "B"),
      provider = ready(f, "protected-creature", "B");
    player(f.state, "B").life = 2;
    blocks(
      f,
      [unblocked, small, large],
      [
        { attacker: small, blocker: lifelinker },
        { attacker: large, blocker: provider },
      ],
    );
    passes(f);
    answer(f, {
      kind: "damage",
      allocations: [
        { source: unblocked, target: "B", amount: 2 },
        { source: small, target: lifelinker, amount: 2 },
        { source: large, target: provider, amount: 5 },
      ],
    });
    answer(f, {
      kind: "damage",
      allocations: [
        { source: lifelinker, target: small, amount: 2 },
        { source: provider, target: large, amount: 5 },
      ],
    });
    expect(player(f.state, "B").life).toBe(2);
    expect(player(f.state, "B").lost).toBe(false);
    expect(locate(f, "B", "protected-creature").zone).toBe("graveyard");
    expect(f.state.outcome.kind).toBe("ongoing");
  });
  test(`${mode}: actual cleanup clears temporary grant and damage together while preserving the live static grant`, () => {
    const f = fixture(mode);
    const provider = ready(f, "protected-creature"),
      target = ready(f, "creature");
    replaceDefinition(f, "draw-spell", {
      spellProgram: {
        schema: "commander-spell/1",
        target: "creature",
        effects: [
          {
            kind: "modify-creature",
            powerDelta: 0,
            toughnessDelta: 0,
            keywords: ["flying"],
            duration: "until-end-of-turn",
          },
        ],
      },
    });
    cast(f, "A", "draw-spell", target);
    resolveOne(f);
    object(f.state, target).damage = 2;
    const before = f.state.turn;
    for (let step = 0; step < 100 && f.state.turn === before; step++) {
      const decision = f.state.decision;
      if (decision?.kind === "priority") answer(f, { kind: "pass" });
      else if (decision?.kind === "attack") answer(f, { kind: "attack", attacks: [] });
      else if (decision?.kind === "discard")
        answer(f, { kind: "discard", cards: decision.cards.slice(0, decision.count) });
      else throw new Error(`Unexpected cleanup path: ${decision?.kind}`);
    }
    expect(f.state.turn).toBeGreaterThan(before);
    expect(f.state.continuousEffects).toEqual([]);
    expect(object(f.state, target).damage).toBe(0);
    expect(characteristics(f.state, f.registry, target).keywords).toEqual(["indestructible"]);
    bounce(f, "B", provider);
    expect(characteristics(f.state, f.registry, target).keywords).toEqual([] as Keyword[]);
    expect(f.state.objects[target]?.zone).toBe("battlefield");
  });
}
