import { expect, test } from "bun:test";
import {
  CardDefinition,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import fixture from "../test-fixtures/reviewed-bindings.json";
import { buildDevelopmentMatchPlan } from "./plan";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
} from "./prepared";
import { REVIEWED_SOURCE_BINDINGS } from "./reviewed-source-bindings";

async function sourceAndRoots(name: string) {
  const byName = fixture.definitions as Record<string, unknown>;
  const subject = CardDefinition.parse(byName[name]);
  const commander = CardDefinition.parse(byName["Jasmine Boreal"]);
  const forest = CardDefinition.parse(byName.Forest);
  const body = {
    schema: "commander-content/1" as const,
    id: "source-binding-closure-only-fixture",
    sourceBundle: fixture.sourceBundle,
    rulesHash: fixture.rulesHash,
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: { [subject.id]: subject, [commander.id]: commander, [forest.id]: forest },
    unsupportedOracleIds: [],
    eligibleDenominator: 3,
    compilerVersion: "source-binding-test/1",
    processorAbi: ENGINE_VERSION,
  };
  const source: ContentRelease = { ...body, hash: await semanticHash(body) };
  // Dependency roots only, deliberately not a claim of legal100-card composition or executed play.
  const deckBody = {
    id: `closure-fixture:${name}`,
    commander: commander.id,
    entries: [
      { definition: commander.id, count: 1 },
      { definition: subject.id, count: 1 },
    ],
  };
  const deck: DeckRevision = { ...deckBody, hash: await semanticHash(deckBody) };
  return { source, subjectId: subject.id, decks: [deck, deck] };
}
async function rehash(source: ContentRelease) {
  const { hash: _hash, ...body } = source;
  return { ...body, hash: await semanticHash(body) };
}

test("every known family identity rejects constructor downgrades even when typed markers are removed and source hashes recomputed", async () => {
  for (const name of [
    "Giant Growth",
    "Cloudblazer",
    "Lone Missionary",
    "Canopy Spider",
    "Vine Trellis",
    "Divination",
  ]) {
    const fixture = await sourceAndRoots(name);
    const artifact = await createPreparedMatchArtifact(fixture.source, fixture.decks);
    await admitPreparedMatchArtifact(artifact, fixture.source, fixture.decks);
    for (const mutation of [
      "legacy-draw",
      "erase-program",
      "oracle-id",
      "object-id",
      "dictionary-id",
      "version",
      "body-and-program",
    ]) {
      const changed = structuredClone(fixture.source);
      const card = changed.definitions[fixture.subjectId];
      if (!card) throw Error("Missing source fixture");
      if (mutation === "legacy-draw") {
        card.implementationRevision = "commander-development-recipes/1";
        delete card.triggerPrograms;
        card.spellProgram = {
          schema: "commander-spell/1",
          target: null,
          effects: [{ kind: "draw", recipient: "controller", amount: 1 }],
        };
      }
      if (mutation === "erase-program") {
        card.implementationRevision = "commander-development-recipes/1";
        delete card.triggerPrograms;
        delete card.spellProgram;
        card.keywords = [];
        card.manaAbilities = [];
      }
      if (mutation === "oracle-id") card.oracleId = "unreviewed-identity";
      if (mutation === "object-id") card.id = "unreviewed-object-id";
      if (mutation === "dictionary-id") {
        delete changed.definitions[fixture.subjectId];
        changed.definitions["unreviewed-dictionary-id"] = card;
      }
      if (mutation === "version") card.sourceVersion = "a".repeat(64);
      if (mutation === "body-and-program") {
        card.oracleText = "Flying";
        card.keywords = ["flying"];
        card.implementationRevision = "commander-development-recipes/1";
        delete card.triggerPrograms;
        delete card.spellProgram;
      }
      const revised = await rehash(changed);
      const plan = await buildDevelopmentMatchPlan(revised, fixture.decks);
      expect(plan.closure.blockers.length).toBeGreaterThan(0);
      await expect(createPreparedMatchArtifact(revised, fixture.decks)).rejects.toThrow(
        mutation === "object-id" || mutation === "dictionary-id" || mutation === "oracle-id"
          ? "Definition dictionary identity mismatch"
          : "Unauthenticated definition",
      );
    }
  }
});

