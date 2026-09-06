import { expect, test } from "bun:test";
import { computeDependencyClosure, type DependencyRecord } from "./plan";

const record = (
  identity: string,
  dependencies: DependencyRecord["dependencies"] = [],
): DependencyRecord => ({ identity, implemented: true, dependencies });
test("finite exact dependency closure retains cycles and core while proving only unreachable exclusions", () => {
  const result = computeDependencyClosure({
    roots: ["root"],
    registry: [
      record("root", [{ kind: "exact", identity: "ability" }]),
      record("ability", [{ kind: "exact", identity: "root" }]),
      record("unused"),
    ],
    core: [{ identity: "priority", implemented: true }],
  });
  expect(result.retained).toEqual(["ability", "root"]);
  expect(result.excluded).toEqual(["unused"]);
  expect(result.retainedCoreCapabilities).toEqual(["priority"]);
  expect(result.blockers).toEqual([]);
  expect(result.iterations).toBe(2);
});
test("unknown dependency analysis widens to the pinned registry and remains a preflight blocker", () => {
  const result = computeDependencyClosure({
    roots: ["root"],
    registry: [
      record("root", null),
      record("potential-copy"),
      { ...record("unknown-program"), implemented: false },
    ],
    core: [{ identity: "replacement", implemented: false }],
  });
  expect(result.retained).toEqual(["potential-copy", "root", "unknown-program"]);
  expect(result.excluded).toEqual([]);
  expect(result.blockers).toEqual([
    "unimplemented-core:replacement",
    "unimplemented-definition:unknown-program",
    "unresolved-dependencies:root",
  ]);
});
test("class bounds require exact versions and test references, otherwise discovery widens", () => {
  const registry = [
    record("root", [{ kind: "class-bounded", classId: "creature-templates", boundVersion: "1" }]),
    record("token-a"),
    record("token-b"),
    record("other"),
  ];
  const common = { roots: ["root"], registry, core: [] };
  const valid = computeDependencyClosure({
    ...common,
    classes: {
      "creature-templates": {
        version: "1",
        identities: ["token-a", "token-b"],
        tests: ["class-bound-fixture"],
      },
    },
  });
  expect(valid.retained).toEqual(["root", "token-a", "token-b"]);
  expect(valid.excluded).toEqual(["other"]);
  for (const version of ["0", "2"]) {
    const invalid = computeDependencyClosure({
      ...common,
      classes: { "creature-templates": { version, identities: [], tests: [] } },
    });
    expect(invalid.excluded).toEqual([]);
    expect(invalid.blockers).toContain("unverified-class-bound:creature-templates:1");
  }
});
test("registry-wide availability and unavailable exact dependencies remain explicit", () => {
  const result = computeDependencyClosure({
    roots: ["root"],
    registry: [
      record("root", [
        { kind: "registry-wide", reason: "dynamic-name-lookup" },
        { kind: "exact", identity: "missing" },
      ]),
      record("available"),
    ],
    core: [],
  });
  expect(result.retained).toEqual(["available", "missing", "root"]);
  expect(result.blockers).toEqual(["unavailable-definition:missing"]);
  expect(result.excluded).toEqual([]);
});
