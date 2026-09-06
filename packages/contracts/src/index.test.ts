import { describe, expect, test } from "bun:test";
import { canonicalJson, semanticHash } from "./index";

describe("canonical semantic JSON", () => {
  test("plain records sort keys at every depth while array order remains meaningful", async () => {
    const left = { z: [3, { b: 2, a: 1 }], a: null };
    const right = { a: null, z: [3, { a: 1, b: 2 }] };
    expect(canonicalJson(left)).toBe('{"a":null,"z":[3,{"a":1,"b":2}]}');
    expect(await semanticHash(left)).toBe(await semanticHash(right));
    expect(await semanticHash([1, 2])).not.toBe(await semanticHash([2, 1]));
  });
  test("shared acyclic references and null-prototype records retain their JSON values", () => {
    const shared = { x: 1 };
    expect(canonicalJson([shared, shared])).toBe('[{"x":1},{"x":1}]');
    const record = Object.assign(Object.create(null), { x: 1 });
    expect(canonicalJson(record)).toBe('{"x":1}');
  });
  test("cycles fail explicitly instead of overflowing or changing meaning", () => {
    const object: Record<string, unknown> = {};
    object.self = object;
    expect(() => canonicalJson(object)).toThrow("Cyclic");
    const array: unknown[] = [];
    array.push(array);
    expect(() => canonicalJson(array)).toThrow("Cyclic");
  });
  test("undefined, nonfinite, bigint, functions and symbols never disappear silently", () => {
    for (const value of [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      1n,
      () => 1,
      Symbol("x"),
    ]) {
      expect(() => canonicalJson(value)).toThrow();
      expect(() => canonicalJson({ value })).toThrow();
      expect(() => canonicalJson([value])).toThrow();
    }
  });
  test("non-JSON object types cannot masquerade as empty records", () => {
    class Example {
      value = 1;
    }
    for (const value of [
      new Date(),
      new Map(),
      new Set(),
      new Uint8Array([1]),
      /x/,
      new Example(),
      Object.create({ inherited: true }),
    ])
      expect(() => canonicalJson(value)).toThrow("plain records");
  });
  test("sparse arrays, extra keys, symbols, hidden fields and accessors are rejected without invoking getters", () => {
    expect(() => canonicalJson(new Array(2))).toThrow();
    const array = [1];
    Object.assign(array, { extra: 2 });
    expect(() => canonicalJson(array)).toThrow();
    expect(() => canonicalJson({ [Symbol("x")]: 1 })).toThrow();
    expect(() => canonicalJson(Object.defineProperty({}, "hidden", { value: 1 }))).toThrow();
    let reads = 0;
    const getter = {
      get value() {
        reads++;
        return 1;
      },
    };
    expect(() => canonicalJson(getter)).toThrow("accessors");
    expect(reads).toBe(0);
  });
});