test("fixed reviewed digest registry agrees with complete real fixtures and never authenticates a changed constructor label", async () => {
  for (const source of Object.values(fixture.definitions)) {
    const card = CardDefinition.parse(source);
    const pinned = REVIEWED_SOURCE_BINDINGS[card.oracleId];
    expect(pinned?.definitionHash).toBe(await semanticHash(card));
    expect(pinned?.implementationRevision).toBe(card.implementationRevision);
    expect(pinned?.sourceVersion).toBe(card.sourceVersion);
  }
});

test("unrecognized legacy bodies remain unresolved after deleting ability markers", async () => {
  for (const body of [
    "When this creature enters, draw a card.",
    "This creature can't block.",
    "Reach (Unreviewed wording.)",
  ]) {
    const f = await sourceAndRoots("Canopy Spider");
    const card = f.source.definitions[f.subjectId];
    if (!card) throw Error("Missing fixture");
    delete f.source.definitions[f.subjectId];
    card.id = "synthetic-unreviewed";
    card.oracleId = "synthetic-unreviewed";
    card.oracleText = body;
    card.keywords = [];
    card.implementationRevision = "commander-development-recipes/1";
    f.source.definitions[card.id] = card;
    for (const deck of f.decks) {
      for (const entry of deck.entries)
        if (entry.definition === f.subjectId) entry.definition = card.id;
      const { hash: _hash, ...rest } = deck;
      deck.hash = await semanticHash(rest);
    }
    const plan = await buildDevelopmentMatchPlan(await rehash(f.source), f.decks);
    expect(plan.closure.blockers).toContain("unresolved-dependencies:synthetic-unreviewed");
  }
});

test("known normalized sourceVersion anchors a reviewed binding after every identity and ability marker is renamed", async () => {
  for (const name of ["Cloudblazer", "Lone Missionary", "Canopy Spider", "Vine Trellis"]) {
    const f = await sourceAndRoots(name);
    const card = f.source.definitions[f.subjectId];
    if (!card) throw Error("Missing reviewed source");
    delete f.source.definitions[f.subjectId];
    card.id = "oracle:unknown-renamed-source";
    card.oracleId = "unknown-renamed-source";
    card.implementationRevision = "commander-development-recipes/1";
    delete card.triggerPrograms;
    delete card.spellProgram;
    card.oracleText = "";
    card.keywords = [];
    card.manaAbilities = [];
    f.source.definitions[card.id] = card;
    for (const deck of f.decks) {
      for (const entry of deck.entries)
        if (entry.definition === f.subjectId) entry.definition = card.id;
      const { hash: _hash, ...body } = deck;
      deck.hash = await semanticHash(body);
    }
    const changed = await rehash(f.source);
    const plan = await buildDevelopmentMatchPlan(changed, f.decks);
    expect(plan.closure.blockers).toContain(
      "unresolved-dependencies:oracle:unknown-renamed-source",
    );
    await expect(createPreparedMatchArtifact(changed, f.decks)).rejects.toThrow(
      "Unauthenticated definition",
    );
  }
});

test("production full and prepared admission reject a wholly fabricated identity, version and internally consistent vanilla body", async () => {
  const f = await sourceAndRoots("Cloudblazer");
  const card = f.source.definitions[f.subjectId];
  if (!card) throw Error("Missing fixture");
  delete f.source.definitions[f.subjectId];
  card.id = "oracle:fabricated";
  card.oracleId = "fabricated";
  card.sourceVersion = "f".repeat(64);
  card.oracleText = "";
  card.keywords = [];
  card.manaAbilities = [];
  card.implementationRevision = "commander-development-recipes/1";
  delete card.triggerPrograms;
  delete card.spellProgram;
  f.source.definitions[card.id] = card;
  for (const deck of f.decks) {
    for (const entry of deck.entries)
      if (entry.definition === f.subjectId) entry.definition = card.id;
    const { hash: _hash, ...body } = deck;
    deck.hash = await semanticHash(body);
  }
  const altered = await rehash(f.source);
  await expect(createFullExecutionRegistry(altered)).rejects.toThrow("Unauthenticated definition");
  await expect(createPreparedMatchArtifact(altered, f.decks)).rejects.toThrow(
    "Unauthenticated definition",
  );
});
