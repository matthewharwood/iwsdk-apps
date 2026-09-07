import { expect, test } from "bun:test";
import { canonicalJson, type GameEvent } from "@iwsdk-apps/contracts";
import { observe } from "../../engine/src/index";
import {
  type ActivationSourceFixture,
  activationSourceActivate as activate,
  activationSourceCard as card,
  activationSourceCast as cast,
  activationSourceFixture as fixture,
  activationSourceMain as main,
  activationSourcePermanent as permanent,
  activationSourceResolve as resolve,
} from "../../engine/test-fixtures/activation-source";
import { continuousEvidence } from "./spell-evidence";

// Actual source executions from explicitly selected legal hands/basic lands. The
// helper receives real accepted event batches, not a fabricated durable archive.
function evidence(f: ActivationSourceFixture, records = f.history) {
  return continuousEvidence(
    { records },
    { current: () => f.state, view: (actor: string) => observe(f.state, f.registry, actor) },
  );
}
function resolved(records: { events: GameEvent[] }[], type: string) {
  const row = records.find((record) =>
    record.events.some(
      (event) =>
        event.type === type &&
        record.events.some((other) => other.type === "ContinuousEffectCreated"),
    ),
  );
  const event = row?.events.find((entry) => entry.type === type);
  if (!row || !event) throw new Error(`Missing actual ${type} batch`);
  return { row, event };
}
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`${mode}: exact paid activation and spell sources both qualify their subsequently created modifiers`, async () => {
    const f = await fixture(
      "Tuknir Deathlock",
      ["Shivan Dragon", "Giant Growth"],
      "Tobias Andrion",
      [],
      mode,
    );
    const source = permanent(f, "A", "Shivan Dragon");
    activate(f, "A", "Shivan Dragon", "{R}");
    resolve(f);
    activate(f, "A", "Shivan Dragon", "{R}");
    resolve(f);
    cast(f, "A", "Giant Growth", source);
    resolve(f);
    const before = canonicalJson({ state: f.state, history: f.history });
    const value = evidence(f);
    expect(value.created).toEqual({ [card("Shivan Dragon").id]: 2, [card("Giant Growth").id]: 1 });
    expect(value.active).toHaveLength(3);
    expect(value.active.filter((effect) => effect.activation)).toHaveLength(2);
    expect(canonicalJson({ state: f.state, history: f.history })).toBe(before);
    const mutants: [string, (records: typeof f.history) => void][] = [
      [
        "missing activation completion",
        (rows) => {
          const { row, event } = resolved(rows, "ActivatedAbilityResolved");
          row.events.splice(row.events.indexOf(event), 1);
        },
      ],
      [
        "failed activation is not resolution",
        (rows) => {
          resolved(rows, "ActivatedAbilityResolved").event.type = "ActivatedAbilityDidNotResolve";
        },
      ],
      [
        "wrong activated source",
        (rows) => {
          resolved(rows, "ActivatedAbilityResolved").event.data.source = "wrong-source@1";
        },
      ],
      [
        "wrong activated definition",
        (rows) => {
          resolved(rows, "ActivatedAbilityResolved").event.data.definition =
            card("Giant Growth").id;
        },
      ],
      [
        "wrong occurrence",
        (rows) => {
          resolved(rows, "ActivatedAbilityResolved").event.data.ability = "wrong-ability";
        },
      ],
      [
        "wrong program",
        (rows) => {
          resolved(rows, "ActivatedAbilityResolved").event.data.program = "wrong-program";
        },
      ],
      [
        "wrong captured controller",
        (rows) => {
          resolved(rows, "ActivatedAbilityResolved").event.data.controller = "B";
        },
      ],
      [
        "resolution before creation",
        (rows) => {
          const { row, event } = resolved(rows, "ActivatedAbilityResolved");
          row.events.splice(row.events.indexOf(event), 1);
          row.events.unshift(event);
        },
      ],
      [
        "unpaid occurrence",
        (rows) => {
          const row = rows.find((r) => r.events.some((e) => e.type === "AbilityActivated"));
          if (!row) throw new Error("Missing payment");
          row.events = row.events.filter((e) => e.type !== "AbilityActivated");
        },
      ],
      [
        "spell wrong source",
        (rows) => {
          resolved(rows, "SpellResolved").event.data.source = "wrong-spell@1";
        },
      ],
      [
        "spell wrong definition",
        (rows) => {
          resolved(rows, "SpellResolved").event.data.definition = card("Shivan Dragon").id;
        },
      ],
      [
        "spell resolution before creation",
        (rows) => {
          const { row, event } = resolved(rows, "SpellResolved");
          row.events.splice(row.events.indexOf(event), 1);
          row.events.unshift(event);
        },
      ],
    ];
    for (const [, mutate] of mutants) {
      const rows = structuredClone(f.history);
      mutate(rows);
      expect(() => evidence(f, rows)).toThrow();
    }
  });
  for (const targetLeaves of [false, true]) {
    test(`${mode}: source departure ${targetLeaves ? "fizzles the exact targeted occurrence without counting it" : "preserves a resolved captured ability's independent target modifier"}`, async () => {
      const f = await fixture(
        "Jasmine Boreal",
        ["Wyluli Wolf", "Memnite"],
        "Tobias Andrion",
        ["Repulse"],
        mode,
      );
      const source = permanent(f, "A", "Wyluli Wolf"),
        target = permanent(f, "A", "Memnite");
      main(f, "B");
      main(f, "A");
      activate(f, "A", "Wyluli Wolf", "", targetLeaves ? source : target);
      cast(f, "B", "Repulse", source);
      resolve(f);
      resolve(f);
      expect(f.state.objects[source]).toBeUndefined();
      const result = evidence(f);
      expect(result.created).toEqual(targetLeaves ? {} : { [card("Wyluli Wolf").id]: 1 });
      expect(result.active).toHaveLength(targetLeaves ? 0 : 1);
      expect(result.absentSources).toEqual(targetLeaves ? [] : [source]);
      expect(
        f.state.events.some(
          (e) =>
            e.type ===
            (targetLeaves ? "ActivatedAbilityDidNotResolve" : "ActivatedAbilityResolved"),
        ),
      ).toBe(true);
    });
  }
}
