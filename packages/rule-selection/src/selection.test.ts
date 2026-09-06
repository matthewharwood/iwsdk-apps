import { describe, expect, test } from "bun:test";
import {
  CandidateIndex,
  createView,
  type FieldSchema,
  Mask,
  orderInstances,
  prepareSelector,
  type ResidualRegistry,
  resolve,
  type SelectionView,
  type Selector,
  type ViewIdentity,
} from "./index";

const fields = {
  zone: "string",
  controller: "string",
  tapped: "boolean",
  turn: "integer",
  types: "string-set",
  address: "string",
} satisfies FieldSchema;
const identity: ViewIdentity = {
  match: "m",
  revision: 1,
  epoch: 2,
  lens: "current",
  eventVersion: "0",
  processorVersion: "test/1",
  bindingsKey: "actor:a",
  universe: "live-objects",
  generation: 1,
};
function view(size = 67): SelectionView {
  return createView(
    "object",
    identity,
    fields,
    Array.from({ length: size }, (_, i) => ({
      id: `o${i}`,
      values: {
        zone: i % 3 === 0 ? "hand" : "battlefield",
        controller: i % 2 === 0 ? "a" : "b",
        tapped: i % 5 === 0,
        turn: i % 11,
        types: i % 7 === 0 ? ["Land"] : ["Creature"],
        address: i % 3 === 0 ? "match/hand/object" : "match/battlefield/object",
      },
    })),
    { actor: "a", lastTurn: 5 },
  );
}
const zone: Selector = { op: "string-eq", field: "zone", value: "battlefield" };
const actor: Selector = { op: "string-eq", field: "controller", value: { binding: "actor" } };
const types: Selector = { op: "set-has", field: "types", value: "Creature" };
const turn: Selector = {
  op: "integer-compare",
  field: "turn",
  comparison: "lt",
  value: { binding: "lastTurn" },
};
const residual: Selector = { op: "residual", id: "odd-turn", version: "1", reads: ["turn"] };
const residuals: ResidualRegistry = {
  "odd-turn": { version: "1", reads: ["turn"], evaluate: (c) => Number(c.values.turn) % 2 === 1 },
};
function differential(v: SelectionView, query: Selector): void {
  const plan = prepareSelector(query, fields, {
    prefilterFields: ["zone", "controller"],
    indexedFields: ["zone", "controller", "tapped", "types"],
    residuals,
  });
  const reference = resolve(v, query, { residuals });
  for (const mode of ["prepared-scan", "prepared-indexed"] as const) {
    const result = resolve(v, query, { mode, plan, residuals });
    expect(result.ids).toEqual(reference.ids);
  }
  const bounds = new CandidateIndex(v, plan.indexedFields).bounds(query);
  for (const id of bounds.lower.ids()) expect(reference.ids).toContain(id);
  for (const id of reference.ids) expect(bounds.upper.ids()).toContain(id);
}
describe("typed conservative selection", () => {
  test("reference, prepared prefilter, and indexed discovery execute different paths", () => {
    const v = view();
    const query: Selector = { op: "and", terms: [zone, actor, residual] };
    const plan = prepareSelector(query, fields, {
      prefilterFields: ["zone"],
      indexedFields: ["zone", "controller"],
      residuals,
    });
    const reference = resolve(v, query, { residuals });
    const prepared = resolve(v, query, { mode: "prepared-scan", plan });
    const indexed = resolve(v, query, { mode: "prepared-indexed", plan });
    expect(prepared.ids).toEqual(reference.ids);
    expect(indexed.ids).toEqual(reference.ids);
    expect(reference.stats.exactChecks).toBe(67);
    expect(prepared.stats.coarseChecks).toBe(67);
    expect(prepared.stats.exactChecks).toBeLessThan(67);
    expect(indexed.stats.coarseChecks).toBe(0);
    expect(indexed.stats.exactChecks).toBeLessThan(prepared.stats.exactChecks);
  });
  test("nested arbitrary Boolean expressions preserve lower/exact/upper bounds", () => {
    const atoms: Selector[] = [
      zone,
      actor,
      types,
      turn,
      residual,
      { op: "all" },
      { op: "none" },
      { op: "boolean-eq", field: "tapped", value: false },
    ];
    const v = view();
    for (const a of atoms)
      for (const b of atoms)
        for (const op of ["and", "or"] as const)
          differential(v, { op: "not", term: { op, terms: [a, { op: "not", term: b }] } });
  });
  test("negating a wholly unindexed residual retains the entire candidate domain", () => {
    const v = view();
    const query: Selector = { op: "not", term: residual };
    const bounds = new CandidateIndex(v, []).bounds(query);
    expect(bounds.lower.ids()).toEqual([]);
    expect(bounds.upper.ids()).toHaveLength(67);
    differential(v, query);
  });
  test("complements clear tail bits, use the finite candidate domain, and reject foreign masks", () => {
    for (const size of [0, 1, 31, 32, 33, 67]) {
      const v = view(size);
      expect(new Mask(v).not().ordinals()).toEqual(Array.from({ length: size }, (_, i) => i));
      expect(Mask.all(v).not().ids()).toEqual([]);
      expect(new Mask(v).has(size)).toBe(false);
    }
    const v = view();
    expect(() => Mask.all(v).and(Mask.all(view()))).toThrow("different domains");
    const players = createView("player", identity, fields, v.candidates);
    expect(() => Mask.all(v).or(Mask.all(players))).toThrow("different domains");
  });
  test("zone/control changes rebuild facts even without a committed revision change", () => {
    const old = view(4);
    const nextCandidates = structuredClone(old.candidates);
    const next = createView(
      "object",
      { ...identity, epoch: 3, generation: 2 },
      fields,
      nextCandidates.map((c) => ({
        ...c,
        values: { ...c.values, zone: "battlefield", controller: "a" },
      })),
      old.bindings,
    );
    const query: Selector = { op: "and", terms: [zone, actor] };
    const plan = prepareSelector(query, fields, {
      prefilterFields: ["zone", "controller"],
      indexedFields: ["zone", "controller"],
    });
    const oldIndex = new CandidateIndex(old, plan.indexedFields);
    const result = resolve(next, query, { mode: "prepared-indexed", plan, index: oldIndex });
    expect(result.ids).toEqual(["o0", "o1", "o2", "o3"]);
    expect(result.stats.fallback).toBe("stale-index-view");
    expect(result.stats.mode).toBe("prepared-scan");
    expect(resolve(old, query).ids).toEqual(["o2"]);
  });
  test("missing plans safely fall back, and unknown fields/semantics never become false", () => {
    const v = view();
    expect(resolve(v, zone, { mode: "prepared-indexed" }).stats.fallback).toBe(
      "missing-or-incompatible-plan",
    );
    expect(() =>
      prepareSelector({ op: "integer-compare", field: "zone", comparison: "gt", value: 1 }, fields),
    ).toThrow("does not support");
    expect(() => prepareSelector(residual, fields)).toThrow("Unregistered residual");
    const missing = createView("object", identity, fields, [
      { id: "missing", values: { zone: "battlefield" } },
    ]);
    const query: Selector = { op: "boolean-eq", field: "tapped", value: false };
    const plan = prepareSelector(query, fields, { indexedFields: ["tapped"] });
    expect(new CandidateIndex(missing, ["tapped"]).bounds(query).upper.ids()).toEqual(["missing"]);
    expect(() => resolve(missing, query, { mode: "prepared-indexed", plan })).toThrow(
      "Missing tapped",
    );
    const unknown: ResidualRegistry = {
      "odd-turn": { version: "1", reads: ["turn"], evaluate: () => "unavailable" },
    };
    expect(() => resolve(v, residual, { residuals: unknown })).toThrow(
      "unavailable authoritative semantics",
    );
  });
  test("ancestry respects segment boundaries and bound relations require typed values", () => {
    const v = createView("rule-instance", identity, fields, [
      { id: "same-definition:instance1", values: { address: "query.characteristics" } },
      { id: "same-definition:instance2", values: { address: "query.characteristics.color" } },
      { id: "different", values: { address: "query.characteristicsElse" } },
    ]);
    const query: Selector = {
      op: "descendant-of",
      field: "address",
      value: "query.characteristics",
      separator: ".",
    };
    differential(v, query);
    expect(resolve(v, query).ids).toEqual([
      "same-definition:instance1",
      "same-definition:instance2",
    ]);
    expect(() =>
      resolve(view(), {
        op: "integer-compare",
        field: "turn",
        comparison: "eq",
        value: { binding: "actor" },
      }),
    ).toThrow("Binding type mismatch");
  });
  test("structural order, explicit constraints, player choices, and conflicts remain separate", () => {
    const ids = ["effect-b", "effect-a", "effect-copy"];
    expect(orderInstances(ids, [], "preserve-structural")).toEqual({ kind: "ordered", ids });
    expect(orderInstances(ids, [], "require-choice").kind).toBe("choice-required");
    expect(
      orderInstances(
        ids,
        [{ before: "effect-a", after: "effect-b", reason: "processor dependency" }],
        "preserve-structural",
      ),
    ).toEqual({ kind: "ordered", ids: ["effect-a", "effect-b", "effect-copy"] });
    expect(
      orderInstances(
        ids,
        [
          { before: "effect-a", after: "effect-b", reason: "a" },
          { before: "effect-b", after: "effect-a", reason: "b" },
        ],
        "preserve-structural",
      ).kind,
    ).toBe("conflict");
  });
});
