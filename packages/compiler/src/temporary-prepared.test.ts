import { expect, test } from "bun:test";
import { bindTemporaryCreatureSpell, TEMPORARY_CREATURE_SPELLS } from "@iwsdk-apps/card-programs";
import {
  CardDefinition,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { temporaryCandidate } from "../../card-programs/test-fixtures/temporary";
import authenticated from "../test-fixtures/reviewed-bindings.json";
import { buildDevelopmentMatchPlan, TEMPORARY_CREATURE_CORE_CAPABILITIES } from "./plan";
import { admitPreparedMatchArtifact, createPreparedMatchArtifact } from "./prepared";

async function fixture() {
  const commander = CardDefinition.parse(authenticated.definitions["Jasmine Boreal"]);
  const unused = CardDefinition.parse(authenticated.definitions.Forest);
  const definitions: Record<string, CardDefinition> = {
    [commander.id]: commander,
    [unused.id]: unused,
  };
  for (const recipe of TEMPORARY_CREATURE_SPELLS) {
    const card = bindTemporaryCreatureSpell(temporaryCandidate(recipe));
    if (!card) throw new Error(`Missing ${recipe.name}`);
    definitions[card.id] = card;
  }
  const body = {
    schema: "commander-content/1" as const,
    id: "temporary-closure-unit-fixture",
    sourceBundle: authenticated.sourceBundle,
    rulesHash: authenticated.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions,
    unsupportedOracleIds: [],
    eligibleDenominator: Object.keys(definitions).length,
    compilerVersion: "unit-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  const source: ContentRelease = { ...body, hash: await semanticHash(body) };
  // Closure-only roots, not a claim that this98-card fixture passed Commander deck admission.
  const deckBody = {
    id: "temporary-fixture-roots",
    commander: commander.id,
    entries: Object.keys(definitions)
      .filter((id) => id !== unused.id)
      .map((definition) => ({ definition, count: 1 })),
  };
  const deck: DeckRevision = { ...deckBody, hash: await semanticHash(deckBody) };
  return { source, decks: [deck, deck] };
}
async function rehash(source: ContentRelease) {
  const { hash: _hash, ...body } = source;
  return { ...body, hash: await semanticHash(body) };
}

test("all97 exact temporary definitions retain intrinsic-keyword/continuous capabilities without external card dependencies", async () => {
  const { source, decks } = await fixture();
  const artifact = await createPreparedMatchArtifact(source, decks);
  const admitted = await admitPreparedMatchArtifact(artifact, source, decks);
  expect(artifact.closure.blockers).toEqual([]);
  expect(artifact.closure.excluded).toEqual([authenticated.definitions.Forest.id]);
  expect(artifact.closure.widened).toEqual([]);
  expect(Object.keys(admitted.definitions).length).toBe(98);
  for (const capability of TEMPORARY_CREATURE_CORE_CAPABILITIES)
    expect(artifact.requiredCoreCapabilities).toContain(capability);
  const altered = structuredClone(artifact);
  altered.requiredCoreCapabilities = altered.requiredCoreCapabilities.filter(
    (cap) => cap !== "continuous:cleanup-expiry",
  );
  const { hash: _hash, ...body } = altered;
  await expect(
    admitPreparedMatchArtifact({ ...body, hash: await semanticHash(body) }, source, decks),
  ).rejects.toThrow("does not match");
});

test("rehashed source changes to delta/keywords/order/target or pinned identity block prepared admission", async () => {
  const f = await fixture();
  const recipe = TEMPORARY_CREATURE_SPELLS.find((row) => row.name === "Wildsize");
  if (!recipe) throw new Error("Missing cantrip source");
  for (const change of [
    "delta",
    "keyword",
    "order",
    "target",
    "identity",
    "cost",
    "recipe",
    "legacy-recipe",
  ]) {
    const source = structuredClone(f.source);
    const card = source.definitions[`oracle:${recipe.identity}`];
    if (!card?.spellProgram) throw new Error("Missing fixture card");
    const effect = card.spellProgram.effects[0];
    if (effect?.kind !== "modify-creature") throw new Error("Missing modifier");
    if (change === "delta") effect.powerDelta = 7;
    if (change === "keyword") effect.keywords = ["hexproof"];
    if (change === "order") card.spellProgram.effects.reverse();
    if (change === "target") card.spellProgram.target = "player";
    if (change === "identity") card.sourceVersion = "0".repeat(64);
    if (change === "cost" && card.manaCost) card.manaCost.generic++;
    if (change === "recipe") card.implementationRevision = "unreviewed-temporary/1";
    if (change === "legacy-recipe") card.implementationRevision = "commander-development-recipes/1";
    const changed = await rehash(source);
    if (change === "target") {
      await expect(createPreparedMatchArtifact(changed, f.decks)).rejects.toThrow(
        "Temporary creature modifiers require a creature target",
      );
      continue;
    }
    const plan = await buildDevelopmentMatchPlan(changed, f.decks);
    expect(plan.closure.blockers).toContain(`unresolved-dependencies:${card.id}`);
    await expect(createPreparedMatchArtifact(changed, f.decks)).rejects.toThrow(
      "Unauthenticated definition",
    );
  }
  const wrongAbi = await rehash({
    ...f.source,
    processorAbi: "commander-engine/future-unreviewed",
  });
  await expect(createPreparedMatchArtifact(wrongAbi, f.decks)).rejects.toThrow(
    "Prepared execution blocked",
  );
});
