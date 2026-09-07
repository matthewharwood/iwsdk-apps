import { expect, test } from "bun:test";
import { heuristicDriver } from "../../simulation/src/driver";
import { fixture, put } from "../test-fixtures/blocking-unit";
import {
  answerAttack,
  answerBlock,
  assertBlockingDecision,
  damageDomain,
  startAttackDeclaration,
  startBlockDeclarations,
} from "./combat";
import { observe } from "./index";

// Source: CR4381ad1b… (2026-08-07), 509.1b,702.13b,14c–d,28b,31b,36b,118b.
// Explicit isolated board scenarios, not authentic source cards or full-game evidence.
function present<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing scenario value");
  return value;
}

type Options = NonNullable<Parameters<typeof put>[4]>;
const cases: [string, Options, Options, boolean][] = [
  ["fear rejects a white creature", { keywords: ["fear"] }, { colors: ["W"] }, false],
  ["fear permits a black creature", { keywords: ["fear"] }, { colors: ["B"] }, true],
  [
    "fear permits a white artifact creature",
    { keywords: ["fear"] },
    { colors: ["W"], types: ["Artifact", "Creature"] },
    true,
  ],
  [
    "intimidate compares every attacker color",
    { keywords: ["intimidate"], colors: ["R", "G"] },
    { colors: ["G", "W"] },
    true,
  ],
  [
    "intimidate rejects disjoint colors",
    { keywords: ["intimidate"], colors: ["R"] },
    { colors: ["G"] },
    false,
  ],
  [
    "colorless creatures share no color",
    { keywords: ["intimidate"], colors: [] },
    { colors: [] },
    false,
  ],
  [
    "intimidate permits colorless artifacts",
    { keywords: ["intimidate"], colors: [] },
    { colors: [], types: ["Artifact", "Creature"] },
    true,
  ],
  ["horse blocks horse", { keywords: ["horsemanship"] }, { keywords: ["horsemanship"] }, true],
  [
    "flying does not block horsemanship",
    { keywords: ["horsemanship"] },
    { keywords: ["flying"] },
    false,
  ],
  [
    "reach does not block horsemanship",
    { keywords: ["horsemanship"] },
    { keywords: ["reach"] },
    false,
  ],
  ["horse can block plain ground", {}, { keywords: ["horsemanship"] }, true],
  ["shadow blocks shadow", { keywords: ["shadow"] }, { keywords: ["shadow"] }, true],
  ["shadow attacker rejects plain blocker", { keywords: ["shadow"] }, {}, false],
  ["shadow blocker cannot block plain attacker", {}, { keywords: ["shadow"] }, false],
  [
    "shadow does not bypass flying",
    { keywords: ["shadow", "flying"] },
    { keywords: ["shadow"] },
    false,
  ],
  [
    "shadow and reach satisfy both restrictions",
    { keywords: ["shadow", "flying"] },
    { keywords: ["shadow", "reach"] },
    true,
  ],
  [
    "horse does not bypass flying",
    { keywords: ["horsemanship", "flying"] },
    { keywords: ["horsemanship"] },
    false,
  ],
  ["skulk permits equal power", { keywords: ["skulk"], power: 2 }, { power: 2 }, true],
  ["skulk permits smaller power", { keywords: ["skulk"], power: 2 }, { power: 1 }, true],
  ["skulk rejects greater power", { keywords: ["skulk"], power: 2 }, { power: 3 }, false],
  ["skulk compares negative power", { keywords: ["skulk"], power: -2 }, { power: -1 }, false],
  [
    "cannot-block overrides matching flying",
    { keywords: ["flying"] },
    { keywords: ["flying"], blockingRestrictions: ["cannot-block"] },
    false,
  ],
  [
    "cannot-be-blocked overrides matching shadow",
    { keywords: ["shadow"], blockingRestrictions: ["cannot-be-blocked"] },
    { keywords: ["shadow"] },
    false,
  ],
  [
    "flying-only blocker rejects ground",
    {},
    { keywords: ["flying"], blockingRestrictions: ["blocks-only-flying"] },
    false,
  ],
  [
    "flying-only still needs flying or reach",
    { keywords: ["flying"] },
    { blockingRestrictions: ["blocks-only-flying"] },
    false,
  ],
  [
    "flying-only and reach can block a flyer",
    { keywords: ["flying"] },
    { keywords: ["reach"], blockingRestrictions: ["blocks-only-flying"] },
    true,
  ],
];

function declare(attacker: Options = {}, blocker: Options = {}, seats: 2 | 4 = 2) {
  const setup = fixture(seats);
  put(setup.state, setup.release, "attacker", "A", attacker);
  put(setup.state, setup.release, "blocker", "B", blocker);
  startAttackDeclaration(setup.state, setup.release);
  answerAttack(setup.state, setup.release, "A", {
    kind: "attack",
    attacks: [{ attacker: "attacker", defender: "B" }],
  });
  startBlockDeclarations(setup.state, setup.release);
  return setup;
}

