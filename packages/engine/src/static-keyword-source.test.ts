import { beforeAll, expect, test } from "bun:test";
import { canonicalJson, RulesState, semanticHash } from "@iwsdk-apps/contracts";
import { REVIEWED_SOURCE_BINDINGS } from "../../compiler/src/reviewed-source-bindings";
import {
  keywordSourceCard,
  keywordSourceCast,
  keywordSourceFixture,
  keywordSourceInventory,
  keywordSourceObject,
  keywordSourceResolve,
  keywordSourceSnapshot,
} from "../test-fixtures/static-keyword-source";
import { characteristics } from "./characteristics";
import { move } from "./common";
import { admitDeck, assertInvariants, observe } from "./index";

// Independent expected keywords come from all55 complete bodies reviewed before
// binder inspection. Providers and own witnesses are cast normally. The opponent
// witness, selected hands/basic lands are declared constructed preconditions.
// This does not count shuffled complete games or source-release qualification.
beforeAll(async () => {
  const { hash, ...payload } = keywordSourceSnapshot;
  expect(hash).toBe("42d65c2cffbfbbede2ce98226f07bf11bfad55af47b958d6672d24b7b2756bd9");
  expect(await semanticHash(payload)).toBe(hash);
  expect(keywordSourceSnapshot.parentDraftReleaseHash).toBe(
    "dbecdf4f6b9440e17b291af1784b9994a0d78b7eea5fe426251e769443c7ffb4",
  );
  expect(keywordSourceSnapshot.cases).toHaveLength(55);
  for (const row of keywordSourceSnapshot.cards) {
    expect(await semanticHash(row.definition)).toBe(row.definitionHash);
    expect(REVIEWED_SOURCE_BINDINGS[row.definition.oracleId]?.definitionHash).toBe(
      row.definitionHash,
    );
  }
  for (const row of keywordSourceSnapshot.cases) {
    const source = keywordSourceCard(row.name),
      expected = row.independentExpectation;
    expect(source.oracleText).toBe(expected.completeOracleText);
    expect(source.sourceVersion).toBe(expected.sourceVersion);
    expect<unknown>(source.keywords).toEqual(expected.intrinsicKeywords);
    expect<unknown>(source.staticKeywordPrograms).toEqual([
      {
        schema: "commander-static-keyword-grant/1",
        sourceZone: "battlefield",
        layer: 6,
        filter: {
          types: expected.recipient.typesAll.includes("Artifact")
            ? ["Artifact", "Creature"]
            : ["Creature"],
          subtype: expected.recipient.subtype,
          color: expected.recipient.hasColor,
          controller: expected.recipient.controller === "any" ? "any" : "source-controller",
          excludeSource: expected.recipient.excludeSameObject,
        },
        grant: expected.grantKeywords,
      },
    ]);
  }
});

for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  for (const row of keywordSourceSnapshot.cases) {
    test(`${mode}: actual ${row.name} casts, pays and resolves its whole grant on authentic recipient ${row.witness}`, async () => {
      const f = await keywordSourceFixture(
        "Sliver Hivelord",
        [row.name, row.witness],
        "Sliver Hivelord",
        [row.witness],
        mode,
      );
      for (const seat of f.state.manifest.seats) admitDeck(seat.deck, f.registry);
      const inventory = [keywordSourceInventory(f, "A"), keywordSourceInventory(f, "B")];
      expect(inventory.map((cards) => cards.length)).toEqual([100, 100]);
      const opposing = move(
        f.state,
        keywordSourceObject(f, "B", row.witness).id,
        "battlefield",
        "constructed authenticated opposing witness",
      );
      keywordSourceCast(f, "A", row.witness);
      keywordSourceResolve(f);
      const recipient = keywordSourceObject(f, "A", row.witness);
      const sourceBefore = keywordSourceObject(f, "A", row.name);
      const paid = keywordSourceCast(f, "A", row.name);
      expect(paid.event?.data.paid).toEqual(paid.payment.spend);
      expect(characteristics(f.state, f.registry, paid.id).keywords).toEqual(
        keywordSourceCard(row.name).keywords,
      );
      expect(characteristics(f.state, f.registry, recipient.id).keywords).toEqual([]);
      expect(characteristics(f.state, f.registry, opposing.id).keywords).toEqual([]);
      keywordSourceResolve(f);
      const source = keywordSourceObject(f, "A", row.name);
      expect(source.zone).toBe("battlefield");
      expect(source.generation).toBe(sourceBefore.generation + 2);
      expect(source.id).not.toBe(paid.id);
      expect<unknown>([...characteristics(f.state, f.registry, source.id).keywords].sort()).toEqual(
        row.expectedSourceKeywords,
      );
      expect<unknown>(
        [...characteristics(f.state, f.registry, recipient.id).keywords].sort(),
      ).toEqual(row.expectedWitnessKeywords);
      expect<unknown>(
        [...characteristics(f.state, f.registry, opposing.id).keywords].sort(),
      ).toEqual(row.expectedOpponentKeywords);
      expect(characteristics(f.state, f.registry, recipient.id).power).toBe(
        keywordSourceCard(row.witness).power,
      );
      expect(characteristics(f.state, f.registry, recipient.id).toughness).toBe(
        keywordSourceCard(row.witness).toughness,
      );
      expect(
        f.state.events.some(
          (e) => e.type === "PermanentSpellResolved" && e.data.definition === source.definition,
        ),
      ).toBe(true);
      expect(f.state.continuousEffects).toEqual([]);
      expect(Object.isFrozen(f.registry.definitions[source.definition])).toBe(true);
      expect([keywordSourceInventory(f, "A"), keywordSourceInventory(f, "B")]).toEqual(inventory);
      const shown = observe(f.state, f.registry, "B");
      expect(shown.objects.find((o) => o.id === source.id)?.card?.oracleText).toBe(row.oracleText);
      const restored = RulesState.parse(JSON.parse(canonicalJson(f.state)));
      assertInvariants(restored, f.registry);
      expect(observe(restored, f.registry, "B")).toEqual(shown);
      const evidence = process.env.STATIC_KEYWORD_SOURCE_EVIDENCE_DIR;
      if (evidence)
        await Bun.write(
          `${evidence}/${mode}/${row.identity}.json`,
          `${JSON.stringify(
            {
              schema: "static-keyword-source-cast-evidence/1",
              scope: "authentic-card-casts-with-constructed-hands-lands-and-opponent-witness",
              newCompletedGames: 0,
              name: row.name,
              oracleId: row.identity,
              sourceVersion: row.sourceVersion,
              definitionHash: row.definitionHash,
              parentDraftReleaseHash: keywordSourceSnapshot.parentDraftReleaseHash,
              executionSourceHash: f.registry.sourceReleaseHash,
              preparedArtifactHash: f.registry.preparedArtifactHash,
              executionDefinitionCount: Object.keys(f.registry.definitions).length,
              manifest: f.state.manifest,
              sourceBefore,
              paid,
              sourceAfter: source,
              expected: row,
              observedSource: characteristics(f.state, f.registry, source.id),
              observedOwn: characteristics(f.state, f.registry, recipient.id),
              observedOpponent: characteristics(f.state, f.registry, opposing.id),
              acceptedHistoryAfterConstructedSetup: f.history,
              currentState: f.state,
            },
            null,
            2,
          )}\n`,
        );
    });
  }
}
