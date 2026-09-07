import { expect, test } from "bun:test";
import { createFullExecutionRegistry } from "@iwsdk-apps/compiler/prepared";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import { activationFixtureSource } from "../../../packages/compiler/test-fixtures/ordinary-activated";
import { historicalFixtureRelease, selectCompileMode } from "./compile";

test("public compilation routes all-reviewed and the activation flag to the executable activation family", () => {
  expect(selectCompileMode(["--all-reviewed"])).toBe("ordinary-activated");
  expect(selectCompileMode(["--ordinary-activated-abilities"])).toBe("ordinary-activated");
  expect(selectCompileMode(["--self-entry-triggers"])).toBe("self-entry");
  expect(selectCompileMode(["--spell-families"])).toBe("spell-families");
  expect(selectCompileMode([])).toBe("development");
});
async function actualSource() {
  const source = await activationFixtureSource();
  const { hash: _hash, ...current } = source;
  const body = { ...current, processorAbi: "commander-engine/0.17.0" };
  return { source, expectedHash: await semanticHash(body) };
}
test("historical deck reconstruction retains source bytes, requires the entire expected hash and cannot execute a historical ABI", async () => {
  const { source, expectedHash } = await actualSource();
  const before = canonicalJson(source);
  const historical = await historicalFixtureRelease(
    source,
    expectedHash,
    "commander-engine/0.17.0",
  );
  expect(historical.hash).toBe(expectedHash);
  expect(canonicalJson(historical.definitions)).toBe(canonicalJson(source.definitions));
  expect(canonicalJson(source)).toBe(before);
  await expect(createFullExecutionRegistry(historical)).rejects.toThrow("ABI");
  await expect(
    historicalFixtureRelease(source, "0".repeat(64), "commander-engine/0.17.0"),
  ).rejects.toThrow("Historical fixture source changed");
});
for (const changed of ["bundle", "rules", "body", "compiler", "unsupported"] as const)
  test(`historical ABI restoration cannot hide changed ${changed}`, async () => {
    const { source, expectedHash } = await actualSource();
    switch (changed) {
      case "bundle":
        source.sourceBundle = "1".repeat(64);
        break;
      case "rules":
        source.rulesHash = "2".repeat(64);
        break;
      case "body": {
        const d = Object.values(source.definitions)[0];
        if (!d) throw Error("Missing source");
        d.oracleText += "\nDraw a card.";
        break;
      }
      case "compiler":
        source.compilerVersion = "unreviewed";
        break;
      case "unsupported":
        source.unsupportedOracleIds.push("unreviewed");
        break;
    }
    await expect(
      historicalFixtureRelease(source, expectedHash, "commander-engine/0.17.0"),
    ).rejects.toThrow("Historical fixture source changed");
  });