function assertBlock(setup: ReturnType<typeof declare>, legal: boolean) {
  const { state, release } = setup;
  expect(state.decision?.blockDomain?.[0]?.blockers.includes("blocker")).toBe(legal);
  const before = JSON.stringify(state);
  const act = () =>
    answerBlock(state, release, "B", {
      kind: "block",
      blocks: [{ attacker: "attacker", blocker: "blocker" }],
    });
  if (legal) {
    expect(act).not.toThrow();
    expect(state.combat.blocked).toContain("attacker");
    expect(state.events.at(-1)?.type).toBe("BlockersDeclared");
  } else {
    expect(act).toThrow();
    expect(JSON.stringify(state)).toBe(before);
    expect(() => answerBlock(state, release, "B", { kind: "block", blocks: [] })).not.toThrow();
  }
}

for (const [name, attacker, blocker, legal] of cases)
  test(name, () => assertBlock(declare(attacker, blocker), legal));

for (const [keyword, subtype] of [
  ["plainswalk", "Plains"],
  ["islandwalk", "Island"],
  ["swampwalk", "Swamp"],
  ["mountainwalk", "Mountain"],
  ["forestwalk", "Forest"],
] as const) {
  for (const controller of ["A", "B", "C"] as const) {
    test(`${keyword}: a ${subtype} controlled by ${controller} prevents blocks only for B`, () => {
      const setup = declare({ keywords: [keyword] }, { keywords: [keyword] }, 4);
      // A nonbasic land with this land subtype is sufficient; matching landwalk does not cancel.
      const land = put(setup.state, setup.release, "land", controller, {
        types: ["Land"],
        subtypes: [subtype],
      });
      land.owner = controller === "B" ? "C" : "B";
      startBlockDeclarations(setup.state, setup.release);
      assertBlock(setup, controller !== "B");
    });
  }
}

test("landwalk tests the land subtype, not its name or a creature subtype", () => {
  const setup = declare({ keywords: ["forestwalk"] });
  const fake = put(setup.state, setup.release, "fake", "B", { subtypes: ["Forest"] });
  present(setup.release.definitions[fake.definition]).name = "Forest";
  startBlockDeclarations(setup.state, setup.release);
  assertBlock(setup, true);
});

test("skulk reads the current counter-modified power at declaration", () => {
  const setup = declare({ keywords: ["skulk"], power: 2 }, { power: 2 });
  present(setup.state.objects.blocker).counters["+1/+1"] = 1;
  startBlockDeclarations(setup.state, setup.release);
  assertBlock(setup, false);
});

test("gaining an evasion ability after blocking never removes a declared block", () => {
  const setup = declare();
  assertBlock(setup, true);
  const attacker = present(setup.state.objects.attacker);
  present(setup.release.definitions[attacker.definition]).keywords.push("shadow");
  setup.state.step = "combat-damage";
  expect(setup.state.combat.blocked).toEqual(["attacker"]);
  expect(damageDomain(setup.state, setup.release, "A")[0]?.targets).toEqual([
    { id: "blocker", kind: "creature", lethal: 2 },
  ]);
});

test("a current blocking domain guides the ordinary driver through combined shadow and menace", async () => {
  const setup = declare({ keywords: ["shadow", "menace"] }, { keywords: ["shadow"] });
  put(setup.state, setup.release, "plain", "B", { power: 9 });
  put(setup.state, setup.release, "shadow2", "B", { keywords: ["shadow"] });
  startBlockDeclarations(setup.state, setup.release);
  const response = await heuristicDriver(observe(setup.state, setup.release, "B"), 1);
  expect(response).toEqual({
    kind: "block",
    blocks: [
      { blocker: "blocker", attacker: "attacker" },
      { blocker: "shadow2", attacker: "attacker" },
    ],
  });
  if (response.kind !== "block") throw new Error("Wrong response kind");
  expect(() => answerBlock(setup.state, setup.release, "B", response)).not.toThrow();
});

test("forging the projected domain cannot make a forbidden block legal", () => {
  const setup = declare({ keywords: ["fear"] });
  present(present(setup.state.decision).blockDomain?.[0]).blockers = ["blocker"];
  expect(() =>
    answerBlock(setup.state, setup.release, "B", {
      kind: "block",
      blocks: [{ attacker: "attacker", blocker: "blocker" }],
    }),
  ).toThrow();
});

test("a missing blocking domain is an explicit driver failure", () => {
  const setup = declare();
  const view = observe(setup.state, setup.release, "B");
  delete present(view.decision).blockDomain;
  expect(() => heuristicDriver(view, 1)).toThrow("DriverUnsupportedDecision");
});

test("missing, reordered, or forged blocking constraints fail the publication guard", () => {
  const setup = declare({ keywords: ["fear", "menace"] }, { colors: ["B"] });
  expect(() => assertBlockingDecision(setup.state, setup.release)).not.toThrow();
  const original = structuredClone(present(setup.state.decision));
  for (const mutate of [
    () => {
      delete present(setup.state.decision).blockDomain;
    },
    () => {
      present(present(setup.state.decision).blockDomain?.[0]).minimumBlockers = 1;
    },
    () => {
      present(present(setup.state.decision).blockDomain?.[0]).blockers.push("foreign");
    },
    () => {
      present(setup.state.decision).actor = "A";
    },
    () => {
      present(setup.state.decision).cards = [];
    },
  ]) {
    setup.state.decision = structuredClone(original);
    mutate();
    expect(() => assertBlockingDecision(setup.state, setup.release)).toThrow();
  }
});
