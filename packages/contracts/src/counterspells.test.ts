import { expect, test } from "bun:test";
import { SpellProgram } from "./index";

for (const target of ["spell", "creature-spell", "noncreature-spell"] as const)
  test(`${target}: exact counter program is serializable and excludes unsupported combinations`, () => {
    const source = {
      schema: "commander-spell/1" as const,
      target,
      effects: [{ kind: "counter" as const }],
    };
    expect(SpellProgram.parse(source)).toEqual(source);
    expect(
      SpellProgram.safeParse({ ...source, effects: [{ kind: "damage", amount: 2 }] }).success,
    ).toBe(false);
    expect(
      SpellProgram.safeParse({
        ...source,
        effects: [...source.effects, { kind: "draw", recipient: "controller", amount: 1 }],
      }).success,
    ).toBe(false);
    expect(
      SpellProgram.safeParse({ ...source, effects: [{ kind: "counter", destination: "exile" }] })
        .success,
    ).toBe(false);
  });
for (const target of [null, "player", "creature", "ability"])
  test(`counter effect rejects unsupported target ${target}`, () => {
    expect(
      SpellProgram.safeParse({
        schema: "commander-spell/1",
        target,
        effects: [{ kind: "counter" }],
      }).success,
    ).toBe(false);
  });
